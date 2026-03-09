---
name: use-tags
description: Use the shared tag system in this repo for tag rendering, tag editors, normalization, dedupe, and tag filter bars. Use when a task touches tags in notes, revelations, document archives, resource manager, or any screen that should rely on ABNShared.tags instead of custom local tag logic.
---

# Use Tags

Use this skill whenever the task involves tag UI or tag behavior.

## Use This Skill When

- Adding readonly tags to cards, viewers, or lists
- Adding or changing a tag editor in a form
- Adding tag filter chips with counters
- Normalizing, deduping, or parsing tag input before save
- Reviewing a screen that currently implements tags locally

## Source Of Truth

- Logic: `features/shared/tags.js`
- Styles: `css/shared-tags.css`
- Deeper repo doc: `docs/SHARED_TAG_SYSTEM.md`

The feature owns state and persistence. `ABNShared.tags` only handles normalization, render helpers, and UI events.

## Rules

- Do not reimplement tag chips, tag filters, or tag editors locally if the shared system can do it.
- Keep persistence in the consuming feature. The shared tag system must not talk to Supabase or business tables.
- Default to `displayMode: "title"` unless the feature already has a strong reason not to.
- Tag filters should combine with existing text filters, not replace them.
- When comparing tags, use stable keys (`createTagKey`) rather than raw labels.
- For readonly tag rows in shared cards/lists, use the global wrapper `.abn-tag-list`.
- Do not use archive-only wrappers like `.da-tags-row` on shared non-archive lists.
- If the tag surface is inside a document list/card flow, also use `use-documents`.

## Common Moves

- Readonly tags: use `dedupe()` + `formatLabel()` and render `.abn-tag` inside `.abn-tag-list`
- Filter bar: use `collectStats()` + `renderFilterBar()` with local `selectedTag` state
- Editor: use `renderEditor()` and keep `tags` plus `composerOpen` in local state
- Save path: use `parse()` and/or `dedupe()` before building the payload

## References

Read `references/tag-system.md` when you need:

- the file map
- live examples inside this repo
- integration patterns for editor vs filter bar vs readonly tags
- grep patterns to find existing implementations fast
