# Arquitetura

## Frontend
- Web: Next.js (React) com CDN Cloudflare.
- Mobile: React Native (Expo) com fluxos PDV e estoque.

## Backend
- Node.js (NestJS/Express) modular por dominio.
- API REST/GraphQL, Webhooks e eventos de dominio.

## Dados
- PostgreSQL (RDS) para dados transacionais.
- Redis (ElastiCache) para cache, filas offline e rate limit.
- S3 para imagens e anexos.

## Infra
- AWS (EKS/Fargate) com IaC (Terraform).
- Cloudflare (DNS, WAF, CDN, Workers para cache de catalogo).

## Seguranca
- JWT curto + refresh.
- MFA opcional, RBAC por loja.
- Criptografia at-rest/in-transit, auditoria por dominio.

## APIs (rascunho)
- /auth/login
- /inventory/products
- /sales/orders
- /finance/receivables
- /storefront/catalog
