# Revendis Codebase Guide for AI Agents

## Architecture Overview

**Revendis** é um monorepo TypeScript gerenciado com **Turbo**, estruturado em arquitetura de micro-frontend com backend compartilhado.

### Estrutura de Projetos

- **`apps/backend`**: API REST Node.js/Express
- **`apps/web`**: Aplicação web (placeholder)
- **`apps/mobile`**: Aplicação mobile (placeholder)
- **`packages/ui`**: Componentes UI compartilhados (placeholder)
- **`packages/tokens`**: Design tokens/constantes (placeholder)
- **`packages/config`**: Configurações compartilhadas (placeholder)

## Critical Workflows

### Development
```bash
npm run dev      # Inicia todos os workspaces em paralelo via Turbo
```

### Build & Test
```bash
npm run build    # Compila via Turbo (respeitando dependências via ^build)
npm run lint     # Lint em todos os workspaces
npm run test     # Testes em todos os workspaces (depende de build anterior)
```

### Backend Específico
```bash
cd apps/backend
npm run dev      # ts-node-dev com respawn automático
npm run build    # TypeScript -> dist/
```

## Project-Specific Patterns

### Turbo Pipeline Configuration
- **Build**: Outputs `dist/`, `build/`, `*.js`, `*.d.ts` com dependência on `^build` (transitive dependencies)
- **Dev**: Cache desabilitado (watch mode)
- **Test**: Depende de `^build` antes de executar

### TypeScript Setup
- **Base Config** (`tsconfig.base.json`): ES2020, strict mode, Node types
- **Workspaces**: Estendem `tsconfig.base.json`, definem `rootDir` e `outDir` locais
- **Exemplo** (backend): `extends: ../../tsconfig.base.json`

### Backend Architecture (Express)
- Port: `process.env.PORT || 3001`
- Middleware stack: Helmet (segurança) → CORS → JSON parser
- Health check: `GET /health` → JSON status
- **No espaço**: ESLint via `"echo 'placeholder'"` (implementar)

## Key Files

- `package.json`: Scripts root (dev, build, lint, test)
- `turbo.json`: Task pipeline e outputs
- `tsconfig.base.json`: Configuração TypeScript base
- `apps/backend/src/index.ts`: Entry point API
- `apps/backend/tsconfig.json`: Config backend

## Integration Points

### Cross-App Communication
- Backend expõe REST API na porta 3001
- Web/Mobile consomem via HTTP
- Packages compartilham código TypeScript (UI, tokens, config)

### Dependencies
- **Core**: Express, Helmet, CORS
- **Dev**: TypeScript, ts-node-dev, Turbo
- **External**: Node 20+ recomendado

## Common Patterns to Avoid

1. ❌ **Não** importar cross-workspace sem via `packages/`
2. ❌ **Não** rodar builds individuais sem respeitar Turbo
3. ❌ **Não** adicionar deps sem update workspaces coordenados

## Tips for New Features

- **Novo endpoint backend**: Adicione em `apps/backend/src/index.ts`, teste com `/health`
- **Novo package**: Crie em `packages/<name>` com `package.json` + `tsconfig.json`
- **Novo app**: Crie em `apps/<name>`, estenda tsconfig.base
- **Build issues**: Sempre rode `turbo build` (não tsc direto)
