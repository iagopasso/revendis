# Revendis Design System

## Objective
Create one reusable visual language for web/mobile/storefront with predictable UI behavior and fast implementation.

## Foundations

### Typography
- Family: `Space Grotesk` (UI), `Space Mono` (numeric/financial).
- Hierarchy:
  - `display-xl`: hero and key brand pages
  - `display-md`: section titles and dashboard title blocks
  - `heading-lg`: high-priority cards/modals
  - `heading-sm`: table/card block titles
  - `body-md`, `body-sm`: operational copy
  - `mono-md`: amounts, KPIs, codes

### Spacing
- Official rhythm: `space-2` to `space-12`.
- Minimum content breathing room:
  - card internal padding: `space-4`
  - panel spacing: `space-6`
  - major sections: `space-8+`

### Radius and Surfaces
- Primary radius: `12px`.
- Highlight radius: `16px` to `20px`.
- Light surfaces:
  - primary: `rv-cloud-000`
  - secondary: `rv-cloud-100`
- Dark surfaces:
  - primary: `rv-night-900`
  - secondary: `rv-night-700`

## Component Standards

### Buttons
- `primary`: one dominant CTA per view.
- `secondary`: complementary action.
- `ghost`: low visual priority.
- Disabled states must keep readable text contrast.

### Cards
- Must include:
  - title or context
  - value or state
  - optional action
- Financial card values use `mono` token styles.

### Inputs
- Always visible label, not placeholder-only.
- Support error, success and disabled states.
- Date/number fields must preserve readability in dark mode.

### Tables / Lists
- Desktop: table/list mode.
- Mobile: card mode with contextual labels.
- Numeric and date values must stay proportional and not break line unpredictably.

## Interaction Rules
- One clear primary action per section.
- Keep feedback immediate after critical actions (save, pay, delete).
- Empty states require a next action path.

## Implementation Source
- Canonical token/config file:
  - `apps/web/app/lib/revendis-design-system.ts`
- Visual reference page:
  - `/design-system` (inside dashboard shell)
