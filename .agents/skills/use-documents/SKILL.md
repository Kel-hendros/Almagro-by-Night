---
name: use-documents
description: Use the shared document system in this repo when a task touches document-archive, document-screen, note/recap/revelation viewers or forms, document-type adapters, or document list/card variants. Use this before creating a new document-like screen so new work plugs into the existing registry, archive route, shared shells, and list presets instead of inventing parallel implementations.
---

# Use Documents

Use this skill whenever the task touches document viewers, document forms, or archive/list screens.

## Use This Skill When

- Adding a new `docType`
- Changing `document-archive`
- Changing `document-screen`
- Adjusting note, recap, or revelation cards/viewers/forms
- Defining which list style a document surface should use
- Reviewing whether a document UI should be shared or feature-local

## Source Of Truth

- Standards: `docs/ENGINEERING_STANDARDS.md`
- Shared shell logic: `features/shared/document-screen.js`
- Shared shell styles: `css/document-screen.css`
- Shared list presets/helpers: `features/shared/document-list.js`
- Shared list preset styles: `css/document-list.css`
- Archive fragment: `fragments/document-archive.html`
- Archive controller/view/service: `features/document-archive/*.js`
- Archive styles: `css/document-archive.css`
- Type registry: `features/shared/document-types/registry.js`
- Current adapters: `features/shared/document-types/note.js`, `recap.js`, `revelation.js`
- Current shared screens: `features/shared/note-screen.js`, `recap-screen.js`, `revelation-screen.js`

## Rules

- Treat `document-archive` as list, search, filters, pagination, and entry point only.
- Put document mutations in the shared viewer/form flow, not inline on archive cards, unless there is a documented exception.
- Add new document types through the shared registry/adapters, not by creating a separate archive page.
- Pick a list preset first, then customize the adapter/card details.
- If a document surface only needs the latest N items, use the shared list helper instead of custom slicing logic.
- Global list rule: if a surface does not request a specific count, show the latest `5` documents.
- If a surface requests a specific count, pass it explicitly, for example `1`.
- “Latest” means newest by creation time, not by visual order guessed in the DOM.
- Keep archive-specific CSS in `css/document-archive.css`, scoped by `data-archive-type` when needed.
- Keep shared viewer/form shell behavior in `document-screen`; scope special shell differences by `data-doc-type`.
- If the document surface uses tags, also use `use-tags`.
- If the work changes shared visuals or primitives, also use `use-themes`.
- If the work touches current user/player/permissions, also use `use-supabase-domain`.

## Global List Presets

Use these names consistently when discussing or implementing archive views:

- `Lista minimalista`
  - Runtime shape: `getListLayout() => "stack"`
  - Card content: title, meta, short preview
  - Best for linear text documents like recaps
- `Lista completa`
  - Runtime shape: `getListLayout() => "stack"`
  - Card content: title, meta, tags, preview, optional badge/footer
  - Best for text-heavy documents where metadata matters, like notes
- `Grid de cards`
  - Runtime shape: `getListLayout() => "grid"`
  - Card content: richer card with optional media/footer/chips
  - Best for visual or multi-recipient documents like revelations
- `Lista agrupada`
  - Runtime shape: custom `renderList()` with sections/groups
  - Can sit on top of stack or grid internals
  - Best when the same doc type needs grouping by owner/context, like narrator notes by player

These presets are surface-level decisions, not permanent properties of a `docType`.
The same document type can use different presets in different places if the UX goal changes.

## Common Moves

- Need a new doc type: add/register an adapter, choose a list preset, and wire a shared viewer/form if the doc is editable.
- Need only the latest N documents on a non-archive screen: use `ABNShared.documentList.getRecentRows(rows, { limit, getCreatedAt })`.
- Need archive-only behavior: edit the adapter plus `document-archive` view/controller hooks before touching unrelated screens.
- Need grouped sections: implement `renderList()` in the adapter instead of forcing the controller to know about that type.
- Need special archive filters: keep text search in the controller and expose type-specific stats/hooks from the adapter.
- Need special archive visuals: scope in `css/document-archive.css` by `[data-archive-type="..."]`.
- Need special viewer/form visuals: scope in shared document CSS by `[data-doc-type="..."]` and keep the shell contract intact.

## References

Read `references/document-system.md` when you need:

- the adapter contract for `document-archive`
- the shared `documentList` helper contract
- the shared document shell primitives
- the current list presets and which types use them
- the checklist for adding a new document type cleanly
- live examples and grep patterns in this repo
