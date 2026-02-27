# Style Reviewer — Persistent Memory

## Project CSS Architecture
- `css/styles.css` — global layout, legacy variables (`--color-red-accent`, `--color-cream`, etc.)
- `css/theme-tokens.css` — canonical source of truth: 6 themes, all `--color-*` base vars + `--theme-*` semantic aliases
- `css/ui-components.css` — shared `.btn`, `.btn--*`, `.app-input`, `.app-label`, `.app-modal-*`, `.hidden` utility
- `features/resource-manager/resource-manager.css` — all Resource Manager component styles (fully theme-compliant as of Feb 2026)

## Variable Naming Convention (use these in audits)
Canonical base vars (defined per-theme): `--color-bg-base`, `--color-bg-surface`, `--color-bg-raised`, `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`, `--color-border-subtle`, `--color-border-strong`, `--color-accent`, `--color-accent-soft`, `--color-success`, `--color-warning`, `--color-danger`

Semantic aliases (use these in component CSS): `--theme-bg-primary`, `--theme-bg-surface`, `--theme-bg-elevated`, `--theme-text-primary`, `--theme-text-secondary`, `--theme-text-tertiary`, `--theme-border-divider`, `--theme-border-primary`, `--theme-accent`, `--theme-accent-soft`, `--theme-success`, `--theme-success-soft`, `--theme-warning`

Typography: `--app-font-body`, `--app-font-heading`

## Known Hardcoded Values in Shared Files (NOT violations — intentional)
- `ui-components.css` lines 61–63: `.btn--danger` uses `#c62828` and `#ffffff` (danger button intentionally hardcoded)
- `ui-components.css` lines 108–116: `.btn-icon--danger` and hover use `#c62828`, `#ad1f1f`, `#ffffff`
- `styles.css` line 498: `.auth-home-crew` background `#000000` (photo frame background, intentional)

## Recurring Violation Pattern: `element.style.display` for show/hide
The most common inline style violation in this project. Components frequently use `el.style.display = "none"/"block"` instead of toggling CSS classes.
- The global `.hidden` utility class exists in `ui-components.css`: `display: none !important`
- Correct fix: use `el.classList.toggle("hidden", condition)` or `el.classList.add/remove("hidden")`
- Correct fix for tab views: add/remove `.active` class (CSS already defines `.ct-view { display: none }` / `.ct-view.active { display: block }`)


## CSS Ownership Map
- Resource Manager: `features/resource-manager/resource-manager.css` (loaded via `<link>` in the fragment)
- Shared buttons/inputs/modals: `css/ui-components.css`
- Sidebar, layout, legacy panels: `css/styles.css`
- Theme tokens and variables: `css/theme-tokens.css`
- Chronicle Detail: `css/chronicles.css` (cd- prefix component system, uses local `--cd-*` aliases that map to `--theme-*`)
- Territorial game: `css/game.css` (legacy --color-cream/--color-red-accent system, pre-dates theme-tokens)

## Global Tab System (added Feb 2026)
- Global classes: `.app-tabs`, `.app-tab`, `.app-tabs--underline`, `.app-tab-panel` in `ui-components.css` lines 212–288
- KNOWN ISSUE: Tab block uses `--color-*` base vars, NOT `--theme-*` aliases — inconsistent with the rest of ui-components.css. Needs fix.
- Context overrides: `.ct-tabs { margin-bottom }` in resource-manager.css; `.cd-tabs { padding }` + `.cd-tabs .app-tab { font-size }` in chronicles.css
- Chronicle detail uses `.cd-tab-panel` (NOT `.app-tab-panel`) for panels — intentional divergence (needs `display:flex` not `display:block`). Tab buttons do use `.app-tab`.
- Zone detail (`detail.zone.js`) uses `.app-tabs` + `.app-tab` + `.app-tab-panel` — fully on global system.
- Resource Manager (`resource-manager.js`) uses `.app-tab` + `.app-tab-panel` — fully on global system.
- `switchTab()` pattern: `classList.toggle("active", condition)` on both tab buttons and panels — correct pattern.

## Recurring Violation Pattern: `element.style.display` for show/hide
The most common inline style violation in this project. Previously fixed in Resource Manager.
- The global `.hidden` utility class exists in `game.css` line 1393 (`display: none !important`) — also in `ui-components.css` conceptually but defined in game.css for the fragment context.
- Correct fix: use `el.classList.toggle("hidden", condition)` or `el.classList.add/remove("hidden")`
- Correct fix for tab views: `classList.toggle("active", condition)` on `.app-tab` and `.app-tab-panel` elements.

### Resource Manager Violations (Feb 2026, RESOLVED)
All previously flagged inline styles in resource-manager.js and resource-manager.html have been fixed.

## Known Inline Style Violations in detail.zone.js (unresolved as of Feb 2026)
- Line 219–221: `style="color:${lt.faction_color || '#FF0000'}"` — `#FF0000` fallback is hardcoded. Fix: use `var(--theme-text-secondary)` or CSS class for default.
- Line 702: `style="padding: 20px; text-align: center;"` on a `.muted` paragraph. Fix: add `.muted--centered` class to game.css.
- Line 792: `style="color:white"` inside threshold label template. Fix: wrap in CSS class using `var(--theme-text-primary)`.

## Acceptable Exceptions (do NOT flag)
- `rgba(0,0,0, x)` shadow values — box-shadow and drop-shadow opacities are not in the token system
- Dynamic `transform`, `left`, `top` for map token positioning in `tactical-map.js`, `active-encounter.js`
- MapLibre GL programmatic style objects
- Intentional badge colors: ACTIVA green, Narrador red, Jugador blue, status badges
- `.btn--danger` hardcoded red in `ui-components.css` — documented intentional exception
- `detail.zone.js`: inline `borderColor`, `backgroundColor`, `boxShadow` on lieutenant cards from `lt.faction_color` — data-driven, acceptable
- `detail.zone.js`: inline `style="border-color:${accentColor}"` on modal-content, `style="color:${accentColor}"` on faction name — data-driven faction color, acceptable
- `detail.zone.js`: `style="width:${width}%; background:${seg.color};"` on progress bar segments — computed % width + data-driven faction color, acceptable
- `detail.zone.js`: `style="background:${colorPill}"` on `.detail-status-pill` — data-driven zone control color, acceptable
