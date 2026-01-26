# E2E Tests

## Web (Playwright)
- Config: `apps/web/playwright.config.ts`
- Test: `apps/web/e2e/home.spec.ts`
- Run: `npm --workspace web run e2e`

## Mobile (Detox)
- Config: `apps/mobile/detox.config.js`
- Jest config: `apps/mobile/e2e/jest.config.js`
- Test: `apps/mobile/e2e/app.e2e.js`
- Pre-req: `npx expo prebuild` para gerar `ios/` (ou use um projeto bare).
- Build: `npm --workspace mobile run e2e:build`
- Run: `npm --workspace mobile run e2e`
