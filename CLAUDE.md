# Almagro by Night — Project Context

## Overview

Vampire: The Masquerade tabletop RPG campaign management tool. Vanilla JS SPA with Supabase backend. No build step, no framework — pure HTML/CSS/JS with CDN dependencies.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JavaScript, HTML5, CSS3 |
| Routing | Hash-based SPA (`router.js`) |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Maps | MapLibre GL 2.4.0 |
| Icons | Lucide Icons |
| Build | None (static files, GitHub Pages) |

## Supabase Connection

- **Project URL**: `https://queitmvjucbjoeodsgqk.supabase.co`
- **Client config**: `/js/supabase.js`
- **Auth**: Supabase Auth with email/password forms in `auth.js` (no credentials stored in code — users enter their own at runtime)

## Project Structure

```
index.html              ← SPA shell with sidebar nav
js/
  supabase.js           ← Supabase client init (5 lines)
  auth.js               ← Login/signup (224 lines)
  router.js             ← Hash-based routing (269 lines)
  app.js                ← App init, SingleGameStore (479 lines)
  chronicles.js         ← Chronicle CRUD + invite system (297 lines)
  game.js               ← Territorial influence game (1304 lines)
  detail.zone.js        ← Zone detail panel (861 lines)
  combat-tracker.js     ← Encounter list & management (703 lines)
  active-encounter.js   ← Live combat UI (2292 lines)
  tactical-map.js       ← MapLibre map rendering (646 lines)
  actions-ui.js         ← Action selection modal (446 lines)
  ghoul.js              ← Ghoul management (356 lines)
  temporal-codex.js     ← Temporal records (177 lines)
  shared-picker.js      ← Reusable picker component (91 lines)
  active-character-sheet.js  ← Character display (45 lines)
  template-definitions.js    ← Template utils (43 lines)
fragments/              ← 14 HTML view templates loaded by router
css/                    ← 10 CSS files (styles.css has global vars)
characterSheets/        ← Standalone character sheet app (script.js = 230KB)
knowledge_base/         ← VtM disciplines & rules docs
docs/
  PROJECT_RULES.md      ← Code style guidelines
  plans/                ← Development plans with dates
```

## Database Schema (Supabase)

### Core Tables

**players**
- `id` uuid PK
- `user_id` uuid (references auth.users)
- `is_admin` boolean

**chronicles** (groups campaigns together)
- `id` uuid PK
- `name` text
- `description` text
- `status` text ('active' | 'archived')
- `invite_code` text unique (8 chars, generated)
- `creator_id` uuid → players(id)
- `created_at` timestamptz

**chronicle_participants**
- `chronicle_id` uuid → chronicles(id)
- `player_id` uuid → players(id)
- `role` text ('narrator' | 'player')
- PK: (chronicle_id, player_id)

**character_sheets**
- `id` uuid PK
- `user_id` uuid (owner)
- `chronicle_id` uuid → chronicles(id) (nullable)
- `data` jsonb (full character sheet data)
- Has rituals data in `data.rituals` array

**games** (territorial influence games)
- `id` uuid PK
- `name` text
- `creator_id` uuid → players(id)
- `chronicle_id` uuid → chronicles(id) (nullable)

**game_participants**
- `game_id` uuid → games(id)
- `player_id` uuid → players(id)

**encounters**
- `id` uuid PK
- `name` text
- `status` text ('wip' | 'ready' | 'in_game' | 'archived')
- `chronicle_id` uuid → chronicles(id) (nullable)
- `data` jsonb (tokens, instances, map config, grid)

**zones** — fixed zone data for territorial game
**zone_influence** — faction influence per zone
**actions_log** — action history for influence game

### Key RPCs

- `generate_invite_code()` → text (8-char alphanumeric)
- `join_chronicle_by_code(p_code text)` → jsonb (joins player to chronicle)
- `is_current_user_admin()` → boolean
- `move_encounter_token(encounter_id, token_id, x, y)` → boolean (player token movement with ownership check)

### RLS Policies

- **Chronicles**: participants can SELECT; any authenticated can INSERT; only creator can UPDATE/DELETE
- **Chronicle participants**: participants see each other; insert via RPC; narrator can DELETE
- **Encounters**: admin sees all, non-admin sees only `in_game`; admin-only INSERT/UPDATE/DELETE
- All tables have RLS enabled

## SQL Migration Files (Not yet applied — run manually in Supabase SQL Editor)

1. **`chronicles.sql`** — Chronicles system: tables, FKs, RLS, RPCs, data migration from existing game
2. **`encounters_multiplayer.sql`** — Status normalization, RLS, `move_encounter_token` RPC
3. **`delete_avatar_trigger.sql`** — Avatar cleanup trigger

**IMPORTANT**: These SQL migrations may or may not have been applied yet. Check the database state before re-running them. The chronicles migration includes a data migration block that creates a chronicle from the first existing game.

## Application Architecture

### Routing
Hash-based: `#welcome`, `#chronicles`, `#chronicle`, `#games`, `#game`, `#character-sheets`, `#active-character-sheet`, `#combat-tracker`, `#active-encounter`, `#tools`

### State Management
- `SingleGameStore` in `app.js` — loads/caches current game data
- `localStorage.currentChronicleId` — persists selected chronicle across sessions
- No global state library — each module manages its own state

### Data Flow
```
Auth (Supabase) → Chronicle selection → Game/Character/Encounter → Active gameplay → Save to Supabase
```

### Encounter Data Model (in `encounters.data` jsonb)
```json
{
  "instances": [{ "id": "...", "name": "...", "isPC": true/false, "characterSheetId": "...", "faction": "...", "stats": {...} }],
  "tokens": [{ "id": "...", "instanceId": "...", "x": 0, "y": 0 }],
  "grid": { "cols": 20, "rows": 20, "cellSize": 40 },
  "mapConfig": { "url": "...", "bounds": [...] }
}
```

### Encounter States
- `wip` — being designed by narrator
- `ready` — narrator finished setup, not yet live
- `in_game` — live, players can see and move tokens
- `archived` — game over

### Influence System
- Zones have influence breakdown: `{ neutral, factionA, factionB }`
- Fill neutral first, discount rival last, cap at goal
- Documented in `influencia_documentacion.md`

## Code Style Rules

1. **No inline styles** — all styling via CSS classes
2. **CSS variables** — use `--color-red-accent`, etc. from `styles.css`
3. **Modular components** — reusable patterns like `shared-picker.js`
4. **Check before edit** — verify if functionality already exists globally
5. **Clean cleanup** — when removing code, remove all references too

## Current Development Status (Feb 2026)

### Recently Completed
- Chronicles system (central hub grouping characters, encounters, games)
- Dock pager (pagination for panels with multiple tabs)
- Ritual CRUD in character sheets
- Attacks system with dice roller
- Specialty support in attacks
- Encounter state management controls (wip → ready → in_game → archived)

### Pending / In Progress
- **Chronicles SQL migration needs to be applied** to Supabase (run `chronicles.sql`)
- **Encounters multiplayer SQL** needs to be applied (`encounters_multiplayer.sql`)
- Connect chronicles JS to real Supabase data (currently the UI is built but may need testing with real data)
- Multiplayer encounter features (players moving their own tokens)

## Key Patterns

### Loading HTML Fragments
```javascript
// Router loads fragment HTML into #main-content
async function loadFragment(name) {
  const res = await fetch(`fragments/${name}.html`);
  document.getElementById('main-content').innerHTML = await res.text();
}
```

### Supabase Queries
```javascript
// Standard pattern used throughout
const { data, error } = await window.supabase
  .from('table_name')
  .select('*')
  .eq('column', value);
```

### Component Init Pattern
```javascript
// Each JS module exports an init function called after fragment loads
window.initChronicles = async function() { /* ... */ };
```
