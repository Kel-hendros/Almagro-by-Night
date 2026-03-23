# Handoff: Territory Tab For Chronicles

Date: 2026-03-17

## Implemented

- Extracted shared map primitives into `js/shared-map.js`.
- Adapted `js/game.js` to reuse the shared map core without mixing chronicle territory logic into the control game domain.
- Added a new `Territorio` tab to `fragments/chronicle.html`.
- Added chronicle territory UI + map + POI editor in `features/chronicle-detail/territory.js`.
- Wired chronicle territory loading/subscription methods into `features/chronicle-detail/service.js`.
- Added territory styles to `css/chronicles.css`.
- Registered `js/shared-map.js` in `index.html`.
- Added SQL migration `sql/chronicle_territories.sql`.

## Data Model

Migration file:

- `sql/chronicle_territories.sql`

Creates:

- `public.chronicle_territories`
- `public.chronicle_territory_pois`

Includes:

- triggers for `updated_at`
- RLS policies
- realtime publication registration for both tables

## Current Behavior

- Narrator can configure territory center label, lat, lng, zoom.
- Territory tab uses the linked game territory dataset as optional backdrop if `games.territory.maptiler_dataset_url` exists.
- Players and narrator can create POIs.
- Only POI author or narrator can edit/delete a POI.
- Visibility supports:
  - `all`
  - `narrator`
- Territory tab subscribes to realtime changes for config + POIs.

## Verification Already Done

Syntax checks passed:

- `node --check js/shared-map.js`
- `node --check features/chronicle-detail/territory.js`
- `node --check features/chronicle-detail/service.js`
- `node --check features/chronicle-detail/controller.js`
- `node --check js/game.js`

Schema verification after migration:

- `public.chronicle_territories` exists with RLS enabled
- `public.chronicle_territory_pois` exists with RLS enabled

## Supabase Status

The Supabase MCP is configured in `.mcp.json` for project ref:

- `queitmvjucbjoeodsgqk`

Migration applied successfully via MCP tool:

- `chronicle_territories`

## First Step After Restart

1. Test the chronicle page:
   - one chronicle with linked game territory backdrop
   - one chronicle without linked territory
2. Validate:
   - narrator config save
   - POI create/edit/delete
   - narrator-only visibility behavior
   - realtime refresh

## Existing Advisors

Current security advisors still report pre-existing issues unrelated to this migration, including:

- `public.debug_trigger_logs` with RLS enabled and no policy
- several functions with mutable `search_path`

Examples:

- [RLS Enabled No Policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Function Search Path Mutable](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)

## Main Files Touched

- `js/shared-map.js`
- `js/game.js`
- `index.html`
- `fragments/chronicle.html`
- `features/chronicle-detail/controller.js`
- `features/chronicle-detail/service.js`
- `features/chronicle-detail/territory.js`
- `css/chronicles.css`
- `sql/chronicle_territories.sql`

## Important Note

There were unrelated existing worktree changes in:

- `features/active-encounter/active-encounter.js`
- `features/active-encounter/rooms/room-manager.js`

Those were not modified as part of this task.
