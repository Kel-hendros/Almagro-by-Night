# Dock Pagination + Rituals System

## Summary

Add page-based navigation to the dock tabs (right sidebar) so they can hold more than 6 tabs, and add a Rituals system as the first tab of a new second page group.

## Dock Pagination

### Structure

A pager widget (`< ● ○ >`) sits above the existing tab grid. Two tab pages exist:

- **Page 1 (current):** Disciplinas, Virtudes, Trasfondos, Méritos y Defectos, Experiencia, Notas
- **Page 2 (new):** Rituales, Armas, + 4 empty placeholder slots

Each page is a `<div class="dock-tab-page">`. Only the one with `.active` is visible. The grid layout (2-col, 3-row) stays the same on both pages.

### Pager widget

```
‹  ● ○  ›
```

- `<div class="dock-pager">` containing prev/next buttons and dot indicators
- Dots are `<span class="dock-dot">` with `.active` on the current page
- Clicking arrows or dots switches which `dock-tab-page` is visible
- On page switch: if the currently active panel belongs to the hidden page, auto-activate the first real tab of the new page

### Placeholder slots

Empty slots on page 2 are `<div class="dock-tab-placeholder">` — same size as a tab button but inert, styled subtle/disabled.

## Rituals System

### Data model

```javascript
let characterRituals = [];
// Each entry: { name: string, level: number, disciplineId: number, description: string }
```

### Save / Load

- `getRitualsData()` — maps `characterRituals` to clean objects, returns array
- `loadRitualsFromJSON(characterData)` — reads `characterData.rituals`, populates array, calls render
- Stored under `characterData.rituals` in the Supabase JSON column
- Registered in `getCharacterData()` and `loadCharacterFromJSON()` following the existing pattern

### UI — Form

Inside `#panel-rituales`:

- `+` button toggles a hidden form (same pattern as merits/defects)
- Fields:
  - **Nombre:** text input, required
  - **Nivel:** number input, min=1, no upper limit
  - **Disciplina:** button that opens discipline modal in single-select mode. Shows selected discipline name or placeholder text.
  - **Descripción:** textarea, optional
- Submit pushes to `characterRituals`, resets form, calls `saveCharacterData()`

### UI — Ritual list (accordions by discipline)

`renderRitualList()`:

1. Group rituals by `disciplineId`
2. Sort groups by discipline name
3. Within each group, sort rituals by level ascending
4. Render each group as a collapsible section:
   - Header: discipline name (click to expand/collapse)
   - Body: list of rituals, each showing name + level badge + edit/delete buttons
   - Expanding a ritual shows its description (same pattern as merits/defects items)

### Discipline modal — single-select mode

The existing `#discipline-repo-modal` is extended with a mode parameter:

- **Multi-select mode (current):** toggle selection, "Aplicar" button commits. Used by discipline system.
- **Single-select mode (new):** clicking a discipline immediately selects it and closes the modal. No "Aplicar" button shown. A callback receives the selected `disciplineId`.

Implementation: `openModal()` accepts an options object `{ mode: "single"|"multi", onSelect: fn }`. In single mode, clicking an item calls `onSelect(id)` and closes.

## Weapons Tab

Panel `#panel-armas` contains a placeholder message. No logic for now.

## Files changed

- `characterSheets/index.html` — pager widget, page wrappers, new panels, placeholder slots
- `characterSheets/style.css` — pager styles, placeholder styles, ritual accordion styles
- `characterSheets/script.js` — pager logic, ritual CRUD, modal single-select mode, save/load integration
