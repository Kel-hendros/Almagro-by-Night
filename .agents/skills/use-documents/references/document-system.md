# Shared Document System Reference

## Source Of Truth

- Standards and contract: `docs/ENGINEERING_STANDARDS.md`
- Shared viewer/form shell logic: `features/shared/document-screen.js`
- Shared viewer/form shell styles: `css/document-screen.css`
- Shared list helper: `features/shared/document-list.js`
- Shared list styles: `css/document-list.css`
- Archive fragment and route payload: `fragments/document-archive.html`
- Archive flow: `features/document-archive/service.js`, `view.js`, `controller.js`, `index.js`
- Archive styles: `css/document-archive.css`
- Type registry: `features/shared/document-types/registry.js`
- Current adapters: `features/shared/document-types/note.js`, `recap.js`, `revelation.js`
- Current shared document screens: `features/shared/note-screen.js`, `recap-screen.js`, `revelation-screen.js`

## Architecture

### 1. Shared viewer/form shell

Everything document-like should open inside `ABNShared.documentScreen.open({...})`.

Shared shell responsibilities:

- modal/sheet lifecycle
- title, subtitle, tags
- header and footer actions
- base reading/form layout
- `data-doc-type` hook for scoped variations

Core primitives from `css/document-screen.css`:

- `doc-view-body`
- `doc-view-card`
- `doc-markdown`
- `doc-form-body`
- `doc-form-wrap`
- `doc-form-group`
- `doc-form-row`
- `doc-form-input`
- `doc-form-textarea`

### 2. Shared archive route

`document-archive` is a generic route loaded by `fragments/document-archive.html`.

Archive responsibilities:

- header
- search
- tag filters
- pagination
- list/grid host
- click handling and create action handoff

Archive is not the place for full editing flows.

### 3. Shared list helper

`features/shared/document-list.js` owns reusable list presets and the global “latest N documents” rule for non-archive surfaces.

Current helper API:

- `applyPreset(host, preset)`
- `createItem(options)`
- `buildPreviewText(text, { maxLines })`
- `stripMarkdownPreservingBreaks(text)`
- `getRecentRows(rows, { limit, getCreatedAt })`
- `renderSkeleton(host, { preset, count })`
- `normalizeLimit(limit)`
- `DEFAULT_LIMIT`

Global list rule:

- if a surface does not ask for a specific count, show the latest `5`
- if a surface asks for a count, use that number
- latest means newest by creation time

Use this helper on local surfaces like `Crónica > Diario` instead of re-implementing pagination or ad hoc slicing.

Important distinction:

- archive cards live in the adapter `renderCard()` path and can use archive-specific wrappers/styles
- local non-archive detailed lists should use `createItem({ variant: "detailed" })` plus shared `css/document-list.css` anatomy

### 4. Type registry

`features/shared/document-types/registry.js` is the plug-in point.

Each `docType` registers an adapter. The controller resolves the adapter from the hash `type` and delegates behavior to it.

## Adapter Contract

Common adapter methods:

- `getArchiveTitle(ctx)`
- `getArchiveSubtitle(ctx)`
- `getSearchPlaceholder(ctx)`
- `getCreateLabel(ctx)`
- `canCreate(ctx)`
- `getPageSize(ctx)`
- `getListLayout(ctx)` returning `"stack"` or `"grid"`
- `getEmptyMessage(ctx, { query })`
- `fetchRows(ctx)`
- `filterRows(rows, query, ctx, filters?)`
- `renderCard(row, ctx)`
- `openCreate(ctx, helpers)`
- `handleListClick(event, ctx, helpers)`

Optional adapter methods:

- `renderList(rows, ctx, meta)` when the type needs grouped/custom list markup
- `getTagFilterStats(rows, ctx, filters)` when the type exposes tag chips
- `buildDetailedListItemOptions(row, ctx)` for shared non-archive detailed lists
- `getSecondaryBackAction(ctx)`
- `subscribe(ctx, { onChange })`
- `unsubscribe(subscription)`

Rule:

- keep generic list orchestration in the controller
- push type-specific rendering and behavior into the adapter
- if a local surface wants the shared detailed list, adapters should return data, not bespoke markup

## Global List Presets

These are the team-level presets to reuse when designing document archives.

Important:

- presets belong to a surface, not forever to a doc type
- the same doc type can appear with different presets in different contexts
- archives and local chronicle surfaces do not have to use the same preset if the UX intent is different

### `Lista minimalista`

Meaning:

- stack layout
- title first
- compact meta
- short text preview
- no heavy footer or media by default

Use for:

- recaps
- linear reading documents
- lists where scanning chronology matters more than metadata density

Current live example:

- `features/shared/document-types/recap.js`
- `Archivo de Recuentos`

### `Lista completa`

Meaning:

- stack layout
- title + meta + tags + preview
- optional badge/footer
- still text-forward

Use for:

- notes
- text documents where tags and ownership matter

Current live example:

- `features/shared/document-types/note.js`
- `Archivo de Notas`

### `Lista detallada`

Meaning:

- non-archive shared list item built with `documentList.createItem({ variant: "detailed" })`
- title + meta + tags + preview + optional thumbnail
- same typography, spacing, and content anatomy across document types
- adapter provides values through `buildDetailedListItemOptions(...)`

Use for:

- `Crónica > Diario > Sesiones`
- `Crónica > Diario > Mis Notas`
- `Crónica > Diario > Revelaciones`

Current live example:

- `features/chronicle-detail/recaps.js`
- `features/chronicle-detail/notes.js`
- `features/chronicle-detail/controller.js`
- `features/shared/document-types/recap.js`
- `features/shared/document-types/note.js`
- `features/shared/document-types/revelation.js`

### `Grid de cards`

Meaning:

- grid layout
- 1 to 3 columns depending on width
- richer cards
- optional media
- footer content can anchor to bottom for equal row heights

Use for:

- revelations
- more visual document archives
- items where recipients, previews, or thumbnails are part of the scan pattern

Current live example:

- `features/shared/document-types/revelation.js`
- `css/document-archive.css`

### `Lista agrupada`

Meaning:

- custom `renderList()` output with titled sections
- each section can internally use stack or grid
- useful when the archive needs semantic grouping

Use for:

- narrator-facing note archives grouped by player
- any archive where ownership or section headers matter more than pure chronology

Current live example:

- `features/shared/document-types/note.js`

## What Belongs Where

### Shared shell layer

Put here:

- modal/frame lifecycle
- document reading/form primitives
- markdown typography
- shared action button behavior

Files:

- `features/shared/document-screen.js`
- `css/document-screen.css`

### Shared doc-type screen layer

Put here:

- note/recap/revelation viewer logic
- note/recap/revelation form logic
- type-specific actions and persistence flow

Files:

- `features/shared/note-screen.js`
- `features/shared/recap-screen.js`
- `features/shared/revelation-screen.js`

### Archive adapter layer

Put here:

- row normalization
- fetch/filter/render for a `docType`
- list click behavior
- create action handoff
- optional grouping or type-specific filter stats

Files:

- `features/shared/document-types/*.js`

### Archive controller/view layer

Put here:

- route parsing
- adapter resolution
- shared pagination/search flow
- shared archive UI

Files:

- `features/document-archive/*.js`

### Local non-archive document list layer

Put here:

- small in-context lists like `Crónica > Diario`
- latest-N selection using `documentList.getRecentRows(...)`
- shared detailed list composition using `documentList.createItem({ variant: "detailed" })`
- adapter-owned row mapping through `buildDetailedListItemOptions(...)`

Files:

- `features/shared/document-list.js`
- `css/document-list.css`
- the consuming feature module, for example `features/chronicle-detail/recaps.js`
- any fragment that must load the required shared adapters, for example `fragments/chronicle.html`

## Adding A New Document Type

1. Decide whether the entity is really a document.
   - If it needs a reader/editor shell and archive entry point, it probably is.
2. Decide the list preset.
   - `Lista minimalista`, `Lista completa`, `Grid de cards`, or `Lista agrupada`
2b. Decide whether the surface is archive-sized or latest-N.
   - If it is just a local summary/list, default to the latest `5`
   - If it needs another amount, pass the limit explicitly
2c. If the local surface should match the shared detailed list, add `buildDetailedListItemOptions(...)` to the adapter instead of inventing local card markup.
3. Create or reuse a shared document screen.
   - Use `ABNShared.documentScreen.open({...})`
4. Create a new adapter under `features/shared/document-types/`
   - register the type
   - implement fetch/filter/render/open handlers
5. Ensure the archive fragment loads the adapter script.
6. Scope any archive-only CSS under `[data-archive-type="new-type"]`.
7. Scope any shell/viewer-only CSS under `[data-doc-type="new-type"]` when possible.

## Design And Behavior Rules

- Archive cards are for discovery, not full editing.
- Local document lists should default to the latest `5` unless the surface explicitly asks for another count.
- Local document lists should use creation-time recency when picking “latest”.
- Local detailed lists should share title/meta/tags/preview/media styling across doc types.
- Archive visuals and local detailed-list visuals should not diverge through feature-local CSS patches.
- Search, tag filters, and pagination stay generic unless there is a strong reason otherwise.
- If the type uses tags, use the shared tag system instead of local tag chips.
- If a visual rule applies to multiple document types, put it in shared CSS rather than feature-local CSS.
- If a special visual rule only applies to one type, scope it by archive/doc type instead of branching globally.

## Live Examples

### Notes

- Adapter: `features/shared/document-types/note.js`
- Screen: `features/shared/note-screen.js`
- Preset: `Lista completa` + `Lista agrupada` for narrator
- Local list: `Lista detallada` in `Crónica > Diario > Mis Notas`

### Recaps

- Adapter: `features/shared/document-types/recap.js`
- Screen: `features/shared/recap-screen.js`
- Archive preset: `Lista minimalista`
- Local list: `Lista detallada` in `Crónica > Diario > Sesiones`

### Revelations

- Adapter: `features/shared/document-types/revelation.js`
- Screen: `features/shared/revelation-screen.js`
- Preset: `Grid de cards`
- Local list: `Lista detallada` in `Crónica > Diario > Revelaciones`

## Review Checklist

- Is this really a document and not just another feature card?
- Is the work reusing `document-screen` instead of inventing a new shell?
- Is the archive behavior living in an adapter instead of in the generic controller?
- Is the chosen list preset clear and consistent with the document type?
- If this is a local list, is it using the shared latest-N rule instead of custom manual limits?
- If this is a local detailed list, is the adapter returning `buildDetailedListItemOptions(...)` instead of custom markup?
- Are special styles scoped by `data-archive-type` or `data-doc-type` instead of leaking globally?
- If tags are present, is the shared tag system being used?

## Fast Search Patterns

Use these when looking for nearby examples:

```bash
rg -n "documentScreen|documentTypes\\.register|getListLayout|renderList|renderCard|buildDetailedListItemOptions|openCreate|handleListClick|documentList|getRecentRows" features/shared features/document-archive features/chronicle-detail
```

For archive CSS hooks:

```bash
rg -n "data-archive-type|da-list--grid|da-list--stack|da-groups|da-group" css/document-archive.css features/shared/document-types
```

For shared document shell hooks:

```bash
rg -n "data-doc-type|doc-view-body|doc-form-body|doc-markdown|ds-overlay|ds-body" css/document-screen.css features/shared
```
