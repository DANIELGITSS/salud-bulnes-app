/**
 * Actualiza el tema GES de Hipertensión Arterial con el flujo HEARTS SSÑ 2026
 * y la adaptación operativa del protocolo PSCV HCSF Bulnes.
 *
 * Uso:
 *   node --env-file=.env scripts/update-ges-hta-hearts-v1.mjs
 *   node --env-file=.env scripts/update-ges-hta-hearts-v1.mjs --apply
 */
import { createClient } from '@supabase/supabase-js';

const TOPIC_ID = '696ea74c245ef362de4f433a';
const APPLY = process.argv.includes('--apply');

if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.');
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY,
);

const CONTENT_BLOCKS = [
  {
    id: 'hta-hearts-header-v1',
    type: 'protocol_header',
    order: 0,
    title: 'Hipertensión arterial — Ruta HEARTS y flujo local de PSCV',
    summary: 'Ingreso, confirmación diagnóstica, intensificación y seguimiento de HTA según lineamiento SSÑ 2026, protocolo PSCV HCSF Bulnes y flujograma local propuesto.',
    ordinario: 'ORDINARIO 5/N°151 · HTA1',
    date: 'Marzo 2026',
    specialty: 'Programa de Salud Cardiovascular',
    department: 'DSS Ñuble / HCSF Bulnes',
    destination: 'PSCV o ECICEP · HCSF Bulnes',
    institution: 'Servicio de Salud Ñuble',
    layout_position: 'full',
  },
  {
    id: 'hta-local-context-v1',
    tab: 'hta_local',
    type: 'alert',
    color: 'green',
    order: 1,
    title: 'Protocolo local',
    content: 'El ingreso operativo se apoya en el Protocolo PSCV HCSF Bulnes HTA1. La intensificación farmacológica y el mínimo de cuatro controles se rigen por el Ordinario SSÑ 2026. El flujograma “Bulnes Propuesta” se identifica por separado cuando sus plazos aún requieren validación local.',
    local_protocol: true,
    layout_position: 'main',
  },
  {
    id: 'hta-local-ingreso-v1',
    tab: 'hta_local',
    subtab: 'hta_local_ingreso',
    type: 'flowchart',
    color: 'green',
    order: 2,
    title: 'Ingreso PSCV y activación HEARTS — Bulnes',
    description: 'Secuencia operativa desde la confirmación diagnóstica hasta el primer control.',
    details: [
      'Médico confirma hipertensión arterial y registra el diagnóstico en Rayen',
      '~ Firmar constancia GES y generar orden interna para ingreso PSCV',
      'Solicitar batería de exámenes y electrocardiograma de ingreso',
      'Evaluar criterios de inclusión y exclusión HEARTS',
      'Si cumple: activar Iniciativa HEARTS en formulario cardiovascular integral',
      '~ Consensuar cambios de estilo de vida',
      '~ Emitir receta HEARTS de etapa 1, separada de receta crónica',
      'Derivar a nutricionista, químico farmacéutico y TENS según necesidad',
      '~ Nutrición y QF dentro del primer mes según protocolo PSCV local',
      'Dejar control de PA con TENS capacitado en 2–4 semanas',
    ],
    local_protocol: true,
    layout_position: 'main',
  },
  {
    id: 'hta-local-responsables-v1',
    tab: 'hta_local',
    subtab: 'hta_local_ingreso',
    type: 'criteria',
    color: 'blue',
    order: 3,
    title: 'Responsables y registros esenciales',
    items: [
      'Médico: confirma diagnóstico, constancia GES, ingreso cardiovascular, meta terapéutica y tratamiento',
      'TENS PSCV: PA estandarizada, cumplimiento de meta, rescate, Morisky MMAS-8 y coordinación de intensificación',
      'Profesional autorizado: médico, enfermera/o o químico farmacéutico intensifica según disponibilidad y competencias',
      'Nutricionista: evaluación de riesgo, prescripción dietoterapéutica y acuerdos de estilo de vida',
      'Químico farmacéutico: evaluación de adherencia, dispensación y educación farmacoterapéutica',
      'Registro: ficha clínica Rayen, formulario cardiovascular integral, pestaña HEARTS y carnet crónico según corresponda',
    ],
    local_protocol: true,
    layout_position: 'main',
  },
  {
    id: 'hta-local-pscv-vs-hearts-v1',
    tab: 'hta_local',
    subtab: 'hta_local_elegibilidad',
    type: 'alert',
    color: 'blue',
    order: 4,
    title: 'Ingreso a PSCV no es lo mismo que candidatura HEARTS',
    content: 'Toda persona con diagnóstico confirmado de HTA ingresa a PSCV o ECICEP con su constancia GES, cumpla o no los criterios HEARTS. Los criterios siguientes solo definen quién puede usar la escalera farmacológica estandarizada HEARTS; quien no los cumple continúa igual en PSCV con manejo individualizado por médico.',
    local_protocol: true,
    layout_position: 'main',
  },
  {
    id: 'hta-local-inclusion-v1',
    tab: 'hta_local',
    subtab: 'hta_local_elegibilidad',
    type: 'criteria',
    color: 'green',
    order: 5,
    title: 'Criterios de candidatura al algoritmo HEARTS',
    items: [
      'Promedio PA ≥140/90 mmHg con al menos 2 determinaciones en cada brazo, separadas por al menos 30 segundos, en días distintos y dentro de 15 días',
      'Edad entre 15 y 79 años',
      'Sin criterios de exclusión',
      'Diagnóstico reciente e incorporación a PSCV y/o ECICEP',
    ],
    local_protocol: true,
    layout_position: 'main',
  },
  {
    id: 'hta-local-exclusion-v1',
    tab: 'hta_local',
    subtab: 'hta_local_elegibilidad',
    type: 'criteria',
    color: 'red',
    order: 6,
    title: 'Criterios de exclusión del algoritmo HEARTS',
    items: [
      'Embarazo o potencial embarazo',
      'Persona mayor frágil',
      'Edad menor de 15 años o mayor o igual a 80 años',
      'Alergia conocida o contraindicación a fármacos del algoritmo',
      'Insuficiencia cardíaca o infarto agudo al miocardio previo',
      'ERC etapa 4–5 o albuminuria A2 persistente (RAC ≥30 mg/g)',
      'Cirrosis hepática',
      'Si existe cualquier exclusión: continuar manejo individualizado en PSCV o ECICEP',
    ],
    local_protocol: true,
    layout_position: 'main',
  },
  {
    id: 'hta-local-exams-v1',
    tab: 'hta_local',
    subtab: 'hta_local_examenes',
    type: 'checklist',
    order: 7,
    title: 'Batería inicial de HTA — Protocolo PSCV Bulnes',
    sections: [
      {
        label: 'Laboratorio',
        items: [
          'Glicemia',
          'Creatinina + VFG',
          'BUN / uremia',
          'Electrolitos plasmáticos',
          'Orina completa',
          'Razón albúmina/creatinina (RAC)',
          'Perfil lipídico',
          'Perfil hepático',
          'Recuento globular',
        ],
      },
      {
        label: 'Estudio complementario',
        items: [
          'Electrocardiograma de 12 derivaciones',
          'Evaluar daño de órgano blanco y riesgo cardiovascular',
        ],
      },
      {
        label: 'Seguridad farmacológica',
        items: [
          'Verificar función renal y potasio antes de aplicar el algoritmo',
          'Solicitar control de potasio al asociar IECA/ARA II con espironolactona',
        ],
      },
    ],
    local_protocol: true,
    layout_position: 'main',
  },
  {
    id: 'hta-local-followup-v1',
    tab: 'hta_local',
    subtab: 'hta_local_seguimiento',
    type: 'flowchart',
    color: 'blue',
    order: 8,
    title: 'Seguimiento HEARTS — control, adherencia y rescate',
    description: 'Todo usuario debe completar al menos cuatro controles, aun si alcanza meta precozmente.',
    details: [
      'TENS capacitado mide PA con técnica estandarizada y registra el resultado',
      'Aplicar o actualizar Morisky MMAS-8 y reforzar automanejo',
      'Si está en meta: mantener farmacoterapia y continuar controles hasta completar cuatro',
      'Si está fuera de meta: reforzar adherencia y gestionar intensificación con profesional autorizado',
      'Morisky menor de 6: derivar a QF para evaluación de adherencia',
      'Adherencia intermedia (6–7): el Ordinario recomienda apoyo de QF para identificar barreras',
      'Inasistencia: TENS realiza rescate y coordina continuidad',
      'Tras etapa 4 fuera de meta: médico en poli descompensados en 2–4 semanas',
      'Persistencia pese a intervenciones: evaluar derivación a nivel secundario según red y protocolo local',
    ],
    local_protocol: true,
    layout_position: 'main',
  },
  {
    id: 'hta-local-conducta-tabla-v1',
    tab: 'hta_local',
    subtab: 'hta_local_seguimiento',
    type: 'table',
    color: 'blue',
    order: 9,
    title: 'Qué hacer en cada escenario del control',
    description: 'Misma lógica que usa la ruta interactiva. La meta operativa es PA <140/90 mmHg.',
    headers: ['Escenario', '¿Aumentar?', 'Próximo control', 'Derivar a', 'Registrar'],
    rows: [
      [
        'Ingreso, candidato a HEARTS',
        'Iniciar etapa 1: losartán 50 mg + amlodipino 5 mg',
        '2–4 semanas con TENS',
        'Nutrición y QF dentro del primer mes; TENS agenda controles',
        'Constancia GES, ingreso PSCV/ECICEP, activación HEARTS, receta etapa 1',
      ],
      [
        'Ingreso, no candidato a HEARTS',
        'No aplica la escalera: el médico individualiza',
        'Según indicación médica del PSCV',
        'Médico PSCV; nutrición y QF según protocolo local',
        'Constancia GES, ingreso PSCV/ECICEP, motivo de exclusión HEARTS',
      ],
      [
        'Control en meta, menos de 4 controles',
        'No: mantener la etapa actual',
        '2–4 semanas, siguiente control con TENS',
        'Solo QF si la adherencia es intermedia (Morisky 6–7)',
        'PA y Morisky en pestaña HEARTS; citación',
      ],
      [
        'Control en meta con 4 controles cumplidos',
        'No: mantener como esquema de continuidad',
        'Control habitual del PSCV',
        'Continuidad en PSCV o ECICEP',
        'Cierre HEARTS compensado, PA de salida y receta de mantención',
      ],
      [
        'Control fuera de meta, etapas 1 a 3',
        'Sí: subir a la etapa siguiente',
        '2–4 semanas con TENS',
        'Profesional autorizado que intensifica (médico, enfermera/o o QF)',
        'Nueva receta HEARTS, PA y Morisky, citación',
      ],
      [
        'Control fuera de meta con Morisky menor de 6',
        'No aún: corregir adherencia antes de intensificar',
        '2–4 semanas con TENS',
        'Químico farmacéutico',
        'PA y Morisky, derivación a QF, citación',
      ],
      [
        'Control fuera de meta en etapa 4',
        'No: la escalera termina en la etapa 4',
        '2–4 semanas',
        'Poli de descompensados; nivel secundario si persiste',
        'Derivación y motivo en ficha Rayen, PA y Morisky',
      ],
    ],
    local_protocol: true,
    layout_position: 'main',
  },
  {
    id: 'hta-local-proposal-note-v1',
    tab: 'hta_local',
    subtab: 'hta_local_seguimiento',
    type: 'alert',
    color: 'amber',
    order: 10,
    title: 'Flujograma Bulnes — propuesta por validar',
    content: 'La propuesta local contempla 4–6 semanas después de la etapa 3 y un control a 8 semanas para el cierre compensado. El Ordinario SSÑ 2026 establece como regla general controles cada 2–4 semanas. La ruta interactiva usa este último plazo hasta que el equipo confirme la adaptación definitiva de Bulnes.',
    local_protocol: true,
    layout_position: 'main',
  },
  {
    id: 'hta-hearts-ladder-v1',
    tab: 'hta_escalera',
    type: 'hearts_ladder',
    order: 10,
    layout_position: 'main',
  },
  {
    id: 'hta-hearts-ladder-safety-v1',
    tab: 'hta_escalera',
    type: 'criteria',
    color: 'amber',
    order: 11,
    title: 'Antes de intensificar',
    items: [
      'Confirmar medición estandarizada y meta individual',
      'Revisar adherencia, acceso, efectos adversos y automanejo',
      'Revisar creatinina, VFG, potasio y contraindicaciones del algoritmo',
      'Mantener receta HEARTS separada de la receta de crónicos',
      'Losartán 100 mg: en APS se prescribe como 2 comprimidos de 50 mg cada 24 horas',
      'No aplicar esta escalera en pacientes excluidos; individualizar el tratamiento',
    ],
    layout_position: 'main',
  },
  {
    id: 'hta-hearts-pathway-v1',
    tab: 'hta_ruta',
    type: 'hearts_pathway',
    order: 20,
    layout_position: 'main',
  },
  {
    id: 'hta-hearts-flow-v1',
    tab: 'hta_flujo',
    type: 'mermaid',
    order: 30,
    title: 'Vía clínica HEARTS — SSÑ 2026',
    description: 'Ruta desde el diagnóstico reciente hasta seguimiento o derivación.',
    content: `flowchart TD
      A([Diagnóstico reciente de HTA]) --> B[Perfil de PA estandarizado<br/>3 tomas en no más de 15 días]
      B --> C{¿Cumple criterios HEARTS?}
      C -->|No| D([Ingresa igual a PSCV o ECICEP<br/>manejo individualizado])
      C -->|Sí| E[Constancia GES + ingreso CV<br/>activar HEARTS + estilo de vida]
      E --> F[Etapa 1<br/>Losartán 50 mg + Amlodipino 5 mg]
      F --> G[Control TENS 2–4 semanas<br/>PA + MMAS-8]
      G --> H{¿PA en meta?}
      H -->|Sí| I[Mantener etapa<br/>y completar 4 controles]
      H -->|No| J{¿Adherencia adecuada?}
      J -->|No| K[Apoyo QF + educación<br/>coordinar conducta]
      J -->|Sí| L[Profesional autorizado<br/>intensifica etapa]
      K --> L
      L --> M{Etapa alcanzada}
      M -->|2| N[Losartán 100 mg<br/>+ Amlodipino 10 mg]
      M -->|3| O[Anterior + HCTZ 25 mg]
      M -->|4| P[Anterior + HCTZ 50 mg]
      N --> G
      O --> G
      P --> Q{¿PA en meta<br/>tras etapa 4?}
      Q -->|Sí| I
      Q -->|No| R[Médico poli descompensados<br/>en 2–4 semanas]
      R --> S{¿Persiste fuera de meta?}
      S -->|Sí| T([Evaluar nivel secundario<br/>según red y protocolo local])
      S -->|No| D`,
    layout_position: 'main',
  },
  {
    id: 'hta-hearts-checklist-v1',
    tab: 'hta_cotejo',
    type: 'checklist',
    order: 40,
    title: 'Pauta de cotejo — Ingreso y seguimiento HTA / HEARTS',
    sections: [
      {
        label: 'Confirmación diagnóstica',
        items: [
          'PA medida con equipo validado y técnica estandarizada',
          'Primera consulta: medición en ambos brazos; controles posteriores en el brazo de mayor cifra',
          'Tres tomas en total, en días distintos y dentro de 15 días',
          'Promedio del perfil de PA calculado y diagnóstico confirmado por médico',
        ],
      },
      {
        label: 'Candidatura HEARTS',
        items: [
          'Edad entre 15 y 79 años',
          'Promedio PA ≥140/90 mmHg',
          'Criterios de exclusión revisados y ausentes',
        ],
      },
      {
        label: 'Ingreso y garantías',
        items: [
          'Constancia GES firmada',
          'Ingreso PSCV o ECICEP registrado',
          'Iniciativa HEARTS activada en formulario integral',
          'Batería de exámenes y ECG solicitados',
          'Meta terapéutica y próximo control registrados',
        ],
      },
      {
        label: 'Tratamiento inicial',
        items: [
          'Acuerdos de estilo de vida consensuados',
          'Etapa 1 prescrita: losartán 50 mg + amlodipino 5 mg al día',
          'Receta HEARTS separada de receta crónica',
          'Derivaciones a nutrición, QF y TENS evaluadas',
        ],
      },
      {
        label: 'Cada control HEARTS',
        items: [
          'PA estandarizada registrada por TENS capacitado',
          'Cumplimiento de meta evaluado',
          'Morisky MMAS-8 aplicado o actualizado',
          'Estilo de vida, adherencia, RAM y automanejo revisados',
          'Mantención o intensificación coordinada con profesional autorizado',
          'Próximo control en 2–4 semanas y rescate registrado si corresponde',
        ],
      },
      {
        label: 'Qué queda registrado y dónde deriva',
        items: [
          'Actividad del control: control cardiovascular HEARTS por TENS capacitado',
          'Si se intensifica: atención del profesional autorizado que indica la nueva etapa',
          'Si el Morisky es menor de 6: derivación y consulta de químico farmacéutico',
          'Si sigue fuera de meta tras la etapa 4: consulta médica en poli de descompensados',
          'PA, Morisky, etapa y receta HEARTS en el formulario cardiovascular integral',
          'Citación al próximo control agendada antes de que el usuario se retire',
        ],
      },
      {
        label: 'Cierre o salida',
        items: [
          'Al menos cuatro controles HEARTS completados',
          'Si está compensado: continuidad en PSCV o ECICEP',
          'Si continúa fuera de meta tras etapa 4: médico en poli descompensados',
          'Si persiste la descompensación: evaluar derivación a nivel secundario',
        ],
      },
    ],
    layout_position: 'main',
  },
  {
    id: 'hta-hearts-references-v1',
    tab: 'hta_referencias',
    type: 'text',
    order: 50,
    title: 'Fuentes y jerarquía de uso',
    content: `### Lineamiento vigente de red
**Ordinario 5/N°151, DSS Ñuble, 18 de marzo de 2026.** Define ingreso, cuatro etapas farmacológicas, controles cada 2–4 semanas, funciones del TENS y profesionales autorizados, MMAS-8 y manejo fuera de meta.

### Protocolo local
**Norma de manejo para atención en APS de pacientes del Programa Cardiovascular de Bulnes, código HTA1, tercera edición, marzo de 2023.** Define ingreso PSCV, batería local de exámenes, roles del equipo y registros.

### Propuesta operativa local
**Flujograma HEARTS Bulnes — Propuesta.** Adapta las actividades Rayen, SOME y la secuencia local. Los intervalos que difieren del Ordinario se muestran como propuesta pendiente de validación.

### Referencia técnica HEARTS
La técnica de medición de PA debe ser estandarizada y realizada con un dispositivo validado. El Ordinario remite al curso HEARTS de la OPS para medición automática precisa.`,
    layout_position: 'main',
  },
];

const { data: topic, error: fetchError } = await supabase
  .from('topics')
  .select('id,name,tipo_contenido,related_tools')
  .eq('id', TOPIC_ID)
  .single();

if (fetchError) throw fetchError;

const nextType = [...new Set([...(topic.tipo_contenido || []), 'flujo_local'])];

const relatedTools = Array.isArray(topic.related_tools) ? [...topic.related_tools] : [];
if (!relatedTools.some(tool => tool.tool_id === 'morisky-mmas8')) {
  relatedTools.push({ tool_id: 'morisky-mmas8', label: 'Morisky MMAS-8 — Adherencia a tratamiento' });
}

console.log(`Tema: ${topic.name}`);
console.log(`Bloques a publicar: ${CONTENT_BLOCKS.length}`);
console.log(`Pestañas: ${[...new Set(CONTENT_BLOCKS.map(block => block.tab).filter(Boolean))].join(', ')}`);

if (!APPLY) {
  console.log('Modo dry-run. Use --apply para actualizar la base de datos.');
  process.exit(0);
}

const { error: updateError } = await supabase
  .from('topics')
  .update({
    content_blocks: CONTENT_BLOCKS,
    has_local_protocol: true,
    tipo_contenido: nextType,
    related_tools: relatedTools,
    protocol_code: 'HTA1 · Ord. 5/N°151',
    protocol_edition: 'Tercera / actualización HEARTS 2026',
    protocol_date: 'Marzo 2026',
    protocol_validity: null,
    protocol_objective: 'Estandarizar el ingreso, intensificación y seguimiento de personas con hipertensión arterial mediante la iniciativa HEARTS, integrando el flujo SSÑ con la operación PSCV del HCSF Bulnes.',
    last_updated: new Date().toISOString(),
  })
  .eq('id', TOPIC_ID);

if (updateError) throw updateError;
console.log('HTA actualizado con tabs HEARTS, escalera, ruta interactiva, flujo y pauta de cotejo.');
