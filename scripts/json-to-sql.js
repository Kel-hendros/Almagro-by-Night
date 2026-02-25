#!/usr/bin/env node
// Transforms system-templates JSON files into SQL INSERT statements
const fs = require('fs');
const path = require('path');

const ATTR_TYPES = {
  Fuerza: 'Físicos', Destreza: 'Físicos', Resistencia: 'Físicos',
  Carisma: 'Sociales', Manipulación: 'Sociales', Apariencia: 'Sociales',
  Percepción: 'Mentales', Inteligencia: 'Mentales', Astucia: 'Mentales',
};

function transform(tpl) {
  const attrFields = Object.entries(tpl.attributes).map(([name, value]) => ({
    name, value, type: ATTR_TYPES[name] || 'Físicos',
  }));

  const abilityFields = Object.entries(tpl.abilities || {}).map(([name, info]) => ({
    name, value: info.value, type: info.type,
  }));

  const data = {
    maxHealth: tpl.maxHealth || 7,
    notes: tpl.notes || '',
    tags: tpl.tags || [],
    groups: [
      { name: 'Atributos', fields: attrFields },
      { name: 'Habilidades', fields: abilityFields },
      {
        name: 'Otros',
        fields: [
          { name: 'Salud máxima', value: tpl.maxHealth || 7, type: 'Rasgos' },
          { name: 'Fuerza de Voluntad', value: tpl.willpower || 0, type: 'Rasgos' },
        ],
      },
    ],
  };

  return { name: tpl.name, type: tpl.type || 'npc', data };
}

// Read files from args or default to all
const dataDir = path.join(__dirname, '..', 'data');
let files = process.argv.slice(2);
if (files.length === 0) {
  files = fs.readdirSync(dataDir).filter(f => f.startsWith('system-templates-') && f.endsWith('.json'));
} else {
  files = files.map(f => f.endsWith('.json') ? f : f + '.json');
}

const values = [];
for (const file of files) {
  const fullPath = path.join(dataDir, file);
  if (!fs.existsSync(fullPath)) { console.error('Not found:', fullPath); continue; }
  const templates = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  for (const tpl of templates) {
    if (tpl._section && !tpl.name) continue; // skip standalone section markers
    const row = transform(tpl);
    const jsonStr = JSON.stringify(row.data).replace(/'/g, "''");
    values.push(`  ('${row.name.replace(/'/g, "''")}', '${row.type}', true, '${jsonStr}'::jsonb)`);
  }
}

console.log(`INSERT INTO templates (name, type, is_system, data) VALUES`);
console.log(values.join(',\n') + ';');
console.log(`\n-- ${values.length} templates`);
