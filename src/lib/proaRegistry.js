import { supabase } from './supabase';
import { buildRenalFunctionText, calculateEgfrCkdEpi2021 } from './renalFunction';

const STORAGE_KEY = 'proa_pseudonymous_registry_v1'; // caché local (respaldo offline)
const PENDING_KEY = 'proa_pending_form_v1';

const clone = (value) => JSON.parse(JSON.stringify(value));

export function sanitizeProaRecord(form) {
  const sanitized = clone(form || {});
  // Excepción exclusiva del registro PROA: se conservan nombre, RUT y edad
  // para facilitar el seguimiento intrahospitalario. La ficha clínica sigue
  // excluida y ningún otro módulo usa esta persistencia.
  sanitized.paciente = String(sanitized.paciente || '').trim();
  sanitized.rut = String(sanitized.rut || '').trim();
  sanitized.n_ficha = '';
  delete sanitized.__proaRegistryMode;
  delete sanitized.__proaEditLatest;
  delete sanitized.__diabetesPreviouslyRecorded;
  return sanitized;
}

export function generateProaCode({ paciente = '', rut = '' } = {}) {
  const initials = String(paciente)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'PX';
  const cleanRut = String(rut).replace(/[^0-9kK]/g, '').toUpperCase();
  const body = cleanRut.slice(0, -1);
  const dv = cleanRut.slice(-1) || 'X';
  const lastTwo = body.slice(-2).padStart(2, '0');
  const random = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${initials}${lastTwo}-${dv}-${random}`;
}

// ─────────────── Mapeo fila Supabase ↔ registro local ───────────────
const rowToRecord = (row) => ({
  id: row.id,
  code: row.code,
  bedCode: row.bed_code,
  servicio: row.servicio || '',
  updatedAt: row.updated_at,
  evolutions: Array.isArray(row.evolutions) ? row.evolutions : [],
});

const recordToRow = (record) => ({
  id: record.id,
  code: record.code,
  bed_code: record.bedCode,
  servicio: record.servicio || '',
  evolutions: record.evolutions || [],
  updated_at: record.updatedAt,
});

const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const normalizeIdentity = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9kK]/g, '')
  .toUpperCase();

function hasPatientIdentityConflict(existing, incomingForm) {
  const existingForm = existing?.evolutions?.[0]?.form || {};
  const existingRut = normalizeIdentity(existingForm.rut);
  const incomingRut = normalizeIdentity(incomingForm.rut);
  if (existingRut && incomingRut && existingRut !== incomingRut) return true;

  const existingName = normalizeIdentity(existingForm.paciente);
  const incomingName = normalizeIdentity(incomingForm.paciente);
  return Boolean(existingName && incomingName && existingName !== incomingName);
}

// ─────────────── Caché local (lectura instantánea / offline) ───────────────
export function readProaRegistry() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeProaRegistry(records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records || []));
  } catch {
    // Best-effort cache.
  }
}

// ─────────────── Supabase (fuente de verdad, multi-dispositivo) ───────────────
export async function fetchProaRecords() {
  try {
    const { data, error } = await supabase
      .from('proa_records')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    const records = (data || []).map(rowToRecord);
    writeProaRegistry(records);
    return records;
  } catch {
    // Sin conexión / error → usar la última caché conocida.
    return readProaRegistry();
  }
}

export async function saveProaRecord(form, options = {}) {
  const now = new Date().toISOString();
  const editLatestEvolution = Boolean(options.editLatestEvolution || form?.__proaEditLatest);
  const safeForm = sanitizeProaRecord(form);
  const isEvolutionNote = ['nota_evolucion_hospitalaria', 'visita_servicio'].includes(safeForm.proa_entry_type);
  if (!isEvolutionNote) delete safeForm.nota_evolucion;
  const bedCode = safeForm.cama || 'SIN-CAMA';
  const replaceExisting = options.replaceExisting || form?.__proaRegistryMode === 'new_patient';

  // Registro existente en esa cama (para encadenar evoluciones del mismo paciente).
  let existing = null;
  try {
    const { data, error } = await supabase
      .from('proa_records')
      .select('*')
      .eq('bed_code', bedCode)
      .maybeSingle();
    if (error) throw error;
    existing = data ? rowToRecord(data) : null;
  } catch (error) {
    const cached = readProaRegistry().find((r) => r.bedCode === bedCode) || null;
    if (!cached) throw error;
    existing = cached;
  }

  if (existing && !replaceExisting && hasPatientIdentityConflict(existing, safeForm)) {
    throw new Error(
      'La cama está ocupada por otro paciente. Usa “Nuevo paciente en esta cama” para egresar o eliminar primero el registro anterior.',
    );
  }

  const record = {
    id: existing?.id || newId(),
    code: replaceExisting || !existing ? generateProaCode(form) : existing.code,
    bedCode,
    servicio: safeForm.servicio || '',
    updatedAt: now,
    evolutions: [
      { savedAt: now, form: safeForm },
      ...(replaceExisting
        ? []
        : editLatestEvolution
          ? (existing?.evolutions || []).slice(1)
          : (existing?.evolutions || [])),
    ].slice(0, 12),
  };

  const { error } = await supabase
    .from('proa_records')
    .upsert(recordToRow(record), { onConflict: 'bed_code' });
  if (error) throw error;

  // Mantener la caché local en sincronía.
  const cache = readProaRegistry();
  writeProaRegistry([record, ...cache.filter((r) => r.id !== record.id && r.bedCode !== bedCode)]);
  return record;
}

export async function saveProaPreAdmission(preAdmission) {
  const renalFunction = buildRenalFunctionText(preAdmission);
  const estimatedGfr = calculateEgfrCkdEpi2021(preAdmission);
  const structuredAntibiotics = Array.isArray(preAdmission.antibioticos)
    ? preAdmission.antibioticos.filter((item) => item?.nombre)
    : [];
  const antibioticLines = structuredAntibiotics.length
    ? []
    : String(preAdmission.antibioterapia || '').split(/\n|;/).map((line) => line.trim()).filter(Boolean);
  const parsedAntibiotics = antibioticLines.map((line) => {
    const doseIndex = line.search(/\s+(?=\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|UI|U)\b)/i);
    const nombre = doseIndex > 0 ? line.slice(0, doseIndex).trim() : line;
    const dosis = doseIndex > 0 ? line.slice(doseIndex).trim() : '';
    return { nombre, dosis, via: /\bVO\b/i.test(line) ? 'VO' : /\bIM\b/i.test(line) ? 'IM' : 'EV' };
  });
  const antibioticItems = [...structuredAntibiotics, ...parsedAntibiotics].map((item) => {
    const usesAmpoules = item.dosis_unidad === 'ampolla';
    return {
      nombre: item.nombre,
      via: item.via || 'EV',
      presentacion: item.presentacion || '',
      dosis_modo: item.dosis_modo || (usesAmpoules ? 'ampolla' : 'total'),
      dosis_por_kg: '',
      dosis_cantidad: usesAmpoules ? '' : (item.dosis_cantidad || ''),
      dosis_unidad: usesAmpoules ? (item.presentacion_unidad || 'g') : (item.dosis_unidad || 'mg'),
      unidades_por_dosis: usesAmpoules ? (item.dosis_cantidad || '') : (item.unidades_por_dosis || ''),
      intervalo_horas: item.intervalo_horas || '',
      dosis: item.dosis || '',
      inicio: item.inicio || '',
      hora_inicio: item.hora_inicio || '',
      termino: item.termino || '',
      termino_manual: Boolean(item.termino),
    };
  });
  const antibioticSummary = antibioticItems
    .map((item) => {
      const dose = item.dosis || (item.dosis_modo === 'ampolla'
        ? `${item.unidades_por_dosis} ${Number(item.unidades_por_dosis) === 1 ? 'ampolla' : 'ampollas'}`
        : `${item.dosis_cantidad} ${item.dosis_unidad}`.trim());
      return [
        item.nombre,
        item.presentacion && `(${item.presentacion})`,
        dose,
        item.intervalo_horas && `c/${item.intervalo_horas} h`,
        item.via,
      ].filter(Boolean).join(' ');
    })
    .join('\n');
  const form = {
    proa_entry_type: 'preingreso',
    proa_enrolled: true,
    fecha: new Date().toISOString().slice(0, 10),
    hora: new Date().toTimeString().slice(0, 5),
    servicio: preAdmission.servicio || '',
    cama: preAdmission.cama || '',
    paciente: preAdmission.paciente || '',
    rut: preAdmission.rut || '',
    edad: preAdmission.edad || '',
    sexo: preAdmission.sexo || '',
    diabetes_evaluado: preAdmission.diabetes_evaluado === true,
    diabetes: preAdmission.diabetes_evaluado === true ? preAdmission.diabetes === true : null,
    diabetes_evaluado_en: preAdmission.diabetes_evaluado_en || '',
    fecha_nacimiento: preAdmission.fecha_nacimiento || '',
    direccion: preAdmission.direccion || '',
    comuna: preAdmission.comuna || '',
    telefono: preAdmission.telefono || '',
    prevision: preAdmission.prevision || '',
    antecedentes: preAdmission.antecedentes || '',
    creatinina: preAdmission.creatinina || '',
    fecha_creatinina: preAdmission.fecha_creatinina || '',
    creatininas: preAdmission.creatinina ? [{ fecha: preAdmission.fecha_creatinina || new Date().toISOString().slice(0, 10), valor: preAdmission.creatinina }] : [],
    vfg_estimada: estimatedGfr ?? '',
    fecha_ingreso: preAdmission.fecha_ingreso || '',
    diagnostico_principal: (preAdmission.diagnosticos || []).filter(Boolean)[0] || preAdmission.diagnostico || '',
    diagnostico_desglose: (preAdmission.diagnosticos || []).filter(Boolean).slice(1).join('\n'),
    diagnostico_actual: (preAdmission.diagnosticos || []).filter(Boolean).join('; ') || preAdmission.diagnostico || '',
    diagnosticos_actuales: (preAdmission.diagnosticos || []).filter(Boolean),
    funcion_renal: renalFunction,
    antibioterapia_preingreso: antibioticSummary,
    antibioticos: antibioticItems,
    antibioticos_eliminados: Array.isArray(preAdmission.antibioticos_eliminados) ? preAdmission.antibioticos_eliminados : [],
    parametros_inflamatorios: Array.isArray(preAdmission.examenes_sangre)
      ? preAdmission.examenes_sangre.filter((item) => item && Object.entries(item).some(([key, value]) => key !== 'fecha' && String(value ?? '').trim()))
      : [],
    estudios_micro: Array.isArray(preAdmission.cultivos)
      ? preAdmission.cultivos.filter((item) => item?.tipo_muestra || item?.fecha || item?.patogeno)
      : [],
    examenes_complementarios: Array.isArray(preAdmission.examenes_complementarios)
      ? preAdmission.examenes_complementarios.filter((item) => item?.fecha || item?.nombre || item?.resultado)
      : [],
    diagnostico_microbiologico: '',
    estudios_imagen: preAdmission.estudios_imagen || '',
    recomendaciones: Array.isArray(preAdmission.recomendaciones) ? preAdmission.recomendaciones : [],
    plan_duracion: preAdmission.plan_duracion || '',
    proxima_revision: '',
    evolucion: preAdmission.evolucion || '',
    resumen_caso: preAdmission.resumen_caso || '',
    aislamiento: preAdmission.aislamiento || '',
    medico_tratante: preAdmission.medico_tratante || '',
    vista_ultima_evolucion: preAdmission.vista_ultima_evolucion || '',
    vista_planes_pendientes: preAdmission.vista_planes_pendientes || '',
    vista_plan_alta: preAdmission.vista_plan_alta || '',
    vista_estudios_complementarios: preAdmission.vista_estudios_complementarios || '',
  };

  // La primera evolución también constituye el ingreso PROA. Las siguientes
  // se agregan al historial del mismo paciente sin reemplazar la ficha previa.
  return saveProaRecord(form);
}

export function isHistoricalProaRecord(record) {
  return Boolean(record?.evolutions?.[0]?.form?.proa_patient_status === 'historico');
}

// Un registro de censo alimenta Vista General sin convertir automáticamente
// al paciente en integrante del programa PROA.
export function isProaEnrolledRecord(record) {
  return record?.evolutions?.[0]?.form?.proa_enrolled !== false;
}

export async function archiveProaRecord(record, dischargeDate = new Date().toISOString().slice(0, 10), dischargeDetails = {}) {
  if (!record?.bedCode) return null;
  const now = new Date().toISOString();
  const originalBed = record.evolutions?.[0]?.form?.cama || record.bedCode;
  const historicalBedCode = `HIST-${record.id}`;
  const evolutions = (record.evolutions || []).map((evolution, evolutionIndex) => ({
    ...evolution,
    form: sanitizeProaRecord({
      ...(evolution.form || {}),
      cama: originalBed,
      proa_patient_status: 'historico',
      fecha_egreso: dischargeDate,
      motivo_egreso: dischargeDetails.motivo || '',
      destino_egreso_servicio: dischargeDetails.destinoServicio || '',
      destino_egreso_cama: dischargeDetails.destinoCama || '',
      antibiotico_alta: dischargeDetails.antibioticoAlta || '',
      antibiotico_alta_indicacion: dischargeDetails.antibioticoAltaIndicacion || '',
      antibioticos: evolutionIndex === 0
        ? (evolution.form?.antibioticos || []).map((item, index) => ({
          ...item,
          termino: dischargeDetails.antibioticStops?.[index] || item.termino || '',
          termino_manual: Boolean(dischargeDetails.antibioticStops?.[index] || item.termino),
        }))
        : (evolution.form?.antibioticos || []),
      proa_archived_at: now,
    }),
  }));
  const { error } = await supabase
    .from('proa_records')
    .update({
      bed_code: historicalBedCode,
      evolutions,
      updated_at: now,
    })
    .eq('bed_code', record.bedCode);
  if (error) throw error;
  const archived = { ...record, bedCode: historicalBedCode, updatedAt: now, evolutions };
  writeProaRegistry([
    archived,
    ...readProaRegistry().filter((item) => item.id !== record.id),
  ]);
  return archived;
}

export async function moveProaRecordToBed(sourceBedCode, targetBedCode, targetService = '') {
  if (!sourceBedCode || !targetBedCode || sourceBedCode === targetBedCode) return null;

  const { data: srcRow } = await supabase
    .from('proa_records')
    .select('*')
    .eq('bed_code', sourceBedCode)
    .maybeSingle();
  if (!srcRow) return null;

  const src = rowToRecord(srcRow);
  const now = new Date().toISOString();
  const movedEvolutions = (src.evolutions || []).map((evolution) => ({
    ...evolution,
    form: sanitizeProaRecord({
      ...(evolution.form || {}),
      cama: targetBedCode,
      servicio: targetService || evolution.form?.servicio || src.servicio || '',
    }),
  }));

  // Limpiar la cama destino y mover el registro de origen hacia ella.
  await supabase.from('proa_records').delete().eq('bed_code', targetBedCode);
  const { error } = await supabase
    .from('proa_records')
    .update({
      bed_code: targetBedCode,
      servicio: targetService || src.servicio || '',
      updated_at: now,
      evolutions: movedEvolutions,
    })
    .eq('bed_code', sourceBedCode);
  if (error) throw error;

  return { ...src, bedCode: targetBedCode, servicio: targetService || src.servicio || '', updatedAt: now, evolutions: movedEvolutions };
}

export async function deleteProaRecord(bedCode) {
  if (!bedCode) return;
  const { error } = await supabase
    .from('proa_records')
    .delete()
    .eq('bed_code', bedCode);
  if (error) throw error;
  writeProaRegistry(readProaRegistry().filter((record) => record.bedCode !== bedCode));
}

export async function updateProaEvolution(record, evolutionIndex, form) {
  if (!record?.id || !Array.isArray(record.evolutions) || !record.evolutions[evolutionIndex]) throw new Error('Evolución PROA no encontrada.');
  const now = new Date().toISOString();
  const evolutions = record.evolutions.map((evolution, index) => index === evolutionIndex
    ? { ...evolution, editedAt: now, form: sanitizeProaRecord({ ...(evolution.form || {}), ...form }) }
    : evolution);
  const { error } = await supabase.from('proa_records').update({ evolutions, updated_at: now }).eq('id', record.id);
  if (error) throw error;
  const updated = { ...record, evolutions, updatedAt: now };
  writeProaRegistry([updated, ...readProaRegistry().filter((item) => item.id !== record.id)]);
  return updated;
}

export async function deleteProaEvolution(record, evolutionIndex) {
  if (!record?.id || !Array.isArray(record.evolutions) || !record.evolutions[evolutionIndex]) throw new Error('Evolución PROA no encontrada.');
  if (record.evolutions.length <= 1) throw new Error('No se puede borrar la única evolución del paciente.');
  const now = new Date().toISOString();
  const evolutions = record.evolutions.filter((_, index) => index !== evolutionIndex);
  const { error } = await supabase.from('proa_records').update({ evolutions, updated_at: now }).eq('id', record.id);
  if (error) throw error;
  const updated = { ...record, evolutions, updatedAt: now };
  writeProaRegistry([updated, ...readProaRegistry().filter((item) => item.id !== record.id)]);
  return updated;
}

export async function dischargeFromProa(record) {
  const latest = getLatestProaForm(record);
  if (!record?.id || !latest) throw new Error('Paciente PROA no encontrado.');
  return saveProaRecord({
    ...latest,
    proa_enrolled: false,
    proa_entry_type: 'egreso_proa',
    fecha_egreso_proa: new Date().toISOString().slice(0, 10),
    proa_change_summary: 'Egreso de seguimiento PROA; paciente continúa hospitalizado.',
    evolucion: 'Paciente egresado de seguimiento PROA. Continúa hospitalizado en su cama actual.',
  });
}

export function getLatestProaForm(record) {
  return record?.evolutions?.[0]?.form || null;
}

// ─────────────── Formulario pendiente (traspaso entre páginas) ───────────────
export function setPendingProaForm(form) {
  const pending = sanitizeProaRecord(form);
  if (form?.__proaRegistryMode) pending.__proaRegistryMode = form.__proaRegistryMode;
  if (form?.__proaEditLatest) pending.__proaEditLatest = true;
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

export function takePendingProaForm() {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
