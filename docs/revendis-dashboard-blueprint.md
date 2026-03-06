# Revendis Dashboard Blueprint

## Objective
Provide decision-ready visibility for management, finance and operation in one screen hierarchy.

## Information Architecture

### Row 1: Executive Snapshot
- Net revenue
- Gross margin
- Total orders
- Average ticket

### Row 2: Commercial Funnel
- Storefront visits
- Cart additions
- Checkout started
- Checkout paid

### Row 3: Financial Health
- Receivables
- Overdue amount
- Paid today
- 7-day cash forecast

### Row 4: Operational Health
- Pending orders
- Not delivered orders
- Stock rupture risk
- Fulfillment lead time

### Row 5: Customer Health
- Active customers (30d)
- Recurring customers (30d)
- Estimated LTV
- Retention trend

## Dashboard Interaction Rules
1. Every KPI card links to a detail surface.
2. Negative movement needs contextual helper text.
3. Alerts must be actionable, not just informative.
4. Date range must persist across sections.

## Suggested Widget Library
- `KpiCard`
- `TrendStat`
- `FunnelCard`
- `RiskList`
- `TopProductsTable`
- `ReceivablesAgingCard`
- `PendingPaymentsCard`

## Visual Guidance
- Keep dashboard density high but scannable.
- Use blue/cyan for neutral/insight context.
- Reserve green for confirmed positive financial states.
- Avoid large decorative elements that reduce data readability.
