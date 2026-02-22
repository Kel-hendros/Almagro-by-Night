# Plan: Sistema de Crónicas

## Objetivo
Crear el concepto de "Crónica" como entidad central que agrupa personajes (character_sheets), encuentros (encounters) y juegos territoriales (games). Incluye sistema de invitación por código.

---

## Paso 1: SQL — Crear tablas y migrar datos

**Archivo:** `chronicles.sql`

### 1a. Tabla `chronicles`
```sql
CREATE TABLE chronicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  invite_code TEXT NOT NULL UNIQUE,
  creator_id UUID NOT NULL REFERENCES players(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 1b. Tabla `chronicle_participants`
```sql
CREATE TABLE chronicle_participants (
  chronicle_id UUID NOT NULL REFERENCES chronicles(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('narrator', 'player')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (chronicle_id, player_id)
);
```

### 1c. Agregar FK a tablas existentes
```sql
ALTER TABLE character_sheets ADD COLUMN chronicle_id UUID REFERENCES chronicles(id);
ALTER TABLE encounters ADD COLUMN chronicle_id UUID REFERENCES chronicles(id);
ALTER TABLE games ADD COLUMN chronicle_id UUID REFERENCES chronicles(id);
```

### 1d. RLS policies
- `chronicles`: SELECT si sos participante; INSERT para cualquier autenticado; UPDATE/DELETE solo creator
- `chronicle_participants`: SELECT si sos participante de esa crónica; INSERT via RPC (join by code); DELETE solo narrator
- `character_sheets`: agregar filtro por crónica en SELECT policy existente
- `encounters`: agregar filtro por crónica en SELECT policy existente

### 1e. RPCs
- `join_chronicle_by_code(p_code TEXT)` — busca la crónica por invite_code, valida que esté activa, inserta en chronicle_participants como 'player'. Retorna el chronicle_id y name.
- `generate_invite_code()` — genera un código único de 8 chars (mayúsculas + números, sin ambiguos O/0/I/1/L)

### 1f. Migración de datos existentes
- Crear una crónica a partir del game existente (mismo nombre, mismo creator)
- Copiar game_participants → chronicle_participants
- Asociar el game existente con chronicle_id
- Asociar character_sheets y encounters existentes con esa chronicle_id

---

## Paso 2: Frontend — Pantalla de Crónicas

**Archivos nuevos:**
- `fragments/chronicles.html`
- `css/chronicles.css`
- `js/chronicles.js`

### 2a. Ruta y navegación
- Agregar ruta `#chronicles` en `router.js`
- Cambiar sidebar: reemplazar "Almagro de Noche" por "Crónicas" (o agregar entrada nueva)
- Al hacer login, redirigir a `#chronicles` en vez de `#games`

### 2b. UI de la pantalla
La pantalla muestra:
1. **Header** con título "Mis Crónicas"
2. **Dos botones de acción:**
   - "Crear Crónica" — abre modal con campo nombre
   - "Unirse con Código" — abre modal con campo de código
3. **Lista de crónicas** del usuario (cards):
   - Nombre, rol (Narrador/Jugador), status, cantidad de jugadores
   - Botón "Entrar" → guarda `currentChronicleId` en localStorage y navega a `#chronicle`

### 2c. Lógica JS (`chronicles.js`)
- `loadChronicles()` — query chronicle_participants JOIN chronicles para el player actual
- `createChronicle(name)` — insert en chronicles + chronicle_participants (role: narrator)
- `joinChronicle(code)` — llama RPC `join_chronicle_by_code`
- Exponer `window.loadChronicles` para el router

---

## Paso 3: Frontend — Dashboard de Crónica

**Archivos nuevos:**
- `fragments/chronicle.html` (singular — el dashboard)

### 3a. Ruta
- Agregar ruta `#chronicle` en router.js
- Init: `window.initChronicle()`

### 3b. UI del dashboard
```
┌─────────────────────────────────────────┐
│  [Nombre de la Crónica]     [Activa]    │
│  Narrador: Fulano                       │
│  Código de invitación: ABN-7K3X [📋]   │
│                                         │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ │
│  │Personajes│ │Encuentros│ │  Almagro │ │
│  │  (5)    │ │   (3)    │ │ de Noche │ │
│  └─────────┘ └──────────┘ └──────────┘ │
│                                         │
│  Jugadores:                             │
│  [Avatar] Jugador 1 - Personaje X       │
│  [Avatar] Jugador 2 - Personaje Y       │
└─────────────────────────────────────────┘
```

- Cards de sección son links: Personajes → `#character-sheets`, Encuentros → `#combat-tracker`, Almagro → `#games`
- El código de invitación solo visible para el narrador
- Lista de jugadores participantes

### 3c. Lógica
- Cargar crónica desde localStorage `currentChronicleId`
- Query participants con JOIN a players
- Contar character_sheets y encounters de esta crónica

---

## Paso 4: Filtrar character_sheets por crónica

### 4a. `fragments/character-sheets.html`
- Leer `currentChronicleId` de localStorage
- Si existe, filtrar query: `.eq("chronicle_id", chronicleId)`
- Al crear un nuevo sheet, setear `chronicle_id`
- Mostrar breadcrumb: "Crónica X > Hojas de Personaje"

### 4b. `characterSheets/index.html`
- Al guardar, incluir `chronicle_id` si viene de una crónica

---

## Paso 5: Filtrar encounters por crónica

### 5a. `js/combat-tracker.js`
- Leer `currentChronicleId` de localStorage
- Si existe, filtrar encounters: `.eq("chronicle_id", chronicleId)`
- Al crear encounter, setear `chronicle_id`
- Mostrar breadcrumb

### 5b. `js/active-encounter.js`
- Al cargar character_sheets para el browser de PCs, filtrar por `chronicle_id`

---

## Paso 6: Conectar games con chronicles

### 6a. `js/app.js`
- Modificar `SingleGameStore` para filtrar por `chronicle_id` actual
- `loadGames()` filtra por crónica activa

### 6b. `fragments/games.html`
- Mostrar breadcrumb: "Crónica X > Almagro de Noche"

---

## Orden de implementación

1. **SQL** (tablas, RLS, RPCs, migración)
2. **Pantalla de crónicas** (lista + crear + unirse)
3. **Dashboard de crónica** (hub central)
4. **Filtro de character_sheets** por crónica
5. **Filtro de encounters** por crónica
6. **Conexión games ↔ chronicles**
7. **Ajustes de navegación** (sidebar, redirects, breadcrumbs)
