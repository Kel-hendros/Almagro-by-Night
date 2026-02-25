# Encounter–Sheet Bridge Architecture

The bridge enables **bidirectional communication** between the active character sheet page (parent window) and the character sheet running inside an iframe, synchronizing encounter state in real time.

## File Map

| File | Runs in | Purpose |
|------|---------|---------|
| `features/active-character-sheet/encounter-bridge.js` | Parent | Connects to Supabase, subscribes to encounter changes, posts state to iframe |
| `features/active-character-sheet/encounter-bar.js` | Parent | Renders a slim status bar (round, turn) above the iframe |
| `features/active-character-sheet/controller.js` | Parent | Orchestrates bridge + bar lifecycle (init / destroy) |
| `features/character-sheets/modules/encounter-blood-tracker.js` | Iframe | Enforces blood-per-turn limit, shows indicator in blood card |
| `features/character-sheets/modules/health-blood.js` | Iframe | Blood consumption hooks (`beforeConsume` / `afterConsume`) |
| `features/character-sheets/modules/disciplines.js` | Iframe | Celerity activation → bypass + RPC notification |
| `features/active-encounter/active-encounter-turns.js` | Narrator | `nextTurn()` cleans up expired extra-action instances on round advance |
| `encounter_bridge.sql` | Database | Partial unique index + RPCs (`get_active_encounter_for_chronicle`, `add_encounter_extra_actions`) |

## Data Flow

```
┌──────────────────────────────────────────────────┐
│  Parent (active-character-sheet page)            │
│                                                  │
│  encounter-bridge.js                             │
│    ├─ connect() → RPC get_active_encounter…      │
│    ├─ subscribes to postgres_changes on encounter│
│    ├─ emits CustomEvents on window               │
│    └─ postMessage → iframe (abn-encounter-state) │
│                                                  │
│  encounter-bar.js                                │
│    └─ listens to CustomEvents → updates bar UI   │
└──────────────┬───────────────────────────────────┘
               │ postMessage (parent → iframe)
               │ type: "abn-encounter-state"
               ▼
┌──────────────────────────────────────────────────┐
│  Iframe (character-sheets/index.html)            │
│                                                  │
│  encounter-blood-tracker.js                      │
│    ├─ listens for abn-encounter-state messages   │
│    ├─ tracks bloodSpentThisRound per round       │
│    ├─ hooks into health-blood beforeConsume/after │
│    └─ shows indicator in .blood-card             │
│                                                  │
│  disciplines.js (Celerity handler)               │
│    ├─ sets celeridadBypass before blood spending  │
│    └─ posts abn-celeridad-activate → parent      │
└──────────────┬───────────────────────────────────┘
               │ postMessage (iframe → parent)
               │ type: "abn-celeridad-activate"
               ▼
┌──────────────────────────────────────────────────┐
│  encounter-bridge.js (handleFrameMessage)        │
│    └─ calls RPC add_encounter_extra_actions      │
│       → inserts Celerity extra-action instances  │
│       → encounter update triggers realtime       │
└──────────────────────────────────────────────────┘
```

## Custom Events (on `window`, parent frame)

| Event | Fired when | `event.detail` |
|-------|-----------|----------------|
| `abn-encounter-connected` | First encounter data arrives | snapshot |
| `abn-encounter-updated` | Any encounter data change | snapshot |
| `abn-encounter-turn-changed` | `activeInstanceId` changes | snapshot |
| `abn-encounter-round-changed` | Round number increments | snapshot |
| `abn-encounter-disconnected` | Encounter ends or goes offline | `{}` |

**Snapshot shape:**
```js
{
  encounterId, encounterName, round, activeInstanceId,
  myInstance, isMyTurn, instances, connected
}
```

## postMessage Protocol

### Parent → Iframe: `abn-encounter-state`
```js
{
  type: "abn-encounter-state",
  connected: boolean,
  encounterId: string | null,
  sheetId: string | null,
  round: number,
  isMyTurn: boolean,
  activeInstanceId: string | null,
}
```
Sent on: connect, every encounter update, iframe `load` event.

### Iframe → Parent: `abn-celeridad-activate`
```js
{
  type: "abn-celeridad-activate",
  encounterId: string,
  sheetId: string,
  count: number,     // 0 = deactivate, 1-5 = extra actions
}
```

## Database Objects (`encounter_bridge.sql`)

### Partial unique index
```sql
idx_encounters_one_active_per_chronicle
  ON encounters (chronicle_id)
  WHERE status = 'in_game' AND chronicle_id IS NOT NULL
```
Enforces at most **one active encounter per chronicle**.

### `get_active_encounter_for_chronicle(p_chronicle_id uuid)` → jsonb
Lightweight RPC returning `{ id, name, status, round, activeInstanceId, instances }` or `null`. Called once on bridge connect, then realtime takes over.

### `add_encounter_extra_actions(p_encounter_id, p_character_sheet_id, p_action_type, p_count)` → boolean
- Locks the encounter row (`FOR UPDATE`)
- Validates ownership (player must own the sheet, unless admin)
- Removes existing extra actions for this sheet + current round (idempotent)
- `count = 0` → deactivation only (removes extras, adds nothing)
- `count > 0` → creates N instances with `isExtraAction: true`, placed after lowest initiative
- Extra action fields: `isExtraAction`, `extraActionType`, `extraActionRound`, `extraActionSourceInstanceId`

## Blood-Per-Turn Enforcement

The blood tracker hooks into `health-blood.js` via `setConsumeHooks()`:
- **`beforeConsume(points)`** — returns `false` to block if `bloodSpentThisRound + points > limit`
- **`afterConsume(points)`** — increments `bloodSpentThisRound`
- **Celerity bypass** — `disciplines.js` sets `setCeleridadBypass(true)` before spending blood for Celerity, then `false` after. Both hooks skip tracking during bypass.
- **Reset** — `bloodSpentThisRound` resets to 0 when the round changes or encounter disconnects.

Blood-per-turn limits by generation: Gen 10+ = 1, 9 = 2, 8 = 3, 7 = 4, 6 = 6, 5 = 8, 4 = 10, ≤3 = 99.

## Lifecycle

### Startup (navigating to `#active-character-sheet`)
1. `controller.initPage()` → `encounterBar.bind()` → `encounterBridge.connect()`
2. Bridge resolves `sheetId` + `chronicleId`, calls `get_active_encounter_for_chronicle`
3. If active encounter found → `applyEncounterData()` → events + postMessage
4. If no encounter → polls every 15s until one appears
5. Inside iframe, `encounter-blood-tracker.init()` listens for messages and hooks blood consumption

### Teardown (navigating away)
1. `router.js` detects route change → calls `controller.destroyPage()`
2. `destroyPage()` → `encounterBar.destroy()` + `encounterBridge.destroy()`
3. Bridge: clears poll, unsubscribes realtime, removes message/load listeners, resets state

### Iframe reload
The bridge binds the iframe's `load` event. When the iframe finishes loading, `handleFrameLoad()` re-sends the current encounter state so the blood tracker picks it up.

## Extra Action Cleanup

When `nextTurn()` in `active-encounter-turns.js` detects a round wrap, it filters out expired extra-action instances where `extraActionRound < newRound`. This prevents Celerity ghosts from piling up across rounds.

## Extending the Bridge

### Adding a new iframe → parent message type
1. Add a handler in `encounter-bridge.js` `handleFrameMessage()` (check `data.type`)
2. Define the message shape in this document
3. Implement the sender in the relevant iframe module using `global.parent.postMessage()`

### Adding a new parent → iframe notification
1. Add the field to `buildFramePayload()` in `encounter-bridge.js`
2. Handle it in `encounter-blood-tracker.js` `handleMessage()` (or create a new iframe-side module)

### Adding a new encounter event
1. Call `emit("abn-encounter-YOUR-EVENT", snapshot())` at the right point in `applyEncounterData()`
2. Optionally listen in `encounter-bar.js` to update the UI

### Adding another discipline / power that needs encounter interaction
Follow the Celerity pattern:
1. In the iframe discipline module: bypass tracker if needed, do the blood spend, then `postMessage` to parent with a new message type
2. In `encounter-bridge.js`: handle the message type, call appropriate RPC
3. In the RPC: validate, modify encounter data, persist
