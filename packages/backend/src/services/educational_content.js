/**
 * Educational Content Service
 * Manages cached educational articles and user bookmarks for Wealth Academy
 */

const { pool } = require('./db');

// Trusted sources for educational content
const TRUSTED_SOURCES = [
    { domain: 'nerdwallet.com', name: 'NerdWallet' },
    { domain: 'investopedia.com', name: 'Investopedia' },
    { domain: 'moneysense.ca', name: 'MoneySense' },
    { domain: 'wealthsimple.com', name: 'Wealthsimple' },
    { domain: 'canada.ca', name: 'Government of Canada' },
    { domain: 'bankofcanada.ca', name: 'Bank of Canada' },
    { domain: 'getsmarteraboutmoney.ca', name: 'GetSmarterAboutMoney' },
    { domain: 'ratehub.ca', name: 'RateHub' },
    { domain: 'fool.ca', name: 'Motley Fool Canada' },
    { domain: 'forbes.com', name: 'Forbes' }
];

// Category colors for UI
const CATEGORY_COLORS = {
    budgeting: '#3B82F6',
    investing: '#10B981',
    debt: '#F59E0B',
    taxes: '#8B5CF6',
    savings: '#06B6D4',
    general: '#C9A227'
};

/**
 * Get list of trusted sources for AI prompt
 */
function getTrustedSources() {
    return TRUSTED_SOURCES;
}

/**
 * Get category color for UI
 */
function getCategoryColor(category) {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS.general;
}

/**
 * Get all articles by category with pagination
 */
async function getArticles({ category = null, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    let query = `
        SELECT id, external_url, title, description, image_url,
               source_name, category, read_time_minutes, fetched_at
        FROM educational_articles
        WHERE expires_at > NOW()
    `;
    const params = [];

    if (category && category !== 'all') {
        params.push(category);
        query += ` AND category = $${params.length}`;
    }

    query += ` ORDER BY fetched_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM educational_articles WHERE expires_at > NOW()`;
    const countParams = [];
    if (category && category !== 'all') {
        countParams.push(category);
        countQuery += ` AND category = $1`;
    }
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    return {
        articles: result.rows.map(article => ({
            ...article,
            categoryColor: getCategoryColor(article.category)
        })),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
}

/**
 * Get a single article by ID
 */
async function getArticleById(articleId) {
    const result = await pool.query(
        `SELECT id, external_url, title, description, image_url,
                source_name, category, read_time_minutes, fetched_at
         FROM educational_articles
         WHERE id = $1`,
        [articleId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    const article = result.rows[0];
    return {
        ...article,
        categoryColor: getCategoryColor(article.category)
    };
}

/**
 * Get articles related to an insight type
 */
async function getArticlesForInsightType(insightType, limit = 3) {
    const result = await pool.query(
        `SELECT ea.id, ea.external_url, ea.title, ea.description, ea.image_url,
                ea.source_name, ea.category, ea.read_time_minutes, ia.relevance_score
         FROM insight_articles ia
         JOIN educational_articles ea ON ia.article_id = ea.id
         WHERE ia.insight_type = $1
           AND ea.expires_at > NOW()
         ORDER BY ia.relevance_score DESC
         LIMIT $2`,
        [insightType, limit]
    );

    return result.rows.map(article => ({
        ...article,
        categoryColor: getCategoryColor(article.category)
    }));
}

/**
 * Get all available categories with article counts
 */
async function getCategories() {
    const result = await pool.query(
        `SELECT category, COUNT(*) as count
         FROM educational_articles
         WHERE expires_at > NOW()
         GROUP BY category
         ORDER BY count DESC`
    );

    return result.rows.map(row => ({
        ...row,
        count: parseInt(row.count),
        color: getCategoryColor(row.category)
    }));
}

/**
 * Cache an article from URL by extracting OG metadata
 * Returns the cached article or existing article if already cached
 */
async function cacheArticleFromUrl(url, metadata = {}) {
    // Check if article already exists and is not expired
    const existingResult = await pool.query(
        `SELECT id, external_url, title, description, image_url, source_name, category
         FROM educational_articles
         WHERE external_url = $1 AND expires_at > NOW()`,
        [url]
    );

    if (existingResult.rows.length > 0) {
        return existingResult.rows[0];
    }

    // Determine source name from URL
    let sourceName = metadata.source || 'Unknown';
    for (const source of TRUSTED_SOURCES) {
        if (url.includes(source.domain)) {
            sourceName = source.name;
            break;
        }
    }

    // Use provided metadata or defaults
    const title = metadata.title || 'Educational Article';
    const description = metadata.description || '';
    const imageUrl = metadata.image_url || null;
    const category = metadata.category || 'general';
    const readTimeMinutes = metadata.read_time_minutes || 5;

    // Insert or update the article
    const result = await pool.query(
        `INSERT INTO educational_articles
            (external_url, title, description, image_url, source_name, category, read_time_minutes, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '7 days')
         ON CONFLICT (external_url)
         DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            image_url = EXCLUDED.image_url,
            source_name = EXCLUDED.source_name,
            category = EXCLUDED.category,
            read_time_minutes = EXCLUDED.read_time_minutes,
            fetched_at = NOW(),
            expires_at = NOW() + INTERVAL '7 days'
         RETURNING id, external_url, title, description, image_url, source_name, category, read_time_minutes`,
        [url, title, description, imageUrl, sourceName, category, readTimeMinutes]
    );

    return result.rows[0];
}

/**
 * Save articles generated by AI and link them to insight types
 */
async function saveAIGeneratedArticles(articles) {
    const savedArticles = [];

    for (const article of articles) {
        // Cache the article with metadata from AI
        const cached = await cacheArticleFromUrl(article.url, {
            title: article.title,
            description: article.description,
            source: article.source,
            category: article.category,
            read_time_minutes: article.read_time_minutes || 5
        });

        savedArticles.push(cached);

        // Link to insight types if provided
        if (article.relatedInsightTypes && Array.isArray(article.relatedInsightTypes)) {
            for (const insightType of article.relatedInsightTypes) {
                await pool.query(
                    `INSERT INTO insight_articles (insight_type, article_id, relevance_score)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (insight_type, article_id)
                     DO UPDATE SET relevance_score = GREATEST(insight_articles.relevance_score, EXCLUDED.relevance_score)`,
                    [insightType, cached.id, article.relevance_score || 1.0]
                );
            }
        }
    }

    return savedArticles;
}

/**
 * Add a bookmark for a user
 */
async function addBookmark(userId, articleId) {
    await pool.query(
        `INSERT INTO user_article_bookmarks (user_id, article_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, article_id) DO NOTHING`,
        [userId, articleId]
    );
    return { success: true };
}

/**
 * Remove a bookmark for a user
 */
async function removeBookmark(userId, articleId) {
    const result = await pool.query(
        `DELETE FROM user_article_bookmarks
         WHERE user_id = $1 AND article_id = $2`,
        [userId, articleId]
    );
    return { success: result.rowCount > 0 };
}

/**
 * Get all bookmarks for a user
 */
async function getBookmarks(userId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const result = await pool.query(
        `SELECT ea.id, ea.external_url, ea.title, ea.description, ea.image_url,
                ea.source_name, ea.category, ea.read_time_minutes,
                uab.bookmarked_at
         FROM user_article_bookmarks uab
         JOIN educational_articles ea ON uab.article_id = ea.id
         WHERE uab.user_id = $1
         ORDER BY uab.bookmarked_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
    );

    const countResult = await pool.query(
        `SELECT COUNT(*) FROM user_article_bookmarks WHERE user_id = $1`,
        [userId]
    );
    const total = parseInt(countResult.rows[0].count);

    return {
        articles: result.rows.map(article => ({
            ...article,
            categoryColor: getCategoryColor(article.category),
            isBookmarked: true
        })),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
}

/**
 * Check if specific articles are bookmarked by user
 */
async function checkBookmarks(userId, articleIds) {
    if (!articleIds || articleIds.length === 0) {
        return {};
    }

    const result = await pool.query(
        `SELECT article_id FROM user_article_bookmarks
         WHERE user_id = $1 AND article_id = ANY($2)`,
        [userId, articleIds]
    );

    const bookmarkedSet = new Set(result.rows.map(r => r.article_id));
    const bookmarkMap = {};

    for (const id of articleIds) {
        bookmarkMap[id] = bookmarkedSet.has(id);
    }

    return bookmarkMap;
}

/**
 * Seed initial educational articles (for development/testing)
 */
async function seedInitialArticles() {
    const seedArticles = [
        {
            url: 'https://www.canada.ca/en/services/finance/manage/tfsa.html',
            title: 'Tax-Free Savings Account (TFSA)',
            description: 'Learn about the TFSA, a flexible, registered savings account that allows Canadians to earn tax-free investment income.',
            source: 'Government of Canada',
            category: 'savings',
            read_time_minutes: 8,
            relatedInsightTypes: ['tfsa_opportunity', 'savings_acceleration']
        },
        {
            url: 'https://www.investopedia.com/terms/b/budgeting.asp',
            title: 'What Is Budgeting? Plus 11 Budgeting Methods',
            description: 'Budgeting is a process of creating a plan to spend your money. Learn different budgeting methods to manage your finances better.',
            source: 'Investopedia',
            category: 'budgeting',
            read_time_minutes: 10,
            relatedInsightTypes: ['spending_optimization', 'cash_flow_optimization']
        },
        {
            url: 'https://www.nerdwallet.com/article/finance/debt-avalanche-vs-debt-snowball',
            title: 'Debt Avalanche vs. Debt Snowball: Which Strategy Is Best?',
            description: 'Compare debt payoff strategies to find the best approach for paying down your debt faster and saving money on interest.',
            source: 'NerdWallet',
            category: 'debt',
            read_time_minutes: 7,
            relatedInsightTypes: ['debt_payoff_acceleration', 'debt_consolidation']
        },
        {
            url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/first-home-savings-account.html',
            title: 'First Home Savings Account (FHSA)',
            description: 'The FHSA is a registered plan that allows first-time home buyers to save for their first home tax-free.',
            source: 'Government of Canada',
            category: 'savings',
            read_time_minutes: 6,
            relatedInsightTypes: ['fhsa_opportunity', 'first_time_homebuyer']
        },
        {
            url: 'https://www.investopedia.com/terms/e/emergency_fund.asp',
            title: 'Emergency Fund: What It Is and Why It Matters',
            description: 'An emergency fund is a stash of money set aside to cover financial emergencies. Learn how much to save and where to keep it.',
            source: 'Investopedia',
            category: 'savings',
            read_time_minutes: 5,
            relatedInsightTypes: ['emergency_fund', 'savings_acceleration']
        },
        {
            url: 'https://www.moneysense.ca/save/investing/index-funds-vs-etfs/',
            title: 'Index Funds vs ETFs: What Is the Difference?',
            description: 'Understanding the differences between index funds and ETFs can help you choose the right investment for your portfolio.',
            source: 'MoneySense',
            category: 'investing',
            read_time_minutes: 8,
            relatedInsightTypes: ['investment_readiness', 'portfolio_optimization']
        },
        {
            url: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/registered-retirement-savings-plan-rrsp.html',
            title: 'RRSP: Registered Retirement Savings Plan',
            description: 'Learn about RRSPs, contribution limits, and how they can help reduce your taxes while saving for retirement.',
            source: 'Government of Canada',
            category: 'taxes',
            read_time_minutes: 10,
            relatedInsightTypes: ['rrsp_opportunity', 'tax_optimization']
        },
        {
            url: 'https://www.wealthsimple.com/en-ca/learn/credit-score',
            title: 'What Is a Credit Score and How Do You Improve It?',
            description: 'Your credit score affects your ability to borrow money. Learn what impacts your score and how to improve it.',
            source: 'Wealthsimple',
            category: 'general',
            read_time_minutes: 6,
            relatedInsightTypes: ['credit_optimization', 'cash_flow_optimization']
        }
    ];

    console.log('Seeding initial educational articles...');
    const saved = await saveAIGeneratedArticles(seedArticles);
    console.log(`Seeded ${saved.length} educational articles`);
    return saved;
}

module.exports = {
    getTrustedSources,
    getCategoryColor,
    getArticles,
    getArticleById,
    getArticlesForInsightType,
    getCategories,
    cacheArticleFromUrl,
    saveAIGeneratedArticles,
    addBookmark,
    removeBookmark,
    getBookmarks,
    checkBookmarks,
    seedInitialArticles,
    CATEGORY_COLORS
};
