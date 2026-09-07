import { ALL_BEDS, BED_CATALOG } from '@/components/agenda-diaria/bedCatalog';
import { fetchProaRecords, getLatestProaForm, isHistoricalProaRecord, saveProaRecord } from '@/lib/proaRegistry';

const HOSPITAL_REGISTRY_KEY = 'vista_general_hospitalizados_v1';
export const HOSPITAL_REGISTRY_UPDATED_EVENT = 'saludbulnes:hospital-registry-updated';

function readHospitalRegistry() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOSPITAL_REGISTRY_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeHospitalRegistry(registry) {
  localStorage.setItem(HOSPITAL_REGISTRY_KEY, JSON.stringify(registry || {}));
}

function notifyHospitalRegistryUpdate(bedCode) {
  window.dispatchEvent(new CustomEvent(HOSPITAL_REGISTRY_UPDATED_EVENT, { detail: { bedCode } }));
}

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
  const serviceLabels = new Map(BED_CATALOG.map(service => [service.short, service.name]));
  serviceLabels.set('HODOM', 'Hospitalización domiciliaria');
  serviceLabels.set('Otro', 'Otro servicio');

  const locations = new Map(ALL_BEDS.map(bed => [bed.code, {
    code: bed.code,
    service: bed.serviceShort,
    serviceLabel: serviceLabels.get(bed.serviceShort) || bed.serviceShort,
    bedLabel: bed.cell,
    unitLabel: bed.salaLabel,
  }]));

  const records = await fetchProaRecords();
  records.filter(record => !isHistoricalProaRecord(record)).forEach(record => {
    if (!record?.bedCode || locations.has(record.bedCode)) return;
    const service = record.servicio || inferredService(record.bedCode);
    locations.set(record.bedCode, {
      code: record.bedCode,
      service,
      serviceLabel: serviceLabels.get(service) || service,
      bedLabel: record.bedCode,
      unitLabel: '',
    });
  });

  return [...locations.values()].sort((a, b) => a.service.localeCompare(b.service, 'es')
    || a.bedLabel.localeCompare(b.bedLabel, 'es', { numeric: true }));
}

function nrsEvaluation(result, inputs) {
  const numericScore = Number(result?.score);
  const hasNumericScore = Number.isFinite(numericScore);
  const screeningApplied = hasNumericScore || result?.score === '★';
  const savedAt = new Date().toISOString();
  return {
    fecha: savedAt.slice(0, 10),
    tamizaje: screeningApplied ? 'Sí' : 'No aplica',
    puntaje: hasNumericScore ? String(numericScore) : result?.score === '★' ? '★' : '',
    riesgo: result?.label || result?.interpretation || 'Resultado NRS-2002',
    evaluacion: screeningApplied ? 'Sí' : 'No aplica',
    interpretacion: result?.interpretation || '',
    recomendaciones: Array.isArray(result?.recommendations) ? result.recommendations : [],
    entradas: inputs || {},
    fuente: 'NRS-2002',
    guardadoEn: savedAt,
  };
}

export async function saveNrsResultToHospitalLocation({ service, bedCode, patientInfo, result, inputs }) {
  if (!service || !bedCode || !result) throw new Error('Selecciona servicio y cama para guardar el resultado.');

  const registry = readHospitalRegistry();
  const currentLocal = registry[bedCode] || {};
  const evaluation = nrsEvaluation(result, inputs);
  const evaluations = [evaluation, ...(Array.isArray(currentLocal.evaluacionesNutricionales) ? currentLocal.evaluacionesNutricionales : [])].slice(0, 30);
  let nextLocal = {
    ...currentLocal,
    nombre: currentLocal.nombre || patientInfo?.name || '',
    rut: currentLocal.rut || patientInfo?.rut || '',
    nFicha: currentLocal.nFicha || patientInfo?.record || '',
    evaluacionesNutricionales: evaluations,
    updatedAt: evaluation.guardadoEn,
  };
  writeHospitalRegistry({ ...registry, [bedCode]: nextLocal });
  notifyHospitalRegistryUpdate(bedCode);

  try {
    const records = await fetchProaRecords();
    const currentRecord = records.find(record => !isHistoricalProaRecord(record) && record.bedCode === bedCode);
    const latest = getLatestProaForm(currentRecord) || {};
    const remoteEvaluations = [evaluation, ...(Array.isArray(latest.vista_evaluaciones_nutricionales) ? latest.vista_evaluaciones_nutricionales : [])].slice(0, 30);
    const savedRecord = await saveProaRecord({
      ...latest,
      proa_entry_type: 'registro_nrs2002',
      proa_enrolled: currentRecord ? latest.proa_enrolled !== false : false,
      fecha: evaluation.fecha,
      hora: new Date(evaluation.guardadoEn).toTimeString().slice(0, 5),
      servicio: service,
      cama: bedCode,
      paciente: latest.paciente || currentLocal.nombre || patientInfo?.name || '',
      rut: latest.rut || currentLocal.rut || patientInfo?.rut || '',
      n_ficha: '',
      vista_evaluaciones_nutricionales: remoteEvaluations,
    });
    nextLocal = { ...nextLocal, proaRecordId: savedRecord.id, proaBedCode: savedRecord.bedCode, proaEnrolled: savedRecord.evolutions?.[0]?.form?.proa_enrolled !== false, proaUpdatedAt: savedRecord.updatedAt };
    writeHospitalRegistry({ ...readHospitalRegistry(), [bedCode]: nextLocal });
    notifyHospitalRegistryUpdate(bedCode);
    return { synced: true, created: !currentRecord };
  } catch (error) {
    return { synced: false, created: !currentLocal.nombre && !currentLocal.rut, error };
  }
}
