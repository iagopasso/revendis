# Revendis

Monorepo inicial para web, mobile e backend.

## Estrutura
- `apps/web`: Next.js (web)
- `apps/mobile`: React Native (Expo)
- `apps/backend`: Node.js (Express stub)
- `packages/tokens`: Design tokens compartilhados
- `packages/ui`: Utilitarios de UI
- `packages/api-types`: Tipos gerados a partir do OpenAPI
- `packages/api-client`: Cliente HTTP tipado (OpenAPI)
- `docs`: Especificacoes e backlog
- `db/migrations`: Migrations SQL (PostgreSQL)

## Scripts
- `npm run dev`: inicia apps (via Turborepo)
- `npm run build`: build de todos os pacotes
- `npm run lint`: lint (placeholders)
- `npm run test`: testes (placeholders)
- `npm run openapi:lint`: valida o contrato OpenAPI
- `npm run openapi:bundle`: gera `docs/openapi.json`
- `npm run openapi:types`: gera tipos em `packages/api-types`
- `scripts/dev-start.sh`: sobe web/backend/mobile em background
- `scripts/dev-stop.sh`: encerra web/backend/mobile
- `scripts/db-apply.sh`: aplica migrations no Postgres local
- `npm --workspace web run e2e`: Playwright (web)
- `npm --workspace mobile run e2e`: Detox (mobile)

## Proximos passos
- Instalar dependencias e rodar `npm install`.
- Preencher matriz de paridade e backlog detalhado em `docs/`.
