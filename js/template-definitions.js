window.TEMPLATE_DEFINITIONS = {
  npc: {
    label: "PNJ",
    groups: [
      {
        name: "Atributos",
        fields: [
          { name: "Fuerza", value: 1, type: "Físicos" },
          { name: "Destreza", value: 1, type: "Físicos" },
          { name: "Resistencia", value: 1, type: "Físicos" },
          { name: "Carisma", value: 1, type: "Sociales" },
          { name: "Manipulación", value: 1, type: "Sociales" },
          { name: "Apariencia", value: 1, type: "Sociales" },
          { name: "Percepción", value: 1, type: "Mentales" },
          { name: "Inteligencia", value: 1, type: "Mentales" },
          { name: "Astucia", value: 1, type: "Mentales" },
        ],
      },
      {
        name: "Habilidades",
        fields: [
          { name: "Alerta", value: 0, type: "Talentos" },
          { name: "Atletismo", value: 0, type: "Talentos" },
          { name: "Pelea", value: 0, type: "Talentos" },
          { name: "Esquivar", value: 0, type: "Talentos" },
          { name: "Intimidación", value: 0, type: "Talentos" },
          { name: "Armas C.C.", value: 0, type: "Técnicas" },
          { name: "Armas de Fuego", value: 0, type: "Técnicas" },
          { name: "Sigilo", value: 0, type: "Técnicas" },
          { name: "Investigación", value: 0, type: "Conocimientos" },
          { name: "Ocultismo", value: 0, type: "Conocimientos" },
        ],
      },
      {
        name: "Otros",
        fields: [
          { name: "Salud máxima", value: 7, type: "Rasgos" },
          { name: "Fuerza de Voluntad", value: 5, type: "Rasgos" },
        ],
      },
    ],
  },
};
