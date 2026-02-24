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

## 9) Archivos de referencia

- `js/combat-tracker.js`
- `js/active-encounter.js`
- `fragments/combat-tracker.html`
- `fragments/active-encounter.html`

## 10) Pendientes planificados

1. Integrar UI de encuentros dentro de `Crónica` (tab interna), manteniendo templates como biblioteca separada.
2. Definir modo “templates compartidos” entre Crónicas (owner/shared, RLS y UX).
3. Migrar guardado por parches/RPC para reducir payload completo de `encounters.data`.
4. Endurecer RLS en DB para que las reglas del cliente sean respaldo, no única barrera.
