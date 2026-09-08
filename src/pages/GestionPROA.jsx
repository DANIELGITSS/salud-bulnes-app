import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { conAccesoMedispense } from '@/components/MedispenseAccess';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PROA_BED_MAP as BASE_PROA_BED_MAP } from '@/lib/hospitalSuggestions';
import { archiveProaRecord, deleteProaEvolution, deleteProaRecord, dischargeFromProa, fetchProaRecords, getLatestProaForm, isHistoricalProaRecord, isProaEnrolledRecord, moveProaRecordToBed, readProaRegistry, saveProaPreAdmission, updateProaEvolution } from '@/lib/proaRegistry';
import { buildRenalFunctionText, normalizeCreatinine } from '@/lib/renalFunction';
import { supabase } from '@/lib/supabase';
import { getMultiPrefill } from '@/lib/multiTemplatePrefill';
import { HOSPITAL_LAB_FIELDS } from '@/components/hospitalizados/hospitalLabCatalog';
import ProaEvolutionDocument from '@/components/visita-proa/ProaEvolutionDocument';
import RenalAntibioticReview from '@/components/visita-proa/RenalAntibioticReview';
import { ANTIBIOTICOS, DEFAULT_DOSIS_ATB, DIAGNOSTICOS_INFECTO, PATOGENOS, PRESENTACIONES_ATB, TIPOS_MUESTRA } from '@/pages/VisitaPROA';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  Bed,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  Clock3,
  FileSpreadsheet,
  Droplets,
  Copy,
  Pencil,
  Plus,
  Printer,
  RotateCw,
  ShieldPlus,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';

const moduleCardClass = 'group block h-full rounded-2xl border bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-md';
const CHART_COLORS = ['#0f766e', '#0284c7', '#7c3aed', '#d97706', '#dc2626', '#059669', '#4f46e5', '#be185d'];
const PROA_TABLE_SERVICE_ORDER = ['MQ1', 'MQ2', 'Pediatría', 'Ginecología Obstetricia', 'Hospitalización domiciliaria', 'Urgencias'];
const proaServiceOrderIndex = (service) => {
  const index = PROA_TABLE_SERVICE_ORDER.indexOf(service);
  return index === -1 ? PROA_TABLE_SERVICE_ORDER.length : index;
};
const localTodayIso = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const PROA_BED_MAP = [
  ...BASE_PROA_BED_MAP,
  {
    servicio: 'Hospitalización domiciliaria',
    groups: [{
      label: 'Cupos indiferenciados',
      beds: Array.from({ length: 15 }, (_, index) => `HD-${index + 1}`),
    }],
  },
  {
    servicio: 'Sala de prueba PROA',
    groups: [{ label: 'No contabiliza en estadísticas', beds: ['TEST-PROA-1'] }],
  },
];

function formatUpdatedAt(value) {
  if (!value) return 'Sin fecha';
  try {
    return new Intl.DateTimeFormat('es-CL', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return 'Sin fecha';
  }
}

function formatProaRut(value) {
  const clean = String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}

const normalizeMedicationName = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase('es');

function canonicalAntibioticName(value) {
  const normalized = normalizeMedicationName(value).replace(/[+/_-]+/g, ' ').replace(/\s+/g, ' ');
  if ((/\bpipe(?:racilina)?\b/.test(normalized) || normalized.includes('piperacilina')) && /\btazo(?:bactam)?\b/.test(normalized)) return 'Piperacilina + tazobactam';
  if (/\bampi(?:cilina)?\b/.test(normalized) && /\bsulba(?:ctam)?\b/.test(normalized)) return 'Ampicilina + sulbactam';
  if (/\bamoxi(?:cilina)?\b/.test(normalized) && /\b(?:clav|clavulan|clavulanico|acido clavulanico)\b/.test(normalized)) return 'Amoxicilina + ácido clavulánico';
  if (/\bimipenem\b/.test(normalized) && /\bcila(?:statina)?\b/.test(normalized)) return 'Imipenem + cilastatina';
  const catalogMatch = ANTIBIOTICOS.find((name) => normalizeMedicationName(name).replace(/[+/_-]+/g, ' ').replace(/\s+/g, ' ') === normalized);
  if (catalogMatch) return catalogMatch;
  return String(value || '').trim().replace(/\s+/g, ' ').replace(/^./, (letter) => letter.toLocaleUpperCase('es'));
}

function formatCombinedAntibioticDose(item, canonicalName) {
  if (!canonicalName.includes(' + ')) return '';
  const presentation = String(item?.presentacion || '');
  const presentationMatch = presentation.match(/(\d+(?:[.,]\d+)?)\s*(?:mg|g)?\s*[+/]\s*(\d+(?:[.,]\d+)?)\s*(mg|g)/i);
  const legacyDoseMatch = String(item?.dosis || '').match(/(\d+(?:[.,]\d+)?)\s*(mg|g)\b/i);
  const amount = Number(String(item?.dosis_cantidad || legacyDoseMatch?.[1] || '').replace(',', '.'));
  const unit = String(item?.dosis_unidad || legacyDoseMatch?.[2] || '').toLowerCase();
  const formatAmount = (value) => String(value).replace('.', ',');
  if (presentationMatch) {
    const componentA = Number(presentationMatch[1].replace(',', '.'));
    const componentB = Number(presentationMatch[2].replace(',', '.'));
    const componentUnit = presentationMatch[3].toLowerCase();
    const recordedIsFirstComponent = amount > 0 && unit === componentUnit && amount === componentA;
    const totalText = amount > 0 && !recordedIsFirstComponent
      ? `${formatAmount(amount)} ${unit || componentUnit}`
      : `${formatAmount(componentA + componentB)} ${componentUnit}`;
    return `${totalText} (${presentationMatch[1]} + ${presentationMatch[2]} ${componentUnit})`;
  }
  if (canonicalName === 'Amoxicilina + ácido clavulánico') {
    if (unit === 'mg' && amount === 625) return '625 mg (500 + 125 mg)';
    if (unit === 'mg' && amount === 1000) return '1000 mg (875 + 125 mg)';
    if (unit === 'g' && amount === 0.625) return '0,625 g (500 + 125 mg)';
  }
  if (canonicalName === 'Ampicilina + sulbactam') {
    if (unit === 'g' && amount === 1.5) return '1,5 g (1 + 0,5 g)';
    if (unit === 'g' && amount === 3) return '3 g (2 + 1 g)';
  }
  if (canonicalName === 'Piperacilina + tazobactam') {
    if (unit === 'g' && amount === 4.5) return '4,5 g (4 + 0,5 g)';
    if (unit === 'g' && amount === 4) return '4,5 g (4 + 0,5 g)';
  }
  return '';
}

function formatArsenalPresentation(medication) {
  const strength = medication?.dose_value != null && medication?.dose_unit
    ? `${medication.dose_value} ${medication.dose_unit}`
    : '';
  return [medication?.presentation, strength].filter(Boolean).join(' · ');
}

function summarizeLatest(form) {
  if (!form) return 'Sin evolución registrada.';
  const diagnoses = String(form.diagnostico_actual || '')
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
  const primaryDiagnosis = diagnoses[0]
    ? `${diagnoses[0].slice(0, 90)}${diagnoses[0].length > 90 ? '…' : ''}`
    : 'Sin diagnóstico consignado';
  const additionalDiagnoses = diagnoses.length > 1 ? ` (+${diagnoses.length - 1})` : '';
  const antibiotics = (form.antibioticos || [])
    .filter((item) => item.nombre)
    .map((item) => canonicalAntibioticName(item.nombre))
    .filter((item, index, items) => items.indexOf(item) === index);
  const visibleAntibiotics = antibiotics.slice(0, 2).join(', ');
  const additionalAntibiotics = antibiotics.length > 2 ? ` (+${antibiotics.length - 2})` : '';
  return visibleAntibiotics
    ? `${primaryDiagnosis}${additionalDiagnoses} · ATB: ${visibleAntibiotics}${additionalAntibiotics}`
    : `${primaryDiagnosis}${additionalDiagnoses}`;
}

function describeEvolutionChanges(form, previousForm) {
  if (form?.proa_entry_type === 'egreso_proa') return ['Egreso de PROA; continúa hospitalizado'];
  if (!previousForm) return ['Ingreso inicial a PROA'];
  const changes = [];
  const textChanged = (key) => String(form?.[key] || '').trim() !== String(previousForm?.[key] || '').trim();
  if (textChanged('diagnostico_actual')) changes.push('Diagnósticos actualizados');
  if (textChanged('resumen_caso') || textChanged('evolucion')) changes.push('Evolución clínica actualizada');
  if (textChanged('plan_duracion')) changes.push('Plan modificado');
  if (JSON.stringify(form?.antibioticos || []) !== JSON.stringify(previousForm?.antibioticos || [])) changes.push('Antimicrobianos modificados');
  if (JSON.stringify(form?.parametros_inflamatorios || []) !== JSON.stringify(previousForm?.parametros_inflamatorios || [])) changes.push('Exámenes de sangre actualizados');
  if (JSON.stringify(form?.examenes_complementarios || []) !== JSON.stringify(previousForm?.examenes_complementarios || [])) changes.push('Exámenes complementarios actualizados');
  if (JSON.stringify(form?.estudios_micro || []) !== JSON.stringify(previousForm?.estudios_micro || [])) changes.push('Microbiología actualizada');
  return changes.length ? changes : ['Registro clínico guardado sin cambios estructurales'];
}

function summarizeEvolutionEntry(form = {}, previousForm = {}) {
  const hasContent = row => row && Object.entries(row).some(([key, value]) => key !== 'fecha' && String(value ?? '').trim());
  const bloodRows = (form.examenes_sangre || []).length ? form.examenes_sangre : (form.parametros_inflamatorios || []);
  const bloodTests = bloodRows.filter(hasContent).length;
  const complementary = (form.examenes_complementarios || []).filter(hasContent).length + (String(form.estudios_imagen || '').trim() ? 1 : 0);
  const cultures = (form.cultivos || form.estudios_micro || []).filter(item => item?.tipo_muestra || item?.patogeno).length;
  const previousNames = new Set((previousForm.antibioticos || []).map(item => String(item?.nombre || '').trim().toLocaleLowerCase('es')).filter(Boolean));
  const antibiotics = (form.antibioticos || []).filter(item => item?.nombre).map(item => {
    const suspended = /suspend|finaliz|terminad/i.test(`${item.estado || ''} ${item.status || ''}`) || Boolean(item.termino && item.termino_manual !== false);
    const maintained = previousNames.has(String(item.nombre).trim().toLocaleLowerCase('es'));
    return { name: canonicalAntibioticName(item.nombre), action: suspended ? 'suspendido' : maintained ? 'mantenido' : 'indicado' };
  });
  const recommendation = String(form.plan_duracion || form.recomendaciones_otra || (form.recomendaciones || []).join(' · ') || '').trim();
  return { bloodTests, complementary, cultures, antibiotics, recommendation };
}

function EvolutionLabCurve({ rows }) {
  const normalized = (rows || []).map((row) => ({
    ...row,
    blancos: row.blancos || row.leucocitos || row.gb || row.GB || row.leu || row.wbc || '',
    crea: row.crea || row.creatinina || '',
    fecha: String(row.fecha || row.collectedAt || '').slice(0, 10),
  })).filter((row) => row.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const available = HOSPITAL_LAB_FIELDS.filter(([key]) => normalized.some((row) => row[key] !== '' && row[key] != null));
  const formatDate = (value) => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
  };
  return <section className="mt-4"><h2 className="border-b font-bold">Curva de exámenes</h2>{available.length === 0 ? <p className="mt-1 text-sm">—</p> : <><div className="mt-2 overflow-x-auto"><table className="w-full min-w-max table-fixed border-collapse text-center text-xs"><thead><tr><th className="w-40 border border-slate-300 bg-slate-100 p-2 text-left">Examen / fecha</th>{normalized.map((row, index) => <th key={`${row.fecha}-${index}`} className="min-w-24 border border-slate-300 bg-slate-100 p-2">{formatDate(row.fecha)}</th>)}</tr></thead><tbody>{available.map(([key, name, unit]) => <tr key={key}><th className="border border-slate-300 bg-slate-50 p-2 text-left">{name}<span className="block text-[9px] font-normal text-slate-500">{unit}</span></th>{normalized.map((row, index) => <td key={`${key}-${index}`} className="border border-slate-300 p-2">{row[key] || '—'}</td>)}</tr>)}</tbody></table></div><div className="mt-4 grid gap-3 md:grid-cols-2">{available.map(([key, name, unit]) => { const data = normalized.filter((row) => row[key] !== '' && row[key] != null && Number.isFinite(Number(String(row[key]).replace(',', '.')))).map((row) => ({ fecha: formatDate(row.fecha), valor: Number(String(row[key]).replace(',', '.')) })); return <div key={key} className="break-inside-avoid rounded-lg border border-slate-200 p-3"><h3 className="text-xs font-bold">{name} <span className="font-normal text-slate-500">({unit})</span></h3><div className="h-32">{data.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}><XAxis dataKey="fecha" tick={{ fontSize: 8 }} /><YAxis tick={{ fontSize: 8 }} /><Tooltip /><Line type="monotone" dataKey="valor" stroke="#0f766e" strokeWidth={2.5} dot /></LineChart></ResponsiveContainer> : <p className="pt-10 text-center text-xs text-slate-400">Sin valores numéricos</p>}</div></div>; })}</div></>}</section>;
}

// Parseo tolerante de fecha (ISO yyyy-mm-dd o dd/mm/aaaa).
function parseProaDate(s) {
  if (!s) return null;
  let d = new Date(`${s}T00:00:00`);
  if (!Number.isNaN(d.getTime())) return d;
  const m = String(s).match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    d = new Date(`${yr}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}
function daysSince(s, { inclusive = false } = {}) {
  const d = parseProaDate(s);
  if (!d) return null;
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff < 0) return null;
  return inclusive ? diff + 1 : diff;
}

function formatClinicalDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : (value || '—');
}

function hospitalStayDays(form) {
  const start = parseProaDate(form?.fecha_ingreso);
  if (!start) return null;
  const end = form?.fecha_egreso
    ? parseProaDate(form.fecha_egreso)
    : form?.proa_archived_at ? new Date(form.proa_archived_at) : new Date();
  const diff = Math.floor((end.getTime() - start.getTime()) / 86400000);
  return diff >= 0 ? diff : null;
}

// Resumen para el tooltip al pasar sobre una cama ocupada (si hay info).
function bedTooltip(form) {
  if (!form) return '';
  const lines = [];
  const dx = form.diagnostico_actual || form.diagnostico_microbiologico;
  if (dx) lines.push(`Diagnóstico: ${dx}`);
  const atbs = (form.antibioticos || []).filter((a) => a.nombre);
  if (atbs.length) {
    const txt = atbs.map((a) => {
      const suspended = Boolean(a.termino && a.termino <= localTodayIso());
      const dia = suspended ? preAntibioticTreatmentDays(a) : daysSince(a.inicio, { inclusive: true });
      const dosis = [a.dosis, a.intervalo_horas ? `c/${a.intervalo_horas} h` : '', a.via].filter(Boolean).join(' ');
      const status = suspended
        ? ` (suspendido${dia != null ? ` · ${dia} días` : ''})`
        : dia ? ` (día ${dia})` : '';
      return `${a.nombre}${dosis ? ` ${dosis}` : ''}${status}`;
    }).join(' · ');
    lines.push(`ATB: ${txt}`);
  }
  const diasHosp = daysSince(form.fecha_ingreso);
  if (diasHosp !== null) lines.push(`Días de hospitalización: ${diasHosp}`);
  return lines.join('\n');
}

function latestEvolutionHover(record) {
  const evolution = (record?.evolutions || []).find(item => String(item?.form?.evolucion || item?.form?.vista_ultima_evolucion || '').trim());
  if (!evolution) return { text: '', isToday: false };
  const text = String(evolution.form.evolucion || evolution.form.vista_ultima_evolucion).trim();
  const savedDate = String(evolution.savedAt || evolution.form.fecha || record.updatedAt || '').slice(0, 10);
  return {
    text: `Evolución actual${savedDate ? ` (${formatClinicalDate(savedDate)})` : ''}: ${text}`,
    isToday: savedDate === localTodayIso(),
  };
}

function findServiceForBed(bedCode) {
  return PROA_BED_MAP.find((service) => (
    service.groups.some((group) => group.beds.includes(bedCode))
  ))?.servicio || '';
}

function displayBedCode(bedCode) {
  return String(bedCode || '').replace(/^MQ2-/, '');
}

const ALL_PROA_BEDS = PROA_BED_MAP.flatMap((service) => (
  service.groups.flatMap((group) => group.beds.map((bed) => ({ bed, servicio: service.servicio })))
));

const EMPTY_PRE_ANTIBIOTIC = {
  nombre: '',
  presentacion: '',
  dosis_cantidad: '',
  dosis_unidad: 'g',
  presentacion_unidad: 'g',
  intervalo_horas: '',
  via: 'EV',
  inicio: '',
  hora_inicio: '',
  termino: '',
};
const EMPTY_PRE_CULTURE = { tipo_muestra: '', fecha: '', estado_resultado: 'pendiente', patogeno: '', sensibilidad: 'Pendiente', resistente: [], sensible: [], intermedio: [], antibiograma_nota: '', antibiograma: '' };
const EMPTY_PRE_BLOOD_TEST = { fecha: '', pcr: '', pct: '', leucocitos: '', crea: '' };
const ISOLATION_TYPES = ['Sin aislamiento', 'Contacto', 'Gotitas', 'Aéreo', 'Contacto + gotitas', 'Contacto + aéreo', 'Protector / neutropénico', 'Otro'];
const COMPLEMENTARY_STUDIES = ['Radiografía de tórax', 'Radiografía de abdomen', 'TAC de cerebro', 'TAC de tórax', 'TAC de abdomen y pelvis', 'AngioTAC de tórax', 'Ecografía abdominal', 'Ecografía renal y vesical', 'Ecografía Doppler venosa', 'Ecocardiograma transtorácico', 'Endoscopía digestiva alta', 'Colonoscopía', 'Resonancia magnética', 'Punción lumbar', 'Biopsia / anatomía patológica', 'Otro'];
const DISCHARGE_REASONS = ['Alta médica', 'Fallecimiento', 'Traslado a otro servicio', 'Traslado a otro establecimiento', 'Otro'];

function printProaEvolutionPreview() {
  const element = document.querySelector('.proa-evolution-print');
  if (!element) return;
  const popup = window.open('', '_blank', 'width=900,height=1000');
  if (!popup) return;
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map(node => node.outerHTML).join('');
  popup.document.write(`<!doctype html><html><head><title>Evolución clínica PROA</title><meta charset="utf-8">${styles}<style>body{margin:0;padding:0;font-family:Arial,sans-serif;color:#0f172a}@page{size:A4 portrait;margin:10mm}@media print{body{padding:0}}</style></head><body>${element.outerHTML}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  popup.document.close();
}

function latestCreatinine(form) {
  const dated = [
    ...(Array.isArray(form?.creatininas) ? form.creatininas.map((item) => ({ fecha: item.fecha, valor: item.valor })) : []),
    ...(Array.isArray(form?.parametros_inflamatorios) ? form.parametros_inflamatorios.filter((item) => item?.crea).map((item) => ({ fecha: item.fecha, valor: item.crea })) : []),
    ...(form?.creatinina ? [{ fecha: form.fecha_creatinina || form.fecha || '', valor: form.creatinina }] : []),
  ].filter((item) => item.valor !== '' && item.valor != null);
  return dated.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))[0] || null;
}

function latestCreatinineForRecord(record, extraRows = []) {
  const candidates = (record?.evolutions || []).flatMap((evolution) => {
    const item = latestCreatinine(evolution?.form || {});
    return item ? [item] : [];
  });
  (extraRows || []).forEach((row) => {
    const value = row?.crea || row?.creatinina;
    if (value !== '' && value != null) candidates.push({ fecha: row.fecha || row.collectedAt || '', valor: value });
  });
  return candidates.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))[0] || null;
}

function renalFunctionForRecord(record) {
  const form = getLatestProaForm(record) || {};
  const latest = latestCreatinineForRecord(record);
  return latest ? buildRenalFunctionText({ ...form, creatinina: latest.valor }) : '—';
}

function formatPreAntibiotic(item) {
  const dose = item.dosis_unidad === 'ampolla'
    ? `${item.dosis_cantidad || ''} ${Number(item.dosis_cantidad) === 1 ? 'ampolla' : 'ampollas'}`
    : `${item.dosis_cantidad || ''} ${item.dosis_unidad || ''}`.trim();
  return [
    canonicalAntibioticName(item.nombre),
    item.presentacion && `(${item.presentacion})`,
    dose,
    item.intervalo_horas && `c/${item.intervalo_horas} h`,
    item.via,
  ].filter(Boolean).join(' ');
}

function preAntibioticTreatmentDays(item) {
  const start = parseProaDate(item?.inicio);
  if (!start) return null;
  if (item?.hora_inicio && !item?.termino) {
    const preciseStart = new Date(`${item.inicio}T${item.hora_inicio}:00`);
    if (Number.isNaN(preciseStart.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - preciseStart.getTime()) / 86400000));
  }
  const end = item?.termino ? parseProaDate(item.termino) : parseProaDate(localTodayIso());
  if (!end || end < start) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function getLastInflammatoryRows(form) {
  return (form?.parametros_inflamatorios || [])
    .filter((row) => row && Object.values(row).some(Boolean))
    .sort((a, b) => (parseProaDate(b.fecha)?.getTime() || 0) - (parseProaDate(a.fecha)?.getTime() || 0))
    .slice(0, 3);
}

function getLastInflammatoryRowsForRecord(record, limit = 3) {
  const unique = new Map();
  (record?.evolutions || []).forEach((evolution) => {
    const form = evolution?.form || {};
    (form.parametros_inflamatorios || []).forEach((row) => {
      if (!row || !Object.values(row).some(Boolean)) return;
      const normalized = { ...row, blancos: row.blancos || row.leucocitos || row.gb || row.GB || row.leu || row.wbc || '', crea: row.crea || row.creatinina || '' };
      const key = `${normalized.fecha || ''}|${normalized.pcr || ''}|${normalized.pct || ''}|${normalized.blancos}|${normalized.crea}`;
      if (!unique.has(key)) unique.set(key, normalized);
    });
    (form.creatininas || []).forEach((item) => {
      if (!item?.valor) return;
      const key = `${item.fecha || ''}||||${item.valor}`;
      if (!unique.has(key)) unique.set(key, { fecha: item.fecha || '', crea: item.valor });
    });
  });
  return [...unique.values()]
    .sort((a, b) => (parseProaDate(b.fecha)?.getTime() || 0) - (parseProaDate(a.fecha)?.getTime() || 0))
    .slice(0, limit);
}

function mergeProaEvolutionLabRows(record, currentRows = []) {
  const byDate = new Map();
  const historicalRows = [...(record?.evolutions || [])].reverse().flatMap((evolution) => evolution?.form?.parametros_inflamatorios || []);
  [...historicalRows, ...(currentRows || [])].forEach((source) => {
    const fecha = String(source?.fecha || source?.collectedAt || '').slice(0, 10);
    if (!fecha) return;
    const row = {
      ...source,
      blancos: source.blancos || source.leucocitos || source.gb || source.GB || source.leu || source.wbc || '',
      crea: source.crea || source.creatinina || '',
      fecha,
    };
    const merged = { ...(byDate.get(fecha) || {}), fecha };
    Object.entries(row).forEach(([key, value]) => {
      if (key === 'fecha' || (value !== '' && value != null)) merged[key] = value;
    });
    byDate.set(fecha, merged);
  });
  return [...byDate.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function formatInflammatoryRow(row) {
  const values = [
    row.pcr && `PCR ${row.pcr}`,
    row.blancos && `Leucos ${row.blancos}`,
    row.pct && `PCT ${row.pct}`,
    row.crea && `Cr ${row.crea}`,
    row.vhs && `VHS ${row.vhs}`,
    row.temp && `T° ${row.temp}`,
  ].filter(Boolean);
  return `${row.fecha || 'Sin fecha'}: ${values.join(' · ') || 'Sin valores'}`;
}

function formatMicroStudies(form) {
  const microbiology = (form?.estudios_micro || [])
    .filter((study) => study?.tipo_muestra || study?.patogeno)
    .map((study) => [study.tipo_muestra, study.fecha && formatClinicalDate(study.fecha), study.estado_resultado === 'negativo' ? 'Negativo' : study.estado_resultado === 'pendiente' ? 'Pendiente' : study.patogeno].filter(Boolean).join(' · '));
  const complementary = (form?.examenes_complementarios || []).filter((item) => item?.fecha || item?.nombre || item?.resultado).map((item) => [item.fecha && formatClinicalDate(item.fecha), item.nombre, item.resultado].filter(Boolean).join(' · '));
  return [...microbiology, form?.estudios_imagen, ...complementary].filter(Boolean).join('; ') || '—';
}

function formatAntimicrobial(item) {
  const canonicalName = canonicalAntibioticName(item.nombre);
  const combinedDose = formatCombinedAntibioticDose(item, canonicalName);
  const structuredDose = combinedDose || (item.dosis_modo === 'ampolla' || item.dosis_unidad === 'ampolla'
    ? item.unidades_por_dosis && `${item.unidades_por_dosis} ampolla${Number(item.unidades_por_dosis) === 1 ? '' : 's'}`
    : item.dosis_cantidad && `${item.dosis_cantidad} ${item.dosis_unidad || ''}`.trim());
  const dose = combinedDose
    ? [combinedDose, item.intervalo_horas && `c/${item.intervalo_horas} h`, item.via].filter(Boolean).join(' ')
    : item.dosis || [structuredDose, item.intervalo_horas && `c/${item.intervalo_horas} h`, item.via].filter(Boolean).join(' ');
  const duration = item.inicio
    ? daysSince(item.inicio, { inclusive: true })
    : null;
  const isSuspended = item.__isCurrent === false || Boolean(item.termino && item.termino <= localTodayIso());
  return {
    name: canonicalName || '—',
    nameWithCourse: item.inicio
      ? `${canonicalName || '—'} (FI: ${formatClinicalDate(item.inicio)}${item.hora_inicio ? ` ${item.hora_inicio}` : ''} · ${preAntibioticTreatmentDays(item) ?? '—'} día${preAntibioticTreatmentDays(item) === 1 ? '' : 's'}${item.termino ? ' totales' : ''})`
      : `${canonicalName || '—'} (FI: no registrada)`,
    dose: dose || 'Dosis no registrada',
    isSuspended,
    statusLabel: isSuspended ? 'Suspendido' : 'Vigente',
    treatmentDays: preAntibioticTreatmentDays(item),
    duration: item.termino
      ? `FI: ${formatClinicalDate(item.inicio)}${item.hora_inicio ? ` ${item.hora_inicio}` : ''} · FT: ${formatClinicalDate(item.termino)} (${preAntibioticTreatmentDays(item) ?? '—'} días totales)`
      : duration
        ? `FI: ${formatClinicalDate(item.inicio)}${item.hora_inicio ? ` ${item.hora_inicio}` : ''} (${preAntibioticTreatmentDays(item)} día${preAntibioticTreatmentDays(item) === 1 ? '' : 's'})`
        : 'Fecha de inicio no registrada',
  };
}

function getChronologicalAntimicrobials(record) {
  const courses = new Map();
  const latestForm = record?.evolutions?.[0]?.form || {};
  const deletedNames = new Set((latestForm.antibioticos_eliminados || []).map((name) => normalizeMedicationName(name)));
  const latestDatedNames = new Set((Array.isArray(latestForm.antibioticos) ? latestForm.antibioticos : [])
    .filter((item) => item?.nombre && item?.inicio)
    .map((item) => normalizeMedicationName(canonicalAntibioticName(item.nombre))));
  [...(record?.evolutions || [])].reverse().forEach((evolution) => {
    const form = evolution?.form || {};
    (Array.isArray(form.antibioticos) ? form.antibioticos : [])
      .filter((item) => item?.nombre)
      .forEach((item) => {
        const normalizedName = normalizeMedicationName(canonicalAntibioticName(item.nombre));
        if (deletedNames.has(normalizedName)) return;
        // Un registro antiguo sin fecha y uno vigente fechado del mismo fármaco
        // corresponden al mismo esquema corregido, no a dos tratamientos.
        if (!item.inicio && form !== latestForm && latestDatedNames.has(normalizedName)) return;
        const key = `${normalizedName}|${item.inicio || 'sin-fecha'}`;
        const previous = courses.get(key) || {};
        courses.set(key, { ...previous, ...item, __sourceForm: form });
      });
  });
  const currentCourseKeys = new Set((Array.isArray(latestForm.antibioticos) ? latestForm.antibioticos : [])
    .filter((item) => item?.nombre)
    .map((item) => `${normalizeMedicationName(canonicalAntibioticName(item.nombre))}|${item.inicio || 'sin-fecha'}`));
  return [...courses.entries()].map(([key, item]) => ({
    ...item,
    __isCurrent: currentCourseKeys.has(key),
  })).sort((a, b) => {
    const aIsSuspended = a.__isCurrent === false || Boolean(a.termino && a.termino <= localTodayIso());
    const bIsSuspended = b.__isCurrent === false || Boolean(b.termino && b.termino <= localTodayIso());
    if (aIsSuspended !== bIsSuspended) return aIsSuspended ? 1 : -1;
    if (a.inicio && b.inicio && a.inicio !== b.inicio) return b.inicio.localeCompare(a.inicio);
    if (a.inicio && !b.inicio) return -1;
    if (!a.inicio && b.inicio) return 1;
    if (a.termino && b.termino && a.termino !== b.termino) return b.termino.localeCompare(a.termino);
    return String(a.nombre).localeCompare(String(b.nombre), 'es');
  });
}

function recordOccupiesDateRange(record, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true;
  const form = getLatestProaForm(record) || {};
  const admission = form.fecha_ingreso || '';
  if (!admission) return false;
  const discharge = isHistoricalProaRecord(record)
    ? (form.fecha_egreso || String(form.proa_archived_at || record.updatedAt || '').slice(0, 10))
    : '';
  if (dateTo && admission && admission > dateTo) return false;
  if (dateFrom && discharge && discharge < dateFrom) return false;
  return true;
}

function isPositiveCulture(culture) {
  if (culture?.estado_resultado && culture.estado_resultado !== 'positivo') return false;
  const pathogen = String(culture?.patogeno || '').trim();
  if (!pathogen) return false;
  return !/(^|\b)(pendiente|sin desarrollo|sin crecimiento|no desarrollo|negativ[oa]|no detectado|est[ée]ril)(\b|$)/i.test(pathogen);
}

function formatCultureDiagnosis(culture) {
  const pathogen = String(culture?.patogeno || '').trim();
  if (!pathogen) return '';
  const sensitivity = String(culture?.sensibilidad || '').trim();
  const resistant = Array.isArray(culture?.resistente) ? culture.resistente.filter(Boolean) : [];
  const susceptible = Array.isArray(culture?.sensible) ? culture.sensible.filter(Boolean) : [];
  const intermediate = Array.isArray(culture?.intermedio) ? culture.intermedio.filter(Boolean) : [];
  const notes = [culture?.antibiograma_nota, culture?.antibiograma].filter(Boolean).join(' · ');
  const additionalNote = String(culture?.antibiograma_nota || (
    resistant.length === 0 && susceptible.length === 0 && intermediate.length === 0
      ? culture?.antibiograma || ''
      : ''
  )).trim();
  const phenotypeText = [pathogen, sensitivity, notes].join(' ');
  const phenotypePatterns = [
    ['BLEE', /\b(?:BLEE|ESBL)\b/i],
    ['KPC', /\bKPC\b/i],
    ['NDM', /\bNDM\b/i],
    ['OXA-48', /\bOXA[- ]?48\b/i],
    ['VIM', /\bVIM\b/i],
    ['IMP', /\bIMP\b/i],
    ['MRSA', /\bMRSA\b/i],
    ['VRE', /\bVRE\b/i],
    ['XDR', /\bXDR\b/i],
    ['MDR', /\bMDR\b|multidrogo[- ]?resistente/i],
    ['Carbapenemasa', /carbapenemasa/i],
  ];
  const phenotypes = phenotypePatterns
    .filter(([, pattern]) => pattern.test(phenotypeText))
    .map(([label]) => label);
  const details = [];
  if (/multisensible/i.test(`${sensitivity} ${notes}`)) {
    details.push('Multisensible');
  } else if (sensitivity && !/^pendiente$/i.test(sensitivity) && !/no aplica/i.test(sensitivity)) {
    details.push(sensitivity);
  }
  details.push(...phenotypes);
  if (resistant.length) details.push(`Resistente a: ${resistant.join(', ')}`);
  if (intermediate.length) details.push(`Intermedio a: ${intermediate.join(', ')}`);
  if (susceptible.length && !details.includes('Multisensible')) details.push(`Sensible a: ${susceptible.join(', ')}`);
  if (additionalNote) details.push(`Nota: ${additionalNote}`);
  return [pathogen, ...new Set(details)].filter(Boolean).join(' · ');
}

function formatMicrobiologicalDiagnosis(form) {
  const explicitDiagnosis = String(form?.diagnostico_microbiologico || '').trim();
  const cultures = Array.isArray(form?.estudios_micro) ? form.estudios_micro : [];
  const cultureDiagnoses = [...new Set(cultures
    .filter(isPositiveCulture)
    .map(formatCultureDiagnosis)
    .filter(Boolean))];
  if (cultureDiagnoses.length > 0) return cultureDiagnoses.join('; ');
  if (explicitDiagnosis) return explicitDiagnosis;
  const hasPending = cultures.some((culture) => culture?.estado_resultado === 'pendiente' || (!culture?.estado_resultado && (culture?.tipo_muestra || culture?.fecha)));
  const hasNegative = cultures.some((culture) => culture?.estado_resultado === 'negativo' || /negativ|sin desarrollo|sin crecimiento|no detectado/i.test(String(culture?.patogeno || '')));
  if (hasPending) return 'Pendiente de resultado';
  if (hasNegative) return 'Sin aislamiento microbiológico';
  return '—';
}

function isTestProaRecord(record) {
  const form = getLatestProaForm(record) || {};
  return Boolean(form.proa_is_test || form.cama === 'TEST-PROA-1' || record?.bedCode === 'TEST-PROA-1');
}

const TABLE_HEADERS = ['Código PROA', 'Nombre', 'RUT', 'Cama', 'Servicio', 'Estado', 'Fecha de egreso', 'Edad', 'Fecha de ingreso', 'Días de estadía', 'DG', 'Función renal', 'DG microbiológico', 'Estudio', 'Últimos 3 PI', 'Tratamientos antimicrobianos', 'Plan'];
const PRINT_HEADERS = ['Servicio / cama', 'Paciente / estadía', 'Diagnóstico / función renal', 'Tratamientos antimicrobianos', 'Microbiología / estudios', 'Últimos 3 PI', 'Plan'];

function buildProaTableRows(records) {
  return records.map((record) => {
    const form = getLatestProaForm(record) || {};
    const antimicrobials = getChronologicalAntimicrobials(record);
    const formatted = antimicrobials.map((item) => formatAntimicrobial(item));
    const plan = [
      ...(form.recomendaciones || []),
      form.recomendaciones_otra,
      form.plan_duracion,
      form.proxima_revision && `Próxima revisión: ${form.proxima_revision}`,
    ].filter(Boolean).join(' · ');
    return [
      record.code,
      form.paciente || '—',
      form.rut || '—',
      displayBedCode(form.cama || record.bedCode),
      findServiceForBed(form.cama || record.bedCode) || 'Sin servicio',
      isHistoricalProaRecord(record) ? 'Egresado' : 'Actual',
      form.fecha_egreso || '—',
      form.edad ? `${form.edad} años` : '—',
      form.fecha_ingreso || 'Sin fecha',
      hospitalStayDays(form) ?? '—',
      form.diagnostico_actual || '—',
      renalFunctionForRecord(record),
      formatMicrobiologicalDiagnosis(form),
      formatMicroStudies(form),
      getLastInflammatoryRowsForRecord(record).map(formatInflammatoryRow).join('\n') || '—',
      formatted.map((item) => `${item.name}\nPauta: ${item.dose}\n${item.duration}`).join('\n\n') || form.antibioterapia_preingreso || '—',
      plan || '—',
    ];
  });
}

function buildProaPrintRows(records) {
  return records.map((record) => {
    const form = getLatestProaForm(record) || {};
    const antimicrobials = getChronologicalAntimicrobials(record);
    const formatted = antimicrobials.map((item) => formatAntimicrobial(item));
    const identity = [
      form.paciente || record.code,
      form.rut && `RUT ${form.rut}`,
      isHistoricalProaRecord(record) ? `Egresado ${form.fecha_egreso || ''}`.trim() : 'Actual',
    ].filter(Boolean).join('\n');
    const stay = [
      form.edad && `${form.edad} años`,
      form.fecha_ingreso && `Ingreso ${form.fecha_ingreso}`,
      form.fecha_egreso && `Egreso ${form.fecha_egreso}`,
      hospitalStayDays(form) != null && `${hospitalStayDays(form)} días`,
    ].filter(Boolean).join('\n');
    const antibioticText = formatted.length
      ? formatted.map((item) => `${item.name}\n${item.dose}\n${item.duration}`).join('\n\n')
      : '—';
    const microbiology = [
      formatMicrobiologicalDiagnosis(form) !== '—' && formatMicrobiologicalDiagnosis(form),
      formatMicroStudies(form) !== '—' && formatMicroStudies(form),
    ].filter(Boolean).join('\n') || '—';
    const plan = [
      ...(form.recomendaciones || []),
      form.recomendaciones_otra,
      form.plan_duracion,
      form.proxima_revision && `Revisión: ${form.proxima_revision}`,
    ].filter(Boolean).join(' · ') || '—';
    return [
      `${findServiceForBed(form.cama || record.bedCode) || 'Sin servicio'}\nCama ${displayBedCode(form.cama || record.bedCode)}`,
      `${identity}\n${stay || '—'}`,
      `${form.diagnostico_actual || '—'}\n\nFunción renal: ${renalFunctionForRecord(record)}`,
      antibioticText,
      microbiology,
      getLastInflammatoryRowsForRecord(record).map(formatInflammatoryRow).join('\n') || '—',
      plan,
    ];
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function openStoredNotePreview(form, record) {
  const note = form?.nota_evolucion;
  if (!note) return false;
  const title = note.titulo || (note.visita_servicio ? 'Visita servicio Dr. Rubilar' : 'Nota de evolución');
  const sections = [['Diagnóstico(s)', note.diagnostico], ['Anamnesis', note.anamnesis], ['Examen físico', note.examen_fisico], ['Indicaciones', note.indicaciones]].filter(([, value]) => String(value || '').trim());
  const popup = window.open('', '_blank', 'width=900,height=1000');
  if (!popup) return true;
  popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{margin:0;background:#cbd5e1;font-family:Arial,sans-serif;color:#111827}.toolbar{position:sticky;top:0;display:flex;justify-content:flex-end;gap:8px;padding:10px 18px;background:#fff;border-bottom:1px solid #cbd5e1}.toolbar button{border:0;border-radius:7px;background:#0f766e;color:#fff;padding:9px 14px;font-weight:700}.sheet{width:210mm;min-height:297mm;margin:18px auto;background:#fff;padding:16mm;box-shadow:0 4px 18px #33415555}.head{display:flex;align-items:center;gap:14px;border-bottom:2px solid #0f172a;padding-bottom:9px}.head img{width:74px;height:55px;object-fit:contain}.head h1{font-size:18px;text-transform:uppercase}.patient{display:grid;grid-template-columns:1fr 1fr;gap:7px 24px;margin:18px 0;border:1px solid #94a3b8;padding:10px}.section{margin-top:17px}.section h2{font-size:13px;border-bottom:1px solid #94a3b8;padding-bottom:4px}.section p{white-space:pre-wrap;line-height:1.5;font-size:12px}.signature{width:72mm;margin:48px 0 0 auto;text-align:center;border-top:1px solid #111;padding-top:5px;font-size:12px}@media print{body{background:#fff}.toolbar{display:none}.sheet{margin:0;box-shadow:none;width:auto;min-height:0;padding:0}}</style></head><body><div class="toolbar"><button onclick="window.print()">Imprimir / guardar PDF</button></div><article class="sheet"><header class="head"><img src="/logo-hospital.png"><div><h1>${escapeHtml(title)}</h1><p>Hospital Comunitario de Salud Familiar de Bulnes</p></div></header><div class="patient"><p><b>Paciente:</b> ${escapeHtml(form.paciente || '')}</p><p><b>RUT:</b> ${escapeHtml(form.rut || '')}</p><p><b>Servicio / cama:</b> ${escapeHtml(form.servicio || '')} · ${escapeHtml(displayBedCode(form.cama || record?.bedCode))}</p><p><b>Fecha y hora:</b> ${escapeHtml(note.fecha_hora || [form.fecha, form.hora].filter(Boolean).join(' '))}</p></div>${sections.map(([label, value]) => `<section class="section"><h2>${escapeHtml(label)}</h2><p>${escapeHtml(value)}</p></section>`).join('')}<div class="signature"><b>${escapeHtml(note.medico || 'Médico que firma')}</b><br>Firma y timbre</div></article></body></html>`);
  popup.document.close();
  return true;
}

function GestionPROA() {
  const navigate = useNavigate();
  const deepLinkHandled = useRef(false);
  const deepLink = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return { bed: params.get('bed') || '', action: params.get('action') || '' };
  }, []);
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(createPageUrl('Home'));
  };
  const bedMapRef = useRef(null);
  const tableRef = useRef(null);
  const [records, setRecords] = useState(() => readProaRegistry());
  const [selectedBed, setSelectedBed] = useState('');
  const [activeService, setActiveService] = useState(PROA_BED_MAP[0]?.servicio || '');
  const [sourceBedToMove, setSourceBedToMove] = useState('');
  const [showPreAdmission, setShowPreAdmission] = useState(false);
  const [showEvolutionPreview, setShowEvolutionPreview] = useState(false);
  const [editingEvolution, setEditingEvolution] = useState(null);
  const [preAdmissionArchiveOnly, setPreAdmissionArchiveOnly] = useState(false);
  const [recordToView, setRecordToView] = useState(null);
  const [savingPreAdmission, setSavingPreAdmission] = useState(false);
  const [preAdmissionError, setPreAdmissionError] = useState('');
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [deletingRecord, setDeletingRecord] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [recordToArchive, setRecordToArchive] = useState(null);
  const [archivingRecord, setArchivingRecord] = useState(false);
  const [dischargeDate, setDischargeDate] = useState(new Date().toISOString().slice(0, 10));
  const [dischargeDetails, setDischargeDetails] = useState({ motivo: '', destinoServicio: '', destinoCama: '', antibioticStops: {}, antibioticoAlta: '', antibioticoAltaIndicacion: '' });
  const [occupiedRecordForPreAdmission, setOccupiedRecordForPreAdmission] = useState(null);
  const [hospitalAdmissionPrompt, setHospitalAdmissionPrompt] = useState(null);
  const [replacementDischargeDate, setReplacementDischargeDate] = useState(new Date().toISOString().slice(0, 10));
  const [resolvingOccupiedBed, setResolvingOccupiedBed] = useState(false);
  const [tableCopied, setTableCopied] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [renalReviewOpen, setRenalReviewOpen] = useState(false);
  const [printServices, setPrintServices] = useState([]);
  const [tableScope, setTableScope] = useState('actuales');
  const [tableAntibioticFilter, setTableAntibioticFilter] = useState('');
  const [tableBedFilter, setTableBedFilter] = useState('');
  const [tableServiceFilter, setTableServiceFilter] = useState('');
  const [tableDateFrom, setTableDateFrom] = useState('');
  const [tableDateTo, setTableDateTo] = useState('');
  const [showCharts, setShowCharts] = useState(false);
  const [chartsUseTableFilters, setChartsUseTableFilters] = useState(false);
  const [activeArsenal, setActiveArsenal] = useState([]);
  const [arsenalStatus, setArsenalStatus] = useState('loading');
  const [preAdmission, setPreAdmission] = useState({
    servicio: '',
    cama: '',
    paciente: '',
    rut: '',
    edad: '',
    sexo: '',
    diabetes_evaluado: false,
    diabetes: null,
    diabetes_evaluado_en: '',
    diabetes_registro_previo: false,
    creatinina: '',
    fecha_creatinina: '',
    fecha_ingreso: '',
    antibioticos: [{ ...EMPTY_PRE_ANTIBIOTIC }],
    cultivos: [{ ...EMPTY_PRE_CULTURE }],
    diagnostico: '',
    diagnosticos: [''],
    examenes_sangre: [{ ...EMPTY_PRE_BLOOD_TEST }],
    resumen_caso: '',
    estudios_imagen: '',
    plan_duracion: '',
    examenes_complementarios: [{ fecha: '', nombre: '', resultado: '' }],
  });
  const recordsByBed = useMemo(() => (
    records.filter((record) => !isHistoricalProaRecord(record) && isProaEnrolledRecord(record)).reduce((acc, record) => {
      acc[record.bedCode] = record;
      return acc;
    }, {})
  ), [records]);

  const hospitalRecordsByBed = useMemo(() => (
    records.filter((record) => !isHistoricalProaRecord(record) && !isProaEnrolledRecord(record)).reduce((acc, record) => {
      acc[record.bedCode] = record;
      return acc;
    }, {})
  ), [records]);

  const selectedRecord = selectedBed ? recordsByBed[selectedBed] : null;
  const selectedLatest = getLatestProaForm(selectedRecord);
  const viewedLatest = getLatestProaForm(recordToView);
  const currentService = PROA_BED_MAP.find((service) => service.servicio === activeService) || PROA_BED_MAP[0];
  const savedClinicalCatalog = useMemo(() => {
    const diagnoses = new Set();
    const antibiotics = new Set();
    records.forEach((record) => {
      (record.evolutions || []).forEach((evolution) => {
        const form = evolution?.form || {};
        if (typeof form.diagnostico_actual === 'string' && form.diagnostico_actual.trim()) {
          diagnoses.add(form.diagnostico_actual.trim());
        }
        (Array.isArray(form.antibioticos) ? form.antibioticos : []).forEach((item) => {
          if (typeof item?.nombre !== 'string' || !item.nombre.trim()) return;
          antibiotics.add(item.nombre.trim());
        });
      });
    });
    return {
      diagnoses: [...new Set([...DIAGNOSTICOS_INFECTO, ...diagnoses])].sort((a, b) => a.localeCompare(b, 'es')),
      antibiotics: [...new Set([
        ...ANTIBIOTICOS,
        ...antibiotics,
        ...activeArsenal.flatMap((medication) => [medication.name, medication.active_ingredient]).filter(Boolean),
      ])].sort((a, b) => a.localeCompare(b, 'es')),
    };
  }, [activeArsenal, records]);

  const arsenalPresentationsByMedication = useMemo(() => {
    const grouped = new Map();
    activeArsenal.forEach((medication) => {
      const names = [medication.name, medication.active_ingredient]
        .map(normalizeMedicationName)
        .filter(Boolean);
      names.forEach((name) => {
        if (!grouped.has(name)) grouped.set(name, []);
        const label = formatArsenalPresentation(medication);
        if (!label || grouped.get(name).some((item) => item.label === label)) return;
        grouped.get(name).push({
          label,
          unidad: medication.dose_unit || '',
          envase: /comprimido/i.test(medication.presentation || '') ? 'comprimido' : /cápsula/i.test(medication.presentation || '') ? 'cápsula' : /ampolla/i.test(medication.presentation || '') ? 'ampolla' : /bolsa/i.test(medication.presentation || '') ? 'bolsa' : '',
          sourceId: medication.id,
        });
      });
    });
    return grouped;
  }, [activeArsenal]);

  const getAvailablePresentations = (medicationName) => {
    const arsenalOptions = arsenalPresentationsByMedication.get(normalizeMedicationName(medicationName)) || [];
    if (arsenalOptions.length > 0) return { options: arsenalOptions, source: 'arsenal' };
    const localOptions = Array.isArray(PRESENTACIONES_ATB[medicationName]) ? PRESENTACIONES_ATB[medicationName] : [];
    return { options: localOptions, source: 'respaldo' };
  };

  const refreshRecords = () => fetchProaRecords().then((nextRecords) => {
    setRecords(nextRecords);
    return nextRecords;
  });
  const currentRecords = useMemo(() => records.filter((record) => !isHistoricalProaRecord(record) && isProaEnrolledRecord(record)), [records]);
  const historicalRecords = useMemo(() => records.filter((record) => isHistoricalProaRecord(record) && isProaEnrolledRecord(record)), [records]);
  const clinicalRecords = useMemo(() => records.filter((record) => isProaEnrolledRecord(record) && !isTestProaRecord(record)), [records]);
  const currentClinicalRecords = useMemo(
    () => currentRecords.filter((record) => !isTestProaRecord(record)),
    [currentRecords],
  );
  const historicalClinicalRecords = useMemo(
    () => historicalRecords.filter((record) => !isTestProaRecord(record)),
    [historicalRecords],
  );
  const currentTestRecords = currentRecords.length - currentClinicalRecords.length;
  const historicalTestRecords = historicalRecords.length - historicalClinicalRecords.length;
  const visibleTableRecords = useMemo(() => {
    const scoped = tableScope === 'historicos'
      ? historicalClinicalRecords
      : tableScope === 'todos'
        ? clinicalRecords
        : currentClinicalRecords;
    const query = tableAntibioticFilter.trim().toLowerCase();
    return scoped.filter((record) => {
      const form = getLatestProaForm(record) || {};
      const effectiveBed = form.cama || record.bedCode;
      const matchesBed = !tableBedFilter || effectiveBed === tableBedFilter;
      const matchesService = !tableServiceFilter || findServiceForBed(effectiveBed) === tableServiceFilter;
      const matchesAntibiotic = !query || (form.antibioticos || [])
        .some((item) => item?.nombre?.toLowerCase().includes(query));
      return matchesBed
        && matchesService
        && matchesAntibiotic
        && recordOccupiesDateRange(record, tableDateFrom, tableDateTo);
    });
  }, [
    currentRecords,
    currentClinicalRecords,
    historicalRecords,
    historicalClinicalRecords,
    clinicalRecords,
    records,
    tableAntibioticFilter,
    tableBedFilter,
    tableServiceFilter,
    tableDateFrom,
    tableDateTo,
    tableScope,
  ]);
  const tableRows = useMemo(() => buildProaTableRows(visibleTableRecords), [visibleTableRecords]);
  const printableTableRecords = useMemo(
    () => visibleTableRecords
      .filter((record) => !isTestProaRecord(record))
      .sort((a, b) => {
        const formA = getLatestProaForm(a) || {};
        const formB = getLatestProaForm(b) || {};
        const bedA = formA.cama || a.bedCode;
        const bedB = formB.cama || b.bedCode;
        const serviceDifference = proaServiceOrderIndex(findServiceForBed(bedA)) - proaServiceOrderIndex(findServiceForBed(bedB));
        return serviceDifference || bedA.localeCompare(bedB, 'es', { numeric: true });
      }),
    [visibleTableRecords],
  );
  const availablePrintServices = useMemo(() => [...new Set(printableTableRecords.map((record) => {
    const form = getLatestProaForm(record) || {};
    return findServiceForBed(form.cama || record.bedCode) || 'Sin servicio';
  }))].sort((a, b) => proaServiceOrderIndex(a) - proaServiceOrderIndex(b)), [printableTableRecords]);
  const selectedPrintRecords = useMemo(() => printableTableRecords.filter((record) => {
    const form = getLatestProaForm(record) || {};
    return printServices.includes(findServiceForBed(form.cama || record.bedCode) || 'Sin servicio');
  }), [printableTableRecords, printServices]);
  const printRows = useMemo(() => buildProaPrintRows(selectedPrintRecords), [selectedPrintRecords]);
  const openProaPrintPreview = () => {
    setPrintServices(availablePrintServices);
    setShowPrintPreview(true);
  };
  const togglePrintService = (service) => setPrintServices((current) => current.includes(service)
    ? current.filter((item) => item !== service)
    : [...current, service]);
  const groupedTableRecords = useMemo(() => {
    const groups = new Map(PROA_BED_MAP.map((service) => [service.servicio, []]));
    groups.set('Sin servicio', []);
    visibleTableRecords.forEach((record) => {
      const form = getLatestProaForm(record) || {};
      const service = findServiceForBed(form.cama || record.bedCode) || 'Sin servicio';
      if (!groups.has(service)) groups.set(service, []);
      groups.get(service).push(record);
    });
    return [...groups.entries()]
      .filter(([, serviceRecords]) => serviceRecords.length > 0)
      .map(([service, serviceRecords]) => ({
        service,
        records: serviceRecords.sort((a, b) => {
          const bedA = getLatestProaForm(a)?.cama || a.bedCode;
          const bedB = getLatestProaForm(b)?.cama || b.bedCode;
          return bedA.localeCompare(bedB, 'es', { numeric: true });
        }),
      }))
      .sort((a, b) => {
        return proaServiceOrderIndex(a.service) - proaServiceOrderIndex(b.service) || a.service.localeCompare(b.service, 'es');
      });
  }, [visibleTableRecords]);
  const currentProaAnalytics = useMemo(() => {
    const antibioticCounts = new Map();
    const pathogenCounts = new Map();
    let patientsWithAntibiotics = 0;
    let patientsWithPositiveCulture = 0;

    const analyticsRecords = chartsUseTableFilters
      ? visibleTableRecords.filter((record) => !isHistoricalProaRecord(record) && !isTestProaRecord(record))
      : currentClinicalRecords;
    analyticsRecords.forEach((record) => {
      const form = getLatestProaForm(record) || {};
      const antibiotics = (form.antibioticos || []).filter((item) => item?.nombre);
      const positiveCultures = (form.estudios_micro || []).filter(isPositiveCulture);
      if (antibiotics.length > 0) patientsWithAntibiotics += 1;
      if (antibiotics.length > 0 && positiveCultures.length > 0) patientsWithPositiveCulture += 1;
      antibiotics.forEach((item) => {
        const canonicalName = canonicalAntibioticName(item.nombre);
        const presentation = String(item.presentacion || '').trim().replace(/\s+/g, ' ');
        const key = `${normalizeMedicationName(canonicalName)}|${normalizeMedicationName(presentation)}`;
        const current = antibioticCounts.get(key) || { name: canonicalName, presentation, count: 0 };
        antibioticCounts.set(key, { ...current, count: current.count + 1 });
      });
      positiveCultures.forEach((culture) => {
        const pathogen = culture.patogeno.trim();
        pathogenCounts.set(pathogen, (pathogenCounts.get(pathogen) || 0) + 1);
      });
    });

    const totalTreatments = [...antibioticCounts.values()].reduce((sum, item) => sum + item.count, 0);
    const antibiotics = [...antibioticCounts.values()]
      .map(({ name, presentation, count }) => ({
        name: presentation ? `${name} · ${presentation}` : name,
        count,
        percentage: totalTreatments ? Math.round((count / totalTreatments) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);
    const pathogens = [...pathogenCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      antibiotics,
      pathogens,
      patientsWithAntibiotics,
      patientsWithPositiveCulture,
      totalTreatments,
    };
  }, [chartsUseTableFilters, currentClinicalRecords, visibleTableRecords]);

  // Cargar desde Supabase al montar (fuente de verdad, multi-dispositivo).
  useEffect(() => { fetchProaRecords().then(setRecords); }, []);
  useEffect(() => {
    if (deepLinkHandled.current || !deepLink.bed) return;
    if (deepLink.action === 'evolve' && records.length === 0) return;
    const record = records.find(item => !isHistoricalProaRecord(item) && isProaEnrolledRecord(item) && item.bedCode === deepLink.bed);
    setSelectedBed(deepLink.bed);
    setActiveService(findServiceForBed(deepLink.bed));
    if (deepLink.action === 'admit' && !record) {
      const shared = getMultiPrefill() || {};
      const diagnoses = [shared.diagnostico_principal || shared.diagnostico, ...String(shared.diagnostico_desglose || '').split(/\n|;/)].map(item => String(item || '').trim()).filter(Boolean);
      setPreAdmission({
        servicio: findServiceForBed(deepLink.bed), cama: deepLink.bed, paciente: shared.patient_name || '', rut: shared.patient_rut || '', edad: shared.edad || '', sexo: shared.sexo || '',
        diabetes_evaluado: shared.diabetes_evaluado === true, diabetes: shared.diabetes === true, diabetes_evaluado_en: shared.diabetes_evaluado_en || '', diabetes_registro_previo: shared.diabetes_evaluado === true,
        creatinina: '', fecha_creatinina: localTodayIso(), fecha_ingreso: shared.fecha_ingreso || localTodayIso(),
        antibioticos: shared.proa_antibioticos?.length ? shared.proa_antibioticos : [{ ...EMPTY_PRE_ANTIBIOTIC }], cultivos: [{ ...EMPTY_PRE_CULTURE }],
        diagnostico: diagnoses[0] || '', diagnosticos: diagnoses.length ? diagnoses : [''],
        examenes_sangre: shared.proa_examenes?.length ? shared.proa_examenes : [{ ...EMPTY_PRE_BLOOD_TEST }],
        resumen_caso: shared.resumen_caso || '', estudios_imagen: shared.estudios_complementarios || '', plan_duracion: shared.planes_pendientes || '',
        examenes_complementarios: [],
      });
      setShowPreAdmission(true);
    }
    deepLinkHandled.current = true;
    if (deepLink.action === 'evolve' && record) {
      setPreAdmission(preAdmissionFromHospitalRecord(record));
      setPreAdmissionError('');
      setShowEvolutionPreview(false);
      setShowPreAdmission(true);
    }
  }, [deepLink, navigate, records]);
  useEffect(() => {
    let active = true;
    supabase
      .from('medications')
      .select('id,name,active_ingredient,presentation,dose_value,dose_unit,category,restrictions,is_active')
      .eq('is_active', true)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('No fue posible cargar el arsenal vigente para PROA:', error);
          setArsenalStatus('fallback');
          return;
        }
        const antimicrobialRows = (data || []).filter((medication) => {
          const category = normalizeMedicationName(medication.category);
          const names = `${normalizeMedicationName(medication.name)} ${normalizeMedicationName(medication.active_ingredient)}`;
          return /antibi|antimicrob|antifung|antiviral/.test(category)
            || ANTIBIOTICOS.some((item) => names.includes(normalizeMedicationName(item)));
        });
        setActiveArsenal(antimicrobialRows);
        setArsenalStatus('loaded');
      });
    return () => { active = false; };
  }, []);

  const serviceRecordCount = (service) => service.groups.reduce((total, group) => (
    total + group.beds.filter((bed) => recordsByBed[bed]).length
  ), 0);

  const handleServiceChange = (serviceName) => {
    setActiveService(serviceName);
    const nextService = PROA_BED_MAP.find((service) => service.servicio === serviceName);
    const selectedIsVisible = nextService?.groups.some((group) => group.beds.includes(selectedBed));
    if (!selectedIsVisible) setSelectedBed('');
    setSourceBedToMove('');
  };

  const editFromLatest = () => {
    if (!selectedRecord) return;
    setPreAdmission(preAdmissionFromHospitalRecord(selectedRecord));
    setPreAdmissionError('');
    setEditingEvolution(null);
    setShowEvolutionPreview(false);
    setShowPreAdmission(true);
  };

  const openEvolutionEditor = (record, index = 0) => {
    if (!record?.evolutions?.[index]) return;
    setPreAdmission(preAdmissionFromHospitalRecord(record, index));
    setEditingEvolution({ record, index });
    setShowEvolutionPreview(false);
    setPreAdmissionError('');
    setRecordToView(null);
    setShowPreAdmission(true);
  };

  const editExistingEvolution = (index = 0) => openEvolutionEditor(recordToView, index);
  const previewExistingEvolution = (index = 0) => {
    if (!recordToView?.evolutions?.[index]) return;
    if (openStoredNotePreview(recordToView.evolutions[index].form || {}, recordToView)) return;
    setPreAdmission(preAdmissionFromHospitalRecord(recordToView, index));
    setEditingEvolution({ record: recordToView, index });
    setShowEvolutionPreview(true);
    setPreAdmissionError('');
    setRecordToView(null);
    setShowPreAdmission(true);
  };

  const removeExistingEvolution = async (index) => {
    if (!recordToView?.evolutions?.[index]) return;
    const evolution = recordToView.evolutions[index];
    if (!window.confirm(`¿Borrar la evolución del ${formatUpdatedAt(evolution.savedAt)}? Esta acción no se puede deshacer.`)) return;
    try {
      const updated = await deleteProaEvolution(recordToView, index);
      setRecordToView(updated);
      await refreshRecords();
    } catch (error) {
      console.error('Error borrando evolución PROA:', error);
      window.alert(error?.message || 'No fue posible borrar la evolución.');
    }
  };

  const dischargeSelectedFromProa = async () => {
    if (!selectedRecord) return;
    if (!window.confirm('¿Egresar a este paciente de PROA? Continuará hospitalizado y permanecerá visible en Vista General.')) return;
    try {
      await dischargeFromProa(selectedRecord);
      await refreshRecords();
    } catch (error) {
      console.error('Error egresando paciente de PROA:', error);
      window.alert('No fue posible completar el egreso de PROA.');
    }
  };

  const createFromBed = () => {
    if (!selectedBed) return;
    openPreAdmission(selectedBed);
  };

  const preAdmissionFromHospitalRecord = (record, evolutionIndex = 0) => {
    const form = record?.evolutions?.[evolutionIndex]?.form || getLatestProaForm(record) || {};
    const systemLatestCreatinine = latestCreatinineForRecord(record);
    const diagnoses = (Array.isArray(form.diagnosticos_actuales) ? form.diagnosticos_actuales : [])
      .concat([form.diagnostico_principal, form.diagnostico_desglose, form.diagnostico_actual])
      .flatMap((value) => String(value || '').split(/\n|;/))
      .map((value) => value.trim())
      .filter((value, index, items) => value && items.indexOf(value) === index);
    return {
      servicio: findServiceForBed(record.bedCode) || form.servicio || '', cama: record.bedCode,
      paciente: form.paciente || '', rut: form.rut || '', edad: form.edad || '', sexo: form.sexo || '',
      diabetes_evaluado: form.diabetes_evaluado === true, diabetes: form.diabetes_evaluado === true ? form.diabetes === true : null, diabetes_evaluado_en: form.diabetes_evaluado_en || '', diabetes_registro_previo: form.diabetes_evaluado === true,
      fecha_nacimiento: form.fecha_nacimiento || '', direccion: form.direccion || '', comuna: form.comuna || '',
      telefono: form.telefono || '', prevision: form.prevision || '', antecedentes: form.antecedentes || '',
      creatinina: systemLatestCreatinine?.valor || form.creatinina || '', fecha_creatinina: systemLatestCreatinine?.fecha || form.fecha_creatinina || localTodayIso(),
      fecha_ingreso: form.fecha_ingreso || localTodayIso(),
      antibioticos: Array.isArray(form.antibioticos) && form.antibioticos.some((item) => item?.nombre) ? form.antibioticos : [{ ...EMPTY_PRE_ANTIBIOTIC }],
      antibioticos_eliminados: Array.isArray(form.antibioticos_eliminados) ? form.antibioticos_eliminados : [],
      cultivos: Array.isArray(form.estudios_micro) && form.estudios_micro.length ? form.estudios_micro.map((item) => ({ ...EMPTY_PRE_CULTURE, ...item, estado_resultado: item.estado_resultado || (isPositiveCulture({ ...item, estado_resultado: 'positivo' }) ? 'positivo' : /negativ|sin desarrollo|sin crecimiento|no detectado/i.test(String(item.patogeno || '')) ? 'negativo' : 'pendiente') })) : [{ ...EMPTY_PRE_CULTURE }],
      diagnostico: diagnoses[0] || '', diagnosticos: diagnoses.length ? diagnoses : [''],
      examenes_sangre: Array.isArray(form.parametros_inflamatorios) && form.parametros_inflamatorios.length ? form.parametros_inflamatorios : [{ ...EMPTY_PRE_BLOOD_TEST }],
      estudios_imagen: form.estudios_imagen || '', recomendaciones: form.recomendaciones || [], plan_duracion: form.plan_duracion || '',
      evolucion: form.evolucion || '', resumen_caso: form.resumen_caso || '', aislamiento: form.aislamiento || '',
      medico_tratante: form.medico_tratante || form.medico || '', vista_ultima_evolucion: form.vista_ultima_evolucion || '',
      vista_planes_pendientes: form.vista_planes_pendientes || '', vista_plan_alta: form.vista_plan_alta || '',
      vista_estudios_complementarios: form.vista_estudios_complementarios || '',
      examenes_complementarios: Array.isArray(form.examenes_complementarios) && form.examenes_complementarios.length ? form.examenes_complementarios : [{ fecha: '', nombre: '', resultado: '' }],
    };
  };

  const confirmHospitalAdmission = () => {
    if (!hospitalAdmissionPrompt?.record) return;
    const hydrated = preAdmissionFromHospitalRecord(hospitalAdmissionPrompt.record);
    setPreAdmission(hydrated);
    setPreAdmissionError('');
    setHospitalAdmissionPrompt(null);
  };

  const movePatientToSelectedBed = async () => {
    if (!selectedBed || !sourceBedToMove) return;
    await moveProaRecordToBed(sourceBedToMove, selectedBed, findServiceForBed(selectedBed));
    setSourceBedToMove('');
    refreshRecords();
  };

  const scrollToBedMap = () => {
    bedMapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openPreAdmission = (bed = '', { archiveOnly = false } = {}) => {
    const hospitalRecord = hospitalRecordsByBed[bed];
    setPreAdmission({
      servicio: findServiceForBed(bed),
      cama: bed,
      paciente: '',
      rut: '',
      edad: '',
      sexo: '',
      diabetes_evaluado: false,
      diabetes: null,
      diabetes_evaluado_en: '',
      diabetes_registro_previo: false,
      creatinina: '',
      fecha_creatinina: localTodayIso(),
      fecha_ingreso: '',
      antibioticos: [{ ...EMPTY_PRE_ANTIBIOTIC }],
      cultivos: [{ ...EMPTY_PRE_CULTURE }],
      diagnostico: '',
      diagnosticos: [''],
      examenes_sangre: [{ ...EMPTY_PRE_BLOOD_TEST }],
      aislamiento: '',
      evolucion: '',
      resumen_caso: '',
      estudios_imagen: '',
      plan_duracion: '',
      examenes_complementarios: [{ fecha: '', nombre: '', resultado: '' }],
    });
    setPreAdmissionArchiveOnly(archiveOnly);
    setEditingEvolution(null);
    setPreAdmissionError('');
    setShowEvolutionPreview(false);
    setShowPreAdmission(true);
    if (hospitalRecord) setHospitalAdmissionPrompt({ record: hospitalRecord, action: 'admit' });
  };

  const persistPreAdmission = async ({ keepOpen = false, previewAfter = false } = {}) => {
    setSavingPreAdmission(true);
    setPreAdmissionError('');
    try {
      const servicio = findServiceForBed(preAdmission.cama);
      if (editingEvolution) {
        const diagnoses = (preAdmission.diagnosticos || []).filter(Boolean);
        await updateProaEvolution(editingEvolution.record, editingEvolution.index, {
          paciente: preAdmission.paciente, rut: preAdmission.rut, edad: preAdmission.edad, sexo: preAdmission.sexo,
          diabetes_evaluado: preAdmission.diabetes_evaluado === true, diabetes: preAdmission.diabetes === true, diabetes_evaluado_en: preAdmission.diabetes_evaluado_en || new Date().toISOString(),
          servicio, cama: preAdmission.cama, fecha_ingreso: preAdmission.fecha_ingreso,
          diagnostico_principal: diagnoses[0] || '', diagnostico_desglose: diagnoses.slice(1).join('\n'), diagnosticos_actuales: diagnoses, diagnostico_actual: diagnoses.join('; '),
          aislamiento: preAdmission.aislamiento || '', evolucion: preAdmission.evolucion || '', vista_ultima_evolucion: preAdmission.evolucion || '',
          resumen_caso: preAdmission.resumen_caso || '', estudios_imagen: preAdmission.estudios_imagen || '', plan_duracion: preAdmission.plan_duracion || '',
          antibioticos: preAdmission.antibioticos.filter((item) => item.nombre), antibioticos_eliminados: preAdmission.antibioticos_eliminados || [], estudios_micro: preAdmission.cultivos.filter((item) => item.tipo_muestra || item.fecha || item.patogeno),
          parametros_inflamatorios: preAdmission.examenes_sangre.filter((item) => item && Object.entries(item).some(([key, value]) => key !== 'fecha' && String(value ?? '').trim())),
          examenes_complementarios: (preAdmission.examenes_complementarios || []).filter((item) => item.fecha || item.nombre || item.resultado),
        });
      } else await saveProaPreAdmission({ ...preAdmission, servicio });
      if (!keepOpen) {
        setShowPreAdmission(false);
        setEditingEvolution(null);
      } else setPreAdmission((current) => ({ ...current, diabetes_registro_previo: true }));
      if (previewAfter) setShowEvolutionPreview(true);
      setSelectedBed(preAdmission.cama);
      setActiveService(servicio || activeService);
      await refreshRecords();
    } catch (error) {
      console.error('Error guardando preingreso PROA:', error);
      setPreAdmissionError('No fue posible guardar el paciente PROA. Intenta nuevamente.');
    } finally {
      setSavingPreAdmission(false);
    }
  };

  const savePreAdmission = async (options = {}) => {
    if (!preAdmission.cama || !preAdmission.edad || !preAdmission.fecha_ingreso || !(preAdmission.diagnosticos || [preAdmission.diagnostico]).some((item) => item.trim())) {
      setPreAdmissionError('Completa cama, edad, fecha de ingreso y diagnóstico.');
      return;
    }
    if (preAdmission.diabetes_evaluado !== true) {
      setPreAdmissionError('Confirma obligatoriamente si el paciente es diabético. Esta pregunta se guarda sólo la primera vez.');
      return;
    }
    const incompleteAntibiotic = preAdmission.antibioticos.some((item) => (
      item.nombre && (!item.presentacion || !item.dosis_cantidad || !item.intervalo_horas || !item.via || !item.inicio)
    ));
    if (incompleteAntibiotic) {
      setPreAdmissionError('Completa presentación, dosis, frecuencia, vía y fecha de inicio de cada antimicrobiano.');
      return;
    }
    const invalidAntibioticDates = preAdmission.antibioticos.some((item) => (
      item.inicio && item.termino && item.termino < item.inicio
    ));
    if (invalidAntibioticDates) {
      setPreAdmissionError('La fecha de término del antimicrobiano no puede ser anterior a su fecha de inicio.');
      return;
    }
    const occupiedRecord = recordsByBed[preAdmission.cama];
    if (occupiedRecord) {
      const occupiedForm = getLatestProaForm(occupiedRecord) || {};
      const sameRut = String(occupiedForm.rut || '').replace(/[^0-9k]/gi, '').toUpperCase()
        && String(occupiedForm.rut || '').replace(/[^0-9k]/gi, '').toUpperCase() === String(preAdmission.rut || '').replace(/[^0-9k]/gi, '').toUpperCase();
      const sameName = normalizeMedicationName(occupiedForm.paciente) && normalizeMedicationName(occupiedForm.paciente) === normalizeMedicationName(preAdmission.paciente);
      if (sameRut || sameName) {
        await persistPreAdmission(options);
        return;
      }
      setOccupiedRecordForPreAdmission(occupiedRecord);
      setReplacementDischargeDate(new Date().toISOString().slice(0, 10));
      return;
    }
    await persistPreAdmission(options);
  };

  const resolveOccupiedBedAndSave = async (action) => {
    if (!occupiedRecordForPreAdmission) return;
    if (action === 'discharge' && !replacementDischargeDate) {
      setPreAdmissionError('Indica la fecha de egreso del paciente anterior.');
      return;
    }
    setResolvingOccupiedBed(true);
    try {
      if (action === 'delete') await deleteProaRecord(occupiedRecordForPreAdmission.bedCode);
      else await archiveProaRecord(occupiedRecordForPreAdmission, replacementDischargeDate);
      setOccupiedRecordForPreAdmission(null);
      await persistPreAdmission();
    } catch (error) {
      console.error('Error resolviendo cama PROA ocupada:', error);
      setPreAdmissionError('No fue posible resolver el registro anterior. No se guardó el paciente nuevo.');
    } finally {
      setResolvingOccupiedBed(false);
    }
  };

  const updatePreAntibiotic = (index, key, value) => {
    setPreAdmission((current) => ({
      ...current,
      antibioticos: current.antibioticos.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        if (key === 'presentacion') {
          const { options } = getAvailablePresentations(item.nombre);
          const presentationInfo = options.find((option) => option.label === value);
          return {
            ...item,
            presentacion: value,
            presentacion_unidad: presentationInfo?.unidad || item.presentacion_unidad,
            dosis_unidad: presentationInfo?.envase || presentationInfo?.unidad || item.dosis_unidad,
          };
        }
        if (key !== 'nombre') return { ...item, [key]: value };
        const canonicalName = savedClinicalCatalog.antibiotics.find((name) => normalizeMedicationName(name) === normalizeMedicationName(value)) || value;
        const preset = DEFAULT_DOSIS_ATB[canonicalName];
        const { options: availablePresentations } = getAvailablePresentations(canonicalName);
        if (!preset && availablePresentations.length === 0) {
          return { ...item, nombre: canonicalName };
        }
        const presetExistsInArsenal = availablePresentations.some((option) => option.label === preset?.presentacion);
        const presentation = presetExistsInArsenal
          ? preset.presentacion
          : availablePresentations[0]?.label || preset?.presentacion || '';
        const presentationInfo = availablePresentations.find((option) => option.label === presentation);
        return {
          ...item,
          nombre: canonicalName,
          presentacion: presentation,
          presentacion_unidad: presentationInfo?.unidad || preset?.dosis_unidad || item.presentacion_unidad,
          dosis_cantidad: preset?.dosis_cantidad || preset?.unidades_por_dosis || item.dosis_cantidad,
          dosis_unidad: presentationInfo?.envase || (preset?.dosis_modo === 'ampolla' ? 'ampolla' : (preset?.dosis_unidad || item.dosis_unidad)),
          intervalo_horas: preset?.intervalo_horas || item.intervalo_horas,
          via: preset?.via || item.via || 'EV',
        };
      }),
      ...(key === 'nombre' && value ? { antibioticos_eliminados: (current.antibioticos_eliminados || []).filter((name) => normalizeMedicationName(name) !== normalizeMedicationName(value)) } : {}),
    }));
  };

  const addPreAntibiotic = () => setPreAdmission((current) => ({
    ...current,
    antibioticos: [...current.antibioticos, { ...EMPTY_PRE_ANTIBIOTIC }],
  }));

  const removePreAntibiotic = (index) => setPreAdmission((current) => {
    const removedName = current.antibioticos[index]?.nombre;
    return {
      ...current,
      antibioticos: current.antibioticos.length === 1
        ? [{ ...EMPTY_PRE_ANTIBIOTIC }]
        : current.antibioticos.filter((_, itemIndex) => itemIndex !== index),
      antibioticos_eliminados: removedName
        ? [...new Set([...(current.antibioticos_eliminados || []), canonicalAntibioticName(removedName)])]
        : (current.antibioticos_eliminados || []),
    };
  });

  const updatePreCulture = (index, key, value) => setPreAdmission((current) => ({
    ...current,
    cultivos: current.cultivos.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      [key]: value,
      ...(key === 'estado_resultado' && value !== 'positivo' ? { patogeno: '', sensibilidad: value === 'negativo' ? 'No aplica' : 'Pendiente', resistente: [], sensible: [], intermedio: [] } : {}),
    } : item),
  }));
  const togglePreCultureResistance = (index, antibiotic) => setPreAdmission((current) => ({
    ...current,
    cultivos: current.cultivos.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      resistente: (item.resistente || []).includes(antibiotic)
        ? item.resistente.filter(value => value !== antibiotic)
        : [...(item.resistente || []), antibiotic],
    } : item),
  }));

  const addPreCulture = () => setPreAdmission((current) => ({
    ...current,
    cultivos: [...current.cultivos, { ...EMPTY_PRE_CULTURE }],
  }));

  const removePreCulture = (index) => setPreAdmission((current) => ({
    ...current,
    cultivos: current.cultivos.length === 1
      ? [{ ...EMPTY_PRE_CULTURE }]
      : current.cultivos.filter((_, itemIndex) => itemIndex !== index),
  }));

  const updatePreDiagnosis = (index, value) => setPreAdmission((current) => ({
    ...current,
    diagnosticos: current.diagnosticos.map((item, itemIndex) => itemIndex === index ? value : item),
  }));
  const addPreDiagnosis = () => setPreAdmission((current) => ({ ...current, diagnosticos: [...current.diagnosticos, ''] }));
  const removePreDiagnosis = (index) => setPreAdmission((current) => ({
    ...current,
    diagnosticos: current.diagnosticos.length === 1 ? [''] : current.diagnosticos.filter((_, itemIndex) => itemIndex !== index),
  }));
  const updatePreBloodTest = (index, key, value) => setPreAdmission((current) => {
    const examenes_sangre = current.examenes_sangre.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item);
    if (key !== 'crea' && key !== 'fecha') return { ...current, examenes_sangre };
    const sourceRecord = editingEvolution?.record || recordsByBed[current.cama];
    const latest = mergeProaEvolutionLabRows(sourceRecord, examenes_sangre).filter((row) => row.crea !== '' && row.crea != null).at(-1);
    return { ...current, examenes_sangre, creatinina: latest?.crea || '', fecha_creatinina: latest?.fecha || current.fecha_creatinina };
  });
  const updateTopCreatinine = (key, value) => setPreAdmission((current) => {
    const creatinina = key === 'creatinina' ? normalizeCreatinine(value) : current.creatinina;
    const fecha_creatinina = key === 'fecha_creatinina' ? value : current.fecha_creatinina;
    let examenes_sangre = current.examenes_sangre.map((row) => key === 'fecha_creatinina' && row.fecha === current.fecha_creatinina && current.fecha_creatinina !== fecha_creatinina ? { ...row, crea: '' } : row);
    if (fecha_creatinina) {
      const rowIndex = examenes_sangre.findIndex((row) => row.fecha === fecha_creatinina);
      if (rowIndex >= 0) examenes_sangre = examenes_sangre.map((row, index) => index === rowIndex ? { ...row, crea: creatinina } : row);
      else if (creatinina) examenes_sangre = [...examenes_sangre.filter((row) => Object.values(row).some(Boolean)), { ...EMPTY_PRE_BLOOD_TEST, fecha: fecha_creatinina, crea: creatinina }];
    }
    return { ...current, creatinina, fecha_creatinina, examenes_sangre };
  });
  const addPreBloodTest = () => setPreAdmission((current) => ({ ...current, examenes_sangre: [...current.examenes_sangre, { ...EMPTY_PRE_BLOOD_TEST }] }));
  const removePreBloodTest = (index) => setPreAdmission((current) => ({
    ...current,
    examenes_sangre: current.examenes_sangre.length === 1 ? [{ ...EMPTY_PRE_BLOOD_TEST }] : current.examenes_sangre.filter((_, itemIndex) => itemIndex !== index),
  }));
  const updateComplementaryExam = (index, key, value) => setPreAdmission((current) => ({ ...current, examenes_complementarios: current.examenes_complementarios.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
  const addComplementaryExam = () => setPreAdmission((current) => ({ ...current, examenes_complementarios: [...current.examenes_complementarios, { fecha: '', nombre: '', resultado: '' }] }));
  const removeComplementaryExam = (index) => setPreAdmission((current) => ({ ...current, examenes_complementarios: current.examenes_complementarios.length === 1 ? [{ fecha: '', nombre: '', resultado: '' }] : current.examenes_complementarios.filter((_, itemIndex) => itemIndex !== index) }));

  const printProaTable = () => {
    const printWindow = window.open('', '_blank', 'width=1400,height=900');
    if (!printWindow) return;
    const headerHtml = PRINT_HEADERS.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
    const rowsHtml = printRows.map((row) => (
      `<tr>${row.map((cell) => `<td>${escapeHtml(cell).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`
    )).join('');
    printWindow.document.write(`<!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <title>Tabla de pacientes PROA</title>
          <style>
            @page { size: A4 landscape; margin: 6mm; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #0f172a; font-family: Arial, sans-serif; }
            h1 { margin: 0 0 2px; font-size: 15px; }
            .meta { margin: 0 0 3mm; color: #475569; font-size: 8.5px; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            thead { display: table-header-group; }
            th, td { border: .3mm solid #94a3b8; padding: 1.7mm; vertical-align: top; overflow-wrap: anywhere; }
            th { background: #ccfbf1; color: #134e4a; font-size: 7.5px; line-height: 1.15; text-transform: uppercase; }
            td { font-size: 8px; line-height: 1.22; }
            th:nth-child(1), td:nth-child(1) { width: 11%; font-weight: 700; }
            th:nth-child(2), td:nth-child(2) { width: 15%; }
            th:nth-child(3), td:nth-child(3) { width: 17%; }
            th:nth-child(4), td:nth-child(4) { width: 22%; background: #f0fdf4; }
            th:nth-child(5), td:nth-child(5) { width: 15%; }
            th:nth-child(6), td:nth-child(6) { width: 10%; }
            th:nth-child(7), td:nth-child(7) { width: 10%; }
            tr { break-inside: avoid; page-break-inside: avoid; }
          </style>
        </head>
        <body>
          <h1>Tabla de pacientes PROA</h1>
          <p class="meta">Hospital Comunitario de Salud Familiar de Bulnes · ${new Date().toLocaleString('es-CL')}</p>
          <table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>
          <script>window.addEventListener('load', () => { window.print(); });<\/script>
        </body>
      </html>`);
    printWindow.document.close();
    setShowPrintPreview(false);
  };

  const copyProaTable = async () => {
    const clipboardText = [
      TABLE_HEADERS,
      ...tableRows,
    ].map((row) => row.map((cell) => String(cell ?? '').replace(/\t/g, ' ').replace(/\n/g, ' · ')).join('\t')).join('\n');
    try {
      await navigator.clipboard.writeText(clipboardText);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = clipboardText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setTableCopied(true);
    window.setTimeout(() => setTableCopied(false), 2500);
  };

  const confirmDeleteRecord = async () => {
    if (!recordToDelete) return;
    setDeletingRecord(true);
    setDeleteError('');
    try {
      await deleteProaRecord(recordToDelete.bedCode);
      setRecords((current) => current.filter((record) => record.bedCode !== recordToDelete.bedCode));
      if (selectedBed === recordToDelete.bedCode) setSelectedBed('');
      setRecordToDelete(null);
      await refreshRecords();
    } catch (error) {
      console.error('Error eliminando paciente PROA:', error);
      setDeleteError('No fue posible borrar el paciente del servidor. Intenta nuevamente.');
    } finally {
      setDeletingRecord(false);
    }
  };

  const openDischargeDialog = (record) => {
    setDischargeDate(new Date().toISOString().slice(0, 10));
    const activeAntibiotics = getLatestProaForm(record)?.antibioticos || [];
    setDischargeDetails({
      motivo: '', destinoServicio: '', destinoCama: '',
      antibioticStops: Object.fromEntries(activeAntibiotics.map((item, index) => [index, item.termino || ''])),
      antibioticoAlta: '', antibioticoAltaIndicacion: '',
    });
    setRecordToArchive(record);
  };

  const confirmArchiveRecord = async () => {
    if (!recordToArchive || !dischargeDate) return;
    setArchivingRecord(true);
    try {
      await archiveProaRecord(recordToArchive, dischargeDate, dischargeDetails);
      if (selectedBed === recordToArchive.bedCode) setSelectedBed('');
      setRecordToArchive(null);
      await refreshRecords();
      setTableScope('historicos');
    } catch (error) {
      console.error('Error archivando paciente PROA:', error);
    } finally {
      setArchivingRecord(false);
    }
  };

  const modules = [
    {
      title: 'Evolución PROA',
      description: 'Registro imprimible para evolucionar la visita del Programa de Optimización del Uso de Antimicrobianos.',
      icon: ClipboardList,
      color: 'teal',
      status: 'Disponible',
      to: createPageUrl('VisitaPROA'),
    },
    {
      title: 'Pacientes por cama',
      description: 'Mapa navegable con identificación, cama y última Evolución PROA sincronizada.',
      icon: Users,
      color: 'teal',
      status: `${clinicalRecords.length} registros`,
      onClick: scrollToBedMap,
    },
    {
      title: 'Antibióticos y función renal',
      description: 'Calcula VFG/CrCl y revisa ajustes, precauciones y situaciones especiales para uno o varios antimicrobianos.',
      icon: Droplets,
      color: 'teal',
      status: 'Calculadora clínica',
      onClick: () => setRenalReviewOpen(true),
    },
  ];

  const renderCard = (mod, index) => {
    const Icon = mod.icon;
    const available = Boolean(mod.to || mod.onClick);
    const colors = mod.color === 'teal'
      ? {
          border: 'border-teal-200 hover:border-teal-300',
          icon: 'bg-teal-600',
          badge: 'bg-teal-100 text-teal-800 border-teal-200',
          action: 'text-teal-700',
        }
      : {
          border: 'border-slate-200 border-dashed',
          icon: 'bg-slate-100',
          iconText: 'text-slate-500',
          badge: 'bg-slate-100 text-slate-600 border-slate-200',
          action: 'text-slate-500',
        };

    const inner = (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.06 }}
        className={`${moduleCardClass} ${colors.border}`}
      >
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${colors.icon}`}>
            <Icon className={`h-5 w-5 ${colors.iconText || 'text-white'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-slate-900">{mod.title}</p>
              <Badge className={colors.badge}>{mod.status}</Badge>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{mod.description}</p>
            <div className={`mt-4 inline-flex items-center gap-1 text-sm font-semibold ${colors.action}`}>
              {available ? 'Abrir módulo' : 'Preparado para integrar'}
              {available && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
            </div>
          </div>
        </div>
      </motion.div>
    );

    if (mod.to) return (
      <Link key={mod.title} to={mod.to} className="block">
        {inner}
      </Link>
    );

    return mod.onClick ? (
      <button key={mod.title} type="button" onClick={mod.onClick} className="block w-full text-left">
        {inner}
      </button>
    ) : (
      <div key={mod.title}>{inner}</div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50">
      <RenalAntibioticReview open={renalReviewOpen} onClose={() => setRenalReviewOpen(false)} records={clinicalRecords} />
      <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <Button variant="ghost" size="icon" className="rounded-xl" onClick={goBack} title="Volver">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-600">
                <ShieldPlus className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Gestión PROA</h1>
                <p className="text-sm text-slate-500">Seguimiento clínico e identificación exclusiva del módulo PROA</p>
              </div>
            </div>
            <Button onClick={() => selectedRecord ? editFromLatest() : openPreAdmission(selectedBed)} className="gap-2 bg-teal-600 hover:bg-teal-700">
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Nueva evolución PROA</span>
              <span className="sm:hidden">Evolución</span>
            </Button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-3">
          {modules.map(renderCard)}
        </div>

        <section ref={bedMapRef} className="mt-6 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Bed className="h-5 w-5 text-teal-700" />
                Buscar paciente por cama
              </h2>
              <p className="text-sm text-slate-500">Selecciona una cama para revisar el código y retomar la última evolución PROA.</p>
            </div>
            <Button variant="outline" size="sm" onClick={refreshRecords} className="gap-2 self-start sm:self-auto">
              <RotateCw className="h-4 w-4" />
              Actualizar
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <Tabs value={activeService} onValueChange={handleServiceChange} className="space-y-4">
                <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-slate-100 p-1.5">
                  {PROA_BED_MAP.map((service) => (
                    <TabsTrigger
                      key={service.servicio}
                      value={service.servicio}
                      className="gap-2 rounded-lg px-3 py-2 data-[state=active]:bg-white data-[state=active]:text-teal-800"
                    >
                      {service.servicio}
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        {serviceRecordCount(service)}/{service.groups.reduce((total, group) => total + group.beds.length, 0)}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>

                {PROA_BED_MAP.map((service) => (
                  <TabsContent key={service.servicio} value={service.servicio} className="mt-0">
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <p className="font-bold text-slate-800">{service.servicio}</p>
                        <Badge className="border-slate-200 bg-white text-slate-600">
                          {service.groups.reduce((total, group) => total + group.beds.length, 0)} camas
                        </Badge>
                      </div>
                      <div className="space-y-3">
                        {service.groups.map((group) => (
                          <div key={`${service.servicio}-${group.label}`}>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                              {group.beds.map((bed) => {
                                const record = recordsByBed[bed];
                                const hospitalRecord = hospitalRecordsByBed[bed];
                                const selected = selectedBed === bed;
                                const sourceRecord = record || hospitalRecord;
                                const evolutionHover = latestEvolutionHover(sourceRecord);
                                const baseTip = sourceRecord ? bedTooltip(getLatestProaForm(sourceRecord)) : '';
                                const tip = [baseTip, evolutionHover.text].filter(Boolean).join('\n');
                                return (
                                  <div key={bed} className="group relative">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedBed(bed);
                                        setSourceBedToMove('');
                                      }}
                                      className={`w-full min-h-[62px] rounded-xl border px-3 py-2 text-left transition ${
                                        selected
                                          ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-200'
                                          : record
                                            ? 'border-emerald-200 bg-emerald-50 hover:border-emerald-300'
                                            : hospitalRecord
                                              ? 'border-sky-200 bg-sky-50 hover:border-sky-300'
                                            : 'border-slate-200 bg-white hover:border-teal-200 hover:bg-teal-50/40'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="block text-base font-bold text-slate-900">{displayBedCode(bed)}</span>
                                        {record && (
                                          <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Ocupada</span>
                                        )}
                                        {!record && hospitalRecord && (
                                          <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Hospitalizado</span>
                                        )}
                                      </div>
                                      {record || hospitalRecord ? (
                                        <>
                                          <span className={`mt-0.5 block truncate text-xs font-semibold ${record ? 'text-emerald-800' : 'text-sky-800'}`}>
                                            {getLatestProaForm(record || hospitalRecord)?.paciente || (record || hospitalRecord).code}
                                          </span>
                                          {getLatestProaForm(record || hospitalRecord)?.paciente && (
                                            <span className="block truncate text-[9px] text-slate-500">{(record || hospitalRecord).code}</span>
                                          )}
                                          <span className="mt-0.5 block text-[10px] text-slate-500">{record ? formatUpdatedAt(record.updatedAt) : 'Aún no incorporado a PROA'}</span>
                                        </>
                                      ) : (
                                        <span className="mt-1 block text-xs text-slate-400">Libre</span>
                                      )}
                                    </button>
                                    {tip && (
                                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-72 max-w-[85vw] -translate-x-1/2 group-hover:block group-focus-within:block">
                                        <div className={`rounded-lg px-3 py-2 text-left text-[11px] leading-snug text-white shadow-xl ring-1 ring-black/10 ${evolutionHover.isToday ? 'bg-emerald-700' : 'bg-slate-900/95'}`}>
                                          {tip.split('\n').map((line, li) => {
                                            const idx = line.indexOf(':');
                                            const label = idx > -1 ? line.slice(0, idx) : '';
                                            const value = idx > -1 ? line.slice(idx + 1).trim() : line;
                                            return (
                                              <p key={li} className={li > 0 ? 'mt-1' : ''}>
                                                {label && <span className={`font-bold ${evolutionHover.isToday ? 'text-emerald-100' : 'text-emerald-300'}`}>{label}: </span>}
                                                {value}
                                              </p>
                                            );
                                          })}
                                        </div>
                                        <div className={`mx-auto -mt-1 h-2 w-2 rotate-45 ${evolutionHover.isToday ? 'bg-emerald-700' : 'bg-slate-900/95'}`} />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  </TabsContent>
                ))}
              </Tabs>
            </div>

            <aside className="rounded-xl border border-slate-200 bg-slate-50 p-4 lg:sticky lg:top-24 lg:self-start">
              <p className="text-sm font-bold uppercase tracking-wide text-slate-700">Detalle</p>
              {!selectedBed && (
                <p className="mt-3 text-sm leading-relaxed text-slate-500">
                  Elige una cama de {currentService?.servicio} para ver si tiene registro PROA guardado.
                </p>
              )}

              {selectedBed && !selectedRecord && (
                <div className="mt-3 space-y-3">
                  <Badge className="border-slate-200 bg-white text-slate-700">Cama {displayBedCode(selectedBed)}</Badge>
                  {hospitalRecordsByBed[selectedBed] ? <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950"><p className="font-bold">Cama ocupada en Hospitalizados</p><p className="mt-1">{getLatestProaForm(hospitalRecordsByBed[selectedBed])?.paciente || hospitalRecordsByBed[selectedBed].code}</p><p className="mt-1 text-xs text-sky-700">La ficha clínica está disponible, pero el paciente aún no pertenece a PROA.</p></div> : <p className="text-sm text-slate-500">No hay registro PROA asociado a esta cama.</p>}
                  <Button onClick={createFromBed} className="w-full bg-teal-600 hover:bg-teal-700">
                    Agregar y evolucionar paciente
                  </Button>
                  <MovePatientControl
                    records={records}
                    selectedBed={selectedBed}
                    sourceBedToMove={sourceBedToMove}
                    setSourceBedToMove={setSourceBedToMove}
                    onMove={movePatientToSelectedBed}
                    onDelete={(record) => setRecordToDelete(record)}
                  />
                </div>
              )}

              {selectedRecord && (
                <div className="mt-3 space-y-4">
                  <div className="rounded-lg border border-emerald-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Identificación PROA</p>
                    <p className="mt-1 text-2xl font-black text-emerald-800">{selectedRecord.code}</p>
                    {selectedLatest?.paciente && <p className="mt-2 font-bold text-slate-900">{selectedLatest.paciente}</p>}
                    {selectedLatest?.rut && <p className="text-sm text-slate-600">RUT {selectedLatest.rut}</p>}
                    {selectedLatest?.edad && <p className="text-sm text-slate-600">{selectedLatest.edad} años</p>}
                    <p className="mt-1 text-sm text-slate-500">Cama {displayBedCode(selectedRecord.bedCode)}</p>
                  </div>

                  <div className="space-y-2 text-sm">
                    <p className="flex items-center gap-2 font-medium text-slate-700">
                      <Clock3 className="h-4 w-4 text-slate-500" />
                      Última actualización: {formatUpdatedAt(selectedRecord.updatedAt)}
                    </p>
                    <p className="line-clamp-3 text-xs leading-relaxed text-slate-600">{summarizeLatest(selectedLatest)}</p>
                    {selectedLatest?.evolucion && (
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Última evolución</p>
                        <p className="line-clamp-6 whitespace-pre-wrap text-sm text-slate-700">{selectedLatest.evolucion}</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 rounded-lg border border-teal-200 bg-teal-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-teal-900">¿Qué quieres hacer con esta cama?</p>
                    <Button type="button" onClick={() => setRecordToView(selectedRecord)} variant="outline" className="w-full gap-2 border-sky-300 bg-white text-sky-800 hover:bg-sky-50">
                      <Printer className="h-4 w-4" /> Historia de evoluciones
                    </Button>
                    <Button onClick={editFromLatest} className="w-full bg-teal-600 hover:bg-teal-700">
                      Nueva evolución PROA
                    </Button>
                    <p className="text-[11px] leading-tight text-teal-800">Un único formulario reúne evolución, exámenes, microbiología, antimicrobianos, estudios y plan.</p>
                    <Button type="button" variant="outline" onClick={dischargeSelectedFromProa} className="w-full border-violet-300 bg-white text-violet-800 hover:bg-violet-50">
                      Egresar de PROA
                    </Button>
                    <p className="text-[11px] leading-tight text-violet-700">Finaliza el seguimiento PROA, pero el paciente continúa hospitalizado y visible en Vista General.</p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openDischargeDialog(selectedRecord)}
                      className="w-full border-amber-300 bg-white text-amber-800 hover:bg-amber-50"
                    >
                      Egresar paciente
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setRecordToDelete(selectedRecord)}
                      className="w-full border-red-300 bg-white text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Borrar paciente
                    </Button>
                    <Button
                      type="button"
                      onClick={() => openPreAdmission(selectedBed, { archiveOnly: true })}
                      variant="outline"
                      className="w-full border-slate-400 bg-white font-semibold text-slate-800 hover:bg-slate-100"
                    >
                      Ingresar nuevo paciente
                    </Button>
                    <p className="text-[11px] leading-tight text-slate-600">Al confirmar el nuevo ingreso, el paciente anterior será egresado y conservado en el histórico.</p>
                  </div>

                  <MovePatientControl
                    records={records}
                    selectedBed={selectedBed}
                    sourceBedToMove={sourceBedToMove}
                    setSourceBedToMove={setSourceBedToMove}
                    onMove={movePatientToSelectedBed}
                    onDelete={(record) => setRecordToDelete(record)}
                  />
                </div>
              )}
            </aside>
          </div>
        </section>

        <section ref={tableRef} className="mt-6 scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <FileSpreadsheet className="h-5 w-5 text-teal-700" />
                Tabla de pacientes PROA
              </h2>
              <p className="text-sm text-slate-500">Resumen del último registro por cama. Haz clic en cualquier fila para editar su evolución actual.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={showCharts ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowCharts((current) => !current)}
                className={showCharts ? 'bg-teal-700 hover:bg-teal-800' : ''}
              >
                {showCharts ? 'Ocultar gráficos' : 'Ver gráficos'}
              </Button>
              <Button variant="outline" size="sm" onClick={openProaPrintPreview} disabled={printableTableRecords.length === 0} className="gap-2">
                <Printer className="h-4 w-4" /> Imprimir tabla
              </Button>
              <Button variant="outline" size="sm" onClick={copyProaTable} disabled={visibleTableRecords.length === 0} className="gap-2 border-emerald-300 text-emerald-800">
                <Copy className="h-4 w-4" /> {tableCopied ? 'Tabla copiada' : 'Copiar para Sheets'}
              </Button>
              <Button variant="outline" size="sm" onClick={refreshRecords} className="gap-2">
                <RotateCw className="h-4 w-4" /> Actualizar
              </Button>
            </div>
          </div>

          <div className="grid gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs">Estado del paciente</Label>
              <select value={tableScope} onChange={(event) => setTableScope(event.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                <option value="actuales">
                  Pacientes actuales ({currentClinicalRecords.length}{currentTestRecords ? ` + ${currentTestRecords} prueba` : ''})
                </option>
                <option value="historicos">
                  Pacientes egresados / histórico ({historicalClinicalRecords.length}{historicalTestRecords ? ` + ${historicalTestRecords} prueba` : ''})
                </option>
                <option value="todos">
                  Todos ({clinicalRecords.length}{records.length - clinicalRecords.length ? ` + ${records.length - clinicalRecords.length} prueba` : ''})
                </option>
              </select>
            </div>
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs">Servicio</Label>
              <select value={tableServiceFilter} onChange={(event) => setTableServiceFilter(event.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">Todos los servicios</option>{PROA_BED_MAP.filter((service) => service.servicio !== 'Sala de prueba PROA').map((service) => <option key={service.servicio}>{service.servicio}</option>)}</select>
            </div>
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs">Cama actual o histórica</Label>
              <select
                value={tableBedFilter}
                onChange={(event) => setTableBedFilter(event.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="">Todas las camas</option>
                {ALL_PROA_BEDS.map(({ bed, servicio }) => (
                  <option key={bed} value={bed}>{servicio} · {displayBedCode(bed)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs">Desde</Label>
              <Input
                type="date"
                value={tableDateFrom}
                onChange={(event) => setTableDateFrom(event.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs">Hasta</Label>
              <Input
                type="date"
                min={tableDateFrom || undefined}
                value={tableDateTo}
                onChange={(event) => setTableDateTo(event.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1 lg:col-span-3">
              <Label className="text-xs">Filtrar por antibiótico</Label>
              <Input
                value={tableAntibioticFilter}
                onChange={(event) => setTableAntibioticFilter(event.target.value)}
                placeholder="Ej.: ceftriaxona, meropenem..."
                className="h-9"
              />
            </div>
            {(tableAntibioticFilter || tableBedFilter || tableServiceFilter || tableDateFrom || tableDateTo || tableScope !== 'actuales') && (
              <Button type="button" variant="ghost" size="sm" onClick={() => {
                setTableScope('actuales');
                setTableAntibioticFilter('');
                setTableBedFilter('');
                setTableServiceFilter('');
                setTableDateFrom('');
                setTableDateTo('');
              }} className="lg:col-span-2">Limpiar filtros</Button>
            )}
            <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-12">
              {visibleTableRecords.length} paciente{visibleTableRecords.length === 1 ? '' : 's'} en el listado. El rango muestra pacientes cuya estadía coincidió total o parcialmente con esas fechas.
            </p>
          </div>

          {showCharts && (
            <div className="grid gap-4 border-b border-slate-200 bg-slate-50/60 p-4 lg:grid-cols-12">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 lg:col-span-12">
                <div>
                  <p className="text-sm font-bold text-slate-900">Alcance de los gráficos</p>
                  <p className="text-xs text-slate-500">
                    {chartsUseTableFilters
                      ? 'Solo pacientes actuales que coinciden con los filtros de la tabla.'
                      : 'Resumen global de todos los pacientes actuales.'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setChartsUseTableFilters((current) => !current)}
                >
                  {chartsUseTableFilters ? 'Mostrar todos los actuales' : 'Aplicar filtros de tabla'}
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:col-span-12">
                <div className="rounded-xl border border-teal-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Pacientes actuales con antibióticos</p>
                  <p className="mt-2 text-3xl font-black text-teal-800">{currentProaAnalytics.patientsWithAntibiotics}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Con antibioterapia y cultivo positivo</p>
                  <p className="mt-2 text-3xl font-black text-emerald-700">{currentProaAnalytics.patientsWithPositiveCulture}</p>
                  <p className="text-xs text-slate-500">
                    {currentProaAnalytics.patientsWithAntibiotics
                      ? `${Math.round((currentProaAnalytics.patientsWithPositiveCulture / currentProaAnalytics.patientsWithAntibiotics) * 100)}% de quienes usan antibióticos`
                      : 'Sin pacientes con antibióticos'}
                  </p>
                </div>
                <div className="rounded-xl border border-sky-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Tratamientos antimicrobianos activos</p>
                  <p className="mt-2 text-3xl font-black text-sky-700">{currentProaAnalytics.totalTreatments}</p>
                  <p className="text-xs text-slate-500">Un paciente puede utilizar más de uno.</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-7">
                <h3 className="font-bold text-slate-900">Antibióticos en uso actualmente</h3>
                <p className="mb-3 text-xs text-slate-500">% calculado sobre el total de tratamientos antimicrobianos activos.</p>
                {currentProaAnalytics.antibiotics.length > 0 ? (
                  <div className="grid items-center gap-2 md:grid-cols-[minmax(260px,1fr)_minmax(220px,0.8fr)]">
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={currentProaAnalytics.antibiotics} layout="vertical" margin={{ left: 12, right: 36 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} unit="%" />
                          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(value) => [`${value}%`, 'Uso']} />
                          <Bar dataKey="percentage" radius={[0, 5, 5, 0]}>
                            {currentProaAnalytics.antibiotics.map((item, index) => (
                              <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2">
                      {currentProaAnalytics.antibiotics.map((item, index) => (
                        <div key={item.name} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                            <span className="truncate">{item.name}</span>
                          </span>
                          <strong>{item.percentage}% ({item.count})</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="py-16 text-center text-sm text-slate-500">No hay antibioterapia activa registrada.</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-5">
                <h3 className="font-bold text-slate-900">Cultivos positivos: microorganismos</h3>
                <p className="mb-3 text-xs text-slate-500">Cantidad de aislamientos registrados en pacientes actuales.</p>
                {currentProaAnalytics.pathogens.length > 0 ? (
                  <>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={currentProaAnalytics.pathogens} dataKey="count" nameKey="name" innerRadius={48} outerRadius={82} paddingAngle={2}>
                            {currentProaAnalytics.pathogens.map((item, index) => (
                              <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => [value, 'Aislamientos']} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-1.5">
                      {currentProaAnalytics.pathogens.map((item, index) => (
                        <div key={item.name} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                            <span className="truncate">{item.name}</span>
                          </span>
                          <strong>{item.count}</strong>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="py-16 text-center text-sm text-slate-500">No hay cultivos positivos registrados en pacientes actuales.</p>
                )}
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-[1380px] w-full border-collapse text-xs">
              <thead className="bg-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-600">
                <tr>
                  {['Paciente', 'Cama', 'Edad / ingreso', 'DG', 'Última creatinina', 'DG microbiológico', 'Estudio', 'Últimos 3 PI', 'Tratamientos antimicrobianos', 'Plan'].map((heading, index) => (
                    <th
                      key={heading}
                      className={`border-b border-r border-slate-200 px-3 py-2 font-bold last:border-r-0 ${
                        index === 0 ? 'sticky left-0 z-20 min-w-[190px] bg-slate-100' : ''
                      } ${index === 1 ? 'sticky left-[190px] z-20 min-w-[105px] bg-slate-100 shadow-[3px_0_5px_-4px_rgba(15,23,42,0.45)]' : ''}`}
                    >
                      {heading}
                    </th>
                  ))}
                  <th className="sticky right-0 border-b border-l border-slate-200 bg-slate-100 px-3 py-2 font-bold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {groupedTableRecords.map(({ service, records: serviceRecords }) => (
                  <Fragment key={service}>
                    <tr className="bg-teal-800 text-white">
                      <td colSpan={11} className="border-b border-teal-900 px-4 py-2.5">
                        <span className="font-black uppercase tracking-wide">{service}</span>
                        <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 font-semibold">
                          {serviceRecords.length} paciente{serviceRecords.length === 1 ? '' : 's'}
                        </span>
                      </td>
                    </tr>
                    {serviceRecords.map((record) => {
                      const form = getLatestProaForm(record) || {};
                      const effectiveBed = form.cama || record.bedCode;
                      const antimicrobials = getChronologicalAntimicrobials(record);
                      const formattedAntimicrobials = antimicrobials.map((item) => formatAntimicrobial(item));
                      const piRows = getLastInflammatoryRowsForRecord(record);
                      const latestCrea = latestCreatinineForRecord(record);
                      const plan = [
                        ...(form.recomendaciones || []),
                        form.recomendaciones_otra,
                        form.plan_duracion,
                        form.proxima_revision && `Próxima revisión: ${form.proxima_revision}`,
                      ].filter(Boolean).join(' · ');
                      return (
                    <tr key={record.id} role="button" tabIndex={0} title="Editar evolución actual" onClick={() => openEvolutionEditor(record, 0)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEvolutionEditor(record, 0); } }} className="cursor-pointer align-top odd:bg-white even:bg-slate-50/60 hover:bg-teal-50/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-500">
                      <td className="sticky left-0 z-10 min-w-[190px] border-b border-r border-slate-200 bg-inherit px-3 py-3">
                        <div className="text-left">
                          <span className="block font-bold text-teal-800">{record.code}</span>
                          {form.paciente && <span className="block font-semibold text-slate-900">{form.paciente}</span>}
                          {form.rut && <span className="block text-slate-500">RUT {form.rut}</span>}
                          {form.proa_is_test && <Badge className="mt-1 block w-fit bg-violet-100 text-violet-800">Paciente de prueba · no contabiliza</Badge>}
                          <Badge className={`mt-1 ${isHistoricalProaRecord(record) ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'}`}>
                            {isHistoricalProaRecord(record) ? `Egresado${form.fecha_egreso ? ` · ${form.fecha_egreso}` : ''}` : 'Actual'}
                          </Badge>
                        </div>
                      </td>
                      <td className="sticky left-[190px] z-10 min-w-[105px] border-b border-r border-slate-200 bg-inherit px-3 py-3 shadow-[3px_0_5px_-4px_rgba(15,23,42,0.45)]">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBed(isHistoricalProaRecord(record) ? '' : record.bedCode);
                            setActiveService(findServiceForBed(effectiveBed));
                            scrollToBedMap();
                          }}
                          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-left text-base font-black text-teal-900 hover:bg-teal-100"
                        >
                          {displayBedCode(effectiveBed)}
                        </button>
                      </td>
                      <td className="border-b border-r border-slate-200 px-3 py-3">
                        <span className="block">{form.edad ? `${form.edad} años` : '—'}</span>
                        <span className="text-slate-500">{form.fecha_ingreso || 'Sin fecha'}</span>
                        {form.fecha_egreso && <span className="block font-semibold text-amber-700">Egreso: {form.fecha_egreso}</span>}
                        <span className="mt-1 block font-medium text-slate-700">
                          {hospitalStayDays(form) != null ? `${hospitalStayDays(form)} días de estadía` : 'Estadía sin calcular'}
                        </span>
                      </td>
                      <td className="max-w-[190px] border-b border-r border-slate-200 px-3 py-3">{form.diagnostico_actual || '—'}</td>
                      <td className="max-w-[160px] border-b border-r border-slate-200 px-3 py-3">{latestCrea ? <><strong>{latestCrea.valor} mg/dL</strong>{latestCrea.fecha && <span className="block text-slate-500">{formatClinicalDate(latestCrea.fecha)}</span>}</> : '—'}</td>
                      <td className="max-w-[180px] border-b border-r border-slate-200 px-3 py-3">{formatMicrobiologicalDiagnosis(form)}</td>
                      <td className="max-w-[220px] border-b border-r border-slate-200 px-3 py-3">{formatMicroStudies(form)}</td>
                      <td className="max-w-[240px] border-b border-r border-slate-200 px-3 py-3">
                        {piRows.length ? piRows.map((row, index) => <span key={`${row.fecha}-${index}`} className="mb-1 block">{formatInflammatoryRow(row)}</span>) : '—'}
                      </td>
                      <td className="min-w-[260px] max-w-[320px] border-b border-r border-slate-200 px-3 py-3">
                        {formattedAntimicrobials.length ? (
                          <div className="space-y-2">
                            {formattedAntimicrobials.map((item, index) => (
                              <div
                                key={`${item.nameWithCourse}-${index}`}
                                className={`rounded-lg border px-3 py-2 shadow-sm ${item.isSuspended ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className={`font-bold ${item.isSuspended ? 'text-red-900' : 'text-emerald-900'}`}>{item.name}</p>
                                  <div className="flex shrink-0 flex-col items-end gap-1"><span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${item.isSuspended ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{item.statusLabel}</span>{item.treatmentDays != null && <span className="rounded-md bg-amber-200 px-2 py-1 text-xs font-black text-amber-950">DÍA {item.treatmentDays}</span>}</div>
                                </div>
                                <p className={`mt-0.5 ${item.isSuspended ? 'text-red-800' : 'text-emerald-800'}`}>{item.dose}</p>
                                <p className={`mt-1 border-t pt-1 text-[11px] font-semibold ${item.isSuspended ? 'border-red-200 text-red-700' : 'border-emerald-200 text-emerald-700'}`}>{item.duration}</p>
                              </div>
                            ))}
                          </div>
                        ) : form.antibioterapia_preingreso || '—'}
                      </td>
                      <td className="max-w-[240px] border-b border-slate-200 px-3 py-3">{plan || '—'}</td>
                      <td className="sticky right-0 border-b border-l border-slate-200 bg-white px-2 py-3" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                        <div className="space-y-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setRecordToView(record)}
                            className="h-auto min-h-8 w-full gap-1 whitespace-normal border-sky-300 px-2 py-1.5 text-sky-800 hover:bg-sky-50"
                          >
                            <Printer className="h-3.5 w-3.5 shrink-0" /> Historia de evoluciones
                          </Button>
                          {!isHistoricalProaRecord(record) && (
                            <Button type="button" variant="outline" size="sm" onClick={() => openDischargeDialog(record)} className="h-8 w-full px-2 text-slate-700">
                              Egresar
                            </Button>
                          )}
                          {isHistoricalProaRecord(record) && (
                            <Badge className="w-full justify-center bg-slate-200 py-1.5 text-slate-700">Egresado</Badge>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDeleteError('');
                              setRecordToDelete(record);
                            }}
                            className="h-8 w-full gap-1 border-red-200 px-2 text-red-700 hover:bg-red-50 hover:text-red-800"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Borrar
                          </Button>
                        </div>
                      </td>
                    </tr>
                      );
                    })}
                  </Fragment>
                ))}
                {visibleTableRecords.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-500">No hay pacientes PROA registrados.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <Dialog open={!!recordToView} onOpenChange={(open) => { if (!open) setRecordToView(null); }}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-4xl overflow-x-hidden overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Historia de evoluciones PROA</DialogTitle>
          </DialogHeader>
          <div className="hidden">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-500">Paciente</p>
              <p className="mt-1 font-bold text-slate-900">{viewedLatest?.paciente || recordToView?.code}</p>
              <p className="text-sm text-slate-600">Cama {displayBedCode(viewedLatest?.cama || recordToView?.bedCode)}</p>
              <p className="text-sm text-slate-600">Actualizada: {formatUpdatedAt(recordToView?.updatedAt)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-500">Resumen clínico</p>
              <p className="mt-1 text-sm text-slate-700">{summarizeLatest(viewedLatest) || 'Sin resumen disponible.'}</p>
              {viewedLatest?.funcion_renal && <p className="mt-1 text-sm text-slate-700">{viewedLatest.funcion_renal}</p>}
            </div>
            <div className="rounded-lg border border-slate-200 p-3 sm:col-span-2">
              <p className="mb-2 text-xs font-bold uppercase text-slate-500">Evolución</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{viewedLatest?.evolucion || 'No hay narrativa de evolución registrada; el último registro corresponde al preingreso.'}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs font-bold uppercase text-slate-500">Antibioterapia</p>
              <p className="whitespace-pre-wrap text-sm text-slate-700">
                {(viewedLatest?.antibioticos || []).filter((item) => item?.nombre).map((item) => `${canonicalAntibioticName(item.nombre)}: ${formatAntimicrobial(item).dose}`).join('\n') || '—'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs font-bold uppercase text-slate-500">Microbiología y plan</p>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{formatMicroStudies(viewedLatest)}</p>
              {viewedLatest?.plan_duracion && <p className="mt-2 text-sm font-medium text-slate-800">{viewedLatest.plan_duracion}</p>}
            </div>
          </div>
          <section className="min-w-0 rounded-xl border border-teal-200 bg-teal-50/50 p-3 sm:p-4"><div className="mb-3 min-w-0"><p className="text-xs font-black uppercase tracking-wide text-teal-900">{viewedLatest?.paciente || recordToView?.code}</p><p className="break-words text-sm text-slate-600">Cama {displayBedCode(viewedLatest?.cama || recordToView?.bedCode)} · {(recordToView?.evolutions || []).length} evolución{recordToView?.evolutions?.length === 1 ? '' : 'es'} almacenada{recordToView?.evolutions?.length === 1 ? '' : 's'}</p></div><div className="min-w-0 space-y-2">{(recordToView?.evolutions || []).map((evolution, index) => { const evolutionForm = evolution.form || {}; const previousForm = recordToView.evolutions[index + 1]?.form || {}; const changes = describeEvolutionChanges(evolutionForm, previousForm); const activity = summarizeEvolutionEntry(evolutionForm, previousForm); return <div key={`${evolution.savedAt}-${index}`} className="relative min-w-0 rounded-lg border border-teal-100 bg-white"><Button type="button" size="icon" variant="ghost" title="Borrar evolución" aria-label={`Borrar evolución del ${formatUpdatedAt(evolution.savedAt)}`} onClick={() => removeExistingEvolution(index)} disabled={recordToView.evolutions.length <= 1} className="absolute right-[6.75rem] top-2 z-10 h-8 w-8 text-red-600 hover:bg-red-50 disabled:opacity-30"><Trash2 className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" title="Editar evolución" aria-label={`Editar evolución del ${formatUpdatedAt(evolution.savedAt)}`} onClick={() => editExistingEvolution(index)} className="absolute right-[4.5rem] top-2 z-10 h-8 w-8 text-teal-700 hover:bg-teal-50"><Pencil className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" title="Vista previa / imprimir" aria-label={`Imprimir evolución del ${formatUpdatedAt(evolution.savedAt)}`} onClick={() => previewExistingEvolution(index)} className="absolute right-9 top-2 z-10 h-8 w-8 text-sky-700 hover:bg-sky-50"><Printer className="h-4 w-4" /></Button><details className="group min-w-0" open={index === 0}><summary className="cursor-pointer list-none p-3 pr-36"><div className="min-w-0"><p className="break-words text-sm font-black text-slate-900">{formatUpdatedAt(evolution.savedAt)}</p><p className="mt-0.5 break-words text-xs font-semibold text-teal-700">{index === 0 ? 'Evolución más reciente' : `Evolución anterior ${index}`}</p><div className="mt-2 flex flex-wrap gap-1">{activity.bloodTests > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-800">Exámenes: {activity.bloodTests}</span>}{activity.complementary > 0 && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-800">Estudios: {activity.complementary}</span>}{activity.cultures > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">Cultivos: {activity.cultures}</span>}{activity.antibiotics.map(item => <span key={`${item.name}-${item.action}`} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.action === 'suspendido' ? 'bg-red-50 text-red-800' : item.action === 'indicado' ? 'bg-emerald-100 text-emerald-800' : 'bg-teal-50 text-teal-800'}`}>{item.name}: {item.action}</span>)}</div></div><ChevronDown className="absolute right-3 top-4 h-4 w-4 text-teal-700 transition-transform group-open:rotate-180" /></summary><div className="min-w-0 border-t border-teal-100 p-3"><p className="line-clamp-3 whitespace-pre-wrap break-words text-xs text-slate-600">{evolutionForm.evolucion || evolutionForm.resumen_caso || evolutionForm.diagnostico_actual || 'Sin narrativa clínica.'}</p>{activity.recommendation && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2"><p className="text-[10px] font-black uppercase tracking-wide text-emerald-800">Recomendación final</p><p className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-xs font-medium text-emerald-950">{activity.recommendation}</p></div>}<div className="mt-2 flex flex-wrap gap-1">{changes.filter(change => !/sin cambios estructurales/i.test(change)).map(change => <span key={change} className="max-w-full break-words rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800">{change}</span>)}</div></div></details></div>; })}{!(recordToView?.evolutions || []).length && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">No hay evoluciones almacenadas.</p>}</div></section>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRecordToView(null)}>Cerrar</Button>
            <Button onClick={() => editExistingEvolution(0)} className="bg-teal-700 hover:bg-teal-800">
              Editar evolución más reciente
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPrintPreview} onOpenChange={setShowPrintPreview}>
        <DialogContent className="flex max-h-[94vh] min-w-0 w-[calc(100vw-1rem)] max-w-[96vw] flex-col gap-3 overflow-x-hidden p-4 sm:p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-teal-700" />
              Vista previa de impresión — Tabla PROA
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
            <span>{selectedPrintRecords.length} paciente{selectedPrintRecords.length === 1 ? '' : 's'} · A4 horizontal · pacientes de prueba excluidos</span>
            <span>La impresión combina campos relacionados para aprovechar mejor cada página.</span>
          </div>
          <div className="rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black uppercase tracking-wide text-teal-900">Servicios a imprimir</p><div className="flex gap-1"><Button type="button" variant="ghost" size="sm" onClick={() => setPrintServices(availablePrintServices)} className="h-7 text-xs text-teal-800">Seleccionar todos</Button><Button type="button" variant="ghost" size="sm" onClick={() => setPrintServices([])} className="h-7 text-xs text-slate-600">Limpiar</Button></div></div>
            <div className="flex flex-wrap gap-2">{availablePrintServices.map((service) => <label key={service} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${printServices.includes(service) ? 'border-teal-400 bg-white text-teal-800' : 'border-slate-200 bg-white/60 text-slate-500'}`}><input type="checkbox" checked={printServices.includes(service)} onChange={() => togglePrintService(service)} className="h-3.5 w-3.5 accent-teal-700" />{service}</label>)}</div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-300 bg-white">
            <table className="min-w-[1150px] w-full table-fixed border-collapse text-[11px] leading-snug">
              <thead className="sticky top-0 z-10 bg-teal-100 text-left uppercase text-teal-950">
                <tr>
                  {PRINT_HEADERS.map((header, index) => (
                    <th
                      key={header}
                      className="border-b border-r border-slate-300 px-2 py-2 last:border-r-0"
                      style={{ width: `${[11, 15, 17, 22, 15, 10, 10][index]}%` }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {printRows.map((row, rowIndex) => (
                  <tr key={`${row[0]}-${rowIndex}`} className="align-top even:bg-slate-50">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className={`whitespace-pre-line border-b border-r border-slate-200 px-2 py-2 last:border-r-0 ${cellIndex === 0 ? 'font-bold text-teal-900' : ''} ${cellIndex === 3 ? 'bg-emerald-50/60' : ''}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {printRows.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Selecciona al menos un servicio para generar la vista previa.</p>}
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 pt-3">
            <Button type="button" variant="outline" onClick={() => setShowPrintPreview(false)}>Cerrar</Button>
            <Button type="button" onClick={printProaTable} disabled={printRows.length === 0} className="gap-2 bg-teal-700 hover:bg-teal-800">
              <Printer className="h-4 w-4" />
              Imprimir esta vista
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPreAdmission} onOpenChange={(open) => { setShowPreAdmission(open); if (!open) setEditingEvolution(null); }}>
        <DialogContent
          className="max-h-[92vh] min-w-0 w-[calc(100vw-1rem)] max-w-5xl overflow-x-hidden overflow-y-auto p-4 sm:p-6"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-teal-700" />
                {editingEvolution ? 'Editar evolución PROA guardada' : 'Evolución PROA · ingreso y seguimiento'}
              </DialogTitle>
              <Button type="button" variant="outline" onClick={() => setShowEvolutionPreview((current) => !current)} className="gap-2 border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100">
                <Printer className="h-4 w-4" />
                {showEvolutionPreview ? 'Ocultar vista previa' : 'Vista previa'}
              </Button>
            </div>
          </DialogHeader>
          <div className="grid gap-x-4 gap-y-3 md:grid-cols-12">
            <div className="space-y-1.5 md:col-span-3">
              <Label htmlFor="proa-pre-service">Servicio *</Label>
              <select id="proa-pre-service" value={preAdmission.servicio || ''} onChange={(event) => setPreAdmission((current) => ({ ...current, servicio: event.target.value, cama: '' }))} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Seleccionar servicio…</option>
                {PROA_BED_MAP.map((service) => <option key={service.servicio} value={service.servicio}>{service.servicio}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 md:col-span-3">
              <Label htmlFor="proa-pre-bed">Cama *</Label>
              <select
                id="proa-pre-bed"
                value={preAdmission.cama}
                disabled={!preAdmission.servicio}
                onChange={(event) => {
                  const bed = event.target.value;
                  setPreAdmission((current) => ({ ...current, cama: bed }));
                  setPreAdmissionError('');
                  if (hospitalRecordsByBed[bed]) setHospitalAdmissionPrompt({ record: hospitalRecordsByBed[bed], action: 'admit' });
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{preAdmission.servicio ? 'Seleccionar cama…' : 'Primero selecciona un servicio'}</option>
                {ALL_PROA_BEDS.filter(({ servicio }) => servicio === preAdmission.servicio).map(({ bed }) => <option key={bed} value={bed}>{displayBedCode(bed)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="proa-pre-age">Edad *</Label>
              <Input id="proa-pre-age" type="number" min="0" max="120" value={preAdmission.edad} onChange={(event) => setPreAdmission((current) => ({ ...current, edad: event.target.value }))} />
            </div>
            <div className="space-y-1.5 md:col-span-4">
              <Label htmlFor="proa-pre-name">Nombre del paciente</Label>
              <Input
                id="proa-pre-name"
                value={preAdmission.paciente}
                onChange={(event) => setPreAdmission((current) => ({ ...current, paciente: event.target.value }))}
                placeholder="Nombre y apellidos"
              />
            </div>
            <div className="space-y-1.5 md:col-span-3">
              <Label htmlFor="proa-pre-rut">RUT</Label>
              <Input
                id="proa-pre-rut"
                value={preAdmission.rut}
                onChange={(event) => setPreAdmission((current) => ({ ...current, rut: formatProaRut(event.target.value) }))}
                placeholder="12.345.678-9"
              />
            </div>
            <p className="text-[11px] text-slate-500 md:col-span-12">
              Nombre, RUT y edad se guardan exclusivamente en Gestión/Evolución PROA.
            </p>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 md:col-span-12"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-sky-900">Diabetes · verificación inicial *</p><p className="text-[11px] text-sky-700">Obligatoria en la primera atención PROA; la respuesta queda guardada.</p></div>{preAdmission.diabetes_evaluado === true && <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-sky-900 ring-1 ring-sky-300">Registrado: {preAdmission.diabetes ? 'Sí' : 'No'}</span>}</div>{!preAdmission.diabetes_registro_previo && <div className="mt-3 flex gap-2">{[['Sí', true], ['No', false]].map(([label, value]) => <button key={label} type="button" onClick={() => setPreAdmission(current => ({ ...current, diabetes_evaluado: true, diabetes: value, diabetes_evaluado_en: current.diabetes_evaluado_en || new Date().toISOString() }))} className={`rounded-lg border px-4 py-2 text-sm font-bold ${preAdmission.diabetes_evaluado === true && preAdmission.diabetes === value ? 'border-sky-500 bg-sky-700 text-white' : 'border-sky-200 bg-white text-sky-800'}`}>{label}</button>)}</div>}</div>
            <div className="space-y-1.5 md:col-span-3">
              <Label htmlFor="proa-pre-sex">Sexo para cálculo de VFG</Label>
              <select
                id="proa-pre-sex"
                value={preAdmission.sexo}
                onChange={(event) => setPreAdmission((current) => ({ ...current, sexo: event.target.value }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Seleccionar...</option>
                <option value="femenino">Femenino</option>
                <option value="masculino">Masculino</option>
              </select>
            </div>
            <div className="space-y-1.5 md:col-span-3">
              <Label htmlFor="proa-pre-creatinine">Creatinina sérica (mg/dL)</Label>
              <Input
                id="proa-pre-creatinine"
                type="text"
                inputMode="decimal"
                value={preAdmission.creatinina}
                onChange={(event) => updateTopCreatinine('creatinina', event.target.value)}
                placeholder="Ej.: 1,20 o 1.20"
              />
            </div>
            <div className="space-y-1.5 md:col-span-3"><Label htmlFor="proa-pre-creatinine-date">Fecha de creatinina</Label><Input id="proa-pre-creatinine-date" type="date" value={preAdmission.fecha_creatinina || ''} onChange={(event) => updateTopCreatinine('fecha_creatinina', event.target.value)} /><p className="text-[10px] text-slate-500">Se sincroniza automáticamente con la curva de exámenes.</p></div>
            <div className="flex items-end md:col-span-3">
              <div className="w-full rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                {preAdmission.creatinina
                  ? buildRenalFunctionText(preAdmission)
                  : 'Al ingresar creatinina, edad y sexo se calculará automáticamente la VFG.'}
              </div>
            </div>
            <div className="space-y-1.5 md:col-span-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="proa-pre-date">Fecha de ingreso *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreAdmission((current) => ({ ...current, fecha_ingreso: localTodayIso() }))}
                  className="h-6 px-2 text-xs text-teal-700 hover:bg-teal-50"
                >
                  Hoy
                </Button>
              </div>
              <Input id="proa-pre-date" type="date" value={preAdmission.fecha_ingreso} onChange={(event) => setPreAdmission((current) => ({ ...current, fecha_ingreso: event.target.value }))} />
            </div>
            <div className="space-y-1.5 md:col-span-9">
              <div className="flex items-center justify-between"><Label>Diagnósticos *</Label><Button type="button" variant="outline" size="sm" onClick={addPreDiagnosis} className="h-8 gap-1"><Plus className="h-3.5 w-3.5" /> Agregar diagnóstico</Button></div>
              <div className="space-y-2">{preAdmission.diagnosticos.map((diagnosis, index) => <div key={index} className="flex gap-2"><Input list="proa-pre-diagnoses" value={diagnosis} onChange={(event) => updatePreDiagnosis(index, event.target.value)} placeholder="Buscar diagnóstico" /><Button type="button" variant="ghost" size="icon" onClick={() => removePreDiagnosis(index)} className="shrink-0 text-red-600"><Trash2 className="h-4 w-4" /></Button></div>)}</div>
              <datalist id="proa-pre-diagnoses">
                {savedClinicalCatalog.diagnoses.map((diagnosis) => <option key={diagnosis} value={diagnosis} />)}
              </datalist>
              <p className="text-[11px] text-slate-500">Incluye el catálogo de Evolución PROA y los diagnósticos previamente guardados.</p>
            </div>
            <div className="space-y-1.5 md:col-span-12"><Label>Aislamiento / precauciones</Label><Input list="proa-isolation-types" value={preAdmission.aislamiento || ''} onChange={(event) => setPreAdmission((current) => ({ ...current, aislamiento: event.target.value }))} placeholder="Seleccionar o escribir…" /><datalist id="proa-isolation-types">{ISOLATION_TYPES.map(item => <option key={item} value={item} />)}</datalist></div>
            <div className="space-y-1.5 md:col-span-12"><Label>Evolución actual</Label><textarea value={preAdmission.evolucion || ''} onChange={(event) => setPreAdmission((current) => ({ ...current, evolucion: event.target.value }))} className="min-h-28 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Cambios clínicos y estado actual observados en esta evaluación" /></div>
            <div className="space-y-1.5 md:col-span-12"><Label>Resumen clínico</Label><textarea value={preAdmission.resumen_caso || ''} onChange={(event) => setPreAdmission((current) => ({ ...current, resumen_caso: event.target.value }))} className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Síntesis general vigente del cuadro clínico" /></div>
            <div className="space-y-1.5 md:col-span-12"><Label>Estudios complementarios</Label><textarea value={preAdmission.estudios_imagen || ''} onChange={(event) => setPreAdmission((current) => ({ ...current, estudios_imagen: event.target.value }))} className="min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Imagenología, procedimientos y otros estudios relevantes" /></div>
            <div className="space-y-1.5 md:col-span-12"><Label>Plan sugerido</Label><textarea value={preAdmission.plan_duracion || ''} onChange={(event) => setPreAdmission((current) => ({ ...current, plan_duracion: event.target.value }))} className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Conducta antimicrobiana, duración, controles y próxima revisión" /></div>
            <div className="space-y-1.5 md:col-span-12">
              <div className="flex items-center justify-between">
                <Label>Antibioterapia vigente</Label>
                <Button type="button" variant="outline" size="sm" onClick={addPreAntibiotic} className="h-8 gap-1">
                  <Plus className="h-3.5 w-3.5" /> Agregar
                </Button>
              </div>
              <div className="space-y-2">
                {preAdmission.antibioticos.map((item, index) => {
                  const { options: presentationCatalog, source: presentationSource } = getAvailablePresentations(item.nombre);
                  const presentationOptions = presentationCatalog
                    .map((presentation) => presentation?.label)
                    .filter((label) => typeof label === 'string' && label);
                  const normalizedQuery = String(item.nombre || '').trim().toLocaleLowerCase('es');
                  const antibioticMatches = normalizedQuery
                    ? savedClinicalCatalog.antibiotics
                      .filter((antibiotic) => antibiotic.toLocaleLowerCase('es').includes(normalizedQuery))
                      .slice(0, 8)
                    : [];
                  const showAntibioticMatches = antibioticMatches.length > 0
                    && !(antibioticMatches.length === 1 && antibioticMatches[0] === item.nombre);
                  return (
                    <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Antimicrobiano {index + 1}</p>
                        <Button type="button" variant="outline" size="sm" onClick={() => removePreAntibiotic(index)} className="h-8 gap-1 border-red-200 bg-white text-red-700 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" /> Eliminar registrado
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-12">
                        <div className="relative space-y-1 lg:col-span-4">
                          <Label className="text-[11px]">Antibiótico</Label>
                          <Input
                            value={item.nombre}
                            onChange={(event) => updatePreAntibiotic(index, 'nombre', event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') event.preventDefault();
                            }}
                            placeholder="Escribir antimicrobiano"
                            autoComplete="off"
                          />
                          {showAntibioticMatches && (
                            <select
                              size={Math.min(antibioticMatches.length, 4)}
                              value=""
                              onChange={(event) => {
                                if (event.target.value) updatePreAntibiotic(index, 'nombre', event.target.value);
                              }}
                              className="w-full rounded-md border border-teal-200 bg-white p-1 text-sm text-slate-700 shadow-sm"
                              aria-label={`Coincidencias de antimicrobiano ${index + 1}`}
                            >
                              {antibioticMatches.map((antibiotic) => (
                                <option key={antibiotic} value={antibiotic} className="rounded px-2 py-1.5">
                                  {antibiotic}
                                </option>
                              ))}
                            </select>
                          )}
                          <p className="text-[10px] text-slate-500">Escribe para buscar; selecciona una coincidencia para precargar la pauta.</p>
                        </div>
                        <div className="space-y-1 lg:col-span-8">
                          <Label className="text-[11px]">Presentación disponible</Label>
                          <Input
                            value={item.presentacion}
                            onChange={(event) => updatePreAntibiotic(index, 'presentacion', event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') event.preventDefault();
                            }}
                            placeholder="Ej.: Frasco ampolla 4,5 g"
                            autoComplete="off"
                          />
                          {presentationOptions.length > 0 && (
                            <div className="space-y-1 pt-1">
                              <div className="flex flex-wrap gap-1.5">
                                {presentationOptions.map((presentation) => (
                                  <button
                                    key={presentation}
                                    type="button"
                                    onClick={() => updatePreAntibiotic(index, 'presentacion', presentation)}
                                    className={`rounded-md border px-2 py-1 text-left text-[10px] transition-colors ${
                                      item.presentacion === presentation
                                        ? 'border-teal-400 bg-teal-50 font-bold text-teal-900'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50'
                                    }`}
                                  >
                                    {presentation}
                                  </button>
                                ))}
                              </div>
                              <p className={`text-[10px] ${presentationSource === 'arsenal' ? 'text-emerald-700' : 'text-amber-700'}`}>
                                {presentationSource === 'arsenal'
                                  ? 'Presentación obtenida del arsenal vigente.'
                                  : arsenalStatus === 'loading'
                                    ? 'Cargando arsenal vigente…'
                                    : 'Catálogo local de respaldo; no se encontró presentación activa en arsenal.'}
                              </p>
                            </div>
                          )}
                          {item.nombre && presentationOptions.length === 0 && (
                            <p className="text-[10px] text-amber-700">Sin formato precargado: ingrésalo manualmente.</p>
                          )}
                        </div>
                        <div className="space-y-1 lg:col-span-4">
                          <Label className="text-[11px]">Dosis por administración</Label>
                          <div className="flex">
                            <Input type="number" min="0" step="0.1" value={item.dosis_cantidad} onChange={(event) => updatePreAntibiotic(index, 'dosis_cantidad', event.target.value)} className="rounded-r-none" placeholder="Ej.: 4,5 o 1" />
                            <select value={item.dosis_unidad} onChange={(event) => updatePreAntibiotic(index, 'dosis_unidad', event.target.value)} className="h-10 rounded-r-md border border-l-0 border-input bg-white px-2 text-sm">
                              {['g', 'mg', 'MUI', 'UI', 'comprimido', 'cápsula', 'ampolla', 'frasco ampolla', 'bolsa'].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="space-y-1 lg:col-span-3">
                          <Label className="text-[11px]">Frecuencia</Label>
                          <Input list="proa-pre-frequencies" value={item.intervalo_horas} onChange={(event) => updatePreAntibiotic(index, 'intervalo_horas', event.target.value)} placeholder="Horas, ej.: 8" />
                        </div>
                        <div className="space-y-1 lg:col-span-2">
                          <Label className="text-[11px]">Vía</Label>
                          <select value={item.via} onChange={(event) => updatePreAntibiotic(index, 'via', event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                            {['EV', 'VO', 'IM', 'SC', 'Inhalado'].map((via) => <option key={via} value={via}>{via}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1 lg:col-span-3">
                          <Label className="text-[11px]">Fecha de inicio</Label>
                          <Input type="date" value={item.inicio} onChange={(event) => updatePreAntibiotic(index, 'inicio', event.target.value)} />
                        </div>
                        <div className="space-y-1 lg:col-span-2">
                          <Label className="text-[11px]">Hora de inicio (opcional)</Label>
                          <Input
                            type="time"
                            value={item.hora_inicio || ''}
                            onChange={(event) => updatePreAntibiotic(index, 'hora_inicio', event.target.value)}
                            disabled={!item.inicio}
                          />
                        </div>
                        <div className="space-y-1 lg:col-span-3">
                          <Label className="text-[11px]">Fecha de término (opcional)</Label>
                          <div className="flex gap-1.5">
                            <Input type="date" min={item.inicio || undefined} value={item.termino || ''} onChange={(event) => updatePreAntibiotic(index, 'termino', event.target.value)} />
                            {item.termino && <Button type="button" variant="outline" size="sm" onClick={() => updatePreAntibiotic(index, 'termino', '')} className="h-10 shrink-0 border-red-200 px-2 text-xs text-red-700 hover:bg-red-50">Borrar fecha</Button>}
                          </div>
                          <p className="text-[10px] text-slate-500">Déjala vacía mientras el tratamiento esté vigente.</p>
                        </div>
                        <div className="flex items-end lg:col-span-2">
                          <div className="w-full rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-center text-xs font-bold text-teal-900">
                            {preAntibioticTreatmentDays(item) != null
                              ? item.termino
                                ? `${preAntibioticTreatmentDays(item)} días totales`
                                : `Día ${preAntibioticTreatmentDays(item)} de tratamiento`
                              : 'Días —'}
                          </div>
                        </div>
                        <div className="flex items-end lg:col-span-4">
                          <p className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">{formatPreAntibiotic(item) || 'Completa el esquema antibiótico.'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <datalist id="proa-pre-frequencies">
                {['4', '6', '8', '12', '24', '48'].map((hours) => <option key={hours} value={hours}>{`Cada ${hours} horas`}</option>)}
              </datalist>
              <p className="text-[11px] text-slate-500">La presentación y pauta se precargan cuando existen; todos los campos permanecen editables.</p>
            </div>

            <div className="space-y-1.5 md:col-span-12">
              <div className="flex items-center justify-between"><Label>Exámenes de sangre</Label><Button type="button" variant="outline" size="sm" onClick={addPreBloodTest} className="h-8 gap-1"><Plus className="h-3.5 w-3.5" /> Agregar control</Button></div>
              <div className="space-y-2">{preAdmission.examenes_sangre.map((exam, index) => <div key={index} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 sm:grid-cols-[150px_repeat(4,minmax(90px,1fr))_36px]"><Input type="date" value={exam.fecha} onChange={(event) => updatePreBloodTest(index, 'fecha', event.target.value)} /><Input value={exam.pcr} onChange={(event) => updatePreBloodTest(index, 'pcr', event.target.value)} placeholder="PCR" /><Input value={exam.pct} onChange={(event) => updatePreBloodTest(index, 'pct', event.target.value)} placeholder="PCT" /><Input value={exam.leucocitos} onChange={(event) => updatePreBloodTest(index, 'leucocitos', event.target.value)} placeholder="Leucocitos" /><Input value={exam.crea} onChange={(event) => updatePreBloodTest(index, 'crea', event.target.value)} placeholder="Creatinina" /><Button type="button" variant="ghost" size="icon" onClick={() => removePreBloodTest(index)} className="text-red-600"><Trash2 className="h-4 w-4" /></Button></div>)}</div>
            </div>

            <div className="space-y-1.5 md:col-span-12"><div className="flex items-center justify-between"><div><Label>Exámenes complementarios</Label><p className="text-[11px] text-slate-500">TAC, ecografías, radiografías, procedimientos y otros resultados.</p></div><Button type="button" variant="outline" size="sm" onClick={addComplementaryExam} className="h-8 gap-1"><Plus className="h-3.5 w-3.5" /> Agregar examen</Button></div><div className="space-y-2">{preAdmission.examenes_complementarios.map((exam, index) => <div key={index} className="grid gap-2 rounded-lg border border-sky-200 bg-sky-50/50 p-2 sm:grid-cols-[140px_minmax(180px,1fr)_2fr_36px]"><Input type="date" value={exam.fecha} onChange={(event) => updateComplementaryExam(index, 'fecha', event.target.value)} /><Input list="proa-complementary-studies" value={exam.nombre} onChange={(event) => updateComplementaryExam(index, 'nombre', event.target.value)} placeholder="Seleccionar o escribir estudio" /><Input value={exam.resultado} onChange={(event) => updateComplementaryExam(index, 'resultado', event.target.value)} placeholder="Resultado, hallazgo o estado" /><Button type="button" variant="ghost" size="icon" onClick={() => removeComplementaryExam(index)} className="text-red-600"><Trash2 className="h-4 w-4" /></Button></div>)}</div><datalist id="proa-complementary-studies">{COMPLEMENTARY_STUDIES.map(study => <option key={study} value={study} />)}</datalist></div>

            <div className="space-y-1.5 md:col-span-12">
              <div className="flex items-center justify-between">
                <Label>Cultivos (opcional)</Label>
                <Button type="button" variant="outline" size="sm" onClick={addPreCulture} className="h-8 gap-1">
                  <Plus className="h-3.5 w-3.5" /> Agregar cultivo
                </Button>
              </div>
              <div className="space-y-2">
                {preAdmission.cultivos.map((culture, index) => (
                  <div key={index} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]"><Input list="proa-pre-samples" value={culture.tipo_muestra} onChange={(event) => updatePreCulture(index, 'tipo_muestra', event.target.value)} placeholder="Tipo de muestra" /><Input type="date" value={culture.fecha} onChange={(event) => updatePreCulture(index, 'fecha', event.target.value)} /><Button type="button" variant="ghost" size="icon" onClick={() => removePreCulture(index)} className="h-10 w-9 text-red-600"><Trash2 className="h-4 w-4" /></Button></div>
                    <div><Label className="mb-1 block text-[11px]">Resultado microbiológico</Label><div className="flex flex-wrap gap-2">{[['pendiente','Pendiente'],['negativo','Negativo'],['positivo','Positivo / microorganismo']].map(([status,label]) => <button key={status} type="button" onClick={() => updatePreCulture(index, 'estado_resultado', status)} className={`rounded-lg border px-3 py-2 text-xs font-bold ${culture.estado_resultado === status ? status === 'positivo' ? 'border-rose-400 bg-rose-100 text-rose-900' : status === 'negativo' ? 'border-emerald-400 bg-emerald-100 text-emerald-900' : 'border-amber-400 bg-amber-100 text-amber-900' : 'border-slate-200 bg-white text-slate-600'}`}>{label}</button>)}</div></div>
                    {culture.estado_resultado === 'positivo' && <Input list="proa-pre-pathogens" value={culture.patogeno} onChange={(event) => updatePreCulture(index, 'patogeno', event.target.value)} placeholder="Microorganismo aislado" />}
                    {culture.estado_resultado === 'positivo' && culture.patogeno && <details className="rounded-md border border-rose-200 bg-white"><summary className="cursor-pointer px-3 py-2 text-xs font-bold text-rose-800">Resistente a{(culture.resistente || []).length ? ` (${culture.resistente.length})` : ''}</summary><div className="grid max-h-52 gap-1 overflow-y-auto border-t border-rose-100 p-3 sm:grid-cols-2 lg:grid-cols-3">{ANTIBIOTICOS.map(antibiotic => <label key={antibiotic} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-rose-50"><input type="checkbox" checked={(culture.resistente || []).includes(antibiotic)} onChange={() => togglePreCultureResistance(index, antibiotic)} className="accent-rose-700" />{antibiotic}</label>)}</div></details>}
                    {culture.estado_resultado === 'negativo' && <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">Resultado negativo / sin desarrollo. Se registra, pero no se contabiliza como patógeno.</p>}
                    {culture.estado_resultado === 'pendiente' && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Cultivo pendiente de resultado.</p>}
                  </div>
                ))}
              </div>
              <datalist id="proa-pre-samples">{TIPOS_MUESTRA.map((sample) => <option key={sample} value={sample} />)}</datalist>
              <datalist id="proa-pre-pathogens">{PATOGENOS.map((pathogen) => <option key={pathogen} value={pathogen} />)}</datalist>
            </div>
          </div>
          {showEvolutionPreview && <div className="proa-evolution-print mx-auto w-full max-w-[210mm] overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm"><ProaEvolutionDocument form={{ ...preAdmission, diagnostico_actual: (preAdmission.diagnosticos || []).filter(Boolean).join('\n'), examenes_sangre: mergeProaEvolutionLabRows(editingEvolution?.record || recordsByBed[preAdmission.cama], preAdmission.examenes_sangre) }} /></div>}
          {preAdmissionError && <p className="text-sm font-medium text-red-600">{preAdmissionError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { setShowPreAdmission(false); setEditingEvolution(null); }}>Cancelar</Button>
            {showEvolutionPreview && <Button type="button" variant="outline" onClick={printProaEvolutionPreview}><Printer className="mr-1 h-4 w-4" />Imprimir / PDF</Button>}
            <Button type="button" variant="outline" onClick={() => savePreAdmission({ keepOpen: true, previewAfter: true })} disabled={savingPreAdmission} className="border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100">Guardar y vista previa</Button>
            <Button type="button" onClick={() => savePreAdmission()} disabled={savingPreAdmission} className="bg-teal-600 hover:bg-teal-700">
              {savingPreAdmission ? 'Guardando…' : editingEvolution ? 'Guardar cambios' : 'Guardar evolución PROA'}
            </Button>
          </div>
          <style>{`@media print{body *{visibility:hidden!important}.proa-evolution-print,.proa-evolution-print *{visibility:visible!important}.proa-evolution-print{position:absolute!important;inset:0!important;width:100%!important;border:0!important;box-shadow:none!important}}`}</style>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!recordToDelete} onOpenChange={(open) => {
        if (!open && !deletingRecord) {
          setRecordToDelete(null);
          setDeleteError('');
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar paciente PROA?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el paciente PROA <strong>{getLatestProaForm(recordToDelete)?.paciente || recordToDelete?.code}</strong> de la cama{' '}
              <strong>{displayBedCode(recordToDelete?.bedCode)}</strong>, incluyendo su preingreso y todas sus evoluciones PROA.
              Esta acción se replicará inmediatamente en la tabla y en el mapa de camas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm font-medium text-red-600">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingRecord}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmDeleteRecord();
              }}
              disabled={deletingRecord}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deletingRecord ? 'Borrando…' : 'Sí, borrar paciente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!recordToArchive} onOpenChange={(open) => {
        if (!open && !archivingRecord) setRecordToArchive(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Egresar paciente PROA?</AlertDialogTitle>
            <AlertDialogDescription>
              El paciente PROA <strong>{getLatestProaForm(recordToArchive)?.paciente || recordToArchive?.code}</strong> dejará de ocupar la cama{' '}
              <strong>{displayBedCode(recordToArchive?.bedCode)}</strong>. Su preingreso y evoluciones se conservarán en el archivo de pacientes egresados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="proa-discharge-date">Fecha de egreso *</Label>
            <Input id="proa-discharge-date" type="date" value={dischargeDate} onChange={(event) => setDischargeDate(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Motivo de egreso *</Label>
            <select value={dischargeDetails.motivo} onChange={(event) => setDischargeDetails((current) => ({ ...current, motivo: event.target.value }))} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
              <option value="">Seleccionar motivo…</option>
              {DISCHARGE_REASONS.map((reason) => <option key={reason}>{reason}</option>)}
            </select>
          </div>
          {dischargeDetails.motivo === 'Traslado a otro servicio' && <div className="grid gap-3 sm:grid-cols-2"><div><Label className="mb-1.5 block">Servicio de destino</Label><Input value={dischargeDetails.destinoServicio} onChange={(event) => setDischargeDetails((current) => ({ ...current, destinoServicio: event.target.value }))} placeholder="Ej.: MQ2" /></div><div><Label className="mb-1.5 block">Cama de destino</Label><Input value={dischargeDetails.destinoCama} onChange={(event) => setDischargeDetails((current) => ({ ...current, destinoCama: event.target.value }))} placeholder="Ej.: 2-4" /></div></div>}
          {(getLatestProaForm(recordToArchive)?.antibioticos || []).some((item) => item?.nombre) && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-bold text-amber-950">Antimicrobianos al egreso</p>{(getLatestProaForm(recordToArchive)?.antibioticos || []).map((item, index) => item?.nombre && <div key={`${item.nombre}-${index}`} className="grid items-end gap-2 sm:grid-cols-[1fr_170px]"><div className="text-sm font-semibold text-slate-800">{item.nombre}</div><div><Label className="mb-1 block text-[11px]">Fecha de cese</Label><Input type="date" min={item.inicio || undefined} value={dischargeDetails.antibioticStops[index] || ''} onChange={(event) => setDischargeDetails((current) => ({ ...current, antibioticStops: { ...current.antibioticStops, [index]: event.target.value } }))} className="bg-white" /></div></div>)}</div>}
          <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><Label className="text-emerald-950">Antimicrobiano de alta (opcional)</Label><Input value={dischargeDetails.antibioticoAlta} onChange={(event) => setDischargeDetails((current) => ({ ...current, antibioticoAlta: event.target.value }))} list="proa-pre-antibiotics" placeholder="Nombre del antimicrobiano" className="bg-white" /><Input value={dischargeDetails.antibioticoAltaIndicacion} onChange={(event) => setDischargeDetails((current) => ({ ...current, antibioticoAltaIndicacion: event.target.value }))} placeholder="Dosis, vía, frecuencia y duración" className="bg-white" /></div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archivingRecord}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmArchiveRecord();
              }}
              disabled={archivingRecord || !dischargeDate || !dischargeDetails.motivo}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {archivingRecord ? 'Egresando…' : 'Confirmar egreso'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!occupiedRecordForPreAdmission} onOpenChange={(open) => {
        if (!open && !resolvingOccupiedBed) setOccupiedRecordForPreAdmission(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>La cama {displayBedCode(preAdmission.cama)} ya está ocupada en PROA</AlertDialogTitle>
            <AlertDialogDescription>
              Actualmente está asociada a <strong>{getLatestProaForm(occupiedRecordForPreAdmission)?.paciente || occupiedRecordForPreAdmission?.code}</strong>.
              {preAdmissionArchiveOnly
                ? ' Para ingresar al paciente nuevo se egresará al anterior y se conservará todo su historial.'
                : ' Antes de ingresar al paciente nuevo debes decidir qué hacer con el registro anterior.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Label htmlFor="proa-replacement-discharge-date">Fecha de egreso del paciente anterior</Label>
            <Input
              id="proa-replacement-discharge-date"
              type="date"
              value={replacementDischargeDate}
              onChange={(event) => setReplacementDischargeDate(event.target.value)}
              className="bg-white"
            />
            <p className="text-xs text-amber-800">“Egresar y conservar” libera la cama y mantiene todo el historial en el archivo.</p>
          </div>
          <AlertDialogFooter className="sm:justify-between">
            <AlertDialogCancel disabled={resolvingOccupiedBed}>Cancelar</AlertDialogCancel>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {!preAdmissionArchiveOnly && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => resolveOccupiedBedAndSave('delete')}
                  disabled={resolvingOccupiedBed}
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  Eliminar registro anterior
                </Button>
              )}
              <Button
                type="button"
                onClick={() => resolveOccupiedBedAndSave('discharge')}
                disabled={resolvingOccupiedBed || !replacementDischargeDate}
                className="bg-amber-600 text-white hover:bg-amber-700"
              >
                {resolvingOccupiedBed ? 'Procesando…' : 'Egresar y conservar'}
              </Button>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!hospitalAdmissionPrompt} onOpenChange={() => {}}>
        <AlertDialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Cama {displayBedCode(hospitalAdmissionPrompt?.record?.bedCode)} ocupada con paciente hospitalizado</AlertDialogTitle>
            <AlertDialogDescription>
              La plataforma ya dispone de información de esta hospitalización. Debes decidir si deseas incorporar este paciente al registro PROA.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {hospitalAdmissionPrompt?.record && (() => {
            const form = getLatestProaForm(hospitalAdmissionPrompt.record) || {};
            const labs = Array.isArray(form.parametros_inflamatorios) ? form.parametros_inflamatorios.length : 0;
            const cultures = Array.isArray(form.estudios_micro) ? form.estudios_micro.length : 0;
            return <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
              <p className="text-base font-black">{form.paciente || hospitalAdmissionPrompt.record.code}</p>
              <p><strong>RUT:</strong> {form.rut || 'No registrado'} · <strong>Edad:</strong> {form.edad ? `${form.edad} años` : 'No registrada'}</p>
              <p><strong>Ingreso:</strong> {form.fecha_ingreso || 'Sin fecha'} · <strong>Servicio/cama:</strong> {findServiceForBed(hospitalAdmissionPrompt.record.bedCode)} · {displayBedCode(hospitalAdmissionPrompt.record.bedCode)}</p>
              <p><strong>Diagnóstico:</strong> {form.diagnostico_principal || form.diagnostico_actual || 'No registrado'}</p>
              <p className="text-xs text-sky-700">Se cargarán los antecedentes disponibles, incluidos datos demográficos, diagnósticos, {labs} control{labs === 1 ? '' : 'es'} de laboratorio y {cultures} cultivo{cultures === 1 ? '' : 's'}.</p>
            </div>;
          })()}
          <AlertDialogFooter>
            <Button type="button" variant="outline" onClick={() => {
              if (hospitalAdmissionPrompt?.action === 'admit') setPreAdmission((current) => ({ ...current, cama: '' }));
              setHospitalAdmissionPrompt(null);
            }}>No, no agregar</Button>
            <Button type="button" onClick={confirmHospitalAdmission} className="bg-teal-700 text-white hover:bg-teal-800">Sí, agregar paciente a PROA</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MovePatientControl({ records, selectedBed, sourceBedToMove, setSourceBedToMove, onMove, onDelete }) {
  const movableRecords = records.filter((record) => !isHistoricalProaRecord(record) && record.bedCode !== selectedBed);
  const selectedSourceRecord = movableRecords.find((record) => record.bedCode === sourceBedToMove);
  if (!selectedBed || movableRecords.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Mover paciente desde otra cama</p>
      <select
        value={sourceBedToMove}
        onChange={(event) => setSourceBedToMove(event.target.value)}
        className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm focus:border-teal-400 focus:outline-none"
      >
        <option value="">Seleccionar cama origen...</option>
        {movableRecords.map((record) => (
          <option key={record.id} value={record.bedCode}>
            {displayBedCode(record.bedCode)} · {record.code}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        onClick={onMove}
        disabled={!sourceBedToMove}
        className="w-full"
      >
        Mover a cama {displayBedCode(selectedBed)}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => onDelete(selectedSourceRecord)}
        disabled={!selectedSourceRecord}
        className="w-full border-red-300 text-red-700 hover:bg-red-50"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Eliminar paciente seleccionado
      </Button>
      <p className="text-[11px] leading-relaxed text-slate-500">
        Puedes mover el paciente a esta cama o eliminar completamente su registro PROA. La eliminación siempre solicitará confirmación.
      </p>
    </div>
  );
}

export default conAccesoMedispense(GestionPROA);
