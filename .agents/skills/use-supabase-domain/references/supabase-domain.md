# Supabase Domain Reference

## Source Of Truth

- Session and current-user helpers: `js/supabase.js`
- Current player cache: `js/shared-player.js`
- Auth bootstrap and player provisioning: `js/auth.js`
- Chronicle list and join flows: `features/chronicles/service.js`
- Chronicle detail access checks: `features/chronicle-detail/service.js`
- Archive access checks: `features/document-archive/service.js`
- Shared handout/revelation participant patterns: `features/shared/handouts.js`
- Schema overview: `CLAUDE.md`
- RLS examples: `sql/players_rls_own_profile.sql`, `sql/chronicle_notes.sql`, `sql/revelations.sql`

Read the implementation before changing a pattern. There are still older files with duplicate queries; prefer the helpers and the newer service shapes above.

## Identity Ladder

Resolve the acting identity in this order:

1. Session
   - `abnGetSession()` in `js/supabase.js`
   - Use this when route bootstrap may race auth hydration
2. User
   - `abnGetCurrentUser()` in `js/supabase.js`
   - Use this when a feature needs the actual `auth.users` row
3. Player
   - `ABNPlayer.getId()` in `js/shared-player.js` when only `player_id` is needed
   - Query `players` by `user_id` when the feature needs player fields like `name` or `is_admin`
4. Participation
   - Query `chronicle_participants` by `chronicle_id + player_id`
5. Role
   - Use the returned `role` (`narrator` or `player`) to branch feature behavior

Do not restart the chain from auth if a higher-level identity is already in hand.

## Shared Helpers

### Session and user

- `abnGetSession(options?)`
- `abnGetCurrentUser(options?)`

Pattern:

- start from `abnGetSession()` on route/bootstrap code
- start from `abnGetCurrentUser()` when loading a user-owned screen that only cares about the current auth user

Live examples:

- `js/router.js`
- `features/character-sheets/bootstrap.js`
- `features/character-sheets/modules/notes.js`

### Current player

- `ABNPlayer.getId()`
- `ABNPlayer.refresh()`
- `ABNPlayer.clear()`

Pattern:

- use `getId()` when only `player_id` matters
- clear the cache on logout
- avoid repeated `players.eq("user_id", session.user.id)` calls inside the same render path if `ABNPlayer` is enough

Live examples:

- `js/shared-player.js`
- `js/app.js`
- `js/router.js`

### Player provisioning

- `ensurePlayer(options?)` in `js/auth.js`

Pattern:

- call it after `signUp` or `signInWithPassword`
- it creates the `players` row if missing and updates `last_login_at` if present

## Query Rules

### If you already have `session.user.id`

- query `players` by `user_id`
- use `.maybeSingle()` when the contract is one player per auth user
- do not call `supabase.auth.getUser()` again just to re-derive the same id

Example shape:

```js
const { data: player } = await supabase
  .from("players")
  .select("id, name, is_admin")
  .eq("user_id", session.user.id)
  .maybeSingle();
```

### If you only need `player_id`

- prefer `ABNPlayer.getId()`
- only hit `players` directly if the cache/helper is not available in that surface yet

### If you need chronicle participation

Preferred direct query:

```js
const { data } = await supabase
  .from("chronicle_participants")
  .select("role")
  .eq("chronicle_id", chronicleId)
  .eq("player_id", playerId)
  .maybeSingle();
```

Preferred fallback by auth user:

```js
const { data } = await supabase
  .from("chronicle_participants")
  .select("role, player_id, players!inner(user_id)")
  .eq("chronicle_id", chronicleId)
  .eq("players.user_id", userId);
```

Use the fallback only when the direct `player_id` path is missing or suspect.

## Schema And RLS Traps

### `chronicle_participants`

From `CLAUDE.md`:

- columns: `chronicle_id`, `player_id`, `role`
- primary key: `(chronicle_id, player_id)`
- there is no standalone `id` column

That means:

- do not `select("id, role")` from `chronicle_participants`
- do not write guards that assume a participant row has a separate id

### `players`

`players.user_id` is the bridge to `auth.users.id`.

That means:

- frontend permission checks should usually map `session.user.id -> players.id`
- SQL policies often map `auth.uid() -> players.user_id -> players.id`

### RLS mental model in this repo

- `players`: own row plus players that share a chronicle
- `chronicle_notes`: current user can read/write only their own player row inside their chronicles
- `revelations`: narrator or chronicle creator can manage all; associated players can read their own

When frontend permissions and SQL disagree, verify the user/player mapping first.

## Live Examples In This Repo

### Fetch current player by current auth user

- `features/chronicles/service.js`
- `features/chronicle-detail/service.js`
- `features/document-archive/service.js`

### Chronicle access guards

- `features/document-archive/controller.js`
- `features/revelations-archive/controller.js`
- `features/active-session/controller.js`

### Participant rosters and player joins

- `features/chronicles/service.js`
- `features/chronicle-detail/service.js`
- `features/shared/handouts.js`

## Review Checklist

- Is the code re-authenticating even though `session.user.id` is already available?
- Is the code querying `players` multiple times where `ABNPlayer.getId()` would do?
- Is the code assuming `chronicle_participants.id` exists?
- Is the service resolving access as `session -> player -> participation -> role`?
- Is the guard failure really a permission problem, or a broken user/player lookup?

## Fast Search Patterns

Use these when looking for nearby examples:

```bash
rg -n "abnGetSession|abnGetCurrentUser|ABNPlayer|ensurePlayer" js features
```

For player and participation queries:

```bash
rg -n "getCurrentPlayerByUserId|getParticipationByUserId|chronicle_participants|players!inner\\(user_id\\)" js features
```

For SQL/RLS identity mapping:

```bash
rg -n "auth.uid\\(|get_my_chronicle_ids|players.*user_id|chronicle_participants" sql
```
