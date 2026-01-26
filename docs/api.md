# API (Sprint 1 - Stub)

Base URL: `/api`

## Health
- `GET /health`

## Inventory
- `GET /inventory/products`
- `POST /inventory/products`
- `POST /inventory/adjustments`
- `POST /inventory/transfers`
- `POST /inventory/returns`

## Sales / PDV
- `GET /sales/orders`
- `POST /sales/checkout`
- `POST /sales/orders/:id/cancel`

## Finance (Receivables)
- `GET /finance/receivables`
- `POST /finance/receivables`
- `POST /finance/receivables/:id/settle`

## Customers
- `GET /customers`
- `POST /customers`

## Reports
- `GET /reports/daily-sales`
- `GET /reports/stock-outs`
- `GET /reports/receivables-aging`

## Storefront
- `GET /storefront/catalog`
- `POST /storefront/orders`
