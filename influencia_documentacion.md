# Documentación: Lógica de Influencia y Estado del Juego

## 1. De dónde sale el estado actual del juego

El estado actual se reconstruye **siempre desde la base de datos** cada vez que se necesita:
- Se consulta `zones` para obtener datos fijos (ej. `influence_goal`).
- Se consulta `zone_influence` para todas las filas de influencia actuales del juego.
- Se calcula para cada zona un **breakdown**:
  ```js
  breakdown = { neutral, facciónA, facciónB }
  ```
- Se determina el `status` de la zona (`neutral`, `controlled`, `under_attack`, `contested`) en base a ese breakdown.

Este cálculo se hace en funciones como:
- `loadZoneStatuses(gameId, territoryId)` → usado por el mapa y el panel de detalle.
- `loadGameProgress(gameId)` → usado por la barra de progreso general.

## 2. Flujo actual desde el modal de acciones (`actions-ui.js`)

Cuando se aplica influencia desde el modal:
1. Se inserta la acción en `actions_log` (para gastar Puntos de Acción - PA).
2. Se llama a `addZoneInfluence(...)`, que **sólo suma** el valor `delta` a la fila correspondiente en `zone_influence`.
3. Se refresca la UI, lo que vuelve a ejecutar `loadZoneStatuses(...)`.

**Problema:** `addZoneInfluence` no consulta el estado actual para decidir cómo aplicar la influencia. Esto puede producir:
- Totales mayores al `goal`.
- Neutral que no baja como se espera.
- Inconsistencias entre la expectativa y el valor en DB.

## 3. Flujo recomendado para consistencia

En lugar de `addZoneInfluence(...)`, llamar a `modifyInfluence(gameId, zoneId, factionId, apCost, influence)`:

Esta función:
- Lee el `goal` y el `breakdown` actual de la zona.
- Aplica el delta siguiendo las reglas:
  1. **Primero llena Neutral**.
  2. **Luego descuenta al rival**.
  3. **Cap** al `goal` máximo.
- Actualiza `zone_influence` en DB.
- Registra la acción en `actions_log`.

### Evitar doble registro en el log
Si `modifyInfluence` se usa desde `actions-ui` y **ya** se inserta en `actions_log` ahí, se debe:
- Quitar el insert de `actions_log` en `actions-ui` y dejar que lo haga `modifyInfluence`, **o**
- Añadir un parámetro a `modifyInfluence` para que **no loguee** y mantener el log en `actions-ui`.

## 4. Recomendación de implementación

Para mayor robustez y evitar condiciones de carrera:
- Mover la lógica a una **función RPC/SQL** en Supabase.
- Que esta función:
  1. Lea el estado actual de la zona.
  2. Calcule el nuevo breakdown aplicando las reglas.
  3. Haga UPSERT/DELETE en `zone_influence`.
  4. Inserte en `actions_log`.
- Ejecutar todo en **una sola transacción**.

## 5. Beneficios del cambio
- Estado siempre consistente con las reglas.
- Evita superar el `goal` de influencia.
- Neutral se reduce correctamente antes de quitar puntos al rival.
- Menos riesgo de errores por múltiples jugadores actuando al mismo tiempo.
