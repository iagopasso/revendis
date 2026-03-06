# Revendis Ecosystem Products

## Product Map
- `Revendis Market`
- `Revendis Pay`
- `Revendis Analytics`

All modules share customer, catalog, order and finance primitives.

## 1) Revendis Market

### Mission
Increase product turnover and conversion across owned channels.

### Core Capabilities
- Unified catalog and stock visibility.
- Public storefront by subdomain.
- Order flow from discovery to checkout.
- Commercial filters and merchandising controls.

### Primary KPIs
- GMV per active store
- Conversion rate visit -> checkout paid
- Average order value

## 2) Revendis Pay

### Mission
Reduce payment friction and improve settlement predictability.

### Core Capabilities
- Pix and card orchestration.
- Pending payment recovery flow.
- Confirmation, status tracking and operational reconciliation.
- Payment state persistence with safe fallback.

### Primary KPIs
- Paid rate in D+0 and D+1
- Recovery rate of pending orders
- Payment confirmation latency

## 3) Revendis Analytics

### Mission
Turn operational data into fast business decisions.

### Core Capabilities
- Executive dashboard for revenue, margin and operations.
- Sales, finance and customer diagnostics.
- Proactive alerting for stock risk and payment risk.
- Trend and cohort views for retention.

### Primary KPIs
- Time to decision (critical actions)
- Forecast accuracy
- Active dashboard usage by role

## Shared Platform Layer
- Identity and access
- Product catalog and stock
- Orders and checkout events
- Payment and finance events
- Reporting and event timeline

## Cross-Module Principles
1. Single data truth across Market/Pay/Analytics.
2. Shared component and token system.
3. Feature flags for gradual rollout.
4. Every key flow must emit auditable events.
