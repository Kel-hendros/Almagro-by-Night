# Engineering Standards

Este documento define los estándares de arquitectura y UI para mantener consistencia en todo el proyecto.

## 1) Arquitectura Frontend

### 1.1 App shell
- `index.html` contiene shell global (sidebar, contenedor principal, modales globales).
- `js/router.js` controla rutas y carga de fragments.
- No agregar lógica de feature en `router` más allá de inicialización.

### 1.2 Feature-first (vertical slices)
Cada feature debe vivir en su carpeta:

`js/features/<feature>/`
- `service.js`: acceso a Supabase / I/O.
- `view.js`: render y utilidades de presentación.
- `controller.js`: eventos, estado local de pantalla, orquestación.
- `index.js`: bootstrap + compatibilidad con router (`window.loadX`).

Regla: evitar archivos “todo en uno” con data + render + eventos mezclados.

## 2) HTML / Fragments

- Sin `onclick`, `onchange`, etc. inline.
- Usar `data-*` attributes para acciones de UI y bindear desde controller.
- Mantener fragments lo más declarativos posible (estructura, no lógica).

## 3) Sistema de diseño (tokens + componentes)

### 3.1 Tokens globales
Fuente de verdad: `css/theme-tokens.css`.

Tokens core mínimos:
- Fondos: `--color-bg-base`, `--color-bg-surface`, `--color-bg-raised`
- Texto: `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`
- Bordes: `--color-border-subtle`, `--color-border-strong`
- Semánticos: `--color-accent`, `--color-accent-soft`, `--color-success`, `--color-warning`, `--color-danger`
- Decorativo: `--color-bg-decorative`
- Tipografía: `--app-font-body`, `--app-font-heading`

Compatibilidad:
- `--theme-*` se puede usar durante migración, pero todo código nuevo debe preferir `--color-*`.

### 3.2 Componentes UI compartidos
Definidos en `css/ui-components.css`:
- `.btn`, `.btn--primary`, `.btn--secondary`, `.btn--ghost`, `.btn--danger`
- `.btn-row`
- `.btn-icon`, `.btn-icon--danger`

Regla:
- Reutilizar componentes compartidos antes de crear variantes locales.
- Si una variante aparece en 2+ features, promoverla al layer shared.

Uso recomendado:
- `.btn*` para acciones textuales (crear, guardar, cancelar, navegar).
- `.btn-icon*` para acciones compactas con ícono (upload, reposition, edit, delete, close).

Do / Don’t:
- Do: agregar clases de feature encima del componente shared para ajustes locales (ej: `class="btn-icon cd-banner-btn"`).
- Do: dejar en CSS de feature solo overrides de layout/espaciado/estado específicos.
- Don’t: reimplementar base visual del botón en cada feature.
- Don’t: hardcodear colores si ya existe variante shared.

Regla de promoción:
- Si un patrón visual se repite en 2+ features, mover su estilo base a `css/ui-components.css`.
- Si en una feature se creó un “mini componente” que podría servir en otra (ej: icon actions de banner), convertirlo en variante shared en el mismo PR o en el siguiente.

### 3.3 Close buttons de modales
- Clase única: `.btn-modal-close` en `css/modal-close.css`.
- Debe usar tokens de theme (nunca colores hardcodeados).

### 3.4 Comportamiento de modales
- Fuente única para lógica de open/close: `js/features/shared/modal.js`.
- API estándar: `ABNShared.modal.createController({ overlay, closeButtons })`.
- Soporta de forma consistente:
- click en backdrop para cerrar
- tecla `Escape` para cerrar
- botones de cierre registrados por selector/elemento
- Regla: evitar volver a implementar listeners de overlay/cierre dentro de cada feature.
- Para la hoja de personaje (`features/character-sheets/script.js`), usar `createSheetModalController(...)` como wrapper compatible sobre la API shared.
- En `features/character-sheets`, extraer subsistemas grandes a `features/character-sheets/modules/*.js` y dejar en `script.js` solo funciones-bridge de compatibilidad.

## 4) CSS Guidelines

- Evitar inline styles en HTML/JS (excepto valores dinámicos puntuales, e.g. `object-position`).
- Evitar variables legacy (`--color-cream`, `--color-red`, etc.) en código nuevo.
- Evitar hardcodes hex/rgba cuando exista token semántico equivalente.
- CSS de feature: solo estilos propios de la pantalla, no redefinir base components.

## 5) JavaScript Guidelines

- No colgar APIs nuevas en `window` salvo bootstrap requerido por router.
- Sanitizar contenido antes de `innerHTML` (`escapeHtml` / `renderMarkdown`).
- No duplicar queries: centralizar en `service.js`.
- Estado de pantalla en controller (objeto `state` local), no global disperso.

## 6) Estructura objetivo de CSS

`css/`
- `theme-tokens.css` (tokens globales)
- `styles.css` (app shell/base layout)
- `ui-components.css` (componentes shared)
- `modal-close.css` (close shared)
- `<feature>.css` (estilos de feature)

## 7) Checklist de PR

- [ ] No hay handlers inline en fragments tocados.
- [ ] Feature separada en `service/view/controller/index`.
- [ ] Sin hardcodes de color/fuente innecesarios.
- [ ] Usa componentes shared (`.btn*`, `.btn-modal-close`) cuando aplique.
- [ ] Mantiene compatibilidad con router y rutas actuales.
- [ ] No introduce duplicación de lógica con otra feature.

## 8) Character Sheets (Feature App)

- La hoja de personaje se considera una feature app y vive en `features/character-sheets/`.
- No usar rutas nuevas bajo `legacy/` para esta feature.
- Ruta canónica embebida: `features/character-sheets/index.html` (centralizada en `js/features/characters/sheet-host.js`).
- Mantener `features/character-sheets/script.js` como orquestador y mover lógica nueva a `features/character-sheets/modules/*.js`.
- Contrato de integración: cada módulo expone `configure()` + `init()` y APIs de dominio explícitas.
- Evitar acoples por globals ad-hoc (`window.openX`, `window.tmpState`, etc.). Integrar módulos vía dependencias inyectadas.
- Referencia operativa: `features/character-sheets/README.md`.
