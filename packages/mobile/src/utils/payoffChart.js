/**
 * Geometry for the debt payoff chart.
 *
 * Deliberately free of React Native imports: the projection is pure arithmetic,
 * and keeping it that way means it can be exercised directly against the
 * backend's real output instead of only by looking at a phone.
 *
 * Both curves come from the same simulation that produced the debt-free date
 * and the interest saved, so the picture cannot drift from the numbers printed
 * beside it. That drift is exactly what the previous version of this chart had:
 * two hand-drawn Bézier paths that never changed with the data.
 */

export const CHART_HEIGHT = 150;
export const CHART_PAD = { top: 8, bottom: 12, left: 2, right: 6 };

/**
 * @param {Object} analysis      the /debt analysis payload
 * @param {string} strategy      'snowball' | 'avalanche'
 * @param {number} extraPayment  extra monthly payment, dollars
 * @param {number} width         plot width in px
 * @returns {Object|null}        null when there is nothing honest to draw
 */
export const buildPayoffChart = (analysis, strategy, extraPayment, width) => {
    const minimumRun = analysis?.strategies?.status_quo;
    const strategyRun = strategy === 'snowball'
        ? analysis?.strategies?.snowball
        : analysis?.strategies?.avalanche;

    const minimumPoints = minimumRun?.balance_schedule || [];
    const strategyPoints = strategyRun?.balance_schedule || [];

    // No schedule at all means no debts to chart. That is the only case with
    // nothing to say — note it is NOT the same as having nothing to draw.
    if (!minimumPoints.length && !strategyPoints.length) return null;

    // Fewer than two points means the balance never fell — a minimum payment
    // below the month's interest. There is no curve, and drawing one anyway is
    // the bug this chart used to have. The caller still renders the card, so
    // that the warning explaining why reaches the person who needs it most.
    const hasMinimum = minimumPoints.length >= 2;
    // With no extra payment the strategy run is the minimum run, and plotting
    // one line exactly on top of another just reads as a rendering fault.
    const hasStrategy = strategyPoints.length >= 2 && extraPayment > 0;

    const plotW = width - CHART_PAD.left - CHART_PAD.right;
    const plotH = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;

    const lastMonth = (points) => (points.length ? points[points.length - 1].month : 0);
    const maxMonth = Math.max(lastMonth(minimumPoints), lastMonth(strategyPoints), 1);
    const maxBalance = Math.max(
        minimumPoints[0]?.balance || 0,
        strategyPoints[0]?.balance || 0,
        1
    );

    // One shared scale. Giving each series its own axis would make the extra
    // payment look better or worse than it is.
    const project = (point) => ({
        x: CHART_PAD.left + (point.month / maxMonth) * plotW,
        y: CHART_PAD.top + (1 - point.balance / maxBalance) * plotH,
    });

    const series = (points, run) => ({
        line: points.map(project).map((p) => `${p.x},${p.y}`).join(' '),
        end: project(points[points.length - 1]),
        // Only a run that actually reaches zero earns an endpoint mark.
        paidOff: run?.paid_off !== false,
    });

    return {
        maxMonth,
        maxBalance,
        baselineY: CHART_PAD.top + plotH,
        minimum: hasMinimum ? series(minimumPoints, minimumRun) : null,
        strategy: hasStrategy ? series(strategyPoints, strategyRun) : null,
        minimumNeverClears: minimumRun?.paid_off === false,
        // Neither payment level clears the debt, so there is no curve at all —
        // the card becomes a warning rather than a plot.
        strategyNeverClears: extraPayment > 0 && strategyRun?.paid_off === false,
        hasPlot: hasMinimum || hasStrategy,
    };
};

export default buildPayoffChart;
