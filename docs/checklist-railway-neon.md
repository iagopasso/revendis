# Checklist de Deploy (Railway + Neon)

Use este checklist para publicar `backend` + `web` no Railway, com banco no Neon.

## 1) Seguranca (antes de tudo)

1. [ ] Rotacionar a senha/credencial do Neon (a URL antiga foi exposta no chat).
2. [ ] Atualizar `DATABASE_URL` nova em todos os ambientes.

## 2) Preparo local

1. [ ] Estar em Node `22.x`.
2. [ ] Rodar `pnpm install --frozen-lockfile`.
3. [ ] Rodar `pnpm --filter backend build`.
4. [ ] Rodar `pnpm --filter web build`.
5. [ ] Confirmar que migrations no Neon foram aplicadas (`scripts/db-apply.sh`).

## 3) Railway: criar projeto e servicos

1. [ ] Criar projeto no Railway.
2. [ ] Criar servico `backend` (Node).
3. [ ] Criar servico `web` (Node).
4. [ ] Em ambos: usar a raiz do monorepo como root directory.

## 4) Deploy do backend

1. [ ] Build command:
```bash
corepack enable && pnpm install --frozen-lockfile && pnpm --filter backend build
```
2. [ ] Start command:
```bash
pnpm --filter backend start
```
3. [ ] Variaveis obrigatorias:
```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/revendis?sslmode=require&channel_binding=require
DEFAULT_ORG_ID=00000000-0000-0000-0000-000000000001
DEFAULT_STORE_ID=00000000-0000-0000-0000-000000000101
```
4. [ ] Validar endpoint:
```bash
GET https://SEU_BACKEND/api/health
```

## 5) Deploy do web

1. [ ] Build command:
```bash
corepack enable && pnpm install --frozen-lockfile && pnpm --filter web build
```
2. [ ] Start command:
```bash
pnpm --filter web start
```
3. [ ] Variaveis obrigatorias:
```bash
NEXT_PUBLIC_API_URL=https://SEU_BACKEND/api
NEXT_PUBLIC_API_TIMEOUT_MS=10000
NEXT_PUBLIC_ORG_ID=00000000-0000-0000-0000-000000000001
NEXT_PUBLIC_STORE_ID=00000000-0000-0000-0000-000000000101
AUTH_SECRET=troque_por_um_segredo_longo
AUTH_ADMIN_EMAIL=admin@seu-dominio.com
AUTH_ADMIN_PASSWORD=troque_essa_senha
AUTH_ADMIN_NAME=Administrador
```

## 6) Dominio e DNS

1. [ ] Conectar dominio da API (ex.: `api.seudominio.com`) ao servico backend.
2. [ ] Conectar dominio do app (ex.: `app.seudominio.com`) ao servico web.
3. [ ] Confirmar HTTPS ativo nos dois.

## 7) Smoke test de producao

1. [ ] Abrir web e fazer login.
2. [ ] Criar/editar um produto.
3. [ ] Registrar uma venda.
4. [ ] Abrir ao menos um relatorio.
5. [ ] Confirmar que chamadas da web batem no backend correto (`NEXT_PUBLIC_API_URL`).

## 8) Observabilidade minima

1. [ ] Logs habilitados no Railway (backend e web).
2. [ ] Alerta para erro 5xx no backend.
3. [ ] Alerta basico de indisponibilidade (`/api/health`).

## 9) Rollback

1. [ ] Garantir deploy anterior preservado no Railway (rollback rapido).
2. [ ] Manter backup/branch no Neon para restauracao.

## Modo guiado (eu te acompanho passo a passo)

Me envie estes 4 itens e eu te guio clicando etapa por etapa:

1. Nome do projeto Railway.
2. URL publica do backend no Railway.
3. URL publica do web no Railway.
4. Dominios finais desejados (API e app), se ja tiver.
