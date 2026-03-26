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

CRITICAL: `--theme-bg-base` and `--theme-text-muted` are UNDEFINED aliases — not declared anywhere in theme-tokens.css or styles.css. They resolve to nothing (transparent/inherit). Both appear widely across the codebase (tools.css, ghoul.css, ui-components.css, card-creator.css, temporal-codex.css, revelation-screen.css, games.css). Correct mappings: `--theme-bg-base` → `var(--color-bg-base)` / `--theme-text-muted` → `var(--color-text-muted)`. These aliases need to be added to theme-tokens.css.

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
- Tools: `css/tools.css` (tool-card grid; fragment wrapper MUST use `.main-container games` not `.main-container tools`)

## Container Class Convention
ALL content pages MUST use `class="main-container games"` as the wrapper. The `.games` modifier in `chronicles.css` lines 3–16 resets the legacy `.main-container` (removes the semi-transparent box, backdrop-filter, centered text, fixed width). Without `.games`, the old ghost-box appearance returns.
- Correct: `games.html`, `chronicles.html`, `character-sheets.html`, `card-creator-local.html`, `resource-manager.html` — all use `.main-container.games`
- Bug pattern: `tools.html` was using `.main-container.tools` (no `.games`) — caused the semi-transparent vestigial box and wrong text color (Mar 2026, fixed)
- Extra modifier classes are fine alongside `.games`: e.g. `class="main-container games tools"` or `class="main-container games cs-page"`
- `temporal-codex.html` uses bare `.main-container` — also missing `.games`, may have the same visual bug

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
- `view.js` (active-session): `style="width:${bloodRatio.percent}%;"` on `.as-blood-fill` — runtime percentage width, matches progress bar pattern

## Card Creator Feature (css/card-creator.css, fragments/card-creator-local.html, js/tools/card-creator/card-creator.js)
- CSS Ownership: `css/card-creator.css`, loaded via `<link>` in the fragment
- Namespace prefix: `cc-` for all component classes
- FULLY AUDITED AND CLEAN as of Mar 2026 (all issues resolved)
- Card-art constants (intentional, commented in CSS): `color: #fff`, `text-shadow: 3px 3px 1px #000` on `.cc-card-text`; `color: color-mix(in srgb, var(--theme-text-on-accent) 73%, transparent)` on `.cc-card-description`
- All `img.style.left/top/transform/filter` in JS are dynamic image manipulation — ACCEPTABLE EXCEPTION
- Canvas export `ctx.fillStyle/shadowColor` values are Canvas 2D API — ACCEPTABLE EXCEPTION
- `style="display:none"` on the file input in HTML — ACCEPTABLE EXCEPTION (documented)
- Hidden `<img>` elements use `.hidden` class correctly (not inline style)

## Settings Feature (fragments/settings.html, css/theme-tuner.css, features/shared/theme-tuner.js)
- CSS Ownership: inline `<style>` block inside `fragments/settings.html` (no separate CSS file)
- Namespace prefix: `settings-` for all component classes
- UNRESOLVED violations as of Mar 2026:
  - `settings.html` line 142: `.settings-name-msg.error { color: var(--theme-accent) }` — WRONG TOKEN. Error states must use `var(--color-danger)` not `--theme-accent` (accent varies by theme)
  - `settings.html` lines 251–252: `editBtn.style.display` and `nameEl.style.display` — inline style show/hide. Fix: `classList.toggle("hidden", editing)`
- `theme-tuner.css`: all hardcoded values are INTENTIONAL — the panel is a developer overlay that must remain readable when app theme is broken. Do NOT flag.
- `theme-tuner.js` drag positioning (`el.style.left/top/right/bottom`) — ACCEPTABLE EXCEPTION (runtime mouse coords)
- `theme-tuner.js` `resolveToHex` helper (`tmp.style.color`) — ACCEPTABLE EXCEPTION (programmatic color resolution)

## Active Session Feature (css/active-session.css, features/active-session/, fragments/active-session.html)
- CSS Ownership: `css/active-session.css`, loaded via `<link>` inside `fragments/active-session.html`
- Namespace prefix: `as-` for all component classes
- UNRESOLVED violations as of Feb 2026:
  - `active-session.css` line 198: `.as-blood-fill` gradient uses 3 hardcoded hex values (`#7f0f1a`, `#c62828`, `#f04d4d`) — fix with `color-mix(var(--theme-accent), black/white)`
  - `active-session.css` lines 234–246: health dot damage colors (6 raw hex values) — extract to `--abn-damage-*` CSS custom properties at top of file
- STRUCTURAL GAP: ~18 `.as-handout-*`, `.as-delivery-*`, `.as-recipient-*`, `.as-form-msg` classes are used in HTML/JS but have NO CSS definitions in `active-session.css` — Handouts panel is completely unstyled
- Game-domain damage color pattern: VtM damage levels (bashing/lethal/aggravated) are not theme-specific. Correct approach is named CSS custom properties (e.g., `--abn-damage-lethal-bg`), not raw hex in rules.
