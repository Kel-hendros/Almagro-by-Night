# Active Session - Arquitectura

## Decisión
Separar lineamientos en 2 documentos:
- Producto: `docs/active-session/product.md`
- Arquitectura: `docs/active-session/architecture.md`

Razon: cambios de negocio y cambios tecnicos evolucionan a distinta velocidad.

## Estructura de feature
`features/active-session/`
- `service.js`: acceso a datos y contexto de crónica/sesión.
- `view.js`: render del roster/estado visual.
- `controller.js`: orquestación y permisos.
- `index.js`: bootstrap de fragment + compat router.

`fragments/active-session.html`
- Layout declarativo de la pantalla.

`css/active-session.css`
- Estilos propios de la pantalla.

## Integración de ruta
- Router: `#active-session?id=<chronicleId>`.
- Sidebar activa `menu-chronicles` para esta ruta.
- Guard de sesión: route privada (redirige a `welcome` sin sesión).

## Integración desde Crónica
- CTA en `chronicle` tab Resumen (columna derecha, primer bloque).
- Navega a `active-session` con el `chronicleId` actual.

## Overlay de Encuentro (reuso obligatorio)
Componente shared existente:
- `features/shared/encounter-overlay.js`
- `css/encounter-overlay.css`

Regla:
- `active-session` no debe reimplementar barra/persiana.
- Debe montar el overlay como componente plug-and-play.
- El `iframe` debe apuntar a `#active-encounter?...&embed=true`.

## Realtime
Directriz:
- Reutilizar la misma fuente de eventos del bridge de encuentro.
- Evitar polling para sincronización de mesa.

Implementación sugerida:
1. Extraer canales realtime a módulo compartido de dominio encounter.
2. Consumir ese módulo desde `active-character-sheet` y `active-session`.

## Contrato de datos mínimo (MVP)
Por personaje:
- `character_sheets.id`
- `name`
- `clan` (V20 actual)
- recursos críticos (`blood_pool`, `willpower`, `humanity`)

Nota:
- Para multi-sistema, migrar estos campos a adaptador por sistema.

## Riesgos técnicos
1. Duplicación de subscripciones realtime entre pantallas.
2. Acoplar Active Session a campos V20 hardcodeados.
3. Re-crear UI del overlay en lugar de reusar componente shared.

## Próximo paso técnico recomendado
1. Montar `encounter-overlay` en Active Session.
2. Añadir bridge de estado de encuentro compartido.
3. Mover chips de stats a renderer por sistema (`systems/v20` primero).
