import { PatientData, PatientGroup, DoseRecommendation, ClassificationCriteria } from '@/types/protocol';

export function classifyPatient(data: PatientData): PatientGroup {
  // Primero verificar criterios de SENSIBILIDAD (tiene prioridad)
  const criteriaSensible = checkSensibleCriteria(data);
  if (criteriaSensible.cumple) {
    return 'sensible';
  }

  // Luego verificar criterios de RESISTENCIA
  const criteriaResistente = checkResistenteCriteria(data);
  if (criteriaResistente.cumple) {
    return 'resistente';
  }

  // Si no cumple ninguno de los anteriores, es INTERMEDIO
  return 'intermedio';
}

function checkSensibleCriteria(data: PatientData): ClassificationCriteria {
  const criteriosMayores: string[] = [];
  const criteriosMenores: string[] = [];

  // Criterios Mayores - ignorar si el valor no está disponible
  if (data.hba1c > 0 && data.hba1c < 7) {
    criteriosMayores.push('HbA1c < 7%');
  }
  if (data.vfg > 0 && data.vfg < 30) {
    criteriosMayores.push('ERC avanzada (VFG < 30 ml/min)');
  }
  if (data.hepatopatia) {
    criteriosMayores.push('Hepatopatía avanzada');
  }

  // Criterios Menores - ignorar si el valor no está disponible
  if (data.glicemiaIngreso > 0 && data.glicemiaIngreso >= 140 && data.glicemiaIngreso <= 179) {
    criteriosMenores.push('Glicemia de ingreso 140-179 mg/dL');
  }
  if (data.edad > 0 && data.edad > 75) {
    criteriosMenores.push('Edad > 75 años');
  }
  if (data.imc > 0 && data.imc < 22) {
    criteriosMenores.push('IMC < 22 / caquexia');
  }
  if (data.trigliceridos > 0 && data.trigliceridos < 150) {
    criteriosMenores.push('TG < 150 mg/dL');
  }

  // Cumple si tiene al menos 1 criterio mayor O combinación de menores que indiquen fragilidad
  const cumple = criteriosMayores.length >= 1 || criteriosMenores.length >= 2;

  return { criteriosMayores, criteriosMenores, cumple };
}

function checkResistenteCriteria(data: PatientData): ClassificationCriteria {
  const criteriosMayores: string[] = [];
  const criteriosMenores: string[] = [];

  // Criterios Mayores - ignorar si el valor no está disponible
  if (data.hba1c > 0 && data.hba1c >= 9) {
    criteriosMayores.push('HbA1c ≥ 9%');
  }
  if (data.corticoidesSistemicos) {
    criteriosMayores.push('Corticoides sistémicos activos');
  }
  if (data.infeccionActiva) {
    criteriosMayores.push('Infección activa con repercusión sistémica significativa');
  }
  if (data.postoperatorioMayor) {
    criteriosMayores.push('Postoperatorio mayor reciente');
  }
  if (data.usoPrevioNPH > 0.5) {
    criteriosMayores.push('NPH previa > 0.5 U/kg');
  }

  // Criterios Menores - ignorar si el valor no está disponible
  if (data.imc > 0 && data.imc >= 30) {
    criteriosMenores.push('IMC ≥ 30');
  }
  if (data.glicemiaIngreso > 0 && data.glicemiaIngreso >= 250) {
    criteriosMenores.push('Glicemia de ingreso ≥ 250 mg/dL');
  }
  if (data.sop && data.sexo === 'femenino') {
    criteriosMenores.push('Síndrome de Ovario Poliquístico');
  }
  if (data.trigliceridos > 0 && data.trigliceridos >= 200) {
    criteriosMenores.push('TG ≥ 200 mg/dL');
  }

  // Cumple si tiene al menos 1 criterio mayor O al menos 2 menores
  const cumple = criteriosMayores.length >= 1 || criteriosMenores.length >= 2;

  return { criteriosMayores, criteriosMenores, cumple };
}

// Dosis de inicio de NPH por grupo (U/kg/día). La corrección no reemplaza a la
// basal: si se requiere de forma repetida, corresponde programar insulina.
const BASAL_INICIO_UKG: Record<PatientGroup, number> = { sensible: 0.1, intermedio: 0.15, resistente: 0.25 };

// Sobre 0,5 U/kg/día de basal, seguir titulando aumenta la hipoglicemia sin
// mejorar el control: ahí corresponde agregar prandial, no más NPH. Coincide
// con el corte del protocolo, que clasifica la NPH previa >0,5 U/kg como
// criterio mayor de insulinorresistencia.
export const BASAL_TOPE_UKG = 0.5;

// Umbral del protocolo para comunicar al médico ("Correcciones >0.2 U/kg",
// p. ej. 16 UI en un paciente de 80 kg). Es también el gatillo natural para
// revisar la basal: si la corrección llega ahí, la basal está corta.
export const CORRECCION_AVISO_UKG = 0.2;

const redondearPar = (valor: number) => Math.round(valor / 2) * 2;

/**
 * Comentarios de la tabla de corrección. Cambian según el paciente ya tenga o
 * no insulina basal, para orientar cuándo iniciarla y cuándo subirla.
 */
export function getDoseRecommendations(grupo: PatientGroup, peso: number, basalUkg = 0): DoseRecommendation[] {
  const conBasal = basalUkg > 0;
  const topeAlcanzado = basalUkg >= BASAL_TOPE_UKG;
  const inicio = BASAL_INICIO_UKG[grupo];

  // Mensaje del tramo en que se decide la basal (hiperglicemia sostenida).
  const decision = topeAlcanzado
    ? 'No subir más la NPH: agregar prandial'
    : conBasal
      ? 'Subir NPH 10-20% sólo si el ayuno sigue alto'
      : `Si persiste, valorar iniciar NPH ${inicio.toString().replace('.', ',')} U/kg/día`;

  const sostenida = topeAlcanzado
    ? 'Revisar prandial, nutrición y corticoides antes de tocar la NPH'
    : conBasal
      ? 'Si la hiperglicemia es post-prandial, no subir la NPH'
      : 'Corrección ≥3 veces al día: programar basal, no seguir con escala sola';

  switch (grupo) {
    case 'sensible':
      return [
        { glucoseRange: '140-159', dose: 0, comment: 'Sin corrección: alto riesgo de hipoglicemia' },
        { glucoseRange: '160-179', dose: 0, comment: 'Sin corrección: controlar en 4-6 h' },
        { glucoseRange: '180-199', dose: 2, comment: conBasal ? 'Un valor aislado no justifica subir la NPH' : 'Registrar: dos valores >180 definen iniciar basal' },
        { glucoseRange: '200-219', dose: 2, comment: 'Sólo si se repite; vigilar hipoglicemia nocturna' },
        { glucoseRange: '220-249', dose: 4, comment: decision },
        { glucoseRange: '≥ 250', dose: 6, comment: 'Avisar al médico y descartar CAD/EHH' },
      ];

    case 'intermedio':
      return [
        { glucoseRange: '140-179', dose: redondearPar(peso * 0.03), comment: 'Corrección aislada: no ajustar basal por un valor', ukgRange: '0.03 U/kg' },
        { glucoseRange: '180-219', dose: redondearPar(peso * 0.06), comment: decision, ukgRange: '0.06 U/kg' },
        { glucoseRange: '220-249', dose: redondearPar(peso * 0.06), comment: conBasal ? 'Titular por glicemia de ayuno, cada 24-48 h' : 'Valorar basal si ya hubo otro valor sobre rango hoy', ukgRange: '0.06 U/kg' },
        { glucoseRange: '250-299', dose: redondearPar(peso * 0.09), comment: sostenida, ukgRange: '0.09 U/kg' },
        { glucoseRange: '300-349', dose: redondearPar(peso * 0.11), comment: 'Avisar al médico: revisar nutrición, corticoides y adherencia', ukgRange: '0.11 U/kg' },
        { glucoseRange: '≥ 350', dose: redondearPar(peso * 0.14), comment: 'Avisar al médico: cetonemia y eventual insulina IV', ukgRange: '0.14 U/kg' },
      ];

    case 'resistente':
      return [
        { glucoseRange: '140-179', dose: redondearPar(peso * 0.06), comment: 'Corrección aislada: no ajustar basal por un valor', ukgRange: '0.06 U/kg' },
        { glucoseRange: '180-219', dose: redondearPar(peso * 0.09), comment: decision, ukgRange: '0.09 U/kg' },
        { glucoseRange: '220-249', dose: redondearPar(peso * 0.11), comment: conBasal ? 'Titular por glicemia de ayuno, cada 24-48 h' : 'Valorar basal si ya hubo otro valor sobre rango hoy', ukgRange: '0.11 U/kg' },
        { glucoseRange: '250-299', dose: redondearPar(peso * 0.14), comment: sostenida, ukgRange: '0.14 U/kg' },
        { glucoseRange: '300-349', dose: redondearPar(peso * 0.17), comment: 'Avisar al médico: revisar corticoides, infección y nutrición', ukgRange: '0.17 U/kg' },
        { glucoseRange: '≥ 350', dose: redondearPar(peso * 0.20), comment: 'Avisar al médico: cetonemia y eventual insulina IV', ukgRange: '0.20 U/kg' },
      ];
  }
}

export interface BasalGuidance {
  estado: 'sin_basal' | 'con_basal' | 'sobrebasalizado';
  titulo: string;
  resumen: string;
  basalActualUkg: number;
  basalActualU: number | null;
  sugeridaUkg: number | null;
  sugeridaU: number | null;
  topeU: number | null;
  cuando: string[];
  titulacion: string[];
  alertas: string[];
}

/**
 * Conducta sobre la insulina basal: cuándo iniciarla, cuándo subirla y cuándo
 * dejar de subirla. El límite de 0,5 U/kg/día marca la sobrebasalización:
 * más allá, el rendimiento cae y sube el riesgo de hipoglicemia.
 */
export function getBasalGuidance(data: PatientData, grupo: PatientGroup): BasalGuidance {
  const peso = data.peso > 0 ? data.peso : 0;
  const basalUkg = data.usoPrevioNPH > 0 ? data.usoPrevioNPH : 0;
  const basalU = peso > 0 && basalUkg > 0 ? Math.round(basalUkg * peso) : null;
  const topeU = peso > 0 ? Math.round(BASAL_TOPE_UKG * peso) : null;
  const avisoU = peso > 0 ? Math.round(CORRECCION_AVISO_UKG * peso) : null;
  const renalFragil = (data.vfg > 0 && data.vfg < 30) || data.hepatopatia;

  let sugeridaUkg = BASAL_INICIO_UKG[grupo];
  if (renalFragil) sugeridaUkg = Math.round(sugeridaUkg * 0.75 * 100) / 100;
  const sugeridaU = peso > 0 ? redondearPar(sugeridaUkg * peso) : null;

  // Gatillos de aviso al médico definidos por el protocolo local.
  const alertas: string[] = [
    avisoU
      ? `Comunicar al médico: hiperglicemia persistente, glicemia >350 mg/dL, corrección sobre ${CORRECCION_AVISO_UKG.toString().replace('.', ',')} U/kg (≈ ${avisoU} U) o hipoglicemia sintomática.`
      : 'Comunicar al médico: hiperglicemia persistente, glicemia >350 mg/dL, corrección sobre 0,2 U/kg o hipoglicemia sintomática.',
  ];
  if (renalFragil) alertas.push('VFG <30 ml/min o hepatopatía: la basal va reducida ~25% y la corrección se espacia.');
  if (data.corticoidesSistemicos) alertas.push('Corticoides sistémicos: la hiperglicemia es vespertina. Cargar la NPH en la mañana y bajarla cuando se reduzca el corticoide.');
  if (data.edad > 75) alertas.push('Mayor de 75 años: meta 140-180 mg/dL; no perseguir normoglicemia.');

  if (basalUkg >= BASAL_TOPE_UKG) {
    return {
      estado: 'sobrebasalizado',
      titulo: 'Sobrebasalización: no subir más la NPH',
      resumen: `La basal actual (${basalUkg.toFixed(2).replace('.', ',')} U/kg/día) alcanza o supera el techo de ${String(BASAL_TOPE_UKG).replace('.', ',')} U/kg/día. Seguir titulando aumenta la hipoglicemia sin mejorar el control.`,
      basalActualUkg: basalUkg,
      basalActualU: basalU,
      sugeridaUkg: null,
      sugeridaU: null,
      topeU,
      cuando: [
        'No aumentar la dosis de NPH por hiperglicemia diurna o post-prandial.',
        'Agregar insulina prandial si come, o revisar el aporte nutricional si está con régimen enteral o parenteral.',
        'Buscar la causa de la resistencia: corticoides, infección activa, dolor, drogas hiperglicemiantes.',
      ],
      titulacion: [
        'Si hay hipoglicemia o glicemia de ayuno <100 mg/dL, bajar la NPH 10-20%.',
        'Reevaluar la dosis total diaria cuando se retire el corticoide o se resuelva la infección.',
      ],
      alertas: [
        'Señales de sobrebasalización: caída marcada entre la glicemia nocturna y la de la mañana, hipoglicemia nocturna y alta variabilidad.',
        ...alertas,
      ],
    };
  }

  if (basalUkg > 0) {
    return {
      estado: 'con_basal',
      titulo: 'Ya tiene basal: titular por la glicemia de ayuno',
      resumen: `Basal actual ${basalUkg.toFixed(2).replace('.', ',')} U/kg/día${basalU ? ` (≈ ${basalU} U/día)` : ''}. Queda margen hasta ${String(BASAL_TOPE_UKG).replace('.', ',')} U/kg/día${topeU ? ` (≈ ${topeU} U/día)` : ''}.`,
      basalActualUkg: basalUkg,
      basalActualU: basalU,
      sugeridaUkg: null,
      sugeridaU: null,
      topeU,
      cuando: [
        'Subir la NPH sólo si la glicemia de ayuno se mantiene sobre 140 mg/dL en dos días seguidos, sin hipoglicemia nocturna.',
        avisoU
          ? `Si la corrección supera ${CORRECCION_AVISO_UKG.toString().replace('.', ',')} U/kg (≈ ${avisoU} U), avisar al médico: la basal quedó corta.`
          : `Si la corrección supera ${CORRECCION_AVISO_UKG.toString().replace('.', ',')} U/kg, avisar al médico: la basal quedó corta.`,
        'No subir la basal para corregir hiperglicemia post-prandial o vespertina: eso se maneja con prandial o con el aporte de alimentación.',
      ],
      titulacion: [
        'Aumentar 10-20% cada 24-48 h, no antes: la NPH demora en estabilizar.',
        'Bajar 10-20% si aparece hipoglicemia o si la glicemia de ayuno baja de 100 mg/dL.',
        'Si la corrección se usa 3 o más veces al día de forma sostenida, evaluar esquema basal-prandial en vez de más basal.',
      ],
      alertas,
    };
  }

  return {
    estado: 'sin_basal',
    titulo: 'Sin basal: la escala de corrección no es tratamiento',
    resumen: 'La corrección aislada sirve para las primeras horas. Si la hiperglicemia se sostiene, corresponde programar insulina basal en vez de repetir correcciones.',
    basalActualUkg: 0,
    basalActualU: null,
    sugeridaUkg,
    sugeridaU,
    topeU,
    cuando: [
      'Hiperglicemias persistentes sobre el rango de la tabla, pese a la corrección.',
      avisoU
        ? `Correcciones sobre ${CORRECCION_AVISO_UKG.toString().replace('.', ',')} U/kg (≈ ${avisoU} U en este paciente): la basal está corta.`
        : `Correcciones sobre ${CORRECCION_AVISO_UKG.toString().replace('.', ',')} U/kg: la basal está corta.`,
      'Necesidad de corrección en 3 o más controles preprandiales del día.',
      'Paciente que ya usaba insulina en su casa: reanudar la basal desde el ingreso, no esperar.',
      'Inicio de corticoides sistémicos o de nutrición enteral o parenteral.',
    ],
    titulacion: [
      `Dosis de inicio sugerida: ${sugeridaUkg.toString().replace('.', ',')} U/kg/día${sugeridaU ? ` ≈ ${sugeridaU} U/día` : ''}.`,
      'NPH repartida en dos dosis, 2/3 en la mañana y 1/3 en la tarde, salvo indicación distinta.',
      'Reevaluar y titular a las 24-48 h según la glicemia de ayuno.',
      `No pasar de ${String(BASAL_TOPE_UKG).replace('.', ',')} U/kg/día${topeU ? ` (≈ ${topeU} U/día)` : ''} sin sumar prandial.`,
    ],
    alertas: ['Mantener la corrección mientras se ajusta la basal, no como tratamiento único.', ...alertas],
  };
}

export function getClassificationDetails(data: PatientData) {
  return {
    sensible: checkSensibleCriteria(data),
    resistente: checkResistenteCriteria(data),
    nefropatiaSinVFG: data.nefropatia && data.vfg <= 0,
  };
}
