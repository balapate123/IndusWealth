/**
 * Educational Content API Routes
 * Endpoints for Wealth Academy articles and user bookmarks
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const educationalService = require('../services/educational_content');

/**
 * GET /api/educational/articles
 * Get all educational articles (paginated, filterable by category)
 */
router.get('/articles', authenticateToken, async (req, res) => {
    try {
        const { category, page = 1, limit = 20 } = req.query;
        const userId = req.user.id;

        const result = await educationalService.getArticles({
            category,
            page: parseInt(page),
            limit: parseInt(limit)
        });

        // Check which articles are bookmarked by this user
        const articleIds = result.articles.map(a => a.id);
        const bookmarkMap = await educationalService.checkBookmarks(userId, articleIds);

        // Add isBookmarked flag to each article
        result.articles = result.articles.map(article => ({
            ...article,
            isBookmarked: bookmarkMap[article.id] || false
        }));

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error fetching articles:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch articles'
        });
    }
});

/**
 * GET /api/educational/articles/:id
 * Get a single article by ID
 */
router.get('/articles/:id', authenticateToken, async (req, res) => {
    try {
        const articleId = parseInt(req.params.id);
        const userId = req.user.id;

        const article = await educationalService.getArticleById(articleId);

        if (!article) {
            return res.status(404).json({
                success: false,
                error: 'Article not found'
            });
        }

        // Check if bookmarked
        const bookmarkMap = await educationalService.checkBookmarks(userId, [articleId]);
        article.isBookmarked = bookmarkMap[articleId] || false;

        res.json({
            success: true,
            data: article
        });
    } catch (error) {
        console.error('Error fetching article:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch article'
        });
    }
});

/**
 * GET /api/educational/categories
 * Get all categories with article counts
 */
router.get('/categories', authenticateToken, async (req, res) => {
    try {
        const categories = await educationalService.getCategories();

        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch categories'
        });
    }
});

/**
 * GET /api/educational/for-insight/:type
 * Get articles related to a specific insight type
 */
router.get('/for-insight/:type', authenticateToken, async (req, res) => {
    try {
        const insightType = req.params.type;
        const limit = parseInt(req.query.limit) || 3;
        const userId = req.user.id;

        const articles = await educationalService.getArticlesForInsightType(insightType, limit);

        // Check which articles are bookmarked
        const articleIds = articles.map(a => a.id);
        const bookmarkMap = await educationalService.checkBookmarks(userId, articleIds);

        const articlesWithBookmarks = articles.map(article => ({
            ...article,
            isBookmarked: bookmarkMap[article.id] || false
        }));

        res.json({
            success: true,
            data: articlesWithBookmarks
        });
    } catch (error) {
        console.error('Error fetching articles for insight:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch articles for insight type'
        });
    }
});

/**
 * GET /api/educational/bookmarks
 * Get user's bookmarked articles
 */
router.get('/bookmarks', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;

        const result = await educationalService.getBookmarks(
            userId,
            parseInt(page),
            parseInt(limit)
        );

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error fetching bookmarks:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch bookmarks'
        });
    }
});

/**
 * POST /api/educational/bookmarks
 * Add a bookmark for an article
 */
router.post('/bookmarks', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { article_id } = req.body;

        if (!article_id) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: article_id'
            });
        }

        await educationalService.addBookmark(userId, parseInt(article_id));

        res.json({
            success: true,
            message: 'Article bookmarked successfully'
        });
    } catch (error) {
        console.error('Error adding bookmark:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to bookmark article'
        });
    }
});

/**
 * DELETE /api/educational/bookmarks/:id
 * Remove a bookmark
 */
router.delete('/bookmarks/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const articleId = parseInt(req.params.id);

        const result = await educationalService.removeBookmark(userId, articleId);

        if (!result.success) {
            return res.status(404).json({
                success: false,
                error: 'Bookmark not found'
            });
        }

        res.json({
            success: true,
            message: 'Bookmark removed successfully'
        });
    } catch (error) {
        console.error('Error removing bookmark:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to remove bookmark'
        });
    }
});

/**
 * POST /api/educational/seed
 * Seed initial educational articles (admin/development only)
 */
router.post('/seed', authenticateToken, async (req, res) => {
    try {
        const articles = await educationalService.seedInitialArticles();

        res.json({
            success: true,
            message: `Seeded ${articles.length} educational articles`,
            data: articles
        });
    } catch (error) {
        console.error('Error seeding articles:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to seed articles'
        });
    }
});

module.exports = router;
