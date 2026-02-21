# Fluxo de Branches: Staging Local + Producao

Objetivo:
- `staging`: ambiente de testes local (`localhost`), sem deploy automatico.
- `main`: producao (Railway), com deploy a cada push/merge.

## 1) Criar e publicar branch staging (uma vez)

```bash
git checkout -b staging
git push -u origin staging
```

## 2) Configurar staging local (localhost)

Use um banco local separado para staging:

```bash
createdb revendis_staging 2>/dev/null || true
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/revendis_staging'
bash scripts/db-apply.sh
```

Subir backend local:

```bash
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/revendis_staging'
export DEFAULT_ORG_ID='00000000-0000-0000-0000-000000000001'
export DEFAULT_STORE_ID='00000000-0000-0000-0000-000000000101'
pnpm --filter backend dev
```

Subir web local (outro terminal):

```bash
cat > apps/web/.env.local <<'EOF'
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_API_TIMEOUT_MS=10000
NEXT_PUBLIC_ORG_ID=00000000-0000-0000-0000-000000000001
NEXT_PUBLIC_STORE_ID=00000000-0000-0000-0000-000000000101
AUTH_SECRET=local-secret-forte
AUTH_ADMIN_EMAIL=admin@local
AUTH_ADMIN_PASSWORD=Admin@123456
AUTH_ADMIN_NAME=Administrador
EOF

pnpm --filter web dev
```

## 3) Fluxo de desenvolvimento

Crie feature branch a partir de `staging`:

```bash
git checkout staging
git checkout -b feat/minha-mudanca
```

Depois de testar localmente:

```bash
git add -A
git commit -m "feat: minha mudanca"
git push -u origin feat/minha-mudanca
```

Merge da feature em `staging` (PR ou local), mantendo staging como branch de homologacao local.

## 4) Promover para producao

Quando validar em `staging`, promova para `main`:

```bash
git checkout main
git pull origin main
git merge --no-ff staging
git push origin main
```

O push em `main` dispara deploy de producao no Railway.

## 5) Rollback rapido

Se uma release falhar:

1. Faca rollback no Railway para o deploy anterior.
2. No Git, reverta o commit em `main`:

```bash
git checkout main
git revert <sha_do_commit>
git push origin main
```

## 6) Observacoes

- `apps/web/.env.local` e `.env.*` ficam fora do Git (ignorado no repo).
- Use `DATABASE_URL` diferente entre local e producao.
- Nao rode migrations de teste no banco de producao.
