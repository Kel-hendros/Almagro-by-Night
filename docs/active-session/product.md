# Active Session - Producto

## Objetivo
`Active Session` es el hub del narrador durante la partida en vivo.

Debe concentrar en una sola pantalla:
- Estado operativo de personajes.
- Acceso inmediato al encuentro en juego (mapa embebido).
- Contexto rapido para toma de decisiones de mesa.

## Usuario objetivo
- Primario: narrador.
- Secundario (futuro): co-narrador / asistentes con permisos.

## Entry Point
- Se entra desde `chronicle` (tab Resumen, columna derecha, bloque superior) con un CTA dedicado.
- Ruta: `#active-session?id=<chronicleId>`.

## Principios UX
- Priorizar lectura y velocidad sobre complejidad visual.
- Evitar duplicar pantallas existentes; reutilizar componentes vivos (overlay de encuentro).
- Mantener navbar visible para navegacion global.

## MVP v1
1. Encabezado de sesión con nombre de crónica y sistema.
2. Lista de personajes con stats criticos (solo lectura).
3. Control de regreso a Crónica.
4. Gating por rol: solo narrador.

## MVP v2 (objetivo inmediato)
1. Overlay de encuentro embebido, identico al de hoja activa (barra + persiana + animacion).
2. Realtime para roster y estado de encuentro usando canales ya existentes (sin polling).
3. CTA contextuales cuando no hay encuentro `in_game`.

## No Objetivos (por ahora)
- Edición completa de hoja desde Active Session.
- CRUD avanzado de encuentros.
- Herramientas de director fuera de combate (agenda, recap editor completo, etc).

## Open Questions
1. ¿Qué stats son canon para todos los sistemas?
2. ¿Qué acciones de narrador deben estar disponibles en v1.5?
3. ¿Active Session debe soportar multi-encuentro futuro o solo 1 activo?
