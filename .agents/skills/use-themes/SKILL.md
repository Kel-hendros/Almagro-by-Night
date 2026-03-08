---
name: use-themes
description: Use the shared theme system and global UI components in this repo when working on colors, typography, tokens, theme-aware styling, document shell visuals, and shared controls like buttons, icon buttons, and modal close buttons. Use this skill before creating a new screen or introducing local styling that might already exist in theme-tokens.css, ui-components.css, modal-close.css, or document-screen.css.
---

# Use Themes

Use this skill whenever the task touches colors, fonts, tokens, or shared UI primitives.

## Use This Skill When

- Creating a new screen or feature layout
- Picking colors or typography for new UI
- Styling buttons, icon actions, modal close buttons, inputs, or shared document UIs
- Reviewing local CSS that might be duplicating shared theme/component styles
- Promoting a repeated local pattern into a shared component

## Source Of Truth

- Theme tokens: `css/theme-tokens.css`
- Shared components: `css/ui-components.css`
- Shared modal close button: `css/modal-close.css`
- Shared document shell: `css/document-screen.css`
- Router theme/font switching: `js/router.js`
- Standards doc: `docs/ENGINEERING_STANDARDS.md`

## Rules

- Prefer global tokens and shared components before inventing local styles.
- New code should prefer `--color-*` tokens. `--theme-*` exists for migration compatibility.
- Use local feature CSS for layout and spacing first, not for redefining shared base visuals.
- If a visual pattern appears in 2+ features, promote it to shared CSS instead of copying it.
- When working on document viewers/forms, start from `document-screen` rather than feature-local shells.

## First Options For New Screens

- Colors: start with `css/theme-tokens.css`
- Fonts: use `--app-font-body` and `--app-font-heading`
- Text buttons: `.btn`, `.btn--primary`, `.btn--secondary`, `.btn--ghost`, `.btn--danger`
- Compact icon actions: `.btn-icon`, `.btn-icon--primary`, `.btn-icon--danger`
- Modal close buttons: `.btn-modal-close`
- Document-like shells: `css/document-screen.css`

## Common Moves

- Need a button: reuse `.btn*` before making a feature-specific class
- Need a destructive icon action: reuse `.btn-icon--danger`
- Need a modal close: reuse `.btn-modal-close`
- Need theme-aware colors: map to semantic tokens first, then style
- Need a one-off variant: layer a feature class on top of the shared component

## References

Read `references/theme-system.md` when you need:

- the token map and theme/font selectors
- the shared component inventory
- promotion rules for moving local UI into shared CSS
- live examples and grep patterns in this repo
