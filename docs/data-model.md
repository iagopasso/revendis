# Data Model (Sprint 2)

## Goals
- Support multi-store inventory with consistent balances.
- Track sales, receivables, returns, and storefront orders.
- Enable audit trail of stock movements.

## Core Entities
- organizations: top-level tenant.
- stores: physical or virtual points of sale.
- users: workspace members (role-based).
- products: catalog with sku/barcode/price/cost.
- inventory_balances: current quantity per store/product.
- inventory_movements: append-only movement log.
- customers: basic CRM record.
- sales + sale_items: POS orders.
- payments: payment lines per sale.
- receivables: accounts receivable tied to sales.
- storefront_orders + storefront_order_items: online orders.
- returns + return_items: returns tied to sales.

## Relationship Summary
- organizations 1 -> N stores, users, products, customers
- stores 1 -> N sales, inventory_balances, inventory_movements, storefront_orders
- products 1 -> N inventory_balances, inventory_movements, sale_items, storefront_order_items
- sales 1 -> N sale_items, payments, receivables, returns

## Movement Types (inventory_movements)
- adjustment_in, adjustment_out
- transfer_in, transfer_out
- sale_out
- return_in

## Money Fields
- Use numeric(12,2) for price, cost, totals.

## Migration
- See `db/migrations/001_init.sql`
