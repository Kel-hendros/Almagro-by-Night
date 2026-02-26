# Encounters Rules (Chronicles)

Este documento define las reglas funcionales y técnicas para `Combat Tracker` / `Active Encounter`.

## 1) Objetivo

- Encuentros son una herramienta de narración ligada a una Crónica.
- El narrador prepara y publica encuentros.
- Los jugadores solo interactúan con encuentros publicados (`in_game`) y con sus personajes asignados.

## 2) Scope y navegación

- Lista de encuentros: `#combat-tracker`
- Sala de encuentro: `#active-encounter?id=<encounterId>`
- Contexto obligatorio: `localStorage.currentChronicleId`

Regla:
- Si no hay `currentChronicleId`, no se listan encuentros globales.
- Si el usuario no participa en la Crónica, no accede a sus encuentros.

## 3) Roles y permisos

Permisos se resuelven por Crónica, no por admin global.

- `canManage`:
  - `chronicle_participants.role === "narrator"`, o
  - `chronicles.creator_id === currentPlayer.id`
- `canView`:
  - participa en `chronicle_participants`, o
  - es creador de la Crónica

Consecuencias:
- Solo `canManage` puede crear, editar, cambiar estado, archivar, agregar/quitar participantes y tokens.
- Jugador (`canView` sin `canManage`) puede ver y controlar únicamente sus tokens de PJ en `in_game`.

## 4) Estados de encuentro

Estados soportados:

- `wip`
- `ready`
- `in_game`
- `archived`

Transiciones permitidas:

- `wip -> ready | archived`
- `ready -> in_game | archived`
- `in_game -> ready | archived`
- `archived -> (sin transición)`

## 5) Visibilidad por rol

En listado (`combat-tracker`):

- Narrador (`canManage`): ve todos los estados no archivados (de su Crónica).
- Jugador (`canView` sin `canManage`): solo `in_game`.

En sala (`active-encounter`):

- Narrador: acceso completo.
- Jugador:
  - si estado != `in_game`, se bloquea acceso.
  - si estado == `in_game`, acceso de lectura + control de su PJ.

## 6) Templates de enemigos

Regla actual:

- Scope por usuario (`templates.user_id = session.user.id`).
- No se cargan templates de otros usuarios.
- Edición y borrado filtrados por `id + user_id`.

Nota:
- Esto permite avanzar seguro sin fuga de datos.
- Si se implementa biblioteca compartida, se debe versionar la regla (ver sección 10).

## 7) Persistencia y concurrencia

`active-encounter` guarda `encounters.data` completo.

Control de conflicto:

- Si existe `updated_at`, se usa write optimista por versión:
  - `update ... where id = ? and updated_at = lastSeenUpdatedAt`
- Si no matchea fila, se considera conflicto:
  - se informa al usuario
  - se recarga estado remoto

Objetivo:
- evitar que un narrador pise silenciosamente cambios de otro.

## 8) Realtime

- Realtime subscription a `encounters` por `id`.
- Polling de respaldo cada `1500ms`.
- Ambos actualizan vista local cuando cambia `status/data` (y `updated_at` si aplica).

## 9) Encuentro único por crónica

Restricción:
- Solo puede haber **un encuentro `in_game`** por crónica a la vez.
- Enforced en DB con partial unique index: `idx_encounters_one_active_per_chronicle`.
- Validación client-side en `combat-tracker.js` y `active-encounter.js` antes de transicionar a `in_game`.

## 10) Encounter–Sheet Bridge (sincronización bidireccional)

Referencia técnica completa: `docs/encounter-bridge.md`

### 10.1 Concepto
Cuando un jugador abre su hoja de personaje (`#active-character-sheet`) y hay un encuentro activo en la crónica, la hoja se conecta automáticamente al encuentro. Esto habilita:
- Barra de estado mostrando ronda/turno arriba de la hoja.
- Límite de gasto de sangre por turno según generación.
- Activación de Celeridad desde la hoja → acciones extra en la iniciativa.

### 10.2 Comunicación parent ↔ iframe
La hoja de personaje corre en un iframe. La comunicación es via `postMessage`:
- **Parent → iframe**: `abn-encounter-state` (estado del encuentro: ronda, turno, conexión).
- **Iframe → parent**: `abn-celeridad-activate` (activación de Celeridad con count).

El bridge en el parent (`encounter-bridge.js`) se conecta a Supabase Realtime para recibir cambios del encuentro y los retransmite al iframe.

### 10.3 Eventos custom (window del parent)
- `abn-encounter-connected` — primera conexión a encuentro activo.
- `abn-encounter-updated` — cualquier cambio en datos del encuentro.
- `abn-encounter-turn-changed` — cambio de `activeInstanceId`.
- `abn-encounter-round-changed` — cambio de ronda.
- `abn-encounter-disconnected` — encuentro terminó o se desconectó.

### 10.4 Sangre por turno
- Límite calculado por generación: Gen 10+=1, 9=2, 8=3, 7=4, 6=6, 5=8, 4=10, ≤3=99.
- Hooks `beforeConsume` / `afterConsume` en `health-blood.js` permiten al tracker bloquear el gasto.
- Indicador visual en la blood card: “Sangre este turno: X / Y”.
- Se resetea al cambiar de ronda.

### 10.5 Celeridad → acciones extra
- VtM permite que el gasto de sangre para Celeridad exceda el límite por turno.
- Al activar: se setea `celeridadBypass`, se gasta sangre, se notifica al parent.
- El parent llama RPC `add_encounter_extra_actions` que inyecta instancias extra en la iniciativa.
- Patrón clear-then-add: reactivar reemplaza las extras anteriores de la misma ronda.
- `count=0` desactiva (remueve extras sin agregar nuevas).
- Al avanzar de ronda (`nextTurn`), las instancias extra de rondas anteriores se eliminan automáticamente.

### 10.6 Polling de respaldo
Si no hay encuentro activo al conectar, el bridge pollea cada 15s hasta detectar uno.

## 11) Visibilidad de tokens e instancias

- El narrador puede togglear visibilidad de tokens/instancias desde el context menu.
- Campo: `instance.visible` (default `true`, `false` = oculto).
- **Narrador**: ve tokens ocultos con borde dashed y opacidad 0.45.
- **Jugador**: tokens ocultos no aparecen en mapa, drawer, ni cards.
- Se aplica tanto a tokens de instancia como a design tokens (decorados).

## 12) Roll Feed (tiradas en vivo sobre el mapa)

Cuando un personaje en un encuentro activo hace una tirada de dados o iniciativa, el resultado se muestra como notificación flotante en el mapa táctico (tanto standalone como embebido en la persiana).

- **Broadcast efímero**: usa Supabase Realtime broadcast (canal `encounter-rolls-{encounterId}`), sin escrituras a DB.
- **Flujo**: `dice-system.js` (iframe) → `postMessage` → `encounter-bridge.js` (parent) → broadcast → `roll-feed.js` (VTT).
- **Enriquecimiento**: `encounter-bridge.js` inyecta `sheetId` en el payload antes del broadcast para permitir la identificación de la instancia en el encuentro.
- **UI**: Notificaciones flotantes arriba a la derecha del mapa, con retrato del personaje, pool, modificadores y resultado. Expandible para ver dados individuales.
- **Autodismiss**: 15 segundos o click en X. Máximo 10 notificaciones visibles.

### 12.1 Integración de tirada de iniciativa con el encuentro

Cuando una tirada de iniciativa llega al roll feed, además de mostrarse como notificación, se aplica automáticamente a la instancia del personaje en el encuentro:

1. `roll-feed.js` detecta `rollType === "initiative"` y llama al callback `onInitiativeRoll` si fue proporcionado al crear el feed.
2. `active-encounter.js` provee ese callback (`applyBroadcastInitiative`) al inicializar el roll feed.
3. El handler busca la instancia PC correspondiente:
   - Primero por `sheetId` (`inst.characterSheetId === roll.sheetId`).
   - Fallback por nombre (`inst.name === roll.characterName`).
4. Si encuentra match, actualiza `inst.initiative`, re-renderiza la barra de iniciativa y guarda el encuentro.
5. Si no hay match (personaje no está en el encuentro), solo se muestra la notificación sin efecto en la iniciativa.

**Regla de turno activo**: una instancia nueva (agregada via addPC o template) nunca se convierte en el turno activo por tener mayor iniciativa. Solo el botón de avanzar turno o `rerollAllInitiatives` puede cambiar el turno activo. `ensureActiveInstance()` solo interviene cuando el activo actual es inválido (muerto, oculto, eliminado).

Referencia técnica completa: `docs/encounter-bridge.md` sección "Roll Feed".

## 13) Embed Mode (Persiana) — Layout

Cuando el VTT se carga dentro de la persiana (`embed=true`):

- El header del encuentro se oculta (`html.embed-mode .ae-header`).
- El container usa `height: 100dvh` con `padding-top: 30px` para dejar espacio al encounter bar del parent.
- El VTT layout ocupa `height: 100%` sin border ni border-radius.

**IMPORTANTE: El `padding-top: 30px` del embed mode está calibrado pixel a pixel con el encounter bar. No modificar sin verificar visualmente en la persiana.**

## 14) Archivos de referencia

Encuentros (narrador):
- `features/active-encounter/active-encounter.js`
- `features/active-encounter/active-encounter-turns.js`
- `features/active-encounter/active-encounter-drawer.js`
- `features/active-encounter/tactical-map-render.js`
- `features/active-encounter/token-context-menu.js`
- `features/active-encounter/active-encounter.css`
- `features/active-encounter/roll-feed.js`
- `fragments/active-encounter.html`

Lista de encuentros:
- `js/combat-tracker.js`
- `fragments/combat-tracker.html`

Bridge hoja–encuentro:
- `features/active-character-sheet/encounter-bridge.js` (parent, conexión + realtime)
- `features/active-character-sheet/encounter-bar.js` (parent, UI barra de estado)
- `features/active-character-sheet/controller.js` (parent, lifecycle)
- `features/character-sheets/modules/encounter-blood-tracker.js` (iframe, sangre por turno)
- `features/character-sheets/modules/health-blood.js` (iframe, hooks de consumo)
- `features/character-sheets/modules/disciplines.js` (iframe, Celeridad)

SQL:
- `encounter_bridge.sql` (partial unique index + RPCs)

Documentación técnica detallada:
- `docs/encounter-bridge.md`

## 15) Pendientes planificados

1. Integrar UI de encuentros dentro de `Crónica` (tab interna), manteniendo templates como biblioteca separada.
2. Definir modo “templates compartidos” entre Crónicas (owner/shared, RLS y UX).
3. Migrar guardado por parches/RPC para reducir payload completo de `encounters.data`.
4. Endurecer RLS en DB para que las reglas del cliente sean respaldo, no única barrera.
5. Agregar más interacciones hoja→encuentro siguiendo el patrón de Celeridad (ver `docs/encounter-bridge.md` sección “Extending the Bridge”).
