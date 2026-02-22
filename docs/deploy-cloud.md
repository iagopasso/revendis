# Deploy em Nuvem (Web + Backend + Banco SaaS)

Este guia publica o projeto em producao usando:
- Banco SaaS: PostgreSQL gerenciado (ex.: Render PostgreSQL, Neon, Supabase)
- Backend: servico Node.js
- Web: servico Next.js

A sequencia abaixo foi pensada para funcionar com o setup atual do monorepo.

## 1) Pre-requisitos

- Node.js `22.x`
- `pnpm` `10.x`
- `psql` instalado localmente (para aplicar migrations)
- Repositorio no GitHub/GitLab

## 2) Criar banco PostgreSQL SaaS

No seu provedor, crie um banco PostgreSQL e copie a connection string.

Formato esperado:

```bash
postgresql://USER:PASSWORD@HOST:5432/revendis?sslmode=require
```

Guarde esse valor para:
- `DATABASE_URL` do backend
- execucao das migrations

## 3) Aplicar migrations no banco SaaS

No seu computador, na raiz do repo:

```bash
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/revendis?sslmode=require'
bash scripts/db-apply.sh
```

Se esse passo falhar, ajuste credenciais/SSL no provedor antes do deploy.

## 4) Deploy do Backend (Node)

Crie um servico web Node na sua plataforma cloud e configure:

- Root directory: raiz do repositorio (monorepo)
- Build command:

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm --filter backend build
```

- Start command:

```bash
pnpm --filter backend start
```

Variaveis obrigatorias:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/revendis?sslmode=require
DEFAULT_ORG_ID=00000000-0000-0000-0000-000000000001
DEFAULT_STORE_ID=00000000-0000-0000-0000-000000000101
MUTATION_AUTH_TOKEN=troque_por_um_token_longo
```

Variaveis opcionais (catalogo/importacao):

```bash
CATALOG_ENABLE_UPSTREAM=0
NATURA_CONSULTANT_LOGIN=
NATURA_CONSULTANT_PASSWORD=
```

No fim, valide o healthcheck:

```bash
GET https://SEU_BACKEND/api/health
```

## 5) Deploy do Web (Next.js)

Crie outro servico web Node para `apps/web` e configure:

- Root directory: raiz do repositorio (monorepo)
- Build command:

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm --filter web build
```

- Start command:

```bash
pnpm --filter web start
```

Variaveis obrigatorias:

```bash
NEXT_PUBLIC_API_URL=https://SEU_BACKEND/api
NEXT_PUBLIC_API_TIMEOUT_MS=10000
NEXT_PUBLIC_ORG_ID=00000000-0000-0000-0000-000000000001
NEXT_PUBLIC_STORE_ID=00000000-0000-0000-0000-000000000101
NEXT_PUBLIC_MUTATION_AUTH_TOKEN=troque_por_um_token_longo
AUTH_SECRET=troque_por_um_segredo_grande
AUTH_ADMIN_EMAIL=admin@seu-dominio.com
AUTH_ADMIN_PASSWORD=troque_essa_senha
AUTH_ADMIN_NAME=Administrador
```

Variaveis opcionais (OAuth):

```bash
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_FACEBOOK_ID=
AUTH_FACEBOOK_SECRET=
AUTH_ALLOWED_EMAILS=email1@dominio.com,email2@dominio.com
```

## 6) Dominios

- Web: `app.seudominio.com`
- API: `api.seudominio.com`

Depois de publicar dominio customizado, atualize `NEXT_PUBLIC_API_URL` no web se necessario.

Se for usar vitrine por subdominio (`loja.seudominio.com`), siga tambem:
- `docs/dns-proxy-storefront.md`

## 7) Checklist final

1. Banco criado e migrations aplicadas
2. Backend respondendo `GET /api/health`
3. Web carregando e autenticando
4. `NEXT_PUBLIC_API_URL` apontando para API publica
5. Credenciais padrao trocadas (`AUTH_ADMIN_PASSWORD`, `AUTH_SECRET`)

## Arquivos de referencia

- `apps/backend/env.example`
- `apps/web/env.example`
- `scripts/db-apply.sh`
