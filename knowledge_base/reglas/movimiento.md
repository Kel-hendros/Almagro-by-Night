# Reglas de Movimiento

El movimiento en Vampiro: La Mascarada se mide en **metros por turno**. Un turno dura aproximadamente 3 segundos. La capacidad de movimiento depende principalmente del Atributo **Destreza** del personaje.

## 1. Cálculo de Velocidad

Existen tres modos básicos de desplazamiento que se consideran **acciones automáticas** (no requieren tirada de dados):

| Tipo de Movimiento | Fórmula (metros por turno) | Descripción                           |
| :----------------- | :------------------------- | :------------------------------------ |
| **Caminar**        | **7 metros**               | Paso normal.                          |
| **Trotar**         | **12 + Destreza**          | Movimiento apresurado pero no máximo. |
| **Correr**         | **20 + (3 x Destreza)**    | Velocidad máxima en línea recta.      |

## 2. Movimiento y Acciones en Combate

Si un personaje quiere moverse y realizar otra acción (como atacar) en el mismo turno, se aplican restricciones importantes:

- **Límite de distancia:** Para realizar una acción después de moverse, el personaje no puede desplazarse más de la **mitad de su velocidad máxima al correr**.
- **Penalización a la reserva de dados:** Si el personaje se mueve mientras realiza otra acción, se **resta un dado** de la reserva de esa acción por cada metro que haya recorrido.

## 3. Efectos de la Salud en el Movimiento

El daño físico reduce drásticamente la capacidad de movimiento. A medida que el personaje desciende en la tabla de Salud, se aplican las siguientes penalizaciones:

| Nivel de Salud   | Penalización al Movimiento                                                                                                                      |
| :--------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Magullado**    | Sin penalización.                                                                                                                               |
| **Lastimado**    | Sin penalización.                                                                                                                               |
| **Lesionado**    | El movimiento se ve ligeramente impedido; la velocidad máxima al correr se **divide a la mitad**.                                               |
| **Herido**       | El personaje **no puede correr** (aunque aún puede caminar). Solo puede moverse **o** atacar en un turno; si intenta ambas cosas, pierde dados. |
| **Malherido**    | Solo puede **cojear** (**3 metros** por turno).                                                                                                 |
| **Tullido**      | Solo puede **arrastrarse** (**1 metro** por turno).                                                                                             |
| **Incapacitado** | Incapaz de moverse.                                                                                                                             |

_Nota:_ Se puede gastar un punto de **Fuerza de Voluntad** para ignorar las penalizaciones por heridas durante un turno, permitiendo moverse a velocidad normal momentáneamente.

## 4. Maniobras Específicas

### Saltar

- **Tirada:** Se utiliza **Fuerza** (o **Fuerza + Atletismo** si se toma carrera previa).
- **Dificultad:** Normalmente **3**.
- **Distancia:** Cada éxito impulsa al personaje:
  - **Verticalmente:** 0,5 metros.
  - **Horizontalmente:** 1 metro.
- **Fallo/Fracaso:** Un fallo no alcanza la distancia. Un fracaso puede resultar en una caída peligrosa o daño al aterrizar.

### Trepar / Escalada

- **Tirada:** **Destreza + Atletismo**.
- **Tipo de acción:** Suele ser una **acción extendida**.
- **Velocidad:** En una ascensión media, el personaje avanza **3 metros por éxito**.
- **Dificultad:** Varía según la superficie (fácil = 5 metros por éxito; difícil = 2 metros por éxito).
- **Ayudas:** El uso de garras (como las de Protean: Garras Salvajes o Vicisitud: Moldear Hueso) reduce la dificultad de trepar en 2.

### Nadar

- **Tirada:** **Resistencia + Atletismo**.
- **Requisito:** Se necesita al menos un punto en Atletismo para saber nadar.
- **Mecánica:** Para largas distancias, se tira tras una hora de actividad. Un fallo indica pérdida de control o deriva; un fracaso significa que el personaje se hunde (recuerda que los vampiros no flotan porque son cuerpos muertos).

### Persecución

- **Tirada:** Depende del medio (ej. **Destreza + Atletismo** a pie, o **Destreza + Conducir** en vehículo).
- **Mecánica:** Es una **acción extendida y enfrentada**.
- **Ventaja inicial:** El objetivo comienza con éxitos automáticos basados en la distancia inicial (1 éxito por metro de ventaja a pie).
- **Resolución:** Se acumulan éxitos turno a turno. Si el perseguidor supera el total de éxitos del objetivo, lo alcanza. Si el objetivo acumula suficientes éxitos extra, escapa.

## 5. Modificadores Sobrenaturales (Celeridad)

La Disciplina **Celeridad** altera fundamentalmente estas reglas:

1. **Pasivo:** Cada punto de Celeridad añade un dado a las tiradas de Destreza, lo cual aumenta automáticamente la velocidad base de trotar y correr.
2. **Activo:** Al gastar sangre para obtener acciones adicionales, el personaje puede realizar estas acciones (incluyendo el desplazamiento máximo posible) **sin penalizadores** a sus reservas de dados.
