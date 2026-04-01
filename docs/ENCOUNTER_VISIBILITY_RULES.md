# Reglas de Visibilidad, Iluminación y Entorno en Encuentros

Este documento describe las reglas de diseño de los sistemas de visibilidad del mapa táctico. Explica **qué** hace cada sistema y **por qué**, sin entrar en detalles de implementación.

---

## Índice

1. [Filosofía general](#1-filosofía-general)
2. [Niebla de guerra (Fog of War)](#2-niebla-de-guerra-fog-of-war)
3. [Muros, puertas y ventanas](#3-muros-puertas-y-ventanas)
4. [Iluminación](#4-iluminación)
5. [Luminosidad y visibilidad de tokens](#5-luminosidad-y-visibilidad-de-tokens)
6. [Interruptores](#6-interruptores)
7. [Poderes con efecto en el mapa](#7-poderes-con-efecto-en-el-mapa)
8. [Condiciones visuales de tokens](#8-condiciones-visuales-de-tokens)
9. [Capas del mapa](#9-capas-del-mapa)
10. [Resumen: narrador vs jugador](#10-resumen-narrador-vs-jugador)

---

## 1) Filosofía general

El mapa táctico modela un espacio físico donde la **información es asimétrica**. El narrador tiene visión omnisciente; los jugadores solo ven lo que sus personajes perciben. Tres sistemas independientes controlan qué ve cada jugador:

| Sistema | Pregunta que responde |
|---------|----------------------|
| Niebla de guerra | ¿Mi personaje puede ver esta zona del mapa? |
| Iluminación | ¿Hay suficiente luz en esa zona para distinguir lo que hay? |
| Visibilidad de tokens | ¿Puedo percibir a esa criatura concreta? |

Estos sistemas se componen: un token puede estar en una zona visible (sin niebla) pero en oscuridad total (sin luz), y por tanto no ser perceptible. O puede estar en una zona iluminada pero fuera del campo de visión (cubierto por niebla). Ambas capas son necesarias para que el resultado final sea correcto.

---

## 2) Niebla de guerra (Fog of War)

### Propósito

La niebla representa el **conocimiento geográfico** de los personajes. Las zonas que no han sido exploradas son completamente negras; las zonas exploradas pero fuera del campo de visión actual se muestran atenuadas (memoria); las zonas dentro del campo de visión actual se ven con claridad completa.

### Modos

| Modo | Descripción |
|------|-------------|
| `auto` | La visibilidad se calcula automáticamente desde la posición de los PJs. Los personajes "ven" en un radio amplio (~30 celdas), bloqueado por muros cerrados. |
| `manual` | El narrador pinta manualmente qué celdas están reveladas u ocultas, usando un pincel. Útil para escenas con reglas narrativas que no encajan en el raycasting automático. |

### Estados de cada celda

Cada celda del mapa tiene tres estados posibles desde la perspectiva de un jugador:

| Estado | Aspecto visual | Significado |
|--------|---------------|-------------|
| **No explorada** | Negro total | El personaje nunca ha estado cerca de esta zona. No sabe qué hay ahí. |
| **Explorada** | Atenuada (dimmed) | El personaje visitó esta zona anteriormente. Recuerda el layout pero no puede ver lo que ocurre ahí ahora. |
| **Visible** | Sin filtro | El personaje puede ver esta zona en este momento. |

### Exploración por personaje

El historial de exploración se guarda **por instancia de personaje**. Si un jugador controla múltiples PJs, la niebla muestra la unión de todo lo que han explorado individualmente. Si un PJ muere, su exploración histórica persiste para esa sesión.

### Overrides manuales

Incluso en modo `auto`, el narrador puede forzar celdas como reveladas u ocultas. Las celdas forzadas como reveladas se suman al polígono de visión automático. Las forzadas como ocultas se restan. Esto permite ajustes finos ("esta habitación secreta no se puede ver ni estando al lado").

### Impersonación

El narrador puede "impersonar" a un PJ específico para ver el mapa exactamente como lo ve ese jugador. Esto sirve para verificar que la experiencia del jugador es correcta antes de revelar información.

---

## 3) Muros, puertas y ventanas

### Propósito

Los muros definen la geometría física del espacio. Determinan:
- Por dónde pueden moverse los tokens.
- Qué bloquea la línea de visión.
- Qué bloquea la propagación de la luz.

### Tipos

| Tipo | Bloquea movimiento | Bloquea visión | Bloquea luz | Interactivo |
|------|-------------------|----------------|-------------|-------------|
| **Muro** | Siempre | Siempre | Siempre | No |
| **Puerta (cerrada)** | Sí | Sí | Sí | Sí — se puede abrir |
| **Puerta (abierta)** | No | No | No | Sí — se puede cerrar |
| **Ventana (cerrada)** | Sí | Sí | Sí | Sí — se puede abrir |
| **Ventana (abierta)** | No | No | No | Sí — se puede cerrar |

### Apertura de puertas y ventanas

- **Narrador**: puede abrir/cerrar cualquier puerta o ventana haciendo click sobre ella.
- **Jugador**: puede abrir/cerrar puertas y ventanas **solo si un PJ suyo está a 3 metros o menos** (2 celdas) del punto medio de la puerta/ventana.

Al abrir o cerrar una puerta/ventana, la niebla y la iluminación se recalculan inmediatamente. Esto permite escenas dinámicas donde abrir una puerta revela una habitación oscura, o donde cerrar una puerta corta la línea de visión de un enemigo.

### Bloqueo de movimiento

Los muros solo bloquean el movimiento de tokens de PJs. Los NPCs (controlados por el narrador) se mueven libremente a través de muros. Esta es una decisión deliberada: el narrador ya conoce todo el mapa y necesita flexibilidad para posicionar NPCs sin restricciones.

### Detección de interiores

El sistema detecta automáticamente qué celdas son "interiores" y cuáles son "exteriores" usando los muros como frontera. Se hace un llenado desde los bordes del mapa: todo lo que es alcanzable desde el borde sin cruzar ningún muro (cerrado o abierto, todos los tipos cuentan como frontera) es exterior. Todo lo demás es interior. Esta distinción es fundamental para el sistema de iluminación.

---

## 4) Iluminación

### Propósito

La iluminación modela la **cantidad de luz disponible** en cada punto del mapa. A diferencia de la niebla (que modela conocimiento), la iluminación modela un fenómeno físico. Una habitación puede estar dentro del campo de visión del personaje (sin niebla) pero estar a oscuras (sin luz), y el personaje no podría distinguir lo que hay dentro.

### Luz ambiental

La luz ambiental representa la iluminación general del entorno (luna, farolas de calle, cielo nocturno). Se configura con:

- **Intensidad** (0–100%): 0% = noche cerrada sin luna. 100% = plena luz del día.
- **Color**: tinte sutil que se aplica a las zonas iluminadas (ej: azulado para noche de luna, anaranjado para atardecer).

**Regla fundamental**: la luz ambiental solo afecta a celdas exteriores. Las celdas interiores (encerradas por muros) empiezan con luminosidad 0, completamente a oscuras. La única forma de iluminar un interior es con luces focales.

Esto modela la realidad de que dentro de un edificio la luz del exterior no penetra (salvo ventanas, que se resuelven a través de la geometría de muros).

### Luces focales

Las luces focales son fuentes de luz puntuales colocadas en el mapa: lámparas, antorchas, farolas, velas, etc. Cada luz tiene:

| Propiedad | Rango | Descripción |
|-----------|-------|-------------|
| **Radio** | 1–15 celdas | Distancia máxima a la que llega la luz |
| **Intensidad** | 10–100% | Brillo en el centro de la fuente |
| **Color** | Hex | Color de la luz (naranja para fuego, blanco para eléctrica, etc.) |
| **Estado** | Encendida/Apagada | Controlado por interruptores o directamente por el narrador |

### Atenuación (falloff)

La luz no es uniforme dentro de su radio. Se atenúa gradualmente desde el centro:

- **Zona central** (0–50% del radio): iluminación fuerte, casi a máxima intensidad.
- **Zona media** (50–85% del radio): iluminación moderada, decayendo progresivamente.
- **Zona de borde** (85–100% del radio): iluminación tenue que se desvanece a cero.

Este gradiente crea bordes suaves y naturales en la iluminación, evitando círculos de luz con corte abrupto.

### Oclusión de luz por muros

Las luces focales proyectan sombras. Si hay un muro entre una luz y un punto del mapa, la luz no llega a ese punto. Esto genera sombras realistas detrás de columnas, dentro de habitaciones cerradas, etc.

Las sombras se calculan independientemente para cada luz. Si dos luces iluminan un punto, sus contribuciones se suman (no se promedian). Un punto puede recibir más luz de la que una sola fuente emite.

---

## 5) Luminosidad y visibilidad de tokens

### Propósito

Mientras la niebla determina si una *zona* es visible y la iluminación determina cuánta *luz* hay en un punto, este sistema determina si un *token específico* puede ser percibido por los jugadores. Es la capa final que decide: "¿puedo ver a este vampiro parado en la esquina oscura?"

### Umbral de luminosidad

Un token es visible para los jugadores **solo si la luminosidad en su posición es igual o superior al 30%**. Por debajo de ese umbral, el token está en suficiente oscuridad como para no ser percibido por medios normales.

En la práctica:
- Un token al aire libre con luz ambiental al 50% → luminosidad 50% → visible.
- Un token en un interior sin luces focales → luminosidad 0% → invisible.
- Un token en el borde de una antorcha (85% del radio) → depende de la intensidad exacta.

### Proximidad: el sentido del tacto

Hay una excepción al umbral de luminosidad: si un token de un PJ del jugador está **a 1 celda o menos** (1.5 metros) de otro token, ese token siempre es percibido, independientemente de la oscuridad. Esto modela que a distancia de contacto se percibe presencia por otros sentidos (oído, olfato, tacto, instinto sobrenatural).

### Tokens propios

Los tokens que pertenecen al jugador siempre son visibles para ese jugador, sin importar la luminosidad. Siempre sabes dónde están tus propios personajes.

### Vista del narrador

El narrador nunca pierde de vista a ningún token. Los que están en oscuridad se muestran con opacidad reducida (35%) para indicar visualmente "esto está en la oscuridad" sin ocultarlo. Esto permite al narrador gestionar el encuentro sin perder información.

### Transiciones suaves

Cuando un token pasa de visible a invisible (o viceversa), la transición no es instantánea. Hay un fade suave (~180ms) para evitar que los tokens "parpadeen" al entrar y salir del borde de una luz.

---

## 6) Interruptores

### Propósito

Los interruptores permiten controlar luces de forma interactiva durante el encuentro. Un vampiro puede entrar a una habitación y apagar la luz antes de atacar, o los jugadores pueden encender las luces de un sótano al encontrar el interruptor.

### Mecánica

Cada interruptor controla una o más luces focales. Al activar/desactivar el interruptor, todas las luces vinculadas cambian de estado simultáneamente.

### Visibilidad de interruptores para jugadores

Los interruptores no son visibles por defecto para los jugadores. Deben cumplir **dos condiciones**:

1. La celda donde está el interruptor debe estar dentro del polígono de visión de la niebla (el PJ puede ver esa zona).
2. Un token de PJ del jugador debe estar **a 3 celdas o menos** (~4.5 metros) del interruptor.

Ambas condiciones deben cumplirse simultáneamente. Esto evita que un jugador vea un interruptor al otro lado de una habitación grande — tiene que acercarse para descubrirlo.

### Interacción del jugador con interruptores

Para activar un interruptor, el jugador necesita tener un PJ **a 3 metros o menos** (2 celdas) del interruptor. Si está más lejos, la interacción es rechazada.

### Vista del narrador

El narrador siempre ve todos los interruptores y las líneas de conexión entre interruptores y sus luces vinculadas. Puede crear, vincular, desvincular y eliminar interruptores libremente.

---

## 7) Poderes con efecto en el mapa

Ciertos poderes disciplinarios de Vampiro: La Mascarada tienen efectos visuales y mecánicos sobre el mapa táctico.

### Ofuscación (Ofuscación 1+)

Toggle: el personaje se vuelve invisible para otros. El narrador ve al token con borde discontinuo y opacidad reducida (45%). Los jugadores no ven el token en absoluto.

### Manto de la Noche (Obtenebración 2+)

Crea una zona circular de oscuridad sobrenatural. El narrador define el diámetro (0.5–120 metros). Mecánicamente el borde del círculo se resuelve como un anillo de segmentos tipo `curtain`: bloquea visión y luz, pero no movimiento. Visualmente se renderiza como un círculo negro animado con borde ondulante.

### Brazos del Abismo (Obtenebración 3+)

Invoca tentáculos como entidades separadas en el mapa. Cada tentáculo es una instancia summonable con su propio token. El narrador define cuántos tentáculos aparecen (1–12).

### Esfera de Silencio (Extinción 1+)

Crea una zona de silencio (radio fijo de 6 metros) centrada en el personaje. Efecto visual: círculo animado con efecto de "respiración". Es un efecto puramente visual/narrativo, no afecta la mecánica de visibilidad.

### Vuelo (Vuelo 1+)

Toggle: el token del personaje comienza a "flotar" visualmente. Se eleva del suelo con una animación de balanceo sinusoidal. Una sombra permanece en el suelo para indicar la posición real. Cada token tiene una fase de balanceo única para que no se muevan todos igual.

---

## 8) Condiciones visuales de tokens

Los tokens pueden tener estados que se indican visualmente con badges (iconos satélite):

| Condición | Badge | Significado |
|-----------|-------|-------------|
| **Muerto** | Calavera | La instancia tiene status "dead" o health ≤ 0 |
| **Tumbado** | Icono prone | El personaje está en el suelo |
| **Volando** | Alas de murciélago | El personaje está en el aire (ver Vuelo) |
| **Cegado** | Ojo tachado | El personaje no puede ver |
| **Oculto** | Icono invisible | El personaje está usando Ofuscación o similar |

### Visibilidad manual (toggle del narrador)

El narrador puede ocultar cualquier instancia/token usando el menú contextual (`instance.visible = false`). Esto es independiente de la iluminación y la niebla — es un override narrativo absoluto:

- **Narrador**: ve el token con borde discontinuo y opacidad 45%.
- **Jugador**: el token no existe en su vista. No aparece en el mapa, en la barra de iniciativa, ni en ningún panel.

Esto sirve para enemigos emboscados, NPCs que aún no se han revelado narrativamente, etc.

### Turno activo

El token del personaje cuyo turno está activo tiene una animación de pulso (escala) y un tinte rojo sutil para destacarlo visualmente del resto.

---

## 9) Capas del mapa

El mapa se compone de múltiples capas que se renderizan en orden de profundidad:

| Orden | Capa | Descripción |
|-------|------|-------------|
| 1 | **Fondo** | Imagen de fondo del mapa (plano de edificio, vista aérea, etc.) |
| 2 | **Terreno** | Texturas pintadas celda a celda (césped, piedra, agua, madera, etc.) |
| 3 | **Design tokens (underlay)** | Elementos decorativos por debajo de los tokens (muebles, alfombras, etc.) |
| 4 | **Tokens de combate** | Los personajes y NPCs |
| 5 | **Overlay de oscuridad** | La capa combinada de niebla + iluminación |
| 6 | **Design tokens (overlay)** | Elementos decorativos por encima de todo (etiquetas, anotaciones) |
| 7 | **Efectos de mapa** | Esferas de silencio, mantos de noche, etc. |
| 8 | **Herramientas** | Previews de muros, pincel de niebla, medición |

### Design tokens

Los design tokens son elementos gráficos decorativos que el narrador coloca sobre el mapa. Pueden ser muebles, objetos, decoración ambiental, etc. Se importan desde una biblioteca de assets reutilizables y soportan rotación, escala, opacidad y layering (underlay/overlay). No son interactivos para los jugadores.

---

## 10) Resumen: narrador vs jugador

| Aspecto | Narrador | Jugador |
|---------|----------|--------|
| **Niebla de guerra** | Siempre ve todo con al menos 10% de visibilidad | Solo ve zonas en polígono de visión de sus PJs. Áreas no exploradas son negro total. |
| **Iluminación** | Ve zonas oscuras atenuadas, nunca negro total | Zonas sin luz aparecen completamente oscuras |
| **Tokens en oscuridad** | Visibles con opacidad 35% | Invisibles (salvo proximidad de 1 celda) |
| **Tokens ocultos** | Visibles con borde discontinuo y opacidad 45% | Completamente invisibles |
| **Interruptores** | Siempre visibles, con líneas de conexión a luces | Solo visibles con niebla despejada + proximidad de 3 celdas |
| **Puertas/ventanas** | Puede abrir/cerrar cualquiera | Puede abrir/cerrar a 3 metros o menos de un PJ |
| **Muros** | Puede dibujar, borrar y editar muros | No puede modificar muros. Movimiento de PJs bloqueado por muros cerrados. |
| **Luces** | Puede crear, mover, editar y eliminar luces | No puede interactuar con luces directamente |
| **Impersonación** | Puede ver como cualquier PJ individual | N/A |
| **Tokens propios** | Todos los tokens son "propios" | Siempre visibles, exentos de luminosidad |

---

## Constantes de referencia

| Concepto | Valor | Equivalencia |
|----------|-------|-------------|
| Tamaño de celda | 1 celda = 1.5 metros | — |
| Radio de visión (niebla auto) | 30 celdas | 45 metros |
| Umbral de luminosidad (ver token) | 30% | — |
| Proximidad para percibir token en oscuridad | 1 celda | 1.5 metros |
| Rango para interactuar con puertas/interruptores (jugador) | 2 celdas | 3 metros |
| Rango para ver interruptores (jugador) | 3 celdas | 4.5 metros |
| Radio de luces focales | 1–15 celdas | 1.5–22.5 metros |
| Intensidad de luces focales | 10–100% | — |
| Visibilidad mínima del narrador (niebla) | 10% | — |
| Opacidad de tokens oscuros (vista narrador) | 35% | — |
| Opacidad de tokens ocultos (vista narrador) | 45% | — |
| Duración de fade in/out de tokens | ~180ms | — |
