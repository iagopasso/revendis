# Revendis App Core Screens

## Scope
First-party screens that define daily platform usage.

## Screen List

### 1) Dashboard
- Audience: manager/owner
- Goal: read business health quickly and trigger actions.
- Success signal: action started in less than 2 minutes.

### 2) Stock (Estoque)
- Audience: operations
- Goal: maintain catalog accuracy, quantity and pricing.
- Success signal: edits propagate immediately to selling channels.

### 3) Sales (Vendas)
- Audience: sales team
- Goal: build order and close payment with low friction.
- Success signal: high completion from created order -> paid order.

### 4) Financeiro
- Audience: finance/owner
- Goal: manage expenses, receivables and payment status.
- Success signal: no divergence between expense values/dates and real ledger.

### 5) Clientes
- Audience: commercial/retention
- Goal: track history, segment customers and improve recurrence.
- Success signal: growth in recurring customers and repeat purchase rate.

### 6) Loja Publica
- Audience: end customer / reseller
- Goal: discover product, add to cart and complete checkout.
- Success signal: conversion and reduced checkout abandonment.

## Shared UX Requirements
1. Desktop + mobile web parity in critical actions.
2. High-contrast dark mode with readable labels and values.
3. Clear success/error feedback after every mutation.
4. Safe state restore for interrupted payment flows.
5. Empty/error states must include next-step action.

## Design Delivery Notes
- Official visual reference page in app: `/design-system`.
- Technical source of truth: `apps/web/app/lib/revendis-design-system.ts`.
