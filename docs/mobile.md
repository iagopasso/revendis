# Mobile setup (Expo)

## Prerequisitos
- Node `>=22 <23`
- pnpm `>=10`
- Expo Go no celular (para dev rapido) ou simulador iOS/Android

## Variaveis de ambiente
Use `apps/mobile/env.example` como base e crie `apps/mobile/.env.local`.

Campos:
- `EXPO_PUBLIC_API_URL`: base da API (`http://localhost:3001/api` por padrao)
- `EXPO_PUBLIC_ORG_ID`: org padrao para headers
- `EXPO_PUBLIC_STORE_ID`: store padrao para headers

Importante:
- Em simulador no mesmo host, `localhost` costuma funcionar.
- Em dispositivo fisico, use o IP local da maquina no lugar de `localhost`.

## Comandos
Na raiz do monorepo:

- `npm run dev:mobile`: inicia Metro/Expo na porta `8082`
- `npm run dev:mobile:ios`: inicia e abre no simulador iOS
- `npm run dev:mobile:android`: inicia e abre no emulador Android
- `npm run dev:mobile:web`: inicia o app mobile via web
- `npm run typecheck:mobile`: valida TypeScript do app mobile

Dentro de `apps/mobile`:

- `npm run dev`
- `npm run dev:ios`
- `npm run dev:android`
- `npm run dev:web`
- `npm run typecheck`

## Fluxo recomendado local
1. Suba backend: `npm --workspace backend run dev`
2. Configure `apps/mobile/.env.local`
3. Suba mobile: `npm run dev:mobile`
4. Escaneie QR no Expo Go ou abra simulador com `i`/`a`

## E2E Detox
Veja `docs/e2e.md` para build e execucao de testes Detox.
