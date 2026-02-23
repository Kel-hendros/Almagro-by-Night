// Repositorio de Caminos/Sendas V20
// Fuente: knowledge_base/localizationAndRepository.js
// virtues: [X, Y] donde X = Conciencia(1)/Convicción(2), Y = Autocontrol(3)/Instinto(4)
window.ROAD_REPO = [
  {
    id: 1,
    name: "Humanidad",
    virtues: [1, 3],
    description:
      "Los seguidores de la Vía Humanitatis (Camino de la Humanidad) luchan contra su Bestia aferrándose a su humanidad perdida. Enfatizan virtudes humanas como la compasión, la razón y la empatía que separan al hombre de la bestia. Estos Vástagos son conocidos como Pródigos.",
    wikiUrl: "https://whitewolf.fandom.com/wiki/Road_of_Humanity",
    sins: [
      {
        rating: 10,
        sin: "Pensamientos egoístas.",
        reason: "Pensarlo equivale a hacerlo.",
      },
      {
        rating: 9,
        sin: "Actos egoístas menores.",
        reason: "La compasión nos separa de las bestias.",
      },
      {
        rating: 8,
        sin: "Herir a otra persona (deliberado o accidental).",
        reason: "Sigue la regla de oro.",
      },
      {
        rating: 7,
        sin: "Robo o hurto.",
        reason: "Respeta la propiedad ajena.",
      },
      {
        rating: 6,
        sin: "Violación accidental (p. ej., drenar a una víctima por hambre).",
        reason: "La ignorancia no excusa la crueldad.",
      },
      {
        rating: 5,
        sin: "Destrucción gratuita.",
        reason: "El hombre crea; la Bestia destruye.",
      },
      {
        rating: 4,
        sin: "Violación apasionada (p. ej., homicidio imprudente, matar a una víctima en frenesí).",
        reason: "Quien actúa como una bestia, se convierte en una bestia.",
      },
      {
        rating: 3,
        sin: "Violación premeditada (p. ej., asesinato).",
        reason: "Si te rindes ante la Bestia, te conviertes en su esclavo.",
      },
      {
        rating: 2,
        sin: "Violación casual (p. ej., matar por capricho, alimentarse más allá de la saciedad).",
        reason: "Los demás son dignos de respeto.",
      },
      {
        rating: 1,
        sin: "Los actos más atroces y dementes.",
        reason: "¿Eres hombre o Bestia?",
      },
    ],
  },
  {
    id: 2,
    name: "Senda del Acuerdo Honorable",
    virtues: [1, 3],
    description:
      "La Senda del Acuerdo Honorable es una Senda de Iluminación que domina a la Bestia mediante la práctica rigurosa de un comportamiento honorable y caballeresco. Sus seguidores son llamados Caballeros, Patriotas o Canonici.",
    wikiUrl: "https://whitewolf.fandom.com/wiki/Path_of_Honorable_Accord",
    sins: [
      {
        rating: 10,
        sin: "No respetar plenamente los preceptos de tu grupo.",
        reason: "El deber verdadero a una causa exige un carácter intachable.",
      },
      {
        rating: 9,
        sin: "No mostrar hospitalidad a tus aliados.",
        reason: "La hospitalidad y la generosidad son la riqueza del alma.",
      },
      {
        rating: 8,
        sin: "Relacionarse con gente sin honor.",
        reason:
          "Sirve como ejemplo, pero no te dejes arrastrar a la mezquindad.",
      },
      {
        rating: 7,
        sin: "No participar en los rituales de tu grupo.",
        reason: "La tradición y el ritual son partes importantes del legado.",
      },
      {
        rating: 6,
        sin: "Desobedecer a tu líder.",
        reason: "La lealtad es la piedra angular de la jerarquía.",
      },
      {
        rating: 5,
        sin: "No proteger a tus aliados.",
        reason: "Defiende a aquellos dignos de tu estima.",
      },
      {
        rating: 4,
        sin: "Anteponer preocupaciones personales al deber.",
        reason: "El deber es el propósito del Vástago.",
      },
      {
        rating: 3,
        sin: "Mostrar cobardía.",
        reason: "El honor reside en luchar por una causa, no en huir de ella.",
      },
      {
        rating: 2,
        sin: "Matar sin motivo.",
        reason: "La vida y la muerte están en manos de Dios.",
      },
      {
        rating: 1,
        sin: "Romper tu palabra o juramento; no honrar un acuerdo.",
        reason:
          "Romper un juramento es carecer del honor que define tu existencia.",
      },
    ],
  },
  {
    id: 3,
    name: "Senda de Caín",
    virtues: [2, 4],
    description:
      "La Senda de Caín es una Senda de Iluminación que emula al Oscuro Padre (Caín) para mantener a raya a la Bestia. Debido a su fuerte vínculo con el Noddismo (el estudio del Libro de Nod), se encuentra casi exclusivamente dentro de las filas del Sabbat. Sus seguidores son conocidos como Nodistas.",
    wikiUrl: "https://whitewolf.fandom.com/wiki/Path_of_Caine",
    sins: [
      {
        rating: 10,
        sin: "No investigar ni estudiar.",
        reason: "La búsqueda de la verdad requiere dedicación.",
      },
      {
        rating: 9,
        sin: "No enseñar a otro Vástago acerca de la Senda.",
        reason:
          "Todos los Vástagos deben tener la oportunidad de explorar su potencial.",
      },
      {
        rating: 8,
        sin: "Tratar a los mortales como iguales.",
        reason:
          "Caín se separó de los mortales; así deben hacerlo todos los Vástagos.",
      },
      {
        rating: 7,
        sin: "No respetar a otros estudiantes de Caín.",
        reason:
          "Todos los Hijos de Caín merecen el respeto debido a su linaje, mientras se esfuercen por comprenderse a sí mismos.",
      },
      {
        rating: 6,
        sin: 'No "cabalgar la ola" del frenesí.',
        reason: "Dirige a la Bestia; no permitas que ella te dirija.",
      },
      {
        rating: 5,
        sin: "Sucumbir al Rötschreck (terror rojo).",
        reason: "Domina tu miedo. El terror es para los seres inferiores.",
      },
      {
        rating: 4,
        sin: "No diablerizar a un Vástago que mantenga su Humanidad.",
        reason: "Aquellos que no exploran su potencial renuncian a él.",
      },
      {
        rating: 3,
        sin: "No probar los límites de tu condición vampírica.",
        reason:
          "Desarrolla tus capacidades hasta sus límites para discernir tu verdadera naturaleza.",
      },
      {
        rating: 2,
        sin: "No buscar conocimiento sobre Caín y el vampirismo.",
        reason:
          "Cada fragmento de conocimiento añade una pieza al rompecabezas de la existencia no-muerta.",
      },
      {
        rating: 1,
        sin: "Negar tu hambre u otras facetas de la condición vampírica.",
        reason:
          "Para ser un Vástago, debes satisfacer las necesidades de un Vástago.",
      },
    ],
  },
  {
    id: 4,
    name: "Senda de los Cátaros",
    virtues: [2, 4],
    description:
      "La Senda de los Cátaros surgió de la herejía del Catarismo (albigensismo) durante la Edad Oscura. Sus seguidores se conocen como Albigenses o Credentes, y abrazan un dualismo que exalta el espíritu y desprecia el mundo material, buscando la pureza mediante la indulgencia en el pecado para trascenderlo.",
    wikiUrl: "https://whitewolf.fandom.com/wiki/Path_of_Cathari",
    sins: [
      {
        rating: 10,
        sin: "Actuar con moderación.",
        reason: "El propósito de uno es el exceso, no la moderación.",
      },
      { rating: 9, sin: "Confiar en los demás.", reason: "Usa o sé usado." },
      {
        rating: 8,
        sin: "No transmitir la Maldición a los malvados apasionados ni a los virtuosos.",
        reason:
          "Los depravados sirven mejor al mal como vampiros; los virtuosos pueden ser doblegados por la maldición.",
      },
      {
        rating: 7,
        sin: "No 'cabalgar la ola' durante el frenesí.",
        reason: "La Bestia, al igual que el yo superior, debe ser complacida.",
      },
      {
        rating: 6,
        sin: "Actuar en contra de otro Albigense.",
        reason:
          "Quienes comparten el mismo propósito deben cumplirlo, no pelear entre sí.",
      },
      {
        rating: 5,
        sin: "Matar impulsivamente.",
        reason:
          "El asesinato no logra ningún fin superior; un hombre muerto no puede mancillar su alma.",
      },
      {
        rating: 4,
        sin: "Renunciar a tus placeres para la conveniencia de otro.",
        reason: "Promueve los placeres físicos, no logros altruistas.",
      },
      {
        rating: 3,
        sin: "Privarse de los placeres.",
        reason:
          "El mundo material es un lugar para la gratificación de la carne.",
      },
      {
        rating: 2,
        sin: "Matar arbitrariamente.",
        reason:
          "Matar a un mortal lo absuelve de provocar su propia condenación.",
      },
      {
        rating: 1,
        sin: "Animar a otros a actuar con moderación.",
        reason:
          "Los Vástagos son criaturas del mal; el propósito de un Vástago es corromper, no salvar.",
      },
    ],
  },
  {
    id: 5,
    name: "Senda del Corazón Salvaje",
    virtues: [2, 4],
    description:
      "La Senda del Corazón Salvaje, derivada de la Vía Bestiae, es practicada principalmente por miembros del clan Gangrel. Busca controlar a la Bestia aceptando sus instintos como algo natural y asumiendo el rol del vampiro como un cazador entre cazadores. Sus seguidores son conocidos como Bestiales.",
    wikiUrl: "https://whitewolf.fandom.com/wiki/Path_of_the_Beast",
    sins: [
      {
        rating: 10,
        sin: "Cazar usando medios distintos a tus poderes vampíricos.",
        reason: "El cazador perfecto no necesita herramientas.",
      },
      {
        rating: 9,
        sin: "Inmiscuirse en intrigas políticas.",
        reason: "Las luchas políticas no ofrecen sustento.",
      },
      {
        rating: 8,
        sin: "Arriesgar tu no-vida salvo para acabar con un enemigo.",
        reason: "No tiene sentido tentar a la Muerte Definitiva.",
      },
      {
        rating: 7,
        sin: "Actuar de manera excesivamente cruel.",
        reason:
          "La muerte es natural; alimentarse es natural. La tortura y la crueldad no lo son.",
      },
      {
        rating: 6,
        sin: "No saciar tu hambre.",
        reason: "El propósito del Vástago es alimentarse.",
      },
      {
        rating: 5,
        sin: "No apoyar a tus aliados.",
        reason: "Apoya a tu familia y ella te apoyará a ti.",
      },
      {
        rating: 4,
        sin: "Matar sin necesidad.",
        reason: "No podrás volver a alimentarte de una presa muerta.",
      },
      {
        rating: 3,
        sin: "No seguir tus instintos.",
        reason: "El instinto es la base de la naturaleza depredadora.",
      },
      {
        rating: 2,
        sin: "Matar a una criatura por cualquier razón que no sea la supervivencia.",
        reason: "El propósito de una muerte es el sustento.",
      },
      {
        rating: 1,
        sin: "Rehusarse a matar para sobrevivir.",
        reason: "Los Vástagos son cazadores; todos los demás son presa.",
      },
    ],
  },
  {
    id: 6,
    name: "Senda de los Huesos",
    virtues: [2, 3],
    description:
      "La Senda de los Huesos suprime a la Bestia mediante el estudio de la verdadera naturaleza de la muerte y su relación con otros estados de existencia. Sus seguidores, originados en los Cappadocianos y actualmente sobre todo Giovanni, son conocidos como Sepultureros.",
    wikiUrl: "https://whitewolf.fandom.com/wiki/Path_of_Bones",
    sins: [
      {
        rating: 10,
        sin: "Mostrar temor a la Muerte.",
        reason: "El miedo inhibe el aprendizaje.",
      },
      {
        rating: 9,
        sin: "No estudiar un suceso de muerte.",
        reason: "Negarse a aprender implica negarse a comprender.",
      },
      {
        rating: 8,
        sin: "Matar accidentalmente.",
        reason: "No hay oportunidad de obtener conocimiento.",
      },
      {
        rating: 7,
        sin: "Retrasar la alimentación cuando se tiene hambre.",
        reason: "La negación de uno mismo no sirve a un propósito superior.",
      },
      {
        rating: 6,
        sin: "Sucumbir al frenesí.",
        reason:
          "La Bestia es irracional, y la emoción aporta poco al entendimiento.",
      },
      {
        rating: 5,
        sin: "Negarse a matar cuando se presenta la oportunidad.",
        reason:
          "La experimentación comprueba la teoría; sin prueba, no hay conclusión.",
      },
      {
        rating: 4,
        sin: "Tomar decisiones guiado por la emoción en vez de la lógica.",
        reason: "Los Vástagos están muertos; también lo están sus emociones.",
      },
      {
        rating: 3,
        sin: "Incomodarse para beneficio de otro.",
        reason:
          "La muerte es inevitable; aliviar la incomodidad de alguien condenado no tiene sentido.",
      },
      {
        rating: 2,
        sin: "Evitar una muerte sin necesidad.",
        reason: "No se debe impedir el ciclo, sino aprender de él.",
      },
      {
        rating: 1,
        sin: "Impedir activamente una muerte.",
        reason:
          "Esas ataduras emocionales son propias de humanos, no de Vástagos.",
      },
    ],
  },
  {
    id: 7,
    name: "Senda de Lilith",
    virtues: [2, 4],
    description:
      "La Senda de Lilith es una antigua Senda de Iluminación con raíces en los cultos Bahari, que reprime a la Bestia mediante la búsqueda de los secretos de Lilith y la exaltación del dolor y el éxtasis. Sus seguidores son conocidos como Lilin o Bahari.",
    wikiUrl: "https://whitewolf.fandom.com/wiki/Path_of_Lilith",
    sins: [
      {
        rating: 10,
        sin: "Alimentarse de inmediato al sentir hambre.",
        reason: "La privación y el hambre enseñaron a Lilith a sobrevivir.",
      },
      {
        rating: 9,
        sin: "Buscar riqueza o poder terrenal.",
        reason:
          "La verdadera riqueza viene del interior, no del dinero ni de la influencia.",
      },
      {
        rating: 8,
        sin: "No corregir los falsos mitos de Caín.",
        reason:
          "Caín fue un asesino, traidor y necio que no merece reverencia.",
      },
      {
        rating: 7,
        sin: "Sentir remordimiento por causar dolor a alguien.",
        reason: "El dolor y el sufrimiento ayudan a otros a aprender y crecer.",
      },
      {
        rating: 6,
        sin: "No participar en un ritual Bahari.",
        reason:
          "Los rituales transmitidos a través del tiempo contienen pistas para el despertar.",
      },
      {
        rating: 5,
        sin: "Temer a la muerte.",
        reason:
          "La muerte es simplemente un cambio inevitable hacia una nueva forma de existencia.",
      },
      {
        rating: 4,
        sin: "Matar a un ser vivo o no-muerto.",
        reason: "La muerte le niega a uno la oportunidad de trascender.",
      },
      {
        rating: 3,
        sin: "No buscar las enseñanzas de Lilith.",
        reason:
          "Lilith ocultó sus obras en muchos lugares; se deben encontrar.",
      },
      {
        rating: 2,
        sin: "No infligir dolor y angustia.",
        reason: "Enseña a través del dolor.",
      },
      {
        rating: 1,
        sin: "Rehuir el dolor.",
        reason:
          "Solo a través del dolor renacemos. Rehuir el dolor es abrazar la ignorancia.",
      },
    ],
  },
  {
    id: 8,
    name: "Senda de la Metamorfosis",
    virtues: [2, 4],
    description:
      "La Senda de la Metamorfosis, continuación del antiguo Camino de la Metamorfosis, es practicada principalmente por el clan Tzimisce. Sus seguidores controlan a la Bestia estudiando los límites de ésta y del vampirismo, con el objetivo de trascender la maldición de Caín. Sus adeptos son conocidos como Metamorfosistas.",
    wikiUrl: "https://whitewolf.fandom.com/wiki/Path_of_Metamorphosis",
    sins: [
      {
        rating: 10,
        sin: "Retrasar la alimentación cuando tienes hambre.",
        reason: "El hambre causa distracción.",
      },
      {
        rating: 9,
        sin: "Entregarse al placer.",
        reason: "El hedonismo aparta a uno de fines superiores.",
      },
      {
        rating: 8,
        sin: "Pedir conocimiento a otro.",
        reason:
          "Las lecciones de la Metamorfosis son secretos que deben descubrirse, no copiarse.",
      },
      {
        rating: 7,
        sin: "Compartir conocimiento con otro.",
        reason: "El conocimiento debe ser aprendido, no simplemente mostrado.",
      },
      {
        rating: 6,
        sin: "Negarse a matar cuando se puede obtener conocimiento de ello.",
        reason:
          "Antes de trascender la muerte, el Metamorfosista debe comprender el fenómeno.",
      },
      {
        rating: 5,
        sin: "No 'cabalgar' un frenesí.",
        reason: "Un Vástago debe conocer a la Bestia para trascenderla.",
      },
      {
        rating: 4,
        sin: "Considerar las necesidades de otros.",
        reason:
          "Quienes no se esfuerzan en lograr la Metamorfosis no merecen tu atención.",
      },
      {
        rating: 3,
        sin: "No experimentar, incluso a riesgo propio.",
        reason:
          "La Senda solo puede comprenderse mediante investigación empírica.",
      },
      {
        rating: 2,
        sin: "No alterar tu propio cuerpo.",
        reason:
          "El cambio físico debe alcanzarse antes de una metamorfosis más significativa.",
      },
      {
        rating: 1,
        sin: "Mostrar compasión por otros.",
        reason:
          "El destino de los demás arrastra a uno a la involución, no a la trascendencia.",
      },
    ],
  },
  {
    id: 9,
    name: "Senda de la Noche",
    virtues: [2, 4],
    description:
      "La Senda de la Noche predica aceptar la maldición de Caín y la Bestia, usando sus poderes para cumplir el propósito del vampirismo: sembrar caos entre los mortales e infundir terror. De ese modo, sus seguidores —principalmente Lasombra, llamados Nihilistas— creen encontrar la salvación como agentes de la condenación.",
    wikiUrl: "https://whitewolf.fandom.com/wiki/Path_of_Night",
    sins: [
      {
        rating: 10,
        sin: "Matar a un mortal para alimentarse.",
        reason: "Un mortal muerto no puede sentir terror.",
      },
      {
        rating: 9,
        sin: "Actuar en interés de otro.",
        reason:
          "La Gehenna está cerca; no queda tiempo para cumplir agendas banales.",
      },
      {
        rating: 8,
        sin: "No ser innovador en tus depredaciones.",
        reason: "Dios hizo de los Vástagos horrores, no asesinos.",
      },
      {
        rating: 7,
        sin: "Pedir ayuda a otro.",
        reason: "Quien no puede valerse por sí mismo cumple mal sus fines.",
      },
      {
        rating: 6,
        sin: "Matar accidentalmente.",
        reason:
          "Que la muerte sea una herramienta: mata selectivamente y aprende del fin de tus víctimas.",
      },
      {
        rating: 5,
        sin: "Someterse a la voluntad de otro Vástago.",
        reason:
          "Los juegos de la Yihad son distracciones del verdadero propósito de los Condenados.",
      },
      {
        rating: 4,
        sin: "Asesinato intencional o pasional.",
        reason:
          "La muerte no sirve a nadie; meramente priva a uno de una víctima.",
      },
      {
        rating: 3,
        sin: "Ayudar a otro.",
        reason:
          "La compasión no tiene cabida en el corazón no-muerto de un Vástago.",
      },
      {
        rating: 2,
        sin: "Aceptar la superioridad de otro.",
        reason: "Todos los Vástagos son iguales bajo el plan de Dios.",
      },
      {
        rating: 1,
        sin: "Arrepentirse de la propia conducta.",
        reason:
          "El propósito de los Vástagos es causar arrepentimiento, no practicarlo.",
      },
    ],
  },
  {
    id: 10,
    name: "Senda de la Paradoja",
    virtues: [2, 3],
    description:
      "La Senda de la Paradoja enseña que la realidad es maleable e impermanente. Sus adeptos (principalmente Ravnos occidentales) sienten el deber de alterar el orden establecido y destruir los artificios de los Antediluvianos mediante engaños y robos, liberando así la energía cósmica (weig) acumulada. A sus seguidores se les llama Shilmulo.",
    wikiUrl: "https://whitewolf.fandom.com/wiki/Path_of_Paradox_(Western)",
    sins: [
      {
        rating: 10,
        sin: "Rehusarse a cometer diablerie sobre el anciano de otro clan.",
        reason:
          "Los ancianos de otros clanes poseen gran poder. Tómalo para ti.",
      },
      {
        rating: 9,
        sin: 'Negarse a guiar a un ser "encerrado" hacia la luz o la destrucción.',
        reason:
          "Algunos Cainitas pueden ser guiados. Extiéndeles la mano si es posible.",
      },
      {
        rating: 8,
        sin: "Mostrar cualquier preocupación por los mortales.",
        reason: "Los mortales crean leyes para restringirnos.",
      },
      {
        rating: 7,
        sin: "No satisfacer tus deseos.",
        reason:
          "La forma vampírica nos otorga hambre y deseos para saber qué experiencias buscar. Evitarlos es morir verdaderamente.",
      },
      {
        rating: 6,
        sin: "No engañar a otros cuando surge la oportunidad.",
        reason:
          "El Abrazo nos libera para saciar nuestros caprichos. Negar esos caprichos es negarse a uno mismo.",
      },
      {
        rating: 5,
        sin: "Ser atrapado alterando la realidad de otro mediante la redistribución selectiva de posesiones (robo).",
        reason:
          "Mortales y Cainitas desaprueban nuestras actividades. No dejes que nos vean ni que actúen con ese conocimiento.",
      },
      {
        rating: 4,
        sin: "Negarse a liberar el weig de un artefacto potenciado o a usarlo en tu propio beneficio.",
        reason: "El mayor poder conlleva mayor libertad.",
      },
      {
        rating: 3,
        sin: "Unirse a una secta o estabilizar la sociedad de algún modo.",
        reason:
          "La sociedad limita la acción y nos niega nuestras necesidades.",
      },
      {
        rating: 2,
        sin: "Impedir activamente el cambio; permitir que otros conozcan tus motivos.",
        reason:
          "Lo que otros saben, pueden entenderlo y usarlo contra ti. Promueve el cambio para que el equilibrio del conocimiento esté a tu favor.",
      },
      {
        rating: 1,
        sin: "Provocar activamente el aburrimiento; aceptar el Vínculo de Sangre.",
        reason:
          "Someterte a la voluntad de otro es dejar de ser un individuo y convertirte en la extensión de la voluntad ajena.",
      },
    ],
  },
  {
    id: 11,
    name: "Senda del Poder y la Voz Interior",
    virtues: [2, 4],
    description:
      "La Senda del Poder y la Voz Interior enseña a dominar a la Bestia mediante una férrea determinación y la acumulación de poder mundano. Sus practicantes, conocidos como Unificadores, creen que la verdad se encuentra en su propia voz interior y que el control absoluto de sí mismos y del mundo es el máximo objetivo.",
    wikiUrl:
      "https://whitewolf.fandom.com/wiki/Path_of_Power_and_the_Inner_Voice",
    sins: [
      {
        rating: 10,
        sin: "Negar la responsabilidad por tus acciones.",
        reason:
          "El incumplimiento de la responsabilidad es un fallo en liderar correctamente.",
      },
      {
        rating: 9,
        sin: "Tratar mal a tus subordinados.",
        reason:
          "Recompensa la competencia como incentivo, pero con moderación.",
      },
      {
        rating: 8,
        sin: "No respetar a tus superiores.",
        reason:
          "Da el respeto que se debe, para que a su vez puedas aprender algo.",
      },
      {
        rating: 7,
        sin: "Ayudar a otros sin obtener ventaja.",
        reason: "Siempre obtén algo de tus acciones.",
      },
      { rating: 6, sin: "Aceptar la derrota.", reason: "Triunfa o muere." },
      {
        rating: 5,
        sin: "No matar cuando conviene a tus intereses.",
        reason: "No dudes en eliminar a quienes se te opongan.",
      },
      {
        rating: 4,
        sin: "Someterse a los errores de otros.",
        reason:
          "Si tienes razón, serás reivindicado. Si sigues a un necio, lo pagarás con sufrimiento.",
      },
      {
        rating: 3,
        sin: "No usar la herramienta más eficaz para el control.",
        reason: "El poder debe tomarse. Sé implacable y firme.",
      },
      {
        rating: 2,
        sin: "No castigar el fracaso.",
        reason:
          "El fracaso es aleccionador solo cuando se usa como ejemplo negativo.",
      },
      {
        rating: 1,
        sin: "Rechazar una oportunidad de poder.",
        reason: "El poder personal es el medio para todo fin.",
      },
    ],
  },
  {
    id: 12,
    name: "Senda de la Sangre",
    virtues: [2, 3],
    description:
      "La Senda de la Sangre, seguida principalmente por los Assamitas, combate a la Bestia mediante una rigurosa devoción a la causa de Haqim. Sus seguidores son llamados Derviches o Asesinos.",
    wikiUrl: "https://whitewolf.fandom.com/wiki/Path_of_Blood_(Assamite)",
    sins: [
      {
        rating: 10,
        sin: "Matar a un mortal durante la alimentación.",
        reason:
          "La sangre humana nutre el cuerpo, pero el asesinato de los inferiores es veneno para el alma.",
      },
      {
        rating: 9,
        sin: "Romper tu palabra de honor a un compañero en la Senda.",
        reason: "La solidaridad es importante para la sagrada causa de Haqim.",
      },
      {
        rating: 8,
        sin: "No enseñar a otros acerca de Haqim y sus enseñanzas.",
        reason: "Los vástagos de Caín son una maldición y deben ser salvados.",
      },
      {
        rating: 7,
        sin: "No destruir a un infiel.",
        reason:
          "Quienes no aceptan las enseñanzas de Haqim pierden su no-vida.",
      },
      {
        rating: 6,
        sin: "Entrar en frenesí.",
        reason: "Haqim enseña elevación, no indulgencia.",
      },
      {
        rating: 5,
        sin: "No tratar de aprender todo lo posible sobre un enemigo y sus tácticas.",
        reason:
          "Para oponerte con éxito a tus enemigos, debes aprender todo sobre ellos.",
      },
      {
        rating: 4,
        sin: "No matar a un enemigo y obtener sustento de su sangre.",
        reason:
          "Otros miembros del clan pueden beneficiarse de tal vitae, por diluida que esté.",
      },
      {
        rating: 3,
        sin: "Rehusarse a responder al llamado de otro seguidor de la Senda.",
        reason:
          "Actuar con egoísmo es caer en las trampas de la progenie de Caín.",
      },
      {
        rating: 2,
        sin: "No diablerizar a un enemigo.",
        reason:
          "Haqim lo ha decretado como primordial para la causa de sus hijos.",
      },
      {
        rating: 1,
        sin: "Actuar contra otro seguidor de la Senda.",
        reason: "Es traición a la Senda y a Haqim.",
      },
    ],
  },
  {
    id: 13,
    name: "Senda del Tifón",
    virtues: [2, 3],
    description:
      "La Senda del Tifón se basa en la doctrina Setita y en la religión alrededor de su Antediluviano (Set). Es la vía ortodoxa del clan Seguidores de Set, y dio origen a sendas derivadas como las de Sutekh, Éxtasis y Guerrero. Sus adeptos son llamados Teofidianos o Tifonistas (conocidos por otros clanes como Corruptores).",
    wikiUrl: "https://whitewolf.fandom.com/wiki/Path_of_Typhon",
    sins: [
      {
        rating: 10,
        sin: "Perseguir tus propias indulgencias en lugar de las de otro.",
        reason: "El caer en el vicio es una herramienta, no una diversión.",
      },
      {
        rating: 9,
        sin: "Negarse a ayudar a otro seguidor de la Senda.",
        reason:
          "Trabajar en equipo es más eficaz que actuar solo para elevar a Set.",
      },
      {
        rating: 8,
        sin: "No destruir a un vampiro en Golconda.",
        reason: "Quienes han trascendido sus deseos no pueden ser dominados.",
      },
      {
        rating: 7,
        sin: "No observar un ritual religioso Setita.",
        reason: "No debes negarle a Set lo que le corresponde.",
      },
      {
        rating: 6,
        sin: "No socavar el orden social actual en favor de los Setitas.",
        reason:
          "Los demás Vástagos carecen de propósito o están extraviados, y esa indolencia retrasa el resurgimiento de Set.",
      },
      {
        rating: 5,
        sin: "No hacer lo que sea necesario para corromper a otro.",
        reason: "Cuantas más personas estén en deuda con los Setitas, mejor.",
      },
      {
        rating: 4,
        sin: "No buscar conocimiento arcano.",
        reason:
          "Los misterios de la resurrección de Set pueden esconderse en cualquier lugar.",
      },
      {
        rating: 3,
        sin: "Obstruir los esfuerzos de otro Setita.",
        reason:
          "Las filas de los justos no son lugar para mezquinos juegos de poder.",
      },
      {
        rating: 2,
        sin: "No aprovechar la debilidad de otro.",
        reason: "La compasión no tiene lugar en los planes mayores de Set.",
      },
      {
        rating: 1,
        sin: "Rehusarse a ayudar en la resurrección de Set.",
        reason: "Eso es propio de los infieles.",
      },
    ],
  },
  {
    id: 14,
    name: "Senda del Cielo",
    virtues: [1, 3],
    description:
      "Los seguidores de la Vía Caeli intentan controlar a su Bestia mediante la devoción religiosa. Con frecuencia se les conoce como Nodistas o los Fieles.",
    wikiUrl: "https://whitewolf.fandom.com/wiki/Road_of_Heaven",
    sins: [
      {
        rating: 10,
        sin: "Violar cualquiera de los Diez Mandamientos, por cualquier motivo.",
        reason: "La Palabra de Dios es ley.",
      },
      {
        rating: 9,
        sin: "No denunciar la corrupción y el pecado.",
        reason: "Lo único que el Diablo exige es que los fieles no hagan nada.",
      },
      {
        rating: 8,
        sin: "Actuar por orgullo, avaricia, glotonería o algún otro impulso pecaminoso.",
        reason: "El pecado es el camino hacia la Bestia.",
      },
      {
        rating: 7,
        sin: "Robo, hurto, vandalismo intencionado.",
        reason: "No robarás.",
      },
      {
        rating: 6,
        sin: "Causar daño a personas piadosas y virtuosas.",
        reason: "Dios ve todo y castiga tales pecados.",
      },
      {
        rating: 5,
        sin: "Alimentarse de un inocente sin permiso.",
        reason: "Dios protege a los inocentes.",
      },
      {
        rating: 4,
        sin: "Actos blasfemos o heréticos.",
        reason:
          "No tendrás dioses ajenos delante de mí. Negar a Dios solo conduce a la condenación.",
      },
      {
        rating: 3,
        sin: "Permitir que un delito o un pecado grave quede impune.",
        reason: "Mía es la venganza, dice el Señor.",
      },
      {
        rating: 2,
        sin: "El asesinato de inocentes.",
        reason: "No matarás. No repitas el pecado de Caín.",
      },
      {
        rating: 1,
        sin: "Ayudar a un demonio u otro agente sobrenatural del mal.",
        reason: "Sirve al mal y servirás a la Bestia.",
      },
    ],
  },
  {
    id: 15,
    name: "Senda del Cazador Gris",
    virtues: [2, 4], // Convicción e Instinto
    description:
      "Via Venator Umbra es una derivación de la Vía Bestiae. Enseña que la ciudad es un hábitat tan válido para un Vástago como el bosque, siempre que allí haya presa que perseguir.",
    wikiUrl: "https://whitewolf.fandom.com/wiki/Path_of_the_Grey_Hunter",
    sins: [
      {
        rating: 10,
        sin: "Negarse a ofrecer hospitalidad a un visitante invitado o anunciado.",
        reason: "La cortesía mantiene redes y oportunidades de caza.",
      },
      {
        rating: 9,
        sin: "Evitar la oportunidad de cazar en los parajes salvajes.",
        reason: "La presa espera a quien tiene agudeza.",
      },
      {
        rating: 8,
        sin: "No cazar un objetivo fácil cuando se presenta la oportunidad.",
        reason: "Una presa ignorada es una debilidad propia.",
      },
      {
        rating: 7,
        sin: "Rehuir una reunión o celebración significativa.",
        reason: "Los encuentros pueden revelar presas u oportunidades.",
      },
      {
        rating: 6,
        sin: "Evitar el contacto con la civilización.",
        reason: "La ciudad es terreno fértil para el cazador astuto.",
      },
      {
        rating: 5,
        sin: "Hacer un sacrificio por un extraño sin beneficio.",
        reason: "Un cazador debe optimizar sus fuerzas y ventajas.",
      },
      {
        rating: 4,
        sin: "Rehusar matar cuando es importante para tu seguridad.",
        reason: "La supervivencia exige decisión cuando tu vida está en juego.",
      },
      {
        rating: 3,
        sin: "No defender tu territorio.",
        reason: "Un cazador sin dominio territorial no tiene red de caza.",
      },
      {
        rating: 2,
        sin: "Mostrar clemencia hacia tus enemigos.",
        reason:
          "La piedad puede dar lugar a que la presa escape o se vuelva predador.",
      },
      {
        rating: 1,
        sin: "Abstenerse de alimentarse estando hambriento.",
        reason: "Negar el sustento es negarse como depredador.",
      },
    ],
  },
];

// Mapeo de IDs de virtud a valores internos y labels de display
// 1=Conciencia, 2=Convicción, 3=Autocontrol, 4=Instinto, 5=Coraje (siempre fijo)
window.VIRTUE_MAP = {
  1: { value: "conciencia", label: "Conciencia" },
  2: { value: "conviccion", label: "Convicción" },
  3: { value: "autocontrol", label: "Autocontrol" },
  4: { value: "instinto", label: "Instinto" },
};
