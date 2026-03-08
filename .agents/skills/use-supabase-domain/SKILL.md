---
name: use-supabase-domain
description: Use the shared Supabase auth, current-user, player, and chronicle-permission patterns in this repo when a task touches sessions, players, chronicle_participants, or feature services that resolve the current actor. Use this before adding new Supabase queries so you do not re-authenticate unnecessarily, duplicate current-user/player lookups, or drift from the repo's permission model.
---

# Use Supabase Domain

Use this skill whenever the task touches auth/session identity or chronicle access rules.

## Use This Skill When

- Resolving the current user or session
- Resolving the current player from an auth user
- Checking if the current actor participates in a chronicle
- Writing or reviewing feature-service queries against `players` or `chronicle_participants`
- Debugging "no tiene permisos" flows that may actually be identity lookup mismatches
- Adding a new screen that already has the current user or player in hand

## Source Of Truth

- Session/current user helpers: `js/supabase.js`
- Cached current player helper: `js/shared-player.js`
- Signup/login bootstrap: `js/auth.js`
- Chronicle/player access patterns: `features/chronicle-detail/service.js`
- Archive access patterns: `features/document-archive/service.js`
- Revelations access patterns: `features/revelations-archive/service.js`
- Chronicle overview patterns: `features/chronicles/service.js`
- Schema and role shape: `CLAUDE.md`
- RLS examples: `sql/chronicle_notes.sql`, `sql/revelations.sql`, `sql/players_rls_own_profile.sql`

## Rules

- Prefer `abnGetSession()` over raw `supabase.auth.getSession()` when route load can race auth hydration.
- Prefer `abnGetCurrentUser()` when the feature needs the current user object, not just the session.
- Prefer `ABNPlayer.getId()` when the feature only needs the current `player_id`.
- If the feature already has `session.user.id`, resolve `players` by `user_id`; do not ask auth for the user again.
- If the feature already has `player_id`, do not re-query `players` just to confirm the same actor.
- Treat `chronicle_participants` as keyed by `(chronicle_id, player_id)`. Do not assume it has an `id` column.
- For chronicle access, resolve in this order: session -> player -> participation -> role.
- Keep identity helpers in shared JS; keep business-table queries in feature services.
- When a query fails with "sin permisos", verify the user/player mapping before changing RLS or view guards.

## Common Moves

- Need current user: use `abnGetCurrentUser()` or `abnGetSession()`
- Need current player ID: use `ABNPlayer.getId()`
- Need current player row by auth user: query `players` by `user_id`
- Need chronicle access: query `chronicle_participants` by `chronicle_id + player_id`
- Need fallback by auth user: join `chronicle_participants` with `players!inner(user_id)`
- Need signup/login bootstrap: call `ensurePlayer()` after successful auth
- Need to debug a permission guard: compare `session.user.id`, resolved `player_id`, and `chronicle_participants` row before touching SQL

## References

Read `references/supabase-domain.md` when you need:

- the identity and permission flow used in this repo
- live examples for current user, current player, and chronicle participation
- schema pitfalls like `chronicle_participants`
- grep patterns to find nearby service implementations fast
