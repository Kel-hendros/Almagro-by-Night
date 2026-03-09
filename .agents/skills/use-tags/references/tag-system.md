# Shared Tag System Reference

## Source Of Truth

- Logic: `features/shared/tags.js`
- Styles: `css/shared-tags.css`
- Long-form repo doc: `docs/SHARED_TAG_SYSTEM.md`

## Shared API

- `normalizeTag(rawTag, options?)`
- `createTagKey(rawTag)`
- `formatLabel(rawTag, options?)`
- `dedupe(tags, options?)`
- `parse(rawTags, options?)`
- `getTagObjects(tags)`
- `collectStats(items, options)`
- `renderFilterBar(options)`
- `renderEditor(options)`

Read the implementation in `features/shared/tags.js` when changing behavior, not just when consuming it.

## Live Examples In This Repo

### Readonly tags

- `features/shared/document-types/revelation.js`
- `features/shared/document-types/note.js`
- `features/shared/document-screen.js`

Pattern:
- normalize/dedupe incoming tags
- format with `formatLabel(..., { displayMode: "title" })`
- render `.abn-tag`
- use `.abn-tag-list` as the shared readonly wrapper in list/card contexts

### Tag editor in forms

- `features/shared/revelation-screen.js`
- `features/shared/note-screen.js`
- `features/resource-manager/resource-manager.js`

Pattern:
- feature owns `tags`
- feature owns `composerOpen`
- `renderEditor()` emits UI and callbacks
- feature decides when to save

### Tag filter bars

- `features/resource-manager/resource-manager.js`
- `features/document-archive/controller.js`
- `features/document-archive/view.js`
- `features/shared/document-types/revelation.js`

Pattern:
- keep `selectedTag` and `selectedTagLabel` in local state
- compute stats from the current pre-tag-filter subset
- call `renderFilterBar()`
- clicking the active tag clears it

## Integration Rules

### If a screen already has text search

- run text search first
- compute tag stats over that query-filtered subset
- then apply the active tag filter

This keeps the chip counters honest for the current search result.

### If a feature saves tags

- parse and dedupe before building the payload
- do not let `ABNShared.tags` persist directly

### If a feature only displays tags

- do not mount the editor
- do not create feature-specific tag chip CSS unless the shared styles are clearly insufficient
- use `.abn-tag-list` for shared readonly rows instead of archive-only wrappers

### If the tags live inside a shared document list/card

- keep the chip styling global through `.abn-tag` and `.abn-tag-list`
- let the document surface own spacing around the row
- do not reuse archive-only wrappers like `.da-tags-row` outside archive cards

## Fast Search Patterns

Use these when you need a nearby example:

```bash
rg -n "renderEditor\\(|collectStats\\(|renderFilterBar\\(|formatLabel\\(|ABNShared\\.tags"
```

For current archive integration:

```bash
rg -n "selectedTag|selectedTagLabel|renderTagFilters|getTagFilterStats" features/document-archive features/shared/document-types/revelation.js
```
