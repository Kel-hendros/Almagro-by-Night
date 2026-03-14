# Plan: Herramientas de Dibujo para Narrador (Tile Map)

## Concepto

Agregar un sistema de "pintura de tiles" en la grilla de encuentros. El narrador selecciona una textura (pasto, cemento, baldosas, tierra, agua, madera, piedra) y pinta celdas de la grilla con ella. Esto permite construir mapas visuales sin necesitar una imagen de fondo.

## Modelo de Datos

### Nuevo campo en `encounter.data`

```javascript
{
  // ... campos existentes ...
  tileMap: {
    // Clave: "x,y" (coordenadas de celda), Valor: ID de textura
    "0,0": "grass",
    "0,1": "grass",
    "1,0": "concrete",
    // ...
  }
}
```

**¿Por qué un objeto plano con claves "x,y"?**
- Más eficiente que un array 2D sparse (la mayoría de celdas estarán vacías)
- Serialización directa a JSON sin overhead
- Lookup O(1) por celda
- No necesita redimensionar si la grilla crece

### Texturas iniciales

| ID | Nombre | Descripción |
|----|--------|-------------|
| `grass` | Pasto | Verde con variación |
| `concrete` | Cemento | Gris claro uniforme |
| `tiles` | Baldosas | Patrón de cuadrícula |
| `dirt` | Tierra | Marrón con textura |
| `water` | Agua | Azul con efecto sutil |
| `wood` | Madera | Tablas horizontales |
| `stone` | Piedra | Bloques irregulares |
| `sand` | Arena | Beige granulado |

Las texturas se generan con canvas (patrones procedurales), sin assets externos. Esto mantiene el proyecto sin build step y sin dependencias extra.

## Arquitectura

### Archivos nuevos

1. **`features/active-encounter/tile-textures.js`** (~150 líneas)
   - Genera `CanvasPattern` para cada textura usando un canvas offscreen
   - Exporta un registry: `getTilePattern(ctx, textureId) → CanvasPattern`
   - Cada textura es una función que dibuja un tile de 50x50px con variaciones procedurales

2. **`features/active-encounter/tile-painter.js`** (~200 líneas)
   - Lógica del "modo pintura": estado activo, textura seleccionada, tamaño de brocha
   - Manejo de mouse events cuando el modo está activo (mousedown + mousemove = pintar, derecho = borrar)
   - Integración con el sistema de guardado de encounter

### Archivos modificados

3. **`features/active-encounter/tactical-map-render.js`**
   - Agregar `drawTileMap()` entre el fondo negro y la grilla
   - Itera solo las celdas visibles en viewport (optimización)
   - Usa `ctx.fillStyle = pattern` para cada textura

4. **`features/active-encounter/active-encounter-drawer.js`**
   - Agregar nueva pestaña/sección "Terreno" en el drawer del narrador
   - Muestra paleta de texturas como thumbnails clickeables
   - Controles: tamaño de brocha (1x1, 2x2, 3x3), borrador
   - Botón "Limpiar todo"

5. **`features/active-encounter/tactical-map-interactions.js`**
   - Cuando el tile painter está activo, interceptar mouse events
   - Convertir coordenadas de pantalla a celda de grilla
   - Delegar al tile painter

6. **`features/active-encounter/tactical-map.js`**
   - Agregar `tileMap` al state
   - Exponer métodos: `setTile(x, y, textureId)`, `clearTile(x, y)`, `clearAllTiles()`

7. **`features/active-encounter/active-encounter.js`**
   - Incluir `tileMap` en save/load de encounter data
   - Inicializar tile painter solo para narrador

8. **`features/active-encounter/index.js`**
   - Cargar los nuevos archivos JS

9. **`features/active-encounter/active-encounter.css`**
   - Estilos para la paleta de texturas y controles de pintura

10. **`fragments/active-encounter.html`**
    - Agregar sección de terreno en el drawer (si no se genera dinámicamente)

## Pipeline de Renderizado (orden actualizado)

```
1. Fondo negro (fill rect)
2. Background image (si existe)
3. ★ TILE MAP (nuevo) ← dibuja celdas pintadas
4. Grid lines
5. Map effects (shrouds)
6. Design tokens (underlay)
7. Tokens (entidades)
8. Design tokens (overlay)
9. Measurement tool
```

## UX del Modo Pintura

### Activación
- En el drawer del narrador, nueva sección "Terreno" (ícono de pincel)
- Al seleccionar una textura, se activa el modo pintura
- El cursor cambia a un crosshair con preview de la textura
- Click en "Terreno" de nuevo o Escape desactiva el modo

### Pintar
- **Click izquierdo**: Pinta la celda bajo el cursor con la textura seleccionada
- **Click izquierdo + arrastrar**: Pinta continuamente mientras se mueve
- **Click derecho**: Borra la celda (vuelve a transparente)
- **Click derecho + arrastrar**: Borra continuamente
- La brocha puede ser 1x1, 2x2 o 3x3 celdas

### Indicador visual
- Mientras está en modo pintura, se muestra un highlight en la celda bajo el cursor
- El highlight muestra la textura que se va a pintar (semi-transparente)
- Si la brocha es mayor a 1x1, se muestra el área completa

### Restricciones
- Solo narrador (mismo check que controles existentes)
- Solo cuando el layer activo es "Fondo" o un nuevo layer "Terreno"
- El tile map NO interactúa con el movimiento de tokens
- Los jugadores ven el tile map pero no pueden editarlo

## Pasos de Implementación

### Paso 1: Texturas procedurales (`tile-textures.js`)
- Crear el módulo de generación de texturas
- Cada textura: canvas offscreen 50x50 → `ctx.createPattern()`
- Funciones de dibujo procedural para cada material
- Cache de patterns por contexto

### Paso 2: Renderizado del tile map (`tactical-map-render.js`)
- Agregar `drawTileMap(ctx, state)`
- Iterar `tileMap` entries, filtrar por viewport visible
- Dibujar pattern en cada celda ocupada

### Paso 3: State y persistencia (`tactical-map.js`, `active-encounter.js`)
- Agregar `tileMap` al modelo de datos
- Métodos set/clear/clearAll
- Incluir en save/load

### Paso 4: Interacciones de pintura (`tile-painter.js`, `tactical-map-interactions.js`)
- Implementar modo pintura con estado activo/inactivo
- Mouse handlers para pintar/borrar
- Soporte de brocha variable
- Cursor preview

### Paso 5: UI del drawer (`active-encounter-drawer.js`, CSS)
- Paleta de texturas como thumbnails
- Selector de tamaño de brocha
- Botón borrador y limpiar todo
- Integración con el sistema de tabs existente

### Paso 6: Integración final
- Cargar archivos en `index.js`
- Permisos (solo narrador)
- Testing manual

## Consideraciones

- **Performance**: Solo renderizar tiles visibles en viewport. Con grillas grandes (100x100 = 10,000 celdas potenciales), el objeto sparse y el filtrado por viewport mantienen buen rendimiento.
- **Storage**: El `tileMap` en JSON es liviano. 1000 celdas pintadas ≈ 15KB en el jsonb.
- **Compatibilidad**: Encounters existentes no tienen `tileMap`, se inicializa como `{}` si falta.
- **Sin build step**: Todo vanilla JS, cargado dinámicamente como los demás módulos.
