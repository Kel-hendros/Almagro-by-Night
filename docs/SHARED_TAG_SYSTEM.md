# Shared Tag System

## Objetivo

Centralizar la UI y la lógica básica de tags para no volver a implementar:

- normalización
- deduplicación
- formateo visual
- editor de tags
- barra de filtros con contadores

El módulo vive en:

- `features/shared/tags.js`
- `css/shared-tags.css`

Se expone como `window.ABNShared.tags`.

## Cómo activarlo en una pantalla

1. Cargar los assets globales:
   - `css/shared-tags.css`
   - `features/shared/tags.js`
2. Mantener el estado y la persistencia en la feature consumidora.
3. Usar `ABNShared.tags` sólo para:
   - normalizar
   - renderizar
   - emitir cambios

El patrón correcto es:

- la pantalla es dueña del estado
- la pantalla decide cuándo guardar
- el sistema de tags no habla con Supabase ni con la base

## Qué resuelve

Hoy distintas pantallas usan tags:

- plantillas y assets en `resource-manager`
- notas
- revelaciones
- archivos / listados
- browsers de encuentro

La idea es que cada pantalla mantenga su propia persistencia y estado, pero reuse el mismo sistema de tags para render y edición.

## Regla de diseño

El sistema de tags NO guarda directo en base de datos.

Cada feature decide:

- dónde persiste
- cuándo persiste
- cómo arma su payload

`ABNShared.tags` sólo maneja:

- transformaciones
- render
- eventos de cambio

## Contrato del módulo

`ABNShared.tags` es una dependencia de frontend puro.

Eso implica:

- no hace fetch
- no guarda
- no abre modales
- no conoce tablas ni payloads de negocio
- sólo recibe datos y devuelve UI/eventos

## API disponible

### `ABNShared.tags.normalizeTag(rawTag, options?)`

Normaliza espacios y trim.

Opciones:

- `lowercase: boolean`

### `ABNShared.tags.createTagKey(rawTag)`

Genera una key estable para comparar tags sin importar mayúsculas/minúsculas.

### `ABNShared.tags.formatLabel(rawTag, options?)`

Devuelve el label visual.

Opciones:

- `displayMode: "title" | "upper" | "lower" | "raw"`

### `ABNShared.tags.dedupe(tags, options?)`

Elimina duplicados preservando el primer valor.

### `ABNShared.tags.parse(rawTags, options?)`

Parsea un input CSV.

Ejemplo:

```js
const tags = ABNShared.tags.parse("mortal, sabbat, mortal");
// ["mortal", "sabbat"]
```

### `ABNShared.tags.getTagObjects(tags)`

Devuelve:

```js
[{ key: "mortal", label: "mortal" }]
```

### `ABNShared.tags.collectStats(items, options)`

Calcula conteos para filtros por tag.

Opciones importantes:

- `getTags(item)`
- `selectedTag`
- `selectedLabel`

Sirve para casos como:

- mostrar todos los tags
- recalcular co-ocurrencias cuando ya hay un tag activo

### `ABNShared.tags.renderFilterBar(options)`

Renderiza una barra de filtros por tag con contador.

Opciones:

- `container`
- `stats`
- `selectedTag`
- `onToggle(key, label)`
- `displayMode`

Ejemplo:

```js
const stats = ABNShared.tags.collectStats(items, {
  getTags: (item) => item.tags,
  selectedTag: state.activeTag,
});

ABNShared.tags.renderFilterBar({
  container: document.getElementById("my-tag-filters"),
  stats,
  selectedTag: state.activeTag,
  onToggle: (key) => {
    state.activeTag = state.activeTag === key ? null : key;
    render();
  },
});
```

Comportamiento esperado:

- muestra todos los tags visibles en el subconjunto actual
- si hay un tag activo, recalcula co-ocurrencias sobre ese subconjunto
- deja visible el tag activo aunque su contador sea `0`
- deshabilita tags sin resultados cuando no están activos

### `ABNShared.tags.renderEditor(options)`

Renderiza editor de tags con:

- pills
- botón `+`
- input inline
- borrado por icono

Opciones:

- `container`
- `tags`
- `composerOpen`
- `editable`
- `onChange(nextTags)`
- `onComposerToggle(isOpen)`
- `displayMode`
- `placeholder`

Ejemplo:

```js
ABNShared.tags.renderEditor({
  container: document.getElementById("tpl-tags-container"),
  tags: state.templateEdit.tags,
  composerOpen: state.templateEdit.tagComposerOpen,
  editable: true,
  displayMode: "title",
  placeholder: "Nuevo tag",
  onComposerToggle: (isOpen) => {
    state.templateEdit.tagComposerOpen = isOpen;
    renderTags();
  },
  onChange: (nextTags) => {
    state.templateEdit.tags = nextTags;
    state.templateEdit.tagComposerOpen = false;
    renderTags();
  },
});
```

Comportamiento esperado:

- dedupe case-insensitive
- botón `+` para abrir composer
- `Enter` agrega
- `Escape` cancela
- `blur` confirma si hay texto o cierra si está vacío
- botón de borrado con icono global

## Integración mínima recomendada

### 1. Render simple de tags

```js
const html = `
  <div class="abn-tag-list">
    ${tags
      .map((tag) => {
        const label = ABNShared.tags.formatLabel(tag, { displayMode: "title" });
        return `<span class="abn-tag">${escapeHtml(label)}</span>`;
      })
      .join("")}
  </div>
`;
```

Regla:

- en filas/cards readonly compartidas, usar `.abn-tag-list`
- wrappers locales como `.da-tags-row` quedan reservados para layouts propios del archive

### 2. Editor reusable

```js
function renderTagsEditor() {
  ABNShared.tags.renderEditor({
    container: document.getElementById("my-tags"),
    tags: state.edit.tags,
    composerOpen: state.edit.tagComposerOpen,
    editable: true,
    displayMode: "title",
    placeholder: "Nuevo tag",
    onComposerToggle: (isOpen) => {
      state.edit.tagComposerOpen = isOpen;
      renderTagsEditor();
    },
    onChange: (nextTags) => {
      state.edit.tags = nextTags;
      state.edit.tagComposerOpen = false;
      renderTagsEditor();
    },
  });
}
```

### 3. Persistencia

```js
const payload = {
  ...entity,
  tags: state.edit.tags,
};
```

La persistencia sigue viviendo en la feature. El módulo nunca recibe `supabase`, repositorios ni callbacks de guardado.

## Estilos

Los estilos base están en `css/shared-tags.css`.

Clases principales:

- `.abn-tag`
- `.abn-tag-list`
- `.abn-tag-editor`
- `.abn-tag-add-btn`
- `.abn-tag-delete-btn`
- `.abn-tag-input`
- `.abn-tag-filter-row`
- `.abn-tag-filter-chip`

## Variables visuales

Se pueden overridear con CSS variables desde cada pantalla:

- `--abn-tag-font-family`
- `--abn-tag-font-size`
- `--abn-tag-font-weight`
- `--abn-tag-letter-spacing`
- `--abn-tag-padding-y`
- `--abn-tag-padding-x`
- `--abn-tag-radius`
- `--abn-tag-text-color`
- `--abn-tag-bg`
- `--abn-tag-border`
- `--abn-tag-filter-font-size`
- `--abn-tag-filter-padding-y`
- `--abn-tag-filter-padding-x`
- `--abn-tag-filter-radius`
- `--abn-tag-filter-text-color`
- `--abn-tag-filter-bg`
- `--abn-tag-filter-border`
- `--abn-tag-filter-active-bg`
- `--abn-tag-filter-active-text`
- `--abn-tag-filter-active-border`

## Overrides por pantalla

Si una pantalla necesita ajustar look and feel, el camino correcto es overridear variables o sumar layout wrapper local. No hay que clonar el componente ni volver a crear sus clases.

Ejemplo:

```css
.my-screen {
    --abn-tag-font-family: var(--app-font-mono);
    --abn-tag-font-size: 0.72rem;
    --abn-tag-radius: 999px;
}
```

## Patrón recomendado

### Para render simple

Usar `.abn-tag` y `formatLabel()`.

### Para edición

Usar `renderEditor()` y persistir afuera del módulo.

### Para filtros

Usar `collectStats()` + `renderFilterBar()`.

## Primer consumidor

El primer consumidor migrado es:

- `features/resource-manager/resource-manager.js`

Se usa para:

- render de tags en cards
- editor de tags de plantillas
- editor de tags de decorados
- filtro por tags con contadores

## Consumidores actuales

- `features/resource-manager/resource-manager.js`
- `features/shared/note-screen.js`
- `features/shared/document-screen.js`
- `features/shared/revelation-screen.js`
- `features/chronicle-detail/controller.js`
- `features/revelations-archive/view.js`

## Próximos buenos candidatos

1. `features/shared/note-screen.js`
2. `features/shared/revelation-screen.js`
3. `features/revelations-archive/view.js`
4. `features/chronicle-detail/notes.js`
5. `features/active-encounter/active-encounter-entity-browser.js`

## Criterio de uso

Si una pantalla necesita tags nuevos, evitar reimplementar:

- pills
- parseo CSV
- dedupe
- filtros
- contadores

La decisión correcta por defecto debería ser:

`"usa ABNShared.tags y adaptá la persistencia local"`

## Checklist de adopción

Antes de sumar tags a una nueva pantalla:

1. incluir `css/shared-tags.css`
2. verificar que `features/shared/tags.js` cargue antes de la feature
3. guardar el estado local de tags en la pantalla
4. usar `renderEditor()` si hay edición
5. usar `collectStats()` + `renderFilterBar()` si hay filtros
6. persistir desde la feature, no desde el sistema compartido
