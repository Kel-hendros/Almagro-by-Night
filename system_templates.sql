-- System Templates Migration
-- Adds is_system column and inserts 33 V20 creature templates

-- 1. Add is_system column
ALTER TABLE templates ADD COLUMN IF NOT EXISTS is_system boolean DEFAULT false;

-- 2. Allow NULL user_id for system templates
ALTER TABLE templates ALTER COLUMN user_id DROP NOT NULL;

-- 3. Update RLS: allow all authenticated users to SELECT system templates
CREATE POLICY "Anyone can read system templates"
  ON templates FOR SELECT
  TO authenticated
  USING (is_system = true);

-- 4. Block UPDATE/DELETE on system templates
CREATE POLICY "Nobody can update system templates"
  ON templates FOR UPDATE
  TO authenticated
  USING (is_system IS NOT TRUE);

CREATE POLICY "Nobody can delete system templates"
  ON templates FOR DELETE
  TO authenticated
  USING (is_system IS NOT TRUE);

-- 5. Insert system templates
-- Helper: all use same groups structure from TEMPLATE_DEFINITIONS.npc

-- =============================================
-- ANIMALS
-- =============================================

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Perro / Lobo', 'npc', true, '{
  "maxHealth": 4,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":3,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":3,"type":"Físicos"},
      {"name":"Carisma","value":0,"type":"Sociales"},
      {"name":"Manipulación","value":0,"type":"Sociales"},
      {"name":"Apariencia","value":0,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":1,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":2,"type":"Talentos"},
      {"name":"Atletismo","value":2,"type":"Talentos"},
      {"name":"Pelea","value":2,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":2,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":0,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":4,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":3,"type":"Rasgos"}
    ]}
  ],
  "notes": "Mordida 4L. +1 dado en jauría (3+). Olfato agudo.",
  "tags": ["Animal", "Amenaza:Baja"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Perro de Guardia', 'npc', true, '{
  "maxHealth": 5,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":4,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":4,"type":"Físicos"},
      {"name":"Carisma","value":0,"type":"Sociales"},
      {"name":"Manipulación","value":0,"type":"Sociales"},
      {"name":"Apariencia","value":0,"type":"Sociales"},
      {"name":"Percepción","value":4,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":4,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":4,"type":"Talentos"},
      {"name":"Atletismo","value":3,"type":"Talentos"},
      {"name":"Pelea","value":3,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":3,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":0,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":5,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":5,"type":"Rasgos"}
    ]}
  ],
  "notes": "Mordida 5L. Entrenado para obedecer comandos. No huye fácilmente.",
  "tags": ["Animal", "Amenaza:Baja"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Enjambre de Ratas', 'npc', true, '{
  "maxHealth": 5,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":1,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":3,"type":"Físicos"},
      {"name":"Carisma","value":0,"type":"Sociales"},
      {"name":"Manipulación","value":0,"type":"Sociales"},
      {"name":"Apariencia","value":0,"type":"Sociales"},
      {"name":"Percepción","value":2,"type":"Mentales"},
      {"name":"Inteligencia","value":1,"type":"Mentales"},
      {"name":"Astucia","value":2,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":2,"type":"Talentos"},
      {"name":"Pelea","value":2,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":0,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":4,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":5,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":2,"type":"Rasgos"}
    ]}
  ],
  "notes": "Mordidas múltiples 2L (auto-hit). Inmune a ataques de Pelea (solo daño por área/fuego). Se dispersa al recibir 5 niveles de daño.",
  "tags": ["Animal", "Amenaza:Baja", "Enjambre"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Puma / Felino Grande', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":4,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":3,"type":"Físicos"},
      {"name":"Carisma","value":0,"type":"Sociales"},
      {"name":"Manipulación","value":0,"type":"Sociales"},
      {"name":"Apariencia","value":0,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":3,"type":"Talentos"},
      {"name":"Pelea","value":3,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":0,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":4,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":4,"type":"Rasgos"}
    ]}
  ],
  "notes": "Mordida 5L, Garra 5L. Emboscada: +2 dados si ataca desde ocultamiento.",
  "tags": ["Animal", "Amenaza:Media"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Oso', 'npc', true, '{
  "maxHealth": 10,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":7,"type":"Físicos"},
      {"name":"Destreza","value":2,"type":"Físicos"},
      {"name":"Resistencia","value":4,"type":"Físicos"},
      {"name":"Carisma","value":0,"type":"Sociales"},
      {"name":"Manipulación","value":0,"type":"Sociales"},
      {"name":"Apariencia","value":0,"type":"Sociales"},
      {"name":"Percepción","value":5,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":5,"type":"Talentos"},
      {"name":"Atletismo","value":4,"type":"Talentos"},
      {"name":"Pelea","value":4,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":3,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":0,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":10,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":4,"type":"Rasgos"}
    ]}
  ],
  "notes": "Garra 7L, Mordida 5L. Armadura 1 (5 soak). Olfato sobrenatural (7x sabueso).",
  "tags": ["Animal", "Amenaza:Alta"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Enjambre de Murciélagos', 'npc', true, '{
  "maxHealth": 4,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":1,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":2,"type":"Físicos"},
      {"name":"Carisma","value":0,"type":"Sociales"},
      {"name":"Manipulación","value":0,"type":"Sociales"},
      {"name":"Apariencia","value":0,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":1,"type":"Mentales"},
      {"name":"Astucia","value":2,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":3,"type":"Talentos"},
      {"name":"Pelea","value":0,"type":"Talentos"},
      {"name":"Esquivar","value":3,"type":"Talentos"},
      {"name":"Intimidación","value":0,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":2,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":4,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":2,"type":"Rasgos"}
    ]}
  ],
  "notes": "Mordidas 1L (auto-hit). Ecolocalización. +2 dif a todas las acciones dentro del enjambre. Inmune a ataques de Pelea.",
  "tags": ["Animal", "Amenaza:Baja", "Enjambre"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Serpiente Venenosa', 'npc', true, '{
  "maxHealth": 3,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":1,"type":"Físicos"},
      {"name":"Destreza","value":2,"type":"Físicos"},
      {"name":"Resistencia","value":2,"type":"Físicos"},
      {"name":"Carisma","value":0,"type":"Sociales"},
      {"name":"Manipulación","value":0,"type":"Sociales"},
      {"name":"Apariencia","value":0,"type":"Sociales"},
      {"name":"Percepción","value":2,"type":"Mentales"},
      {"name":"Inteligencia","value":1,"type":"Mentales"},
      {"name":"Astucia","value":2,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":3,"type":"Talentos"},
      {"name":"Pelea","value":2,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":0,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":3,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":3,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":4,"type":"Rasgos"}
    ]}
  ],
  "notes": "Mordida 1L + veneno. Veneno: 3 dados letal/turno x3 turnos (mortales). Vampiros inmunes al veneno.",
  "tags": ["Animal", "Amenaza:Media"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Jabalí', 'npc', true, '{
  "maxHealth": 6,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":4,"type":"Físicos"},
      {"name":"Destreza","value":2,"type":"Físicos"},
      {"name":"Resistencia","value":4,"type":"Físicos"},
      {"name":"Carisma","value":0,"type":"Sociales"},
      {"name":"Manipulación","value":0,"type":"Sociales"},
      {"name":"Apariencia","value":0,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":1,"type":"Mentales"},
      {"name":"Astucia","value":2,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":3,"type":"Talentos"},
      {"name":"Pelea","value":3,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":0,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":0,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":6,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":4,"type":"Rasgos"}
    ]}
  ],
  "notes": "Embestida 5L (colmillos), Mordida 3L. Armadura 1 (5 soak). Carga: +2 daño si se mueve 2+ casillas en línea recta.",
  "tags": ["Animal", "Amenaza:Media"]
}'::jsonb);

-- =============================================
-- HUMANOS — CALLEJEROS
-- =============================================

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Matón Callejero', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":3,"type":"Físicos"},
      {"name":"Destreza","value":2,"type":"Físicos"},
      {"name":"Resistencia","value":3,"type":"Físicos"},
      {"name":"Carisma","value":1,"type":"Sociales"},
      {"name":"Manipulación","value":2,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":2,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":2,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":2,"type":"Talentos"},
      {"name":"Atletismo","value":1,"type":"Talentos"},
      {"name":"Pelea","value":2,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":2,"type":"Talentos"},
      {"name":"Armas C.C.","value":1,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":1,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":3,"type":"Rasgos"}
    ]}
  ],
  "notes": "Puño 3C, Navaja 4L. Huye si recibe 3+ niveles de daño.",
  "tags": ["Mortal", "Amenaza:Baja"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Pandillero', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":3,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":3,"type":"Físicos"},
      {"name":"Carisma","value":2,"type":"Sociales"},
      {"name":"Manipulación","value":2,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":2,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":2,"type":"Talentos"},
      {"name":"Atletismo","value":2,"type":"Talentos"},
      {"name":"Pelea","value":2,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":2,"type":"Talentos"},
      {"name":"Armas C.C.","value":1,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":2,"type":"Técnicas"},
      {"name":"Sigilo","value":1,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":4,"type":"Rasgos"}
    ]}
  ],
  "notes": "Puño 3C, Pistola 4L. +1 dado si hay 3+ pandilleros juntos.",
  "tags": ["Mortal", "Amenaza:Baja"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Asaltante Armado', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":2,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":2,"type":"Físicos"},
      {"name":"Carisma","value":1,"type":"Sociales"},
      {"name":"Manipulación","value":3,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":1,"type":"Talentos"},
      {"name":"Pelea","value":1,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":2,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":2,"type":"Técnicas"},
      {"name":"Sigilo","value":2,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":3,"type":"Rasgos"}
    ]}
  ],
  "notes": "Revólver 4L. Prefiere amenazar antes que disparar. Huye si la víctima se resiste.",
  "tags": ["Mortal", "Amenaza:Baja"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Dealer / Transa', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":2,"type":"Físicos"},
      {"name":"Destreza","value":2,"type":"Físicos"},
      {"name":"Resistencia","value":2,"type":"Físicos"},
      {"name":"Carisma","value":3,"type":"Sociales"},
      {"name":"Manipulación","value":3,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":0,"type":"Talentos"},
      {"name":"Pelea","value":1,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":2,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":1,"type":"Técnicas"},
      {"name":"Sigilo","value":1,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":4,"type":"Rasgos"}
    ]}
  ],
  "notes": "Pistola compacta 4L. Conoce las calles (Callejeo 3 efectivo). Puede dar info sobre actividad local.",
  "tags": ["Mortal", "Amenaza:Baja"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Patovica / Bouncer', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":4,"type":"Físicos"},
      {"name":"Destreza","value":2,"type":"Físicos"},
      {"name":"Resistencia","value":4,"type":"Físicos"},
      {"name":"Carisma","value":2,"type":"Sociales"},
      {"name":"Manipulación","value":2,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":2,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":2,"type":"Talentos"},
      {"name":"Pelea","value":3,"type":"Talentos"},
      {"name":"Esquivar","value":1,"type":"Talentos"},
      {"name":"Intimidación","value":3,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":0,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":5,"type":"Rasgos"}
    ]}
  ],
  "notes": "Puño 4C, Presa/Grapple 5C. Intenta reducir antes de golpear. No usa armas letales salvo emergencia.",
  "tags": ["Mortal", "Amenaza:Media"]
}'::jsonb);

-- =============================================
-- HUMANOS — PROFESIONALES
-- =============================================

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Policía', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":3,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":3,"type":"Físicos"},
      {"name":"Carisma","value":2,"type":"Sociales"},
      {"name":"Manipulación","value":2,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":2,"type":"Talentos"},
      {"name":"Pelea","value":2,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":2,"type":"Talentos"},
      {"name":"Armas C.C.","value":1,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":3,"type":"Técnicas"},
      {"name":"Sigilo","value":0,"type":"Técnicas"},
      {"name":"Investigación","value":1,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":5,"type":"Rasgos"}
    ]}
  ],
  "notes": "Pistola reglamentaria 4L, Bastón 4C. Pide refuerzos. Chaleco antibalas (+2 soak vs balas).",
  "tags": ["Mortal", "Amenaza:Media"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'SWAT / Grupo Especial', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":3,"type":"Físicos"},
      {"name":"Destreza","value":4,"type":"Físicos"},
      {"name":"Resistencia","value":3,"type":"Físicos"},
      {"name":"Carisma","value":2,"type":"Sociales"},
      {"name":"Manipulación","value":1,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":3,"type":"Talentos"},
      {"name":"Pelea","value":3,"type":"Talentos"},
      {"name":"Esquivar","value":2,"type":"Talentos"},
      {"name":"Intimidación","value":0,"type":"Talentos"},
      {"name":"Armas C.C.","value":2,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":4,"type":"Técnicas"},
      {"name":"Sigilo","value":2,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":6,"type":"Rasgos"}
    ]}
  ],
  "notes": "Subfusil 5L, Escopeta 8L. Armadura táctica (+3 soak balas, +2 Pelea). Equipo de 4. Granadas flash (+3 dif x1 turno).",
  "tags": ["Mortal", "Amenaza:Alta"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Guardia de Seguridad', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":3,"type":"Físicos"},
      {"name":"Destreza","value":2,"type":"Físicos"},
      {"name":"Resistencia","value":3,"type":"Físicos"},
      {"name":"Carisma","value":2,"type":"Sociales"},
      {"name":"Manipulación","value":2,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":2,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":1,"type":"Talentos"},
      {"name":"Pelea","value":2,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":1,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":2,"type":"Técnicas"},
      {"name":"Sigilo","value":0,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":4,"type":"Rasgos"}
    ]}
  ],
  "notes": "Pistola 4L, Porra 4C. Reporta primero, actúa después. No es combatiente dedicado.",
  "tags": ["Mortal", "Amenaza:Baja"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Guardaespaldas', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":3,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":3,"type":"Físicos"},
      {"name":"Carisma","value":2,"type":"Sociales"},
      {"name":"Manipulación","value":2,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":4,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":4,"type":"Talentos"},
      {"name":"Atletismo","value":2,"type":"Talentos"},
      {"name":"Pelea","value":3,"type":"Talentos"},
      {"name":"Esquivar","value":2,"type":"Talentos"},
      {"name":"Intimidación","value":2,"type":"Talentos"},
      {"name":"Armas C.C.","value":2,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":3,"type":"Técnicas"},
      {"name":"Sigilo","value":0,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":6,"type":"Rasgos"}
    ]}
  ],
  "notes": "Pistola 4L, Puño 3C. Chaleco (+2 soak). Puede interponerse (bodyguard action). Prioridad: proteger al principal.",
  "tags": ["Mortal", "Amenaza:Media"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Detective', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":2,"type":"Físicos"},
      {"name":"Destreza","value":2,"type":"Físicos"},
      {"name":"Resistencia","value":2,"type":"Físicos"},
      {"name":"Carisma","value":3,"type":"Sociales"},
      {"name":"Manipulación","value":3,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":4,"type":"Mentales"},
      {"name":"Inteligencia","value":3,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":0,"type":"Talentos"},
      {"name":"Pelea","value":1,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":2,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":2,"type":"Técnicas"},
      {"name":"Sigilo","value":1,"type":"Técnicas"},
      {"name":"Investigación","value":3,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":6,"type":"Rasgos"}
    ]}
  ],
  "notes": "Revólver 4L. Observador astuto (Percepción 4). Puede notar incongruencias sobrenaturales. Contactos policiales.",
  "tags": ["Mortal", "Amenaza:Media"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Soldado', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":3,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":3,"type":"Físicos"},
      {"name":"Carisma","value":2,"type":"Sociales"},
      {"name":"Manipulación","value":1,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":3,"type":"Talentos"},
      {"name":"Pelea","value":2,"type":"Talentos"},
      {"name":"Esquivar","value":2,"type":"Talentos"},
      {"name":"Intimidación","value":0,"type":"Talentos"},
      {"name":"Armas C.C.","value":2,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":3,"type":"Técnicas"},
      {"name":"Sigilo","value":2,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":5,"type":"Rasgos"}
    ]}
  ],
  "notes": "Fusil de asalto 7L, Cuchillo 4L. Disciplina militar. Opera en escuadra (4-8). Armadura ligera (+2 soak).",
  "tags": ["Mortal", "Amenaza:Media"]
}'::jsonb);

-- =============================================
-- CAZADORES / HUMANOS ESPECIALES
-- =============================================

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Cazador (Fe Verdadera)', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":2,"type":"Físicos"},
      {"name":"Destreza","value":2,"type":"Físicos"},
      {"name":"Resistencia","value":3,"type":"Físicos"},
      {"name":"Carisma","value":3,"type":"Sociales"},
      {"name":"Manipulación","value":2,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":3,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":0,"type":"Talentos"},
      {"name":"Pelea","value":2,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":0,"type":"Talentos"},
      {"name":"Armas C.C.","value":2,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":1,"type":"Técnicas"},
      {"name":"Sigilo","value":0,"type":"Técnicas"},
      {"name":"Investigación","value":2,"type":"Conocimientos"},
      {"name":"Ocultismo","value":3,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":8,"type":"Rasgos"}
    ]}
  ],
  "notes": "Estaca 3L, Cruz (repele). FE VERDADERA 3 — vampiros tiran Voluntad (dif 7) para acercarse. Puede provocar Rötschreck con símbolo sagrado.",
  "tags": ["Cazador", "Amenaza:Alta"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Ghoul Sirviente', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":3,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":3,"type":"Físicos"},
      {"name":"Carisma","value":2,"type":"Sociales"},
      {"name":"Manipulación","value":2,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":2,"type":"Talentos"},
      {"name":"Atletismo","value":2,"type":"Talentos"},
      {"name":"Pelea","value":3,"type":"Talentos"},
      {"name":"Esquivar","value":1,"type":"Talentos"},
      {"name":"Intimidación","value":1,"type":"Talentos"},
      {"name":"Armas C.C.","value":2,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":2,"type":"Técnicas"},
      {"name":"Sigilo","value":1,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":5,"type":"Rasgos"}
    ]}
  ],
  "notes": "Puño 3C (+1 Potencia), Pistola 4L. Potencia 1. Sangre: 2. Vinculado a su amo. Puede gastar sangre para +1 Físico. Puede entrar en frenesí.",
  "tags": ["Ghoul", "Amenaza:Media"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Sirviente Vinculado', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":2,"type":"Físicos"},
      {"name":"Destreza","value":2,"type":"Físicos"},
      {"name":"Resistencia","value":2,"type":"Físicos"},
      {"name":"Carisma","value":2,"type":"Sociales"},
      {"name":"Manipulación","value":2,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":2,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":2,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":2,"type":"Talentos"},
      {"name":"Atletismo","value":0,"type":"Talentos"},
      {"name":"Pelea","value":1,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":0,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":1,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":3,"type":"Rasgos"}
    ]}
  ],
  "notes": "Puño 2C, Cuchillo 3L. Vínculo de Sangre completo: +3 dif a actuar contra su Regente. Obedece sin cuestionar. Puede sacrificarse irracionalmente.",
  "tags": ["Mortal", "Amenaza:Baja"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Inquisidor (Leopoldo)', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":3,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":3,"type":"Físicos"},
      {"name":"Carisma","value":3,"type":"Sociales"},
      {"name":"Manipulación","value":3,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":4,"type":"Mentales"},
      {"name":"Inteligencia","value":3,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":2,"type":"Talentos"},
      {"name":"Pelea","value":3,"type":"Talentos"},
      {"name":"Esquivar","value":2,"type":"Talentos"},
      {"name":"Intimidación","value":0,"type":"Talentos"},
      {"name":"Armas C.C.","value":3,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":3,"type":"Técnicas"},
      {"name":"Sigilo","value":0,"type":"Técnicas"},
      {"name":"Investigación","value":3,"type":"Conocimientos"},
      {"name":"Ocultismo","value":4,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":8,"type":"Rasgos"}
    ]}
  ],
  "notes": "Espada bendita 5L (agg vs vampiros con Fe), Ballesta 5L, Pistola 4L. Fe Verdadera 2. Agua bendita (1 agg/frasco), estacas. Voluntad de Hierro. Conoce Disciplinas comunes.",
  "tags": ["Cazador", "Amenaza:Muy Alta"]
}'::jsonb);

-- =============================================
-- SOBRENATURALES
-- =============================================

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Ghoul Feral', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":4,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":4,"type":"Físicos"},
      {"name":"Carisma","value":1,"type":"Sociales"},
      {"name":"Manipulación","value":1,"type":"Sociales"},
      {"name":"Apariencia","value":1,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":1,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":3,"type":"Talentos"},
      {"name":"Pelea","value":3,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":2,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":2,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":4,"type":"Rasgos"}
    ]}
  ],
  "notes": "Mordida 4L, Garras improvisadas 4C. Potencia 1. Sangre: 2. Frenesí permanente. Ataca a cualquier vampiro por su sangre. No puede ser razonado.",
  "tags": ["Ghoul", "Amenaza:Media"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Szlachta (Ghoul de Guerra)', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":4,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":4,"type":"Físicos"},
      {"name":"Carisma","value":1,"type":"Sociales"},
      {"name":"Manipulación","value":1,"type":"Sociales"},
      {"name":"Apariencia","value":0,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":2,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":2,"type":"Talentos"},
      {"name":"Pelea","value":3,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":0,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":0,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":4,"type":"Rasgos"}
    ]}
  ],
  "notes": "Arma ósea 6L, Mordida 4L. Potencia 1. Sangre: 10. Armadura 4 (8 soak). Inmune a Dominación/Presencia. Obedece solo a su creador. Ruptura de Mascarada.",
  "tags": ["Ghoul de Guerra", "Amenaza:Alta", "Tzimisce"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Revenant', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":3,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":3,"type":"Físicos"},
      {"name":"Carisma","value":2,"type":"Sociales"},
      {"name":"Manipulación","value":3,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":3,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":2,"type":"Talentos"},
      {"name":"Atletismo","value":1,"type":"Talentos"},
      {"name":"Pelea","value":2,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":2,"type":"Talentos"},
      {"name":"Armas C.C.","value":2,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":2,"type":"Técnicas"},
      {"name":"Sigilo","value":2,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":2,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":5,"type":"Rasgos"}
    ]}
  ],
  "notes": "Según arma equipada. Potencia 1, Vicisitud 1 (varía por familia). Sangre: 1 (regenera 1/día). No envejece rápido. Humanidad máx 5. Inestable mentalmente.",
  "tags": ["Ghoul", "Amenaza:Media", "Revenant"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Sangre Débil', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":2,"type":"Físicos"},
      {"name":"Destreza","value":2,"type":"Físicos"},
      {"name":"Resistencia","value":2,"type":"Físicos"},
      {"name":"Carisma","value":2,"type":"Sociales"},
      {"name":"Manipulación","value":2,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":2,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":2,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":2,"type":"Talentos"},
      {"name":"Atletismo","value":1,"type":"Talentos"},
      {"name":"Pelea","value":1,"type":"Talentos"},
      {"name":"Esquivar","value":1,"type":"Talentos"},
      {"name":"Intimidación","value":0,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":1,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":3,"type":"Rasgos"}
    ]}
  ],
  "notes": "Sangre: 10. Gen 14ª-15ª (1 sangre/turno). Puede caminar bajo el sol (daño contusivo). Puede comer comida. Disciplinas limitadas (máx nivel 1-2). No causa Vínculo de Sangre.",
  "tags": ["Cainita", "Amenaza:Baja", "Sangre Débil"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Vampiro Neófito', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":3,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":3,"type":"Físicos"},
      {"name":"Carisma","value":2,"type":"Sociales"},
      {"name":"Manipulación","value":2,"type":"Sociales"},
      {"name":"Apariencia","value":2,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":2,"type":"Talentos"},
      {"name":"Atletismo","value":2,"type":"Talentos"},
      {"name":"Pelea","value":2,"type":"Talentos"},
      {"name":"Esquivar","value":1,"type":"Talentos"},
      {"name":"Intimidación","value":1,"type":"Talentos"},
      {"name":"Armas C.C.","value":1,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":1,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":1,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":5,"type":"Rasgos"}
    ]}
  ],
  "notes": "Puño 3C, Mordida 3 agg. Sangre: 10. Gen 12ª-13ª (1 sangre/turno). 3 dots Disciplinas de clan (nivel 1-2). Soak letal con Resistencia. Regenera 1 letal por sangre. Vulnerable a fuego y sol (agg).",
  "tags": ["Cainita", "Amenaza:Media"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Vampiro Ancilla', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":3,"type":"Físicos"},
      {"name":"Destreza","value":4,"type":"Físicos"},
      {"name":"Resistencia","value":3,"type":"Físicos"},
      {"name":"Carisma","value":3,"type":"Sociales"},
      {"name":"Manipulación","value":4,"type":"Sociales"},
      {"name":"Apariencia","value":3,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":3,"type":"Mentales"},
      {"name":"Astucia","value":4,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":2,"type":"Talentos"},
      {"name":"Pelea","value":3,"type":"Talentos"},
      {"name":"Esquivar","value":2,"type":"Talentos"},
      {"name":"Intimidación","value":3,"type":"Talentos"},
      {"name":"Armas C.C.","value":2,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":2,"type":"Técnicas"},
      {"name":"Investigación","value":1,"type":"Conocimientos"},
      {"name":"Ocultismo","value":2,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":7,"type":"Rasgos"}
    ]}
  ],
  "notes": "Según clan y disciplinas. Sangre: 14. Gen 9ª (2 sangre/turno). 6-8 dots Disciplinas (nivel 1-4). Tiene ghouls, refugio protegido, contactos. Difícil de sorprender.",
  "tags": ["Cainita", "Amenaza:Alta"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Vampiro Antiguo (Elder)', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":4,"type":"Físicos"},
      {"name":"Destreza","value":5,"type":"Físicos"},
      {"name":"Resistencia","value":4,"type":"Físicos"},
      {"name":"Carisma","value":4,"type":"Sociales"},
      {"name":"Manipulación","value":5,"type":"Sociales"},
      {"name":"Apariencia","value":4,"type":"Sociales"},
      {"name":"Percepción","value":4,"type":"Mentales"},
      {"name":"Inteligencia","value":4,"type":"Mentales"},
      {"name":"Astucia","value":5,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":4,"type":"Talentos"},
      {"name":"Atletismo","value":3,"type":"Talentos"},
      {"name":"Pelea","value":4,"type":"Talentos"},
      {"name":"Esquivar","value":3,"type":"Talentos"},
      {"name":"Intimidación","value":4,"type":"Talentos"},
      {"name":"Armas C.C.","value":3,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":3,"type":"Técnicas"},
      {"name":"Investigación","value":2,"type":"Conocimientos"},
      {"name":"Ocultismo","value":4,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":9,"type":"Rasgos"}
    ]}
  ],
  "notes": "Devastador según disciplinas. Sangre: 20. Gen 7ª (5 sangre/turno, Trait Max 6). 12-15 dots Disciplinas (nivel 1-6+). Red de ghouls, aliados y peones. NO es un encuentro casual — es un evento de campaña.",
  "tags": ["Cainita", "Amenaza:Extrema"]
}'::jsonb);

-- =============================================
-- OTROS
-- =============================================

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Zombi / Shambler', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":3,"type":"Físicos"},
      {"name":"Destreza","value":1,"type":"Físicos"},
      {"name":"Resistencia","value":4,"type":"Físicos"},
      {"name":"Carisma","value":0,"type":"Sociales"},
      {"name":"Manipulación","value":0,"type":"Sociales"},
      {"name":"Apariencia","value":0,"type":"Sociales"},
      {"name":"Percepción","value":1,"type":"Mentales"},
      {"name":"Inteligencia","value":1,"type":"Mentales"},
      {"name":"Astucia","value":1,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":0,"type":"Talentos"},
      {"name":"Atletismo","value":0,"type":"Talentos"},
      {"name":"Pelea","value":2,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":0,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":0,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":0,"type":"Rasgos"}
    ]}
  ],
  "notes": "Golpe 3C, Mordida 3L. Inmune a efectos mentales, veneno y dolor. No esquiva. Solo daño agravado o destrucción total lo detiene. Siempre actúa último.",
  "tags": ["No-Muerto", "Amenaza:Baja"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Entidad Espiritual', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":2,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":3,"type":"Físicos"},
      {"name":"Carisma","value":2,"type":"Sociales"},
      {"name":"Manipulación","value":3,"type":"Sociales"},
      {"name":"Apariencia","value":1,"type":"Sociales"},
      {"name":"Percepción","value":4,"type":"Mentales"},
      {"name":"Inteligencia","value":3,"type":"Mentales"},
      {"name":"Astucia","value":3,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":4,"type":"Talentos"},
      {"name":"Atletismo","value":0,"type":"Talentos"},
      {"name":"Pelea","value":0,"type":"Talentos"},
      {"name":"Esquivar","value":0,"type":"Talentos"},
      {"name":"Intimidación","value":3,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":3,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":3,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":7,"type":"Rasgos"}
    ]}
  ],
  "notes": "Toque helado 3 agg (bypasses armadura). Parcialmente inmaterial — armas normales hacen medio daño. Vulnerable a fuego, Fe Verdadera y magia. Puede desaparecer/reaparecer.",
  "tags": ["Espíritu", "Amenaza:Alta"]
}'::jsonb);

INSERT INTO templates (id, user_id, name, type, is_system, data) VALUES
(gen_random_uuid(), NULL, 'Gárgola (Sentinel)', 'npc', true, '{
  "maxHealth": 7,
  "groups": [
    {"name":"Atributos","fields":[
      {"name":"Fuerza","value":5,"type":"Físicos"},
      {"name":"Destreza","value":3,"type":"Físicos"},
      {"name":"Resistencia","value":5,"type":"Físicos"},
      {"name":"Carisma","value":1,"type":"Sociales"},
      {"name":"Manipulación","value":1,"type":"Sociales"},
      {"name":"Apariencia","value":1,"type":"Sociales"},
      {"name":"Percepción","value":3,"type":"Mentales"},
      {"name":"Inteligencia","value":2,"type":"Mentales"},
      {"name":"Astucia","value":2,"type":"Mentales"}
    ]},
    {"name":"Habilidades","fields":[
      {"name":"Alerta","value":3,"type":"Talentos"},
      {"name":"Atletismo","value":3,"type":"Talentos"},
      {"name":"Pelea","value":4,"type":"Talentos"},
      {"name":"Esquivar","value":2,"type":"Talentos"},
      {"name":"Intimidación","value":3,"type":"Talentos"},
      {"name":"Armas C.C.","value":0,"type":"Técnicas"},
      {"name":"Armas de Fuego","value":0,"type":"Técnicas"},
      {"name":"Sigilo","value":0,"type":"Técnicas"},
      {"name":"Investigación","value":0,"type":"Conocimientos"},
      {"name":"Ocultismo","value":0,"type":"Conocimientos"}
    ]},
    {"name":"Otros","fields":[
      {"name":"Salud máxima","value":7,"type":"Rasgos"},
      {"name":"Fuerza de Voluntad","value":5,"type":"Rasgos"}
    ]}
  ],
  "notes": "Garra 6L, Puño 5C (+Potencia), Picado 8L (vuelo + carga). Sangre: 10. Gen 10ª. Vuelo 3, Potencia 2, Fortaleza 2. Armadura +4 soak (Visceratika 4). -2 Voluntad vs control mental. Sigilo +3 cerca de piedra.",
  "tags": ["Cainita", "Amenaza:Alta", "Gárgola"]
}'::jsonb);
