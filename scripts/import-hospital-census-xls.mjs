import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const sourcePath = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const apply = process.argv.includes('--apply');
const expectedArg = process.argv.find((arg) => arg.startsWith('--expected='));
const expectedPatients = expectedArg ? Number(expectedArg.split('=')[1]) : null;
if (!sourcePath) throw new Error('Uso: node scripts/import-hospital-census-xls.mjs <archivo.xls> [--apply]');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const clean = (value = '') => String(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#(d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/\s+/g, ' ').trim();
const repairEncoding = (value) => /Ã|Â/.test(value) ? Buffer.from(value, 'latin1').toString('utf8') : value;
const normalizeName = (value) => String(value || '')
  .replace(/\bZU\?IGA\b/giu, 'ZUÑIGA')
  .replace(/^[\s:;,.]+|[\s:;,.]+$/g, '')
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('es-CL')
  .replace(/(^|[\s-])([a-záéíóúüñ])/giu, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('es-CL')}`);
const clinicalAcronyms = new Set(['EPOC', 'VIH', 'ITU', 'AVE', 'NAC', 'TAC', 'ECG', 'PCR', 'RCP', 'IOT', 'LET', 'HTA', 'DM', 'ERC', 'IRA', 'VRS']);
const normalizeClinicalText = (value) => String(value || '').trim().replace(/[ \t]+/g, ' ').split('\n').map((line) => line.toLocaleLowerCase('es-CL').replace(/(^|[.!?]\s+)([a-záéíóúüñ])/giu, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('es-CL')}`).replace(/\b[A-Za-zÁÉÍÓÚÜÑ]{2,4}\b/g, (word) => clinicalAcronyms.has(word.toLocaleUpperCase('es-CL')) ? word.toLocaleUpperCase('es-CL') : word)).join('\n');
const rutKey = (value) => String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();
const formatRut = (value) => {
  const normalized = rutKey(value);
  return normalized ? `${normalized.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${normalized.slice(-1)}` : '';
};
const isoDate = (value) => {
  const match = String(value || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
};
const ageAt = (birthDate, at = new Date()) => {
  if (!birthDate) return '';
  const [year, month, day] = birthDate.split('-').map(Number);
  return at.getFullYear() - year - ((at.getMonth() + 1 < month || (at.getMonth() + 1 === month && at.getDate() < day)) ? 1 : 0);
};

function bedFor(row) {
  const room = row.Sala.match(/\d+/)?.[0];
  const bed = row.Cama.replace(/^0+/, '') || '0';
  if (row.Servicio === 'HODOM') {
    const slot = row.Cama.match(/(\d+)/)?.[1];
    return slot ? `HD-${Number(slot)}` : '';
  }
  if (row.Servicio === 'MATHB') return row.Sala.includes('OBSTETRICIA') ? `OBS-${bed}` : `GINE-${bed}`;
  if (row.Servicio === 'MQMCHB') {
    if (row.Sala === 'SALA 5') return 'MQ2-Aislamiento 1';
    if (row.Sala === 'SALA 6') return 'MQ2-Aislamiento 2';
    return `MQ2-${room}-${bed}`;
  }
  if (row.Servicio === 'MQHB') {
    if (!row.Sala.includes('AISLAMIENTO')) return `${room}-${bed}`;
    if (room === '5') return bed.toUpperCase() === '5P' ? 'Aisl 5-1' : 'Aisl 5-2';
    if (room === '8') return bed.toUpperCase() === '8P' ? 'Aisl 8-1' : 'Aisl 8-2';
    return `Aisl ${room}`;
  }
  if (row.Servicio === 'PEDHB') {
    const key = `${room}-${bed}`;
    const pediatric = { '3-1': 1, '3-2': 2, '3-3': 3, '4-1': 4, '4-2': 5, '5-1': 6, '5-3': 7, '6-1': 8, '6-3': 9 };
    return pediatric[key] ? `PED-${pediatric[key]}` : '';
  }
  return '';
}

const serviceFor = (row) => row.Servicio === 'MQMCHB' ? 'MQ2' : row.Servicio === 'MQHB' ? 'MQ1' : row.Servicio === 'PEDHB' ? 'Pediatría' : row.Servicio === 'HODOM' ? 'Hospitalización domiciliaria' : 'Ginecología Obstetricia';
const html = await fs.readFile(sourcePath, 'utf8');
const rawRows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => repairEncoding(clean(cell[1]))));
const headers = rawRows.shift();
const rows = rawRows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || '']))).filter((row) => row.Paciente);
if (!rows.length) throw new Error('El archivo no contiene pacientes ocupando cama.');
if (Number.isFinite(expectedPatients) && rows.length !== expectedPatients) throw new Error(`Se esperaban ${expectedPatients} pacientes ocupando cama; se detectaron ${rows.length}.`);

const candidates = rows.map((row) => {
  const birthDate = isoDate(row['Fecha Nacimiento']);
  return {
    source: row,
    bed: bedFor(row),
    service: serviceFor(row),
    form: {
      proa_entry_type: 'censo_importado',
      proa_enrolled: false,
      paciente: normalizeName(row.Paciente.replace(/\s*\*\s*$/, '')),
      rut: formatRut(row.Rut),
      edad: String(ageAt(birthDate)),
      edad_fuente: row.Edad,
      fecha_nacimiento: birthDate,
      sexo: /^f/i.test(row.Genero) ? 'femenino' : /^m/i.test(row.Genero) ? 'masculino' : '',
      fecha_ingreso: isoDate(row.Ingreso),
      diagnostico_principal: normalizeClinicalText(row.Diagnostico),
      diagnostico_ingreso: normalizeClinicalText(row.Diagnostico),
      codigo_diagnostico_ingreso: row['Codigo Diagn.'],
      diagnostico_desglose: '',
      diagnostico_actual: normalizeClinicalText(row.Diagnostico),
      diagnosticos_actuales: [normalizeClinicalText(row.Diagnostico)].filter(Boolean),
      direccion: row.Domicilio,
      comuna: row.Comuna,
      observaciones_censo: row.Observaciones,
      servicio: serviceFor(row),
      cama: bedFor(row),
      fecha: new Date().toISOString().slice(0, 10),
      hora: new Date().toTimeString().slice(0, 5),
      antibioticos: [],
      estudios_micro: [],
      parametros_inflamatorios: [],
      recomendaciones: [],
    },
  };
});
if (candidates.some((item) => !item.bed)) throw new Error('Hay filas ocupadas sin equivalencia de cama.');
if (new Set(candidates.map((item) => item.bed)).size !== candidates.length) throw new Error('El archivo contiene dos pacientes asignados a la misma cama.');

const { data: existingRows, error: readError } = await supabase.from('proa_records').select('*');
if (readError) throw readError;
const activeRows = existingRows.filter((row) => !row.bed_code.startsWith('HIST-'));
const currentByBed = new Map(activeRows.map((row) => [row.bed_code, row]));
const currentByRut = new Map(activeRows.map((row) => [rutKey(row.evolutions?.[0]?.form?.rut), row]).filter(([rut]) => rut));
const actions = [];

for (const candidate of candidates) {
  const sameRutElsewhere = currentByRut.get(rutKey(candidate.form.rut));
  if (sameRutElsewhere && sameRutElsewhere.bed_code !== candidate.bed) {
    actions.push({ type: 'move', row: sameRutElsewhere, target: candidate.bed, candidate });
    currentByBed.delete(sameRutElsewhere.bed_code);
    currentByBed.set(candidate.bed, sameRutElsewhere);
    continue;
  }
  const occupant = currentByBed.get(candidate.bed);
  if (occupant && rutKey(occupant.evolutions?.[0]?.form?.rut) === rutKey(candidate.form.rut)) actions.push({ type: 'merge', row: occupant, candidate });
  else if (occupant) actions.push({ type: 'replace', row: occupant, candidate });
  else actions.push({ type: 'insert', candidate });
}

const summary = actions.reduce((counts, item) => ({ ...counts, [item.type]: (counts[item.type] || 0) + 1 }), {});
const referencedCurrentIds = new Set(actions.map((item) => item.row?.id).filter(Boolean));
// Hospitalización domiciliaria solo se da de alta cuando el censo la incluye;
// un export sin HODOM no debe vaciar esas camas.
const censusHasHodom = candidates.some((item) => item.bed.startsWith('HD-'));
const exempt = censusHasHodom ? /^TEST/i : /^(?:TEST|HD-)/i;
const notInCensusRows = activeRows.filter((row) => !referencedCurrentIds.has(row.id) && !exempt.test(row.bed_code || ''));
const notInCensus = notInCensusRows.map((row) => ({
  bed: row.bed_code,
  patient: row.evolutions?.[0]?.form?.paciente || '',
  enrolled: row.evolutions?.[0]?.form?.proa_enrolled !== false,
}));
console.log(JSON.stringify({ apply, patients: candidates.length, summary: { ...summary, notInCensus: notInCensus.length }, actions: actions.map((item) => ({ type: item.type, bed: item.candidate.bed, patient: item.candidate.form.paciente, previous: item.row?.evolutions?.[0]?.form?.paciente || '' })), notInCensus }, null, 2));
if (!apply) process.exit(0);

const archive = async (row, reason) => {
  const now = new Date().toISOString();
  const latest = row.evolutions?.[0]?.form || {};
  const evolutions = [{ savedAt: now, form: { ...latest, proa_patient_status: 'historico', proa_archived_at: now, fecha_egreso: now.slice(0, 10), motivo_egreso: reason } }, ...(row.evolutions || []).slice(1)];
  const { error } = await supabase.from('proa_records').update({ bed_code: `HIST-${row.id}`, evolutions, updated_at: now }).eq('id', row.id);
  if (error) throw error;
};
const persist = async (candidate, existing = null, enrolled = false) => {
  const now = new Date().toISOString();
  const previousForm = existing?.evolutions?.[0]?.form || {};
  const previousDiagnosis = previousForm.diagnostico_actual || previousForm.diagnostico_principal || '';
  const hasExistingPatient = Boolean(existing);
  const form = {
    ...previousForm,
    ...candidate.form,
    proa_enrolled: enrolled,
    ...(hasExistingPatient ? {
      antibioticos: previousForm.antibioticos || [],
      antibioticos_eliminados: previousForm.antibioticos_eliminados || [],
      antibioterapia_preingreso: previousForm.antibioterapia_preingreso || '',
      parametros_inflamatorios: previousForm.parametros_inflamatorios || [],
      resultados_examenes_parser: previousForm.resultados_examenes_parser || [],
      examenes_complementarios: previousForm.examenes_complementarios || [],
      estudios_micro: previousForm.estudios_micro || [],
      estudios_imagen: previousForm.estudios_imagen || '',
      aislamiento: previousForm.aislamiento || '',
      creatinina: previousForm.creatinina || '',
      fecha_creatinina: previousForm.fecha_creatinina || '',
      funcion_renal: previousForm.funcion_renal || '',
      vfg_estimada: previousForm.vfg_estimada || '',
      recomendaciones: previousForm.recomendaciones || [],
      recomendaciones_otra: previousForm.recomendaciones_otra || '',
    } : {}),
    diagnostico_desglose: enrolled && previousDiagnosis !== candidate.form.diagnostico_principal ? previousDiagnosis : previousForm.diagnostico_desglose || '',
    diagnostico_actual: enrolled && previousDiagnosis ? previousDiagnosis : candidate.form.diagnostico_principal,
    diagnosticos_actuales: enrolled && previousDiagnosis && previousDiagnosis !== candidate.form.diagnostico_principal ? [candidate.form.diagnostico_principal, previousDiagnosis] : [candidate.form.diagnostico_principal],
  };
  delete form.nota_evolucion;
  const row = {
    id: existing?.id || crypto.randomUUID(),
    code: existing?.code || `CENSO-${rutKey(form.rut)}`,
    bed_code: candidate.bed,
    servicio: candidate.service,
    updated_at: now,
    evolutions: [{ savedAt: now, form }, ...(existing?.evolutions || [])].slice(0, 60),
  };
  const { error } = await supabase.from('proa_records').upsert(row, { onConflict: 'bed_code' });
  if (error) throw error;
};

for (const row of notInCensusRows) {
  await archive(row, 'Paciente ausente del nuevo censo hospitalario');
}

// activeRows es la foto previa al import: un traslado en cadena (A toma la cama
// de B mientras B se va a otra) dejaría al ocupante anterior marcado como
// reemplazado aunque siga en el censo. Solo se archiva a quien no se reubica.
const relocatedIds = new Set(actions.filter((item) => item.type === 'move').map((item) => item.row.id));

for (const action of actions) {
  if (action.type === 'replace') await archive(action.row, 'Reemplazo confirmado por nuevo censo hospitalario');
  if (action.type === 'move') {
    const target = activeRows.find((row) => row.bed_code === action.target && row.id !== action.row.id);
    if (target && !relocatedIds.has(target.id)) await archive(target, 'Reemplazo confirmado por traslado en nuevo censo hospitalario');
    const { error } = await supabase.from('proa_records').delete().eq('id', action.row.id);
    if (error) throw error;
  }
  const existing = ['merge', 'move'].includes(action.type) ? action.row : null;
  const wasEnrolled = existing ? existing.evolutions?.[0]?.form?.proa_enrolled !== false : false;
  await persist(action.candidate, existing, wasEnrolled);
}

console.log(`Censo integrado: ${candidates.length} pacientes.`);
