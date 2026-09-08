import { ALL_BEDS, BED_CATALOG } from '@/components/agenda-diaria/bedCatalog';
import { archiveProaRecord, fetchProaRecords, getLatestProaForm, isHistoricalProaRecord, saveProaRecord } from '@/lib/proaRegistry';

const HOSPITAL_REGISTRY_KEY = 'vista_general_hospitalizados_v1';
export const HOSPITAL_REGISTRY_UPDATED_EVENT = 'saludbulnes:hospital-registry-updated';

function readHospitalRegistry() {
  try { return JSON.parse(localStorage.getItem(HOSPITAL_REGISTRY_KEY) || '{}') || {}; } catch { return {}; }
}
function writeHospitalRegistry(registry) { localStorage.setItem(HOSPITAL_REGISTRY_KEY, JSON.stringify(registry || {})); }
function notifyHospitalRegistryUpdate(bedCode) { window.dispatchEvent(new CustomEvent(HOSPITAL_REGISTRY_UPDATED_EVENT, { detail: { bedCode } })); }

function inferredService(bedCode) {
  const code = String(bedCode || '').toUpperCase();
  if (code.startsWith('HD-')) return 'HODOM';
  if (code.includes('MQ2')) return 'MQ2';
  if (code.includes('MQB')) return 'MQ1';
  if (code.includes('PED')) return 'PED';
  if (code.includes('MB') || code.includes('GINE') || code.includes('OBS')) return 'GINE';
  return 'Otro';
}

export async function loadNrsHospitalLocations() {
  const labels = new Map(BED_CATALOG.map(service => [service.short, service.name]));
  labels.set('HODOM', 'Hospitalización domiciliaria'); labels.set('Otro', 'Otro servicio');
  const locations = new Map(ALL_BEDS.map(bed => [bed.code, { code: bed.code, service: bed.serviceShort, serviceLabel: labels.get(bed.serviceShort) || bed.serviceShort, bedLabel: bed.cell, unitLabel: bed.salaLabel }]));
  const records = await fetchProaRecords();
  records.filter(record => !isHistoricalProaRecord(record)).forEach(record => {
    if (!record?.bedCode || locations.has(record.bedCode)) return;
    const service = record.servicio || inferredService(record.bedCode);
    locations.set(record.bedCode, { code: record.bedCode, service, serviceLabel: labels.get(service) || service, bedLabel: record.bedCode, unitLabel: '' });
  });
  return [...locations.values()].sort((a, b) => a.service.localeCompare(b.service, 'es') || a.bedLabel.localeCompare(b.bedLabel, 'es', { numeric: true }));
}

function normalizedInitials(value) {
  const cleaned = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z\s]/g, ' ').trim();
  if (!cleaned) return '';
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.every(word => word.length === 1) ? words.join('') : words.map(word => word[0]).join('');
}
function numericAge(value) { const age = Number.parseInt(String(value || ''), 10); return Number.isFinite(age) ? age : null; }
function identityMatches(candidate, initials, age) {
  const storedInitials = normalizedInitials(candidate?.paciente || candidate?.nombre || candidate?.patient_initials || candidate?.inicialesPaciente);
  return Boolean(storedInitials && storedInitials === normalizedInitials(initials) && numericAge(candidate?.edad) === numericAge(age));
}

function nrsEvaluation(result, inputs) {
  const numericScore = Number(result?.score); const hasNumericScore = Number.isFinite(numericScore); const screeningApplied = hasNumericScore || result?.score === '★'; const savedAt = new Date().toISOString();
  return { fecha: savedAt.slice(0, 10), tamizaje: screeningApplied ? 'Sí' : 'No aplica', puntaje: hasNumericScore ? String(numericScore) : result?.score === '★' ? '★' : '', riesgo: result?.label || result?.interpretation || 'Resultado NRS-2002', evaluacion: screeningApplied ? 'Sí' : 'No aplica', interpretacion: result?.interpretation || '', recomendaciones: Array.isArray(result?.recommendations) ? result.recommendations : [], entradas: inputs || {}, fuente: 'NRS-2002', guardadoEn: savedAt };
}

async function resolveAssociation({ bedCode, associationMode, initials, age, patientInfo }) {
  if (!normalizedInitials(initials) || numericAge(age) === null) throw new Error('Ingresa las iniciales y la edad para continuar.');
  const registry = readHospitalRegistry(); const currentLocal = registry[bedCode] || {};
  const records = await fetchProaRecords(); const currentRecord = records.find(record => !isHistoricalProaRecord(record) && record.bedCode === bedCode); const latest = getLatestProaForm(currentRecord) || {};
  if (associationMode !== 'new') {
    if (![latest, currentLocal].some(candidate => identityMatches(candidate, initials, age))) {
      const mismatch = new Error('Las iniciales y la edad no coinciden con el registro vigente. Verifica los datos o selecciona “Nuevo usuario”.'); mismatch.code = 'IDENTITY_MISMATCH'; throw mismatch;
    }
    const hydratedLocal = { ...currentLocal, nombre: currentLocal.nombre || latest.paciente || '', rut: currentLocal.rut || latest.rut || '', edad: currentLocal.edad || latest.edad || '', fechaIngreso: currentLocal.fechaIngreso || latest.fecha_ingreso || '' };
    return { currentLocal: hydratedLocal, currentRecord, latest, isNew: false };
  }
  if (currentRecord) await archiveProaRecord(currentRecord, new Date().toISOString().slice(0, 10), { motivo: 'Reemplazo por nueva asociación de cama' });
  const savedAt = new Date().toISOString();
  const minimal = { nombre: patientInfo?.name || `Paciente ${normalizedInitials(initials)}`, rut: patientInfo?.rut || '', nFicha: patientInfo?.record || '', edad: String(numericAge(age)), inicialesPaciente: normalizedInitials(initials), fechaIngreso: savedAt.slice(0, 10), updatedAt: savedAt };
  writeHospitalRegistry({ ...registry, [bedCode]: minimal }); notifyHospitalRegistryUpdate(bedCode);
  return { currentLocal: minimal, currentRecord: null, latest: {}, isNew: true };
}

async function persistIndexedRecord({ service, bedCode, associationMode, initials, age, patientInfo, entryType, localPatch, remotePatch }) {
  const association = await resolveAssociation({ bedCode, associationMode, initials, age, patientInfo });
  const nextLocal = { ...association.currentLocal, ...localPatch(association.currentLocal), updatedAt: new Date().toISOString() };
  writeHospitalRegistry({ ...readHospitalRegistry(), [bedCode]: nextLocal }); notifyHospitalRegistryUpdate(bedCode);
  try {
    const now = new Date().toISOString();
    const savedRecord = await saveProaRecord({ ...association.latest, proa_entry_type: entryType, proa_enrolled: association.currentRecord ? association.latest.proa_enrolled !== false : false, fecha: now.slice(0, 10), hora: new Date(now).toTimeString().slice(0, 5), servicio: service, cama: bedCode, paciente: association.latest.paciente || nextLocal.nombre || '', rut: association.latest.rut || nextLocal.rut || '', edad: association.latest.edad || nextLocal.edad || String(numericAge(age)), patient_initials: normalizedInitials(initials), ...remotePatch(association.latest, now) }, { replaceExisting: association.isNew });
    const syncedLocal = { ...nextLocal, proaRecordId: savedRecord.id, proaBedCode: savedRecord.bedCode, proaEnrolled: savedRecord.evolutions?.[0]?.form?.proa_enrolled !== false, proaUpdatedAt: savedRecord.updatedAt };
    writeHospitalRegistry({ ...readHospitalRegistry(), [bedCode]: syncedLocal }); notifyHospitalRegistryUpdate(bedCode);
    return { synced: true, created: association.isNew };
  } catch (error) {
    if (error?.code === 'IDENTITY_MISMATCH') throw error;
    return { synced: false, created: association.isNew, error };
  }
}

export async function saveNrsResultToHospitalLocation(args) {
  if (!args.service || !args.bedCode || !args.result) throw new Error('Selecciona servicio y cama para guardar el resultado.');
  const evaluation = nrsEvaluation(args.result, args.inputs);
  return persistIndexedRecord({ ...args, entryType: 'registro_nrs2002', localPatch: current => ({ evaluacionesNutricionales: [evaluation, ...(current.evaluacionesNutricionales || [])].slice(0, 30) }), remotePatch: latest => ({ vista_evaluaciones_nutricionales: [evaluation, ...(latest.vista_evaluaciones_nutricionales || [])].slice(0, 30) }) });
}

export async function saveInsulinProtocolToHospitalLocation(args) {
  if (!args.service || !args.bedCode || !args.result) throw new Error('Selecciona servicio y cama para guardar el protocolo.');
  const savedAt = new Date().toISOString(); const item = { ...args.result, fecha: savedAt.slice(0, 10), guardadoEn: savedAt, fuente: 'Protocolo de corrección insulínica' };
  return persistIndexedRecord({ ...args, entryType: 'registro_protocolo_insulina', localPatch: current => ({ diabetesEvaluado: true, diabetes: true, diabetesEvaluadoEn: current.diabetesEvaluadoEn || savedAt, protocolosInsulina: [item, ...(current.protocolosInsulina || [])].slice(0, 30) }), remotePatch: latest => ({ diabetes_evaluado: true, diabetes: true, diabetes_evaluado_en: latest.diabetes_evaluado_en || savedAt, vista_protocolos_insulina: [item, ...(latest.vista_protocolos_insulina || [])].slice(0, 30) }) });
}
