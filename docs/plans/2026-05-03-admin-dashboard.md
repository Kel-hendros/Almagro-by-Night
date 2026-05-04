# 2026-05-03 — Admin Dashboard

## Objetivo

Nueva sección **Dashboard** sólo visible para usuarios admin, con métricas de producto pre-procesadas para lectura rápida. Se introducen tablas `dash_*` y un mecanismo de refresh manual con cache. Aprovechamos el evento para registrar mejor las tiradas (hoy se pierden por el auto-prune) y agregamos un sistema liviano de heartbeat para medir tiempo de actividad real.

## Métricas en alcance

**Estado actual (snapshot)**
- Totales: jugadores, narradores únicos, personajes, crónicas activas
- Promedio personajes por jugador
- Promedio jugadores por crónica
- Tiradas y mensajes totales últimos 30 días

**Por jugador**
- Tiempo activo (últimos 7 / 30 días)
- Sección donde más tiempo pasa (`#chronicle`, `#active-encounter`, `#character-sheets`, etc.)

**Por crónica → "partidas inferidas"**
- `started_at`, `ended_at`, `duration_min`, participantes, cantidad de tiradas y mensajes
- Promedio de pool y de éxitos
- Pulse chart: actividad por bucket de 5 min, separada por personaje

## Fuera de alcance (por ahora)

- Cualquier acción que mute datos desde el dashboard
- Exportar a CSV/PDF (se puede agregar después)
- Refresh automático (sólo manual con cache, según decisión 2026-05-03)
- Logs de eventos que no sean tiradas / mensajes / pings

---

## Decisiones tomadas

| # | Decisión | Razón |
|---|---|---|
| 1 | Refresh manual con botón + tabla cache | Free tier; los datos de producto no son time-critical |
| 2 | Gap entre actividad para partir sesión: **8h** | Confirmado con usuario; sesiones de rol pueden tener pausas largas |
| 3 | Tiempo de actividad por **heartbeat**, no por login | Logins son raros; heartbeat refleja uso real |
| 4 | Charts con **Chart.js** vía CDN | No build step; integración mínima |
| 5 | Prefijo `dash_` en lugar de schema custom | Free tier no requiere config extra |
| 6 | Cómputo **incremental** (sesiones cerradas inmutables) | Refreshes baratos a futuro |

---

## Arquitectura

### Tablas nuevas (todas en `public` con prefijo `dash_`)

#### `dash_dice_rolls` — log append-only
```sql
id                  uuid PK
chronicle_id        uuid → chronicles(id) on delete cascade
player_id           uuid → players(id) on delete set null
character_sheet_id  uuid → character_sheets(id) on delete set null
encounter_id        uuid null
context             text                  -- 'attack', 'discipline', 'willpower', etc.
pool                int
difficulty          int
results             int[]                 -- caras individuales
successes           int
botch               boolean
created_at          timestamptz default now()
```
**Poblado por trigger** sobre `chronicle_notifications` cuando `type = 'dice_roll'` (la única vía hoy es `ABNNotifications.controller.pushNotification` → `chronicle_notifications` → trigger). Así no dependemos de auditar todos los call-sites; cualquier path que loguee una tirada como notificación queda registrado. El auto-prune existente sigue corriendo sin afectar `dash_dice_rolls`.

#### `dash_user_activity_pings` — heartbeats crudos
```sql
id            bigserial PK
user_id       uuid → auth.users on delete cascade
route         text                       -- '#chronicle', '#active-encounter', etc.
chronicle_id  uuid null
pinged_at     timestamptz default now()
```
**Poblado por cliente** cada 60s mientras `document.visibilityState === 'visible'`. Pings con más de 30 días se purgan (los datos ya quedaron agregados en `dash_user_activity_daily`).

#### `dash_user_activity_daily` — agregado por (user, día, ruta)
```sql
user_id        uuid
day            date
route          text
seconds_active int                       -- suma de gaps consecutivos < 120s
ping_count     int
PRIMARY KEY (user_id, day, route)
```
Refresh sólo recalcula `day = current_date` (días pasados quedan inmutables).

#### `dash_inferred_sessions`
```sql
id              uuid PK
chronicle_id    uuid → chronicles(id) on delete cascade
started_at      timestamptz
ended_at        timestamptz
duration_min    int
participants    uuid[]                   -- player_ids con al menos 1 acción
roll_count      int
message_count   int
avg_pool        numeric(5,2)
avg_successes   numeric(5,2)
is_closed       boolean default false    -- true cuando última actividad > 8h
last_activity_at timestamptz
```
Sesiones con `is_closed = true` son inmutables y nunca se reprocesan.

#### `dash_session_activity_buckets`
```sql
session_id      uuid → dash_inferred_sessions(id) on delete cascade
bucket_start    timestamptz             -- cuantizado a 5 min
character_sheet_id uuid null
roll_count      int
message_count   int
PRIMARY KEY (session_id, bucket_start, character_sheet_id)
```
Sólo se recalculan los buckets de sesiones abiertas.

#### `dash_snapshot` — KPIs de estado actual (1 fila)
```sql
id           int PK CHECK (id = 1)       -- garantiza fila única
data         jsonb                       -- todos los KPIs
refreshed_at timestamptz default now()
```

### RPCs nuevas

- `dash_log_pings(p_pings jsonb)` — recibe array `[{route, chronicle_id, pinged_at}]` para batch insert (lo enviamos cada N pings o al cerrar tab vía `sendBeacon`)
- `dash_refresh()` — admin only. Orquesta:
  1. Reagregar `dash_user_activity_daily` para `current_date`
  2. Detectar `MAX(ended_at)` de sesiones cerradas; recalcular sesiones desde ahí
  3. Recalcular buckets de sesiones abiertas
  4. Sobrescribir `dash_snapshot`
  5. Devolver `refreshed_at`
- Trigger function `dash_capture_dice_roll()` sobre `chronicle_notifications` AFTER INSERT WHEN `type = 'dice_roll'`

### RLS

- `dash_dice_rolls`, `dash_user_activity_pings`, `dash_user_activity_daily`: **insert** vía RPC/trigger (security definer); **select** sólo si `players.is_admin = true`
- `dash_inferred_sessions`, `dash_session_activity_buckets`, `dash_snapshot`: **select** sólo admin; nadie inserta directamente (sólo `dash_refresh()`)
- `dash_refresh()` chequea `is_current_user_admin()` al inicio y aborta si no

### Lógica de clustering (8h gap)

Una "acción" para inferir sesiones = una fila en `dash_dice_rolls` ∪ `chronicle_messages` para esa crónica.

```sql
-- Pseudo-SQL
with actions as (
  select chronicle_id, created_at, 'roll' as kind, player_id
    from dash_dice_rolls where created_at > <since>
  union all
  select chronicle_id, created_at, 'msg', created_by_player_id
    from chronicle_messages where created_at > <since>
),
gapped as (
  select *,
    case
      when extract(epoch from (created_at - lag(created_at) over (
             partition by chronicle_id order by created_at))) > 8*3600
        or lag(created_at) over (...) is null
      then 1 else 0
    end as is_new_session
  from actions
),
sessioned as (
  select *,
    sum(is_new_session) over (partition by chronicle_id order by created_at) as session_seq
  from gapped
)
-- agrupar por (chronicle_id, session_seq) → upsert en dash_inferred_sessions
```

---

## Fases de implementación

### Fase 1 — SQL (aplicado vía Supabase MCP)
La migración se aplica con `mcp__supabase__apply_migration` contra el proyecto `queitmvjucbjoeodsgqk` y se versiona también como `sql/dashboard.sql` para que quede en el repo como fuente de verdad. Pasos:
- Crear las 6 tablas con índices
- Trigger `dash_capture_dice_roll` sobre `chronicle_notifications`
- RPCs `dash_log_pings`, `dash_refresh`
- RLS policies
- Backfill inicial: poblar `dash_dice_rolls` desde `chronicle_notifications` existentes con `type = 'dice_roll'` (las pocas que sobrevivieron al prune)
- Verificar con `mcp__supabase__list_tables` y `mcp__supabase__execute_sql` (selects de prueba) que todo quedó bien

### Fase 2 — Heartbeat cliente
**Archivo nuevo: `js/dash-heartbeat.js`**
- Inicia al haber sesión autenticada
- `setInterval` 60s; chequea `document.visibilityState`
- Buffer en memoria; flush cada 5 pings o al `pagehide` con `navigator.sendBeacon` → `dash_log_pings` RPC
- Lee ruta actual desde `window.location.hash`
- Lee `currentChronicleId` de localStorage

**Modificar [index.html](index.html)**: agregar `<script src="js/dash-heartbeat.js">`.

### Fase 3 — UI Dashboard
**Archivos nuevos:**
- `fragments/dashboard.html` — layout con header, KPI cards, tabla de actividad, listado de crónicas con detalle expandible
- `js/dashboard.js` — `window.initDashboard()` que lee `dash_snapshot`, renderiza KPIs, fetcha sesiones por crónica on-demand, renderiza pulse chart con Chart.js
- `css/dashboard.css` — estilos específicos siguiendo variables de [styles.css](css/styles.css)

**Modificar:**
- [js/router.js:358](js/router.js#L358) — agregar `dashboard: "fragments/dashboard.html"` al objeto `routes`
- [js/router.js](js/router.js) — gate de admin en `loadRoute`: si hash es `#dashboard` y `!is_admin` → redirect a `#welcome`
- [index.html](index.html) — agregar ítem de sidebar `#dashboard` (clase condicional `is-admin-only` que se muestra/oculta según `players.is_admin`); agregar `<script src="https://cdn.jsdelivr.net/npm/chart.js@4">` (sólo si la ruta lo necesita; o lazy-load en `dashboard.js`)
- [js/app.js](js/app.js) — exponer flag `window.__isAdmin` para que la sidebar lo lea (ya carga `is_admin` en el bootstrap)

### Fase 4 — Verificación manual
1. Aplicar `sql/dashboard.sql` en Supabase SQL Editor
2. Loguear unas tiradas → confirmar que aparecen en `dash_dice_rolls` vía trigger
3. Navegar entre rutas con tab visible y oculta → confirmar pings con `route` correcta y que tab oculta no inserta
4. Ejecutar `dash_refresh()` manualmente y confirmar `dash_snapshot.data` poblado
5. Ir a `#dashboard` siendo admin → ver KPIs, abrir una crónica → ver sesiones inferidas + pulse chart
6. Ir a `#dashboard` siendo no-admin → redirect a `#welcome`

---

## Archivos a tocar

| Archivo | Acción |
|---|---|
| `sql/dashboard.sql` | crear |
| `js/dash-heartbeat.js` | crear |
| `js/dashboard.js` | crear |
| `fragments/dashboard.html` | crear |
| `css/dashboard.css` | crear |
| `index.html` | agregar item sidebar + scripts |
| `js/router.js` | nueva ruta + gate de admin |
| `js/app.js` | exponer `__isAdmin` (verificar si ya está) |

---

## Riesgos y notas

- **Trigger en `chronicle_notifications`**: corre dentro de la transacción del INSERT. Si falla, rompe el flujo de tiradas. La función debe ser defensiva (`exception when others then return new`) para que un bug del dashboard no rompa la app.
- **Volumen de pings**: ~1440/día/usuario activo. Con purga a 30 días y agregado diario, no debería superar pocos MB. Vigilar después del primer mes.
- **`metadata` de `chronicle_notifications`**: el trigger debe extraer `pool`, `difficulty`, `results`, `successes`, `botch` desde `metadata jsonb`. Hay que confirmar que el payload que arma `broadcastDiceRoll` ([features/active-character-sheet/encounter-bridge.js:295](features/active-character-sheet/encounter-bridge.js#L295)) incluye esos campos; si no, completar la captura desde el cliente o agregar un nuevo `pushDiceRollLog` paralelo. **TODO al implementar Fase 1.**
- **Backfill**: las tiradas históricas más antiguas que las últimas 10 por crónica ya se perdieron por el auto-prune. Aceptamos eso; la analítica histórica arranca desde la fecha en que se aplica esta migración.

---

## Próximos pasos al ejecutar

1. Inspeccionar el `metadata` que hoy se guarda en notificaciones de tirada para mapear correctamente el trigger
2. Confirmar si `Chart.js` se carga global o lazy desde `dashboard.js`
3. Definir orden visual de las KPI cards con el usuario antes de maquetar
