/**
 * Presentation for the insight type enum.
 *
 * Keys mirror the backend's services/insight_identity.js exactly. They are a
 * closed set now — the model picks from it rather than writing a label — so a
 * missing key means the two lists have drifted, not that the model improvised.
 *
 * `slot` indexes the theme's validated 7-hue ramp; never a hex, so dark and
 * light each resolve their own legible step from the same index.
 */
export const INSIGHT_TYPE_META = {
    tax_advantaged_accounts: { icon: 'trending-up', slot: 4, label: 'Registered accounts' },
    spending_optimization: { icon: 'cut', slot: 1, label: 'Spending' },
    debt_payoff: { icon: 'card', slot: 6, label: 'Debt payoff' },
    savings_acceleration: { icon: 'wallet', slot: 0, label: 'Savings' },
    cash_flow: { icon: 'cash', slot: 2, label: 'Cash flow' },
    investment_readiness: { icon: 'bar-chart', slot: 5, label: 'Investment readiness' },
    milestone: { icon: 'trophy', slot: 3, label: 'Milestone' },
    tax_optimization: { icon: 'receipt', slot: 4, label: 'Tax' },
    wealth_building: { icon: 'diamond', slot: 4, label: 'Wealth building' },
    comparative_spending: { icon: 'stats-chart', slot: 6, label: 'Compared to average' },
    opportunity_cost: { icon: 'swap-horizontal', slot: 1, label: 'Opportunity cost' },
    seasonal: { icon: 'calendar', slot: 0, label: 'Timely' },
    other: { icon: 'bulb', slot: null, label: 'Insight' },
};

export const insightTypeMeta = (type) => INSIGHT_TYPE_META[type] || INSIGHT_TYPE_META.other;

/** Days a "remind me later" snooze lasts. */
export const SNOOZE_DAYS = 14;
