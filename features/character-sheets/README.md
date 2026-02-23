# Character Sheets Feature

Esta feature vive en `features/character-sheets/` y se monta dentro de la app principal (no es una app aparte).

## Estructura

- `index.html`: shell del feature y orden de carga de módulos.
- `script.js`: orquestador/bridge; integra módulos, routing local y persistencia.
- `modules/*.js`: lógica por dominio (disciplinas, notas, xp, tiradas, etc).

## Contrato de módulos

Cada módulo expone una API en `window` con prefijo `ABNSheet*`:

- `configure(deps)` para inyección de dependencias.
- `init()` para bindear eventos y estado inicial.
- funciones de dominio (`serialize`, `loadFromCharacterData`, render helpers, etc).

Reglas:

- No crear nuevas dependencias globales ad-hoc (`window.foo = ...`).
- Comunicación entre módulos solo por `configure(...)` y APIs explícitas.
- Persistencia centralizada desde `script.js` mediante callbacks `save`.

## Orden de carga recomendado

1. Repositorios/datos estáticos (si aplica).
2. Módulos base (`specialties`, `health-blood`, `disciplines`, etc).
3. `script.js` como orquestador final.

## Estilos y theming

- Tokens globales: `css/theme-tokens.css` + `css/styles.css`.
- Estilos del feature: `css/character-sheets.css`.
- Evitar colores hardcodeados si existe token equivalente.

## Objetivo de arquitectura

- Mantener `script.js` como composición de módulos, no como lógica de negocio.
- Todo comportamiento reutilizable debe vivir en módulos aislados.
- Facilitar próximas etapas: i18n de catálogos y tests por módulo.
