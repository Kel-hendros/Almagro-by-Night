# Archivo de Revelaciones (MVP)

## Objetivo
Tener un archivo por crónica con revelaciones creadas por narradores y asociadas a uno o más jugadores.

## Reglas de producto
1. Narradores de la crónica:
- crean revelaciones
- asocian/desasocian jugadores
- eliminan revelaciones
- ven el archivo completo de la crónica

2. Jugadores:
- ven solo revelaciones donde están asociados
- no editan ni borran

## Modelo
- `revelations`: contenido de la revelación (`title`, `body_markdown`, `image_url`, `chronicle_id`)
- `revelation_players`: asociaciones (`revelation_id`, `player_id`)

## UX MVP
1. Active Session (narrador):
- formulario de creación
- selector de destinatarios
- listado de archivo con asociaciones por revelación
- quitar asociación individual
- eliminar revelación completa

2. Active Character Sheet (jugador):
- botón "Revelaciones" con badge
- modal "Archivo de Revelaciones"
- lector de revelación (markdown + imagen)

## Realtime
- suscripción por jugador a `revelation_players`.
- cuando hay nueva asociación, actualiza el archivo del jugador.
