# Shared Theme And UI Reference

## Source Of Truth

- Tokens: `css/theme-tokens.css`
- Shared components: `css/ui-components.css`
- Shared close button: `css/modal-close.css`
- Shared document shell: `css/document-screen.css`
- Theme/font switching: `js/router.js`
- Standards and promotion rules: `docs/ENGINEERING_STANDARDS.md`

## Theme Tokens

Prefer semantic `--color-*` tokens in new code.

Core groups in `css/theme-tokens.css`:

- Backgrounds: `--color-bg-base`, `--color-bg-surface`, `--color-bg-raised`
- Text: `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`
- Borders: `--color-border-subtle`, `--color-border-strong`
- Semantic accents: `--color-accent`, `--color-accent-soft`, `--color-success`, `--color-warning`, `--color-danger`, `--color-info`
- Decorative background: `--color-bg-decorative`
- Typography: `--app-font-body`, `--app-font-heading`, `--app-font-size-adjust`

Compatibility aliases:

- `--theme-*` still exists and maps to the new semantic tokens
- use aliases only when touching older code that already depends on them

## Theme And Font Selectors

Theme/font selection is driven from `js/router.js`.

Current themes:

- `dark`
- `light`
- `camarilla`
- `sabbat`
- `anarquista`
- `phantomas`

Current font presets:

- `clasico`
- `noir`
- `terminal`

Selectors applied at root:

- `data-app-theme`
- `data-app-font`

## Shared Component Inventory

### Buttons

Defined in `css/ui-components.css`:

- `.btn`
- `.btn--primary`
- `.btn--secondary`
- `.btn--ghost`
- `.btn--danger`
- `.btn-row`

Use for:

- primary actions
- save/cancel flows
- navigation and secondary actions

### Icon buttons

Defined in `css/ui-components.css`:

- `.btn-icon`
- `.btn-icon--primary`
- `.btn-icon--danger`

Use for:

- compact edit/delete/upload/reposition actions

### Modal close button

Defined in `css/modal-close.css`:

- `.btn-modal-close`

Use this instead of rolling a local `X` button.

### Shared document shell

Defined in `css/document-screen.css` and driven by `features/shared/document-screen.js`.

Use when the screen is really a document viewer/editor, not a generic feature page.

Important primitives:

- `doc-view-body`
- `doc-form-body`
- `doc-markdown`
- document screen shell classes under `.ds-*`

## Promotion Rules

From `docs/ENGINEERING_STANDARDS.md`:

- if a visual pattern repeats in 2+ features, move the base style to shared CSS
- feature CSS should keep local layout/spacing overrides, not duplicate base button/chip/modal visuals
- document-specific base visuals belong in `css/document-screen.css`, scoped by `data-doc-type` when needed

## Live Examples In This Repo

### Shared button usage

- `features/characters/view.js`
- `features/shared/revelation-screen.js`
- `features/document-archive/view.js`

### Shared destructive icon actions

- `features/shared/document-types/revelation.js`
- `features/revelations-archive/view.js`

### Shared modal/document shell

- `features/shared/document-screen.js`
- `css/document-screen.css`
- `features/shared/revelation-screen.js`
- `features/shared/note-screen.js`

## Decision Rules For New Screens

### If you need colors

- start from semantic tokens
- do not hardcode hex values if an existing semantic token fits

### If you need typography

- start from `--app-font-body` and `--app-font-heading`
- only introduce a local font choice if the screen is intentionally outside the app-wide theme language

### If you need a button

- start from `.btn*` or `.btn-icon*`
- add a feature class only for spacing/layout/context tweaks

### If you need a modal close

- start from `.btn-modal-close`

### If you need a document-like experience

- check `document-screen` before building a local shell

## Fast Search Patterns

Use these when looking for existing shared styles or integrations:

```bash
rg -n "btn--primary|btn--secondary|btn--ghost|btn--danger|btn-icon|btn-modal-close|doc-view-body|doc-form-body" css features js
```

For theme/font controls and selectors:

```bash
rg -n "data-app-theme|data-app-font|THEME_ORDER|FONT_ORDER|theme-tokens" css js
```
