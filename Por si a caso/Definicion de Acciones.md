# 📘 Sistema de Acciones — Documentación Técnica

**Buenos Aires by Night / Juego territorial narrativo**

Este documento describe:

- Cómo están modeladas las acciones en la base de datos
- Cómo se registra una acción que realiza un jugador
- Qué hace la función `perform_action`
- Qué parámetros debe enviar el cliente
- Cómo funcionan los efectos declarativos de cada acción
- Ejemplos reales basados en el sistema actual

Es una guía completa para desarrolladores que trabajan en la UI o el cliente.

---

# 1. 📂 Tablas involucradas

El sistema de acciones utiliza 3 tablas principales:

---

## ## 1.1 `actions`

Define **qué acciones existen** en el juego.

Cada acción tiene:

- nombre
- descripción
- atributos narrativos
- costo de referencia
- imagen
- **effect: JSONB declarativo que explica qué hace la acción**

### Estructura relevante:

```sql
CREATE TABLE public.actions (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  description text,
  attribute_type text,
  attribute_name text,
  skill_name text,
  ap_cost integer,
  image text,
  effect jsonb DEFAULT '{}'::jsonb
);
```

### Campo clave: `effect`

Ejemplo del efecto actual de todas las acciones:

```json
{
  "type": "INFLUENCE_GAIN",
  "requires": ["zone", "amount"]
}
```

Esto significa:

- Esta acción **genera puntos de influencia**
- El front debe pedir:

  - una **zona**
  - un **amount** (cantidad numérica)

- El backend calculará automáticamente la influencia final

---

## ## 1.2 `actions_log`

Registra **cada vez que un jugador realiza una acción**.

```sql
CREATE TABLE public.actions_log (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL,
  action_id uuid NOT NULL,
  target_zone_id uuid,
  target_location_id uuid,
  night_date date NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
```

El campo más importante es:

- `details`: donde se guarda información contextual de la acción
  Ejemplo:

```json
{
  "amount": 3,
  "notes": "Habló con comerciantes de la zona"
}
```

---

## ## 1.3 `zone_influence`

Representa **cuánta influencia tiene cada facción en cada zona**.

```sql
CREATE TABLE public.zone_influence (
  id uuid PRIMARY KEY,
  zone_id uuid NOT NULL,
  faction_id uuid NOT NULL,
  influence integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  game_id uuid NOT NULL
);
```

Cuando una acción tiene tipo `"INFLUENCE_GAIN"`:

- Se suma `amount` para esa facción
- Si no existe fila → se crea

---

# 2. ⚙️ perform_action (RPC)

Esta función es la **única forma oficial** en que el front registra una acción que hace un jugador.

---

## ## 2.1 Definición de la función

```sql
perform_action(
  p_player_id uuid,
  p_action_id uuid,
  p_night_date date,
  p_zone_id uuid DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
```

### Parámetros:

| Parámetro       | Tipo  | Obligatorio | Descripción                        |
| --------------- | ----- | ----------- | ---------------------------------- |
| `p_player_id`   | uuid  | ✔           | Jugador que ejecuta la acción      |
| `p_action_id`   | uuid  | ✔           | Acción que se está realizando      |
| `p_night_date`  | date  | ✔           | Fecha/noche en la que ocurrió      |
| `p_zone_id`     | uuid  | depende     | Requerido si la acción lo pide     |
| `p_location_id` | uuid  | depende     | Requerido si la acción lo pide     |
| `p_details`     | jsonb | depende     | Debe incluir valores como `amount` |

---

## ## 2.2 Cómo la función interpreta la acción

`perform_action` **lee el campo `effect` de la acción** para decidir:

- qué necesita (zona, amount, etc.)
- qué tipo de efecto tiene
- cómo modificar la influencia u otras mecánicas

Ejemplo:

```json
{
  "type": "INFLUENCE_GAIN",
  "requires": ["zone", "amount"]
}
```

Esto le dice al backend:

1. La acción genera influencia
2. El front debe enviar zona y amount
3. Se debe actualizar zone_influence
4. El resto se guarda en el log

---

## ## 2.3 Qué hace la función

1. **Valida jugador y acción**
2. **Lee el efecto declarativo** (`effect`)
3. **Valida parámetros requeridos**

   - si `requires` incluye `"zone"` → `p_zone_id` obligatorio
   - si incluye `"amount"` → `p_details.amount` obligatorio

4. **Inserta actions_log**
5. **Aplica mecánica según type**
6. **Devuelve el id del log creado**

---

# 3. 🛠 Cómo llamarlo desde el cliente

Ejemplo práctico con una acción de **ganar influencia**.

---

## ## Ejemplo: acción “Mapear el territorio”

Supongamos que el jugador `Gabriel` quiere realizar:

- acción: `"Mapear el territorio"`
- cantidad: `4` puntos
- zona: `"d4521d47-f449-4412-90b7-73effef4f4cc"`
- noche: `"2025-10-31"`

### Call:

```js
const { data, error } = await supabase.rpc("perform_action", {
  p_player_id: "658cf6f3-65fd-4043-a49c-19c3003084a4",
  p_action_id: "dcf5cd41-d22d-4f52-a14f-f2c76f7312f9",
  p_night_date: "2025-10-31",

  p_zone_id: "d4521d47-f449-4412-90b7-73effef4f4cc",
  p_location_id: null,

  p_details: { amount: 4 },
});
```

### Respuesta exitosa:

```json
{
  "data": "uuid-del-log-generado",
  "error": null
}
```

---

# 4. 🔍 ¿Qué escribe el backend en la base?

### 4.1 actions_log

```json
{
  "player_id": "658cf6f3-65fd-4043-a49c-19c3003084a4",
  "action_id": "dcf5cd41-d22d-4f52-a14f-f2c76f7312f9",
  "target_zone_id": "d4521d47-f449-4412-90b7-73effef4f4cc",
  "night_date": "2025-10-31",
  "details": {
    "amount": 4
  }
}
```

---

### 4.2 zone_influence

Si Gabriel pertenece a “La Cuadrilla”, entonces:

```
La Cuadrilla → zona Almagro → +4 influencia
```

Si no existía una fila previa, se crea así:

```sql
INSERT INTO zone_influence (zone_id, faction_id, influence, game_id)
VALUES ('d4521d47-f449-4412-90b7-73effef4f4cc', 'faccion_x', 4, 'game_id_unico');
```

---

# 5. 📑 Resumen de responsabilidades

### El front-end:

- muestra lista de acciones
- lee `effect` para saber:

  - qué inputs mostrar
  - qué parámetros pedir

- arma el llamado a `perform_action` con:

  - player_id
  - action_id
  - night_date
  - zone o location
  - `details.amount`

- recibe el id del log

### El backend:

- valida todo
- registra el log
- interpreta el efecto
- actualiza influencia
- devuelve id del log

---

# 6. 🚀 Cómo agregar tipos nuevos de acciones

Si mañana querés “Conjurar espectros”, simplemente agregás en `actions.effect`:

```json
{
  "type": "CALL_WRAITH",
  "requires": ["zone", "specter_level"]
}
```

Y en `perform_action` agregamos:

```sql
IF v_type = 'CALL_WRAITH' THEN
  -- lógica nueva
END IF;
```

El front no se rompe.
La base no se rompe.
La UI lee automáticamente qué parámetros pedir.

---

# 7. 🧩 Lista de efectos actuales

Por ahora todas las acciones fueron definidas como:

```json
{
  "type": "INFLUENCE_GAIN",
  "requires": ["zone", "amount"]
}
```

Esto simplifica el desarrollo inicial y permite que el juego esté operativo inmediatamente.

A medida que avance la narrativa, se pueden agregar fácilmente:

- INFLUENCE_STEAL
- SABOTAGE
- MODIFY_LOCATION_OWNER
- GATHER_INFORMATION
- CALL_WRAITH
- EXTORT
- SPY
- MARK_ZONE
- etc.
