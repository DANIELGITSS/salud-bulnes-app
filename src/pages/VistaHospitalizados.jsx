import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useNavigate } from 'react-router-dom';
import { Activity, Apple, BedDouble, Calculator, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardList, FileText, FlaskConical, HeartHandshake, Image, LayoutGrid, List, LogOut, Microscope, Pencil, Pill, Plus, Printer, Save, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { conAccesoMedispense } from '@/components/MedispenseAccess';
import { ALL_BEDS } from '@/components/agenda-diaria/bedCatalog';
import { setMultiPrefill } from '@/lib/multiTemplatePrefill';
import { archiveProaRecord, fetchProaRecords, getLatestProaForm, isHistoricalProaRecord, isProaEnrolledRecord, saveProaPreAdmission, saveProaRecord } from '@/lib/proaRegistry';
import { buildRenalFunctionText } from '@/lib/renalFunction';
import { HOSPITAL_REGISTRY_UPDATED_EVENT } from '@/lib/hospitalNrsRegistry';
import { createPageUrl } from '@/utils';
import { ANTIBIOTICOS, DEFAULT_DOSIS_ATB, PRESENTACIONES_ATB, TIPOS_MUESTRA } from '@/pages/VisitaPROA';
import { allCalculators, calculatorReferences } from '@/components/calculators/catalog';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import HospitalCareDocuments from '@/components/hospitalizados/HospitalCareDocuments';
import NRS2002Calculator from '@/components/calculators/NRS2002Calculator';
import HospitalLabCurvePreview from '@/components/hospitalizados/HospitalLabCurvePreview';
import HospitalMedicalReports from '@/components/hospitalizados/HospitalMedicalReports';
import ProaEvolutionDocument from '@/components/visita-proa/ProaEvolutionDocument';
import { emptyHospitalLabRow, HOSPITAL_LAB_FIELDS, HOSPITAL_LAB_GROUPS, LAB_FIELD_BY_EXAM } from '@/components/hospitalizados/hospitalLabCatalog';
import { parseLabReportText } from '@/pages/CurvaExamenes';

const STORAGE_KEY = 'vista_general_hospitalizados_v1';
const SELECTED_BED_KEY = 'vista_general_hospitalizados_selected_bed';
const RETURN_TO_BED_KEY = 'vista_general_hospitalizados_return_to_bed';
const EMPTY = {
  nombre: '', rut: '', fechaNacimiento: '', edad: '', sexo: '', nFicha: '', prevision: '', telefono: '', direccion: '', comuna: '',
  fechaIngreso: '', diagnosticoPrincipal: '', diagnostico: '', antecedentes: '', antibioterapia: '', antibioticos: [], aislamiento: '', medicoTratante: '', observaciones: '',
  resumenCaso: '', ultimaEvolucion: '', planProa: '', planesPendientes: '', planesAmbitos: [], planAlta: '', estudiosComplementarios: '', estudiosDetalle: [], patogenoAislado: '', ultimoLaboratorio: '',
  ultimaEvolucionActualizadaEn: '',
  signosVitales: '', oxigenoterapiaTipo: '', oxigenoterapiaCantidad: '', drogasVasoactivas: '', soporteClinico: '',
  letIndicacion: '', iotIndicacion: '', rcpIndicacion: '', pacienteSocial: false, escalas: [], evaluacionesNutricionales: [], historialActualizaciones: [],
  informesMedicos: [], cultivos: [],
  reingresoEvaluado: false, reingresoMenor30: false, reingresoFechaEgresoPrevia: '', reingresoEvaluadoEn: '',
};

const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
const textarea = `${input} min-h-24 resize-y`;
const EMPTY_QUICK_ATB = { nombre: '', presentacion: '', dosis_cantidad: '', dosis_unidad: 'mg', intervalo_horas: '', via: 'EV', inicio: '', termino: '' };
const PRINT_SERVICE_OPTIONS = [
  { value: 'MQ1', label: 'MQ1' },
  { value: 'MQ2', label: 'MQ2' },
  { value: 'PED', label: 'Pediatría' },
  { value: 'GINE', label: 'Gineco-Obstetricia' },
  { value: 'HODOM', label: 'HODOM' },
];
const PRINT_SERVICE_ORDER = new Map(PRINT_SERVICE_OPTIONS.map((option, index) => [option.value, index]));
const DISCHARGE_REASONS = ['Alta médica', 'Fallecimiento', 'Traslado a otro servicio', 'Traslado a otro establecimiento', 'Hospitalización domiciliaria', 'Otro'];
const ISOLATION_TYPES = ['Sin aislamiento', 'Contacto', 'Gotitas', 'Aéreo', 'Contacto + gotitas', 'Contacto + aéreo', 'Protector / neutropénico', 'Otro'];
const PLAN_AMBITOS = ['Cardiología', 'Cirugía', 'Broncopulmonar', 'Hemodinamia', 'Medio interno', 'Diabetes', 'Nefrología', 'Nutrición', 'Otro'];
const EMPTY_PLAN_AMBITO = { ambito: '', plan: '' };

function printPreviewElement(selector, title) {
  const container = document.querySelector(selector);
  if (!container) return;
  // Se toma solo el documento en sí, no el contenedor de la vista previa en pantalla
  // (que trae borde, sombra y recorte propios del modal y distorsionaban la impresión).
  const documentElement = container.querySelector('.proa-evolution-document') || container;
  const popup = window.open('', '_blank', 'width=900,height=1100');
  if (!popup) return;
  popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><style>
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#e2e8f0}.proa-preview-toolbar{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 18px;background:#fff;border-bottom:1px solid #cbd5e1;font-family:Arial,sans-serif}.proa-preview-toolbar p{margin:0;color:#475569;font-size:13px}.proa-preview-toolbar button{border:0;border-radius:8px;background:#0f766e;color:#fff;padding:10px 16px;font-weight:800;cursor:pointer}.proa-evolution-document{width:190mm!important;max-width:calc(100vw - 32px)!important;min-height:0!important;margin:18px auto!important;background:#fff!important;box-shadow:0 6px 24px #33415555!important}.proa-document-table{table-layout:fixed!important}.proa-document-table th,.proa-document-table td{overflow-wrap:anywhere!important}.proa-chart,.proa-chart>div,.recharts-responsive-container{width:100%!important;max-width:100%!important}.recharts-wrapper,.recharts-surface{max-width:100%!important}.proa-signature{margin:6mm 0 0 auto;width:72mm;text-align:center}.proa-signature div{height:22mm;border-bottom:1px solid #111}.proa-signature p{margin:5px 0;font-size:12px}
    @page{size:A4 portrait;margin:10mm}@media print{html,body{background:#fff!important;width:auto!important}.proa-preview-toolbar{display:none!important}.proa-evolution-document{width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;box-shadow:none!important}.proa-document-block,.proa-chart{break-inside:avoid;page-break-inside:avoid}}
  </style></head><body><div class="proa-preview-toolbar"><p>Vista previa de la evolución PROA. Revise el contenido antes de imprimir.</p><button type="button" onclick="window.print()">Imprimir / guardar PDF</button></div>${documentElement.outerHTML}<footer class="proa-signature"><div></div><p><strong>Firma y timbre del profesional</strong></p></footer></body></html>`);
  popup.document.close();
}

function printGenericHospitalSnapshot(snapshot, patient, bed) {
  const popup = window.open('', '_blank', 'width=900,height=1000');
  if (!popup) return;
  const safe = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);
  const sections = [['Diagnósticos', snapshot.diagnosticoPrincipal || snapshot.diagnostico], ['Antecedentes relevantes', snapshot.antecedentes], ['Resumen clínico', snapshot.resumenCaso], ['Estado clínico actual', snapshot.ultimaEvolucion], ['Signos vitales', snapshot.signosVitales], ['Oxigenoterapia', [snapshot.oxigenoterapiaTipo, snapshot.oxigenoterapiaCantidad].filter(Boolean).join(' · ')], ['Drogas vasoactivas', snapshot.drogasVasoactivas], ['Otros soportes clínicos', snapshot.soporteClinico], ['Estudios complementarios', snapshot.estudiosComplementarios], ['Tratamiento antimicrobiano', snapshot.antibioterapia], ['Planes pendientes', snapshot.planesPendientes], ['Plan de alta', snapshot.planAlta], ['Observaciones', snapshot.observaciones]].filter(([, value]) => String(value || '').trim());
  const documentTitle = snapshot.titulo || 'Registro clínico almacenado';
  popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${safe(documentTitle)}</title><style>@page{size:A4 portrait;margin:14mm}*{box-sizing:border-box}body{margin:0;background:#cbd5e1;font-family:Arial,sans-serif;color:#111827}.toolbar{position:sticky;top:0;display:flex;justify-content:flex-end;padding:10px 18px;background:#fff}.toolbar button{border:0;border-radius:7px;background:#0f766e;color:#fff;padding:9px 14px;font-weight:700}.sheet{width:210mm;min-height:297mm;margin:18px auto;background:#fff;padding:16mm;box-shadow:0 4px 18px #33415555}.head{display:flex;align-items:center;gap:14px;border-bottom:2px solid #0f172a;padding-bottom:9px}.head img{width:74px;height:55px;object-fit:contain}.head h1{font-size:18px}.patient{display:grid;grid-template-columns:1fr 1fr;gap:7px 24px;margin:18px 0;border:1px solid #94a3b8;padding:10px}.section{margin-top:15px}.section h2{font-size:13px;border-bottom:1px solid #94a3b8;padding-bottom:4px}.section p{white-space:pre-wrap;line-height:1.5;font-size:12px}.footer{margin-top:24px;border-top:1px solid #94a3b8;padding-top:6px;font-size:9px;color:#64748b}@media print{body{background:#fff}.toolbar{display:none}.sheet{margin:0;box-shadow:none;width:auto;min-height:0;padding:0}}</style></head><body><div class="toolbar"><button onclick="window.print()">Imprimir / guardar PDF</button></div><article class="sheet"><header class="head"><img src="/logo-hospital.png"><div><h1>${safe(documentTitle)}</h1><p>Hospital Comunitario de Salud Familiar de Bulnes</p></div></header><div class="patient"><p><b>Paciente:</b> ${safe(patient?.nombre || '')}</p><p><b>RUT:</b> ${safe(patient?.rut || '')}</p><p><b>Servicio / cama:</b> ${safe(bed?.serviceShort || '')} · ${safe(bed?.cell || '')}</p><p><b>Guardado:</b> ${safe(snapshot.guardadoEn ? new Date(snapshot.guardadoEn).toLocaleString('es-CL') : snapshot.fecha || '')}</p></div>${sections.map(([label, value]) => `<section class="section"><h2>${safe(label)}</h2><p>${safe(value)}</p></section>`).join('')}<footer class="footer">Versión histórica almacenada en la ficha. No se reemplazaron sus datos por información clínica posterior.</footer></article></body></html>`);
  popup.document.close();
}

function printProaEvolutionSnapshot(snapshot, patient, bed) {
  const proaForm = snapshot.documentoOriginal || {
    paciente: patient?.nombre || '', rut: patient?.rut || '', edad: patient?.edad || '', fecha_ingreso: patient?.fechaIngreso || '',
    diagnostico_actual: snapshot.diagnosticoPrincipal || snapshot.diagnostico || '', antecedentes: snapshot.antecedentes || '', resumen_caso: snapshot.resumenCaso || '',
    evolucion: String(snapshot.ultimaEvolucion || '').replace(/^\[PROA\]\s*/i, ''), plan_duracion: String(snapshot.planesPendientes || '').replace(/^\[PLAN PROA\]\s*/i, ''),
    estudios_imagen: snapshot.estudiosComplementarios || '', antibioterapia_preingreso: snapshot.antibioterapia || '', diagnostico_microbiologico: snapshot.patogenoAislado || '',
    fecha: snapshot.fecha || '', proa_entry_type: 'evolucion_proa_historica',
  };
  // Se renderiza el documento fuera de pantalla, en la ventana actual (con layout y estilos reales),
  // para poder tomar su markup ya resuelto (incluyendo gráficos) y recién ahí abrir la ventana de impresión.
  const offscreen = document.createElement('div');
  offscreen.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;pointer-events:none;';
  document.body.appendChild(offscreen);
  const root = createRoot(offscreen);
  root.render(<ProaEvolutionDocument form={proaForm} bed={bed} />);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const documentElement = offscreen.querySelector('.proa-evolution-document');
    const markup = documentElement?.outerHTML || '';
    root.unmount();
    offscreen.remove();
    if (!markup) return;
    const popup = window.open('', '_blank', 'width=900,height=1100');
    if (!popup) return;
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Evolución PROA</title><style>
      *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#e2e8f0}.proa-preview-toolbar{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 18px;background:#fff;border-bottom:1px solid #cbd5e1;font-family:Arial,sans-serif}.proa-preview-toolbar p{margin:0;color:#475569;font-size:13px}.proa-preview-toolbar button{border:0;border-radius:8px;background:#0f766e;color:#fff;padding:10px 16px;font-weight:800;cursor:pointer}.proa-evolution-document{width:190mm!important;max-width:calc(100vw - 32px)!important;min-height:0!important;margin:18px auto!important;background:#fff!important;box-shadow:0 6px 24px #33415555!important}.proa-document-table{table-layout:fixed!important}.proa-document-table th,.proa-document-table td{overflow-wrap:anywhere!important}.proa-chart,.proa-chart>div,.recharts-responsive-container{width:100%!important;max-width:100%!important}.recharts-wrapper,.recharts-surface{max-width:100%!important}
      @page{size:A4 portrait;margin:10mm}@media print{html,body{background:#fff!important;width:auto!important}.proa-preview-toolbar{display:none!important}.proa-evolution-document{width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;box-shadow:none!important}.proa-document-block,.proa-chart{break-inside:avoid;page-break-inside:avoid}}
    </style></head><body><div class="proa-preview-toolbar"><p>Vista previa de la evolución PROA. Revise el contenido antes de imprimir.</p><button type="button" onclick="window.print()">Imprimir / guardar PDF</button></div>${markup}</body></html>`);
    popup.document.close();
  }));
}

function printStoredEvolution(snapshot, patient, bed) {
  const isProaDocument = snapshot?.fuente === 'PROA' || snapshot?.tipoDocumento === 'proa' || /PROA/i.test(String(snapshot?.titulo || '')) || /^\[PROA\]/i.test(String(snapshot?.ultimaEvolucion || '')) || Boolean(snapshot?.documentoOriginal?.proa_entry_type);
  if (isProaDocument) {
    printProaEvolutionSnapshot(snapshot, patient, bed);
    return;
  }
  if (snapshot?.fuente === 'Nota de evolución') {
    const note = snapshot.documentoOriginal?.nota_evolucion || {};
    printGenericHospitalSnapshot({ ...snapshot, titulo: note.titulo || snapshot.titulo || 'Nota de evolución', resumenCaso: note.anamnesis || snapshot.resumenCaso, ultimaEvolucion: note.examen_fisico || snapshot.ultimaEvolucion, planesPendientes: note.indicaciones || snapshot.planesPendientes, observaciones: note.medico ? `Profesional: ${note.medico}` : '' }, patient, bed);
    return;
  }
  printGenericHospitalSnapshot(snapshot, patient, bed);
}

// Todas las entradas históricas pasan por el impresor que respeta su formato de origen.
const printHospitalSnapshot = printStoredEvolution;
const DIAGNOSIS_CATALOG = [
  ['Vía aérea / respiratorio', 'J18.9', 'Neumonía, no especificada'], ['Vía aérea / respiratorio', 'J15.9', 'Neumonía bacteriana, no especificada'], ['Vía aérea / respiratorio', 'J44.1', 'EPOC con exacerbación aguda'], ['Vía aérea / respiratorio', 'J45.9', 'Asma, no especificada'], ['Vía aérea / respiratorio', 'J96.0', 'Insuficiencia respiratoria aguda'], ['Vía aérea / respiratorio', 'J81.0', 'Edema pulmonar agudo'], ['Vía aérea / respiratorio', 'J69.0', 'Neumonitis por aspiración'], ['Vía aérea / respiratorio', 'U07.1', 'COVID-19, virus identificado'],
  ['Salud mental', 'F32.9', 'Episodio depresivo, no especificado'], ['Salud mental', 'F33.9', 'Trastorno depresivo recurrente, no especificado'], ['Salud mental', 'F41.1', 'Trastorno de ansiedad generalizada'], ['Salud mental', 'F10.2', 'Síndrome de dependencia del alcohol'], ['Salud mental', 'F05', 'Delirium debido a condición fisiológica conocida'], ['Salud mental', 'F20.9', 'Esquizofrenia, no especificada'], ['Salud mental', 'F31.9', 'Trastorno afectivo bipolar, no especificado'], ['Salud mental', 'R45.8', 'Otros síntomas emocionales'],
  ['Cardiológico', 'I10', 'Hipertensión esencial'], ['Cardiológico', 'I21.9', 'Infarto agudo de miocardio, no especificado'], ['Cardiológico', 'I50.9', 'Insuficiencia cardíaca, no especificada'], ['Cardiológico', 'I48.9', 'Fibrilación auricular y flutter, no especificados'], ['Cardiológico', 'I25.9', 'Cardiopatía isquémica crónica, no especificada'], ['Cardiológico', 'I35.0', 'Estenosis aórtica'], ['Cardiológico', 'I26.9', 'Embolia pulmonar sin cor pulmonale agudo'], ['Cardiológico', 'I63.9', 'Infarto cerebral, no especificado'],
  ['Gastroenterológico', 'K52.9', 'Gastroenteritis y colitis no infecciosa, no especificada'], ['Gastroenterológico', 'K57.9', 'Enfermedad diverticular sin perforación ni absceso'], ['Gastroenterológico', 'K92.2', 'Hemorragia gastrointestinal, no especificada'], ['Gastroenterológico', 'K85.9', 'Pancreatitis aguda, no especificada'], ['Gastroenterológico', 'K74.6', 'Otras cirrosis del hígado'], ['Gastroenterológico', 'K81.0', 'Colecistitis aguda'], ['Gastroenterológico', 'K56.6', 'Otra obstrucción intestinal y la no especificada'],
  ['Hematológico / neoplásico', 'D64.9', 'Anemia, no especificada'], ['Hematológico / neoplásico', 'D69.6', 'Trombocitopenia, no especificada'], ['Hematológico / neoplásico', 'D70', 'Agranulocitosis / neutropenia'], ['Hematológico / neoplásico', 'C34.9', 'Neoplasia maligna de bronquio o pulmón, no especificada'], ['Hematológico / neoplásico', 'C18.9', 'Neoplasia maligna de colon, no especificada'], ['Hematológico / neoplásico', 'C50.9', 'Neoplasia maligna de mama, no especificada'], ['Hematológico / neoplásico', 'C61', 'Neoplasia maligna de próstata'], ['Hematológico / neoplásico', 'C80.9', 'Neoplasia maligna de sitio primario desconocido'],
  ['Ginecológico / obstétrico', 'N73.9', 'Enfermedad inflamatoria pélvica femenina, no especificada'], ['Ginecológico / obstétrico', 'N93.9', 'Hemorragia uterina o vaginal anormal, no especificada'], ['Ginecológico / obstétrico', 'O14.9', 'Preeclampsia, no especificada'], ['Ginecológico / obstétrico', 'O24.4', 'Diabetes mellitus gestacional'], ['Ginecológico / obstétrico', 'O42.9', 'Ruptura prematura de membranas, no especificada'], ['Ginecológico / obstétrico', 'O80', 'Parto único espontáneo'], ['Ginecológico / obstétrico', 'N83.2', 'Otros quistes ováricos y los no especificados'], ['Ginecológico / obstétrico', 'C53.9', 'Neoplasia maligna del cuello uterino, no especificada'],
].map(([category, code, name]) => ({ category, code, name, label: `${code} · ${name}` }));
const TEST_BED = { code: 'TEST-VISTA-PROA-1', cell: 'Prueba 1', serviceShort: 'PRUEBA', salaLabel: 'Sala exclusiva de prueba · no contabiliza' };
const TEST_PATIENT = {
  ...EMPTY, nombre: 'Paciente PROA de Prueba', rut: '11.111.111-1', edad: '68', sexo: 'F', fechaNacimiento: '1958-05-14', fechaIngreso: '2026-08-08',
  diagnosticoPrincipal: 'Neumonía adquirida en la comunidad', diagnostico: 'Insuficiencia respiratoria aguda hipoxémica', antecedentes: 'Hipertensión arterial. Diabetes mellitus tipo 2.',
  resumenCaso: 'Paciente estable, afebril y con requerimiento bajo de oxígeno.', ultimaEvolucion: 'Evolución favorable; menor disnea y sin fiebre.', planesPendientes: 'Control de laboratorio y reevaluación de antibioterapia.',
  ultimaEvolucionActualizadaEn: '2026-09-01T09:00:00-04:00',
  estudiosComplementarios: 'Imagenología · 2026-08-08 · Radiografía de tórax: infiltrado basal derecho · Informado', estudiosDetalle: [{ fecha: '2026-08-08', tipo: 'Imagenología', estudio: 'Radiografía de tórax: infiltrado basal derecho', estado: 'Informado' }],
  aislamiento: 'Precauciones de gotitas', antibioticos: [{ nombre: 'Ceftriaxona', presentacion: 'Polvo para solución inyectable · 1 g', dosis_cantidad: '2', dosis_unidad: 'g', intervalo_horas: '24', via: 'EV', inicio: '2026-08-08', termino: '' }],
  antibioterapia: 'Ceftriaxona 2 g c/24 h EV', patogenoAislado: 'Streptococcus pneumoniae', ultimoLaboratorio: '2026-08-10 · PCR 42 · Leucocitos 10.200 · Creatinina 0,8 mg/dL',
  laboratorios: [{ fecha: '2026-08-10', pcr: '42', blancos: '10200', crea: '0.8', pct: '0.18', vhs: '35', temp: '36.7' }],
  letIndicacion: 'No', iotIndicacion: 'Sí', rcpIndicacion: 'Sí', evaluacionesNutricionales: [{ fecha: '2026-08-09', tamizaje: 'Sí', puntaje: '2', riesgo: 'Sin riesgo nutricional', evaluacion: 'Sí' }],
  reingresoEvaluado: false, reingresoMenor30: false, reingresoFechaEgresoPrevia: '', egresoPrevioConocido: '2026-07-25', reingresoEvaluadoEn: '', proaIsTest: true,
};

function readRegistry() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object') return { [TEST_BED.code]: TEST_PATIENT };
    const storedTest = parsed[TEST_BED.code] || {};
    return { ...parsed, [TEST_BED.code]: { ...TEST_PATIENT, ...storedTest, ultimaEvolucionActualizadaEn: storedTest.ultimaEvolucionActualizadaEn || TEST_PATIENT.ultimaEvolucionActualizadaEn } };
  } catch {
    return { [TEST_BED.code]: TEST_PATIENT };
  }
}

// Borradores de evoluciones por cama: lo escrito sin presionar Guardar se
// conserva y se restaura al reabrir el editor, hasta guardarlo o descartarlo.
const EVOLUTION_DRAFTS_KEY = 'saludBulnesEvolutionDrafts';
function readEvolutionDrafts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(EVOLUTION_DRAFTS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
function writeEvolutionDraft(bedCode, kind, payload) {
  if (!bedCode) return;
  const all = readEvolutionDrafts();
  const forBed = { ...(all[bedCode] || {}) };
  if (payload) forBed[kind] = payload; else delete forBed[kind];
  if (Object.keys(forBed).length) all[bedCode] = forBed; else delete all[bedCode];
  localStorage.setItem(EVOLUTION_DRAFTS_KEY, JSON.stringify(all));
}

function evolutionDraftHistoryEntries(bedCode) {
  const drafts = readEvolutionDrafts()[bedCode] || {};
  return Object.entries(drafts).map(([kind, payload]) => {
    const changed = payload?.changed || {};
    const clinicalStatus = payload?.clinicalStatusDraft || {};
    const snapshot = kind === 'estadoClinico'
      ? { ...clinicalStatus, ultimaEvolucion: payload?.evolutionDraft || '' }
      : { ...changed, diagnostico: payload?.diagnosisAndHistoryDraft || changed.diagnostico || '' };
    return {
      id: `draft-${kind}`,
      kind,
      savedAt: payload?.savedAt || '',
      label: kind === 'estadoClinico' ? 'Estado clínico actual' : 'Actualización clínica',
      snapshot,
    };
  }).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

function draftHistorySummary(entry) {
  const snapshot = entry?.snapshot || {};
  return snapshot.ultimaEvolucion
    || snapshot.resumenCaso
    || snapshot.diagnosticoPrincipal
    || snapshot.diagnostico
    || snapshot.planesPendientes
    || 'Borrador con cambios pendientes de guardar.';
}

function formatRut(value) {
  const clean = String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (!clean) return '';
  if (clean.length === 1) return clean;
  return `${clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${clean.slice(-1)}`;
}

const CLINICAL_ACRONYMS = new Set(['EPOC', 'VIH', 'ITU', 'AVE', 'NAC', 'TAC', 'ECG', 'PCR', 'RCP', 'IOT', 'LET', 'HTA', 'DM', 'ERC', 'IRA', 'VRS']);
const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-CL').replace(/(^|[\s-])([a-záéíóúüñ])/giu, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('es-CL')}`);
const normalizeClinicalText = (value) => String(value || '').trim().replace(/[ \t]+/g, ' ').split('\n').map(line => {
  const lowered = line.toLocaleLowerCase('es-CL').replace(/(^|[.!?]\s+)([a-záéíóúüñ])/giu, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('es-CL')}`);
  return lowered.replace(/\b[A-Za-zÁÉÍÓÚÜÑ]{2,4}\b/g, word => CLINICAL_ACRONYMS.has(word.toLocaleUpperCase('es-CL')) ? word.toLocaleUpperCase('es-CL') : word);
}).join('\n');

function hospitalDays(date) {
  if (!date) return 0;
  const start = new Date(`${date}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(1, Math.floor((new Date().setHours(0, 0, 0, 0) - start.getTime()) / 86400000) + 1);
}

function treatmentDays(startDate, endDate) {
  if (!startDate) return null;
  const start = new Date(`${startDate}T00:00:00`);
  const end = endDate ? new Date(`${endDate}T00:00:00`) : new Date(new Date().setHours(0, 0, 0, 0));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function displayClinicalDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : String(value || '');
}

function shortClinicalDate(value) {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1].slice(2)}` : '';
}

function todayLocalIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function clinicalStateIndicator(record, metadata) {
  const hasState = [record?.ultimaEvolucion, record?.signosVitales, record?.oxigenoterapiaTipo, record?.drogasVasoactivas, record?.soporteClinico].some(value => String(value || '').trim());
  if (!hasState) return { state: 'missing', label: 'Sin registro', detail: 'No hay estado clínico actual', date: '' };
  const rawDate = record?.ultimaEvolucionActualizadaEn || metadata?.date || '';
  const date = String(rawDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { state: 'stale', label: 'Sin fecha', detail: 'Estado clínico sin fecha de vigencia', date: '' };
  const current = date === todayLocalIso();
  return { state: current ? 'current' : 'stale', label: current ? 'Vigente' : 'Vencido', detail: current ? 'Estado actualizado hoy' : `Última actualización ${displayClinicalDate(date)}`, date };
}

const CLINICAL_STATE_BUTTON_STYLES = {
  current: 'border-emerald-300 bg-emerald-50 text-emerald-900 shadow-[0_0_0_3px_rgba(110,231,183,0.16)] hover:bg-emerald-100',
  stale: 'border-rose-300 bg-rose-50 text-rose-900 shadow-[0_0_0_3px_rgba(253,164,175,0.16)] hover:bg-rose-100',
  missing: 'border-amber-300 bg-amber-50 text-amber-900 shadow-[0_0_0_3px_rgba(252,211,77,0.14)] hover:bg-amber-100',
};

const FREQUENT_STUDIES = [
  { estudio: 'Radiografía de tórax', tipo: 'Imagenología' },
  { estudio: 'Ecografía abdominal', tipo: 'Imagenología' },
  { estudio: 'Ecografía renal y vesical', tipo: 'Imagenología' },
  { estudio: 'Ecografía de partes blandas', tipo: 'Imagenología' },
  { estudio: 'TAC de tórax', tipo: 'Imagenología' },
  { estudio: 'TAC de abdomen y pelvis', tipo: 'Imagenología' },
  { estudio: 'TAC cerebral', tipo: 'Imagenología' },
  { estudio: 'AngioTAC', tipo: 'Imagenología' },
  { estudio: 'Resonancia magnética', tipo: 'Imagenología' },
  { estudio: 'Ecocardiograma', tipo: 'Imagenología' },
  { estudio: 'Eco doppler de extremidades', tipo: 'Imagenología' },
  { estudio: 'Electrocardiograma', tipo: 'Estudio funcional' },
  { estudio: 'Holter de ritmo', tipo: 'Estudio funcional' },
  { estudio: 'Espirometría', tipo: 'Estudio funcional' },
  { estudio: 'Electroencefalograma', tipo: 'Estudio funcional' },
  { estudio: 'Endoscopía digestiva alta', tipo: 'Otro' },
  { estudio: 'Colonoscopía', tipo: 'Otro' },
  { estudio: 'Biopsia', tipo: 'Anatomía patológica' },
];

function ExpandIconButton({ icon: Icon, label, title, className = '', children, ...props }) {
  return <Button type="button" size="sm" variant="outline" aria-label={title || label} title={title || label} className={`group h-10 gap-0 rounded-xl px-3 ${className}`} {...props}>
    <Icon className="h-4 w-4 shrink-0" />
    <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-bold opacity-0 transition-all duration-300 group-hover:ml-1.5 group-hover:max-w-48 group-hover:opacity-100 group-focus-visible:ml-1.5 group-focus-visible:max-w-48 group-focus-visible:opacity-100">{label}</span>
    {children}
  </Button>;
}

function EvolutionHistoryFilters({ value, onChange, savedCount, draftCount }) {
  const options = [
    { value: 'all', label: 'Todas', count: savedCount + draftCount },
    { value: 'drafts', label: 'Borradores', count: draftCount },
    { value: 'saved', label: 'Guardadas', count: savedCount },
  ];
  return <div className="inline-flex max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white p-1" role="group" aria-label="Filtrar evoluciones">
    {options.map(option => <button key={option.value} type="button" onClick={() => onChange(option.value)} aria-pressed={value === option.value} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${value === option.value ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
      {option.label}<span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${value === option.value ? 'bg-white/20 text-white' : option.value === 'drafts' && option.count ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{option.count}</span>
    </button>)}
  </div>;
}

function DraftEvolutionCard({ entry, onEdit, onDelete, expanded = false }) {
  const summary = draftHistorySummary(entry);
  return <div className="relative min-w-0 rounded-lg border border-amber-300 bg-amber-50/80 p-3 shadow-sm">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-black text-slate-900">{entry.savedAt ? new Date(entry.savedAt).toLocaleString('es-CL') : 'Fecha no consignada'}</p>
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">Borrador</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">{entry.label}</span>
        </div>
        <p className={`${expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'} mt-1 break-words text-xs text-slate-600`}>{summary}</p>
        <p className="mt-1 text-[10px] font-semibold text-amber-800">Pendiente de guardar como registro clínico definitivo.</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button type="button" size="sm" variant="outline" title="Continuar editando borrador" onClick={() => onEdit(entry.kind)} className="h-8 gap-1 border-amber-300 bg-white px-2 text-xs font-bold text-amber-900 hover:bg-amber-100"><Pencil className="h-3.5 w-3.5" />Continuar</Button>
        <Button type="button" size="icon" variant="ghost" title="Descartar borrador" aria-label={`Descartar borrador de ${entry.label}`} onClick={() => onDelete(entry.kind)} className="h-8 w-8 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  </div>;
}

const SNAPSHOT_FIELDS = ['diagnosticoPrincipal', 'diagnostico', 'antecedentes', 'resumenCaso', 'ultimaEvolucion', 'signosVitales', 'oxigenoterapiaTipo', 'oxigenoterapiaCantidad', 'drogasVasoactivas', 'soporteClinico', 'planProa', 'planesPendientes', 'planesAmbitos', 'planAlta', 'estudiosComplementarios', 'antibioterapia', 'patogenoAislado', 'ultimoLaboratorio', 'letIndicacion', 'iotIndicacion', 'rcpIndicacion', 'observaciones'];
function clinicalSnapshot(record) {
  return SNAPSHOT_FIELDS.reduce((snapshot, key) => ({ ...snapshot, [key]: record[key] || '' }), {});
}

function withHistorySnapshot(record, metadata = {}) {
  const snapshot = clinicalSnapshot(record);
  if (!Object.values(snapshot).some(value => String(value).trim())) return record;
  const history = Array.isArray(record.historialActualizaciones) ? record.historialActualizaciones : [];
  const previous = history[0] ? clinicalSnapshot(history[0]) : null;
  if (previous && JSON.stringify(previous) === JSON.stringify(snapshot)) return record;
  const now = new Date();
  const storedSnapshot = metadata.fuente === 'Estado clínico actual' && snapshot.ultimaEvolucion ? { ...snapshot, tipoDocumento: 'estado_clinico_actual', resumenClinicoImpresion: snapshot.resumenCaso, ultimaEvolucion: `[ESTADO CLÍNICO ACTUAL] ${snapshot.ultimaEvolucion}` } : snapshot;
  return { ...record, historialActualizaciones: [{ ...storedSnapshot, ...metadata, fecha: now.toISOString().slice(0, 10), guardadoEn: now.toISOString() }, ...history].slice(0, 60) };
}

function withProaHistorySnapshot(record, proaForm) {
  const planProa = proaForm?.plan_duracion || record.planProa || '';
  const updatedRecord = { ...record, planProa, planesPendientes: combinedPlansText(planProa, record.planesAmbitos) || record.planesPendientes };
  return withHistorySnapshot(updatedRecord, {
    fuente: 'PROA', tipoDocumento: 'proa', titulo: 'Evolución clínica PROA', documentoOriginal: proaForm,
    ultimaEvolucion: `[PROA] ${proaForm?.evolucion || proaForm?.vista_ultima_evolucion || record.ultimaEvolucion || ''}`.trim(),
    planProa,
    planesPendientes: combinedPlansText(planProa, record.planesAmbitos) || record.planesPendientes,
  });
}

function latestFieldMetadata(history, field, currentValue) {
  const normalizedCurrent = String(currentValue || '').replace(/^\[(?:PROA|PLAN PROA|NOTA DE EVOLUCIÓN)\]\s*/i, '').trim();
  if (!normalizedCurrent) return null;
  const entries = [...(Array.isArray(history) ? history : [])].sort((a, b) => String(b.guardadoEn || b.fecha || '').localeCompare(String(a.guardadoEn || a.fecha || '')));
  const eligibleEntries = field === 'ultimaEvolucion'
    ? entries.filter(entry => entry?.fuente !== 'Nota de evolución' && entry?.tipoDocumento !== 'nota_evolucion')
    : entries;
  const matching = eligibleEntries.find(entry => String(entry?.[field] || '').replace(/^\[(?:PROA|PLAN PROA|NOTA DE EVOLUCIÓN)\]\s*/i, '').trim() === normalizedCurrent)
    || eligibleEntries.find(entry => String(entry?.[field] || '').trim());
  if (!matching) return null;
  return { date: matching.guardadoEn || matching.createdAt || matching.updatedAt || matching.fecha || '', isProa: matching.fuente === 'PROA' || /^\[(?:PROA|PLAN PROA)\]/i.test(String(matching[field] || '')) };
}

function historyDocumentLabel(snapshot) {
  if (snapshot?.fuente === 'PROA' || snapshot?.tipoDocumento === 'proa' || /PROA/i.test(String(snapshot?.titulo || ''))) return 'PROA';
  if (snapshot?.fuente === 'Nota de evolución' || snapshot?.tipoDocumento === 'nota_evolucion') return 'Nota de evolución';
  if (snapshot?.fuente === 'Estado clínico actual' || snapshot?.tipoDocumento === 'estado_clinico_actual') return 'Estado clínico actual';
  return snapshot?.titulo || 'Actualización clínica';
}

function combinedDiagnosisAndHistory(record) {
  return `DIAGNÓSTICO(S):\n${record?.diagnostico || ''}\n\nANTECEDENTES RELEVANTES:\n${record?.antecedentes || ''}`;
}

function splitDiagnosisAndHistory(value) {
  const normalized = String(value || '').replace(/^\s*DIAGNÓSTICO\(S\):\s*\n?/i, '');
  const parts = normalized.split(/\n\s*ANTECEDENTES RELEVANTES:\s*\n?/i);
  return { diagnostico: parts.shift()?.trim() || '', antecedentes: parts.join('\n').trim() };
}

function normalizedPlanRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(item => ({ ambito: String(item?.ambito || '').trim(), plan: String(item?.plan || '').trim() })).filter(item => item.ambito || item.plan);
}

function combinedPlansText(planProa, rows) {
  return [planProa ? `(PROA): ${String(planProa).trim()}` : '', ...normalizedPlanRows(rows).map(item => `${item.ambito || 'Otro'}: ${item.plan}`)].filter(Boolean).join('\n');
}

const cultureKey = item => [item?.fecha, item?.tipo_muestra, item?.patogeno].map(value => String(value || '').trim().toLocaleLowerCase('es-CL')).join('|');
const isNegativeMicroResult = value => /pendiente|sin desarrollo|sin crecimiento|no desarrollo|negativ|no detectado|est[ée]ril/i.test(String(value || ''));
function deduplicateCultures(items) {
  const seen = new Set();
  return (items || []).filter(item => item?.fecha || item?.tipo_muestra || item?.patogeno).filter(item => {
    const key = cultureKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeLaboratoryRows(current, incoming) {
  const byDate = new Map();
  [...(current || []), ...(incoming || [])].forEach(row => {
    const fecha = String(row?.fecha || '').slice(0, 10);
    if (!fecha) return;
    const normalized = { ...row, blancos: row.blancos || row.leucocitos || row.gb || row.GB || row.leu || row.wbc || '', fecha };
    const merged = { ...emptyHospitalLabRow(fecha), ...(byDate.get(fecha) || {}), fecha };
    Object.entries(normalized).forEach(([key, value]) => {
      if (key === 'fecha' || (value !== '' && value != null)) merged[key] = value;
    });
    byDate.set(fecha, merged);
  });
  return [...byDate.values()].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

function collectProaLaboratoryRows(record) {
  return mergeLaboratoryRows([], [...(record?.evolutions || [])].reverse().flatMap(evolution => evolution?.form?.parametros_inflamatorios || []));
}

function cultureFromParsedResult(result) {
  const text = String(result?.valueText || '').trim();
  const upper = text.toLocaleUpperCase('es-CL');
  const sensibilidad = /SIN DESARROLLO|NEGATIV|NO DETECTAD/.test(upper) ? 'Sin desarrollo' : /RESISTENTE/.test(upper) ? 'Resistente' : /SENSIBLE/.test(upper) ? 'Sensible' : 'Pendiente';
  return { fecha: String(result?.collectedAt || '').slice(0, 10), tipo_muestra: result?.name || 'Estudio microbiológico', patogeno: text, sensibilidad, resistente: [], sensible: [], intermedio: [], antibiograma_nota: text, antibiograma: '' };
}

const EMPTY_CULTURE = { fecha: '', tipo_muestra: '', estado_resultado: 'pendiente', patogeno: '', sensibilidad: 'Pendiente' };

function CultureRegistryEditor({ cultures, setCultures }) {
  const update = (index, key, nextValue) => setCultures(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: nextValue, ...(key === 'estado_resultado' && nextValue !== 'positivo' ? { patogeno: '', sensibilidad: nextValue === 'negativo' ? 'No aplica' : 'Pendiente' } : {}) } : item));
  const toggleResistance = (index, antibiotic) => setCultures(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, resistente: (item.resistente || []).includes(antibiotic) ? item.resistente.filter(value => value !== antibiotic) : [...(item.resistente || []), antibiotic] } : item));
  const add = () => setCultures(current => [...current, { ...EMPTY_CULTURE }]);
  const remove = index => setCultures(current => current.length === 1 ? [{ ...EMPTY_CULTURE }] : current.filter((_, itemIndex) => itemIndex !== index));
  return <section>
    <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-black text-slate-900">Cultivos</h3><Button type="button" size="sm" variant="outline" onClick={add}><Plus className="mr-1 h-3.5 w-3.5" />Agregar cultivo</Button></div>
    <div className="space-y-2">{cultures.map((culture, index) => <div key={index} className="space-y-2 rounded-xl border bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
        <input type="date" className={input} value={culture.fecha || ''} onChange={e => update(index, 'fecha', e.target.value)} />
        <input list="hospital-proa-culture-types" className={input} value={culture.tipo_muestra || ''} onChange={e => update(index, 'tipo_muestra', e.target.value)} placeholder="Tipo de cultivo" />
        <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} className="text-red-600">Quitar</Button>
      </div>
      <div className="flex flex-wrap gap-2">{[['pendiente', 'Pendiente'], ['negativo', 'Negativo'], ['positivo', 'Positivo / microorganismo']].map(([status, label]) => <button key={status} type="button" onClick={() => update(index, 'estado_resultado', status)} className={`rounded-lg border px-3 py-2 text-xs font-bold ${culture.estado_resultado === status ? status === 'positivo' ? 'border-rose-400 bg-rose-100 text-rose-900' : status === 'negativo' ? 'border-emerald-400 bg-emerald-100 text-emerald-900' : 'border-amber-400 bg-amber-100 text-amber-900' : 'border-slate-200 bg-white text-slate-600'}`}>{label}</button>)}</div>
      {culture.estado_resultado === 'positivo' && <input className={input} value={culture.patogeno || ''} onChange={e => update(index, 'patogeno', e.target.value)} placeholder="Microorganismo aislado" />}
      {culture.estado_resultado === 'positivo' && culture.patogeno && <details className="rounded border border-rose-200 bg-white"><summary className="cursor-pointer px-3 py-2 text-xs font-bold text-rose-800">Resistente a{(culture.resistente || []).length ? ` (${culture.resistente.length})` : ''}</summary><div className="grid max-h-48 gap-1 overflow-y-auto border-t p-2 sm:grid-cols-2 lg:grid-cols-3">{ANTIBIOTICOS.map(antibiotic => <label key={antibiotic} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-rose-50"><input type="checkbox" checked={(culture.resistente || []).includes(antibiotic)} onChange={() => toggleResistance(index, antibiotic)} />{antibiotic}</label>)}</div></details>}
      {culture.estado_resultado === 'negativo' && <p className="text-xs font-semibold text-emerald-700">Negativo / sin desarrollo; no se contabiliza como patógeno.</p>}
    </div>)}
    {!cultures.length && <p className="rounded-lg border border-dashed border-violet-200 bg-white/60 p-4 text-center text-xs text-violet-700">Sin estudios microbiológicos registrados.</p>}
    </div>
    <datalist id="hospital-proa-culture-types">{TIPOS_MUESTRA.map(item => <option key={item} value={item} />)}</datalist>
  </section>;
}

function catalogToProaBed(bed) {
  if (bed?.code === TEST_BED.code) return 'TEST-PROA-1';
  if (bed.serviceShort === 'MQ1') {
    if (/^\d+-\d+$/.test(bed.cell)) return bed.cell;
    const isolation = /^Aisl(\d+)-(\d+)$/.exec(bed.cell);
    if (isolation) return Number(isolation[2]) === 1 && !['5', '8'].includes(isolation[1])
      ? `Aisl ${isolation[1]}` : `Aisl ${isolation[1]}-${isolation[2]}`;
  }
  if (bed.serviceShort === 'MQ2') {
    const isolation = /^Aislamiento\s+(\d+)$/i.exec(bed.cell);
    return isolation ? `MQ2-Aislamiento ${isolation[1]}` : `MQ2-${bed.cell}`;
  }
  if (bed.serviceShort === 'GINE') {
    const gine = /^08MB-(\d+)$/.exec(bed.code);
    const obs = /^SNC-(\d+)$/.exec(bed.code);
    return gine ? `GINE-${gine[1]}` : obs ? `OBS-${obs[1]}` : null;
  }
  if (bed.serviceShort === 'PED') {
    const pediatricBeds = ALL_BEDS.filter(item => item.serviceShort === 'PED');
    const index = pediatricBeds.findIndex(item => item.code === bed.code);
    return index >= 0 ? `PED-${index + 1}` : null;
  }
  return null;
}

const PROA_TO_CATALOG = new Map([...ALL_BEDS, TEST_BED].map(bed => [catalogToProaBed(bed), bed.code]).filter(([key]) => key));

function antibioticSummary(form) {
  if (form.antibioterapia_preingreso) return form.antibioterapia_preingreso;
  const today = new Date().toISOString().slice(0, 10);
  return (form.antibioticos || []).filter(item => item?.nombre).map(item => {
    const suspended = Boolean(item.termino && item.termino < today);
    const days = treatmentDays(item.inicio, suspended ? item.termino : '');
    const status = item.inicio ? `${suspended ? 'suspendido' : 'vigente'}${days ? ` · día ${days}` : ''}` : '';
    return [
      item.nombre,
      item.dosis || [item.dosis_cantidad, item.dosis_unidad].filter(Boolean).join(' '),
      item.intervalo_horas && `c/${item.intervalo_horas} h`,
      item.via,
      item.inicio && `desde ${item.inicio}`,
      status && `(${status})`,
    ].filter(Boolean).join(' ');
  }).join('\n');
}

function structuredAntibioticSummary(items) {
  const today = new Date().toISOString().slice(0, 10);
  return (items || []).filter(item => item?.nombre).map(item => {
    const suspended = Boolean(item.termino && item.termino < today);
    const days = treatmentDays(item.inicio, suspended ? item.termino : '');
    const treatment = [item.nombre, item.presentacion && `(${item.presentacion})`, item.dosis || [item.dosis_cantidad, item.dosis_unidad].filter(Boolean).join(' '), item.intervalo_horas && `c/${item.intervalo_horas} h`, item.via].filter(Boolean).join(' ');
    const status = suspended ? `SUSPENDIDO${days ? ` · ${days} ${days === 1 ? 'día total' : 'días totales'}` : ''}` : `VIGENTE${days ? ` · Día ${days}` : ''}`;
    const dates = [item.inicio && `FI ${displayClinicalDate(item.inicio)}`, item.termino && `${suspended ? 'FT' : 'término previsto'} ${displayClinicalDate(item.termino)}`].filter(Boolean).join(' · ');
    return `${treatment} — ${status}${dates ? ` · ${dates}` : ''}`;
  }).join('\n');
}

function antibioticVisitItems(record) {
  const items = (record.antibioticos || []).filter(item => item?.nombre);
  if (!items.length) return { current: record.antibioterapia ? [record.antibioterapia] : [], suspended: [] };
  const today = new Date().toISOString().slice(0, 10);
  return items.reduce((groups, item) => {
    const days = treatmentDays(item.inicio, item.termino);
    const treatment = [item.nombre, item.presentacion && `(${item.presentacion})`, item.dosis || [item.dosis_cantidad, item.dosis_unidad].filter(Boolean).join(' '), item.intervalo_horas && `c/${item.intervalo_horas} h`, item.via].filter(Boolean).join(' ');
    const suspended = Boolean(item.termino && item.termino < today);
    const dates = [item.inicio && `FI ${displayClinicalDate(item.inicio)}`, suspended && item.termino && `FT ${displayClinicalDate(item.termino)}`].filter(Boolean).join(' · ');
    const duration = days ? `${suspended ? `${days} días` : `Día ${days}`}${dates ? ` · ${dates}` : ''}` : dates;
    const text = `${treatment}${duration ? ` (${duration})` : ''}`;
    groups[suspended ? 'suspended' : 'current'].push(text);
    return groups;
  }, { current: [], suspended: [] });
}

function pathogenSummary(form) {
  if (form.diagnostico_microbiologico && !/pendiente|sin desarrollo|sin crecimiento|no desarrollo|negativ|no detectado|est[ée]ril/i.test(form.diagnostico_microbiologico)) return form.diagnostico_microbiologico;
  return (form.estudios_micro || []).filter(item => item?.patogeno && !/pendiente|sin desarrollo|sin crecimiento|no desarrollo|negativ|no detectado|est[ée]ril/i.test(item.patogeno)).map(item => [item.patogeno, item.tipo_muestra].filter(Boolean).join(' · ')).join('\n');
}

function latestLabSummary(form) {
  const rows = Array.isArray(form.parametros_inflamatorios) ? form.parametros_inflamatorios : [];
  const latest = rows.slice().sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))[0];
  const renal = form.creatinina ? buildRenalFunctionText(form) : form.funcion_renal || '';
  if (!latest) return [form.fecha_creatinina, renal].filter(Boolean).join(' · ');
  const values = HOSPITAL_LAB_FIELDS.filter(([key]) => latest[key] !== '' && latest[key] != null).slice(0, 6).map(([key, label, unit]) => `${label} ${latest[key]}${unit ? ` ${unit}` : ''}`);
  return [latest.fecha, ...values, !values.length ? renal : ''].filter(Boolean).join(' · ');
}

function isAutoRenalText(value) {
  return /^\s*Creatinina\s+[\d,.]+\s*mg\/dL\s*·\s*VFG\s+estimada/i.test(String(value || ''));
}

function latestStructuredAntibiotics(record) {
  const collected = (record?.evolutions || []).flatMap(evolution => Array.isArray(evolution?.form?.antibioticos) ? evolution.form.antibioticos : []).filter(item => item?.nombre);
  const unique = new Map();
  collected.forEach(item => {
    const key = [String(item.nombre).trim().toLocaleLowerCase('es'), item.inicio || '', item.via || '', item.intervalo_horas || ''].join('|');
    if (!unique.has(key)) unique.set(key, item);
  });
  return [...unique.values()].sort((a, b) => String(a.inicio || '').localeCompare(String(b.inicio || '')) || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

function latestReadmissionEvaluation(record) {
  return (record?.evolutions || []).map(evolution => evolution?.form || {}).find(form => form.reingreso_evaluado === true) || null;
}

function proaToPatient(record) {
  const form = getLatestProaForm(record) || {};
  const readmissionForm = latestReadmissionEvaluation(record);
  const laboratoryRows = collectProaLaboratoryRows(record);
  const latestCreatinineRow = laboratoryRows.find(row => row.crea !== '' && row.crea != null);
  const clinicalForm = { ...form, parametros_inflamatorios: laboratoryRows, creatinina: latestCreatinineRow?.crea || form.creatinina || '', fecha_creatinina: latestCreatinineRow?.fecha || form.fecha_creatinina || '' };
  const structuredAntibiotics = latestStructuredAntibiotics(record);
  const formWithAntibiotics = { ...clinicalForm, antibioticos: structuredAntibiotics };
  return {
    nombre: normalizeName(form.paciente), rut: formatRut(form.rut), fechaNacimiento: form.fecha_nacimiento || '', edad: form.edad || '', sexo: form.sexo || '',
    nFicha: form.n_ficha || '', prevision: form.prevision || '', telefono: form.telefono || '',
    direccion: form.direccion || '', comuna: form.comuna || '', fechaIngreso: form.fecha_ingreso || '',
    diagnosticoPrincipal: normalizeClinicalText(form.diagnostico_principal || form.diagnosticos_actuales?.[0] || form.diagnostico_actual || ''),
    diagnostico: normalizeClinicalText((form.diagnosticos_actuales || []).slice(1).join('\n') || form.diagnostico_desglose || form.diagnostico_actual || form.diagnostico || ''),
    antecedentes: form.antecedentes || '', antibioterapia: antibioticSummary(formWithAntibiotics), antibioticos: structuredAntibiotics,
    aislamiento: form.aislamiento || '', medicoTratante: form.medico || form.medico_tratante || '',
    observaciones: form.vista_observaciones || (form.recomendaciones || []).join(' · '),
    resumenCaso: form.resumen_caso || '',
    ultimaEvolucion: form.vista_ultima_evolucion || '', ultimaEvolucionActualizadaEn: form.vista_ultima_evolucion_actualizada_en || '',
    planProa: form.plan_duracion || '',
    planesAmbitos: Array.isArray(form.vista_planes_ambitos) ? form.vista_planes_ambitos : [],
    planesPendientes: form.vista_planes_pendientes || combinedPlansText(form.plan_duracion, form.vista_planes_ambitos) || [...(form.recomendaciones || []), form.recomendaciones_otra].filter(Boolean).join(' · '),
    planAlta: form.vista_plan_alta || '',
    estudiosComplementarios: form.vista_estudios_complementarios || form.estudios_imagen || '',
    estudiosDetalle: Array.isArray(form.vista_estudios_detalle) ? form.vista_estudios_detalle : [],
    patogenoAislado: pathogenSummary(form), ultimoLaboratorio: latestLabSummary(clinicalForm), laboratorios: laboratoryRows,
    cultivos: Array.isArray(form.estudios_micro) ? form.estudios_micro : [],
    letIndicacion: form.let_indicacion || form.let || '', iotIndicacion: form.iot_indicacion || form.iot || '', rcpIndicacion: form.rcp_indicacion || form.rcp || '', pacienteSocial: Boolean(form.paciente_social),
    escalas: Array.isArray(form.vista_escalas) ? form.vista_escalas : [], evaluacionesNutricionales: Array.isArray(form.vista_evaluaciones_nutricionales) ? form.vista_evaluaciones_nutricionales : [],
    informesMedicos: Array.isArray(form.vista_informes_medicos) ? form.vista_informes_medicos : [],
    reingresoEvaluado: Boolean(readmissionForm),
    reingresoMenor30: readmissionForm?.reingreso_menor_30 === true,
    reingresoFechaEgresoPrevia: readmissionForm?.reingreso_fecha_egreso_previa || '',
    reingresoEvaluadoEn: readmissionForm?.reingreso_evaluado_en || '',
    historialActualizaciones: (record.evolutions || []).map(evolution => { const evolutionForm = evolution.form || {}; const note = evolutionForm.nota_evolucion || {}; const notePayloadExists = Object.values(note).some(value => Array.isArray(value) ? value.length > 0 : String(value || '').trim()); const isNote = ['nota_evolucion_hospitalaria', 'visita_servicio'].includes(evolutionForm.proa_entry_type) || (!evolutionForm.proa_entry_type && notePayloadExists); return {
      id: evolution.savedAt, fecha: String(evolution.savedAt || record.updatedAt || '').slice(0, 10), guardadoEn: evolution.savedAt || record.updatedAt,
      titulo: isNote ? (note.visita_servicio ? 'Visita de servicio · Nota de evolución' : 'Nota de evolución') : 'Evolución PROA', fuente: isNote ? 'Nota de evolución' : 'PROA', tipoDocumento: isNote ? 'nota_evolucion' : 'proa', documentoOriginal: evolutionForm,
      diagnostico: evolutionForm.diagnostico_actual || note.diagnostico || '', resumenCaso: evolutionForm.resumen_caso || note.anamnesis || '', ultimaEvolucion: `${isNote ? '[NOTA DE EVOLUCIÓN]' : '[PROA]'} ${evolutionForm.evolucion || note.examen_fisico || evolutionForm.resumen_caso || note.anamnesis || ''}`.trim(),
      planesPendientes: `${isNote ? '' : '[PLAN PROA] '}${evolutionForm.plan_duracion || note.indicaciones || ''}`.trim(), estudiosComplementarios: evolutionForm.estudios_imagen || '', antibioterapia: antibioticSummary(evolutionForm),
      patogenoAislado: pathogenSummary(evolutionForm), ultimoLaboratorio: latestLabSummary(evolutionForm), observaciones: '',
      letIndicacion: evolutionForm.let_indicacion || evolutionForm.let || '', iotIndicacion: evolutionForm.iot_indicacion || evolutionForm.iot || '', rcpIndicacion: evolutionForm.rcp_indicacion || evolutionForm.rcp || '',
    }; }),
    proaRecordId: record.id, proaBedCode: record.bedCode, proaEnrolled: isProaEnrolledRecord(record), proaUpdatedAt: record.updatedAt,
  };
}

function mergePatient(base, local) {
  const merged = { ...base };
  Object.entries(local || {}).forEach(([key, value]) => {
    if (key === 'antecedentes' && isAutoRenalText(value)) return;
    if (value !== '' && value !== null && value !== undefined) merged[key] = value;
  });
  if (Array.isArray(base.antibioticos) && base.antibioticos.some(item => item?.nombre)) {
    merged.antibioticos = base.antibioticos;
    merged.antibioterapia = structuredAntibioticSummary(base.antibioticos);
  }
  const readmissionSides = [base, local || {}].filter(side => side.reingresoEvaluado === true);
  if (readmissionSides.length > 0) {
    const readmissionSource = readmissionSides.sort((a, b) => String(b.reingresoEvaluadoEn || '').localeCompare(String(a.reingresoEvaluadoEn || '')))[0];
    merged.reingresoEvaluado = true;
    merged.reingresoMenor30 = readmissionSource.reingresoMenor30 === true;
    merged.reingresoFechaEgresoPrevia = readmissionSource.reingresoFechaEgresoPrevia || '';
    merged.reingresoEvaluadoEn = readmissionSource.reingresoEvaluadoEn || '';
  }
  const proaIsNewer = String(base.proaUpdatedAt || '') > String(local?.updatedAt || '');
  if (proaIsNewer) ['nombre', 'rut', 'fechaNacimiento', 'edad', 'sexo', 'direccion', 'comuna', 'fechaIngreso', 'proaRecordId', 'proaBedCode', 'proaEnrolled', 'pacienteSocial', 'diagnosticoPrincipal', 'diagnostico', 'antibioterapia', 'antibioticos', 'aislamiento', 'patogenoAislado', 'ultimoLaboratorio', 'laboratorios', 'cultivos', 'ultimaEvolucion', 'ultimaEvolucionActualizadaEn', 'planProa', 'planesAmbitos', 'planesPendientes', 'planAlta', 'informesMedicos'].forEach(key => {
    const explicitlyClearable = ['ultimaEvolucion', 'ultimaEvolucionActualizadaEn'].includes(key);
    if ((explicitlyClearable && base[key] !== undefined) || (base[key] !== '' && base[key] !== undefined)) merged[key] = base[key];
  });
  const baseHistory = base.historialActualizaciones || [];
  const comparableText = value => String(value || '').replace(/^\[(?:PROA|PLAN PROA|ESTADO CLÍNICO ACTUAL|NOTA DE EVOLUCIÓN)\]\s*/i, '').trim().toLocaleLowerCase('es-CL');
  const repairedLocalHistory = (local?.historialActualizaciones || []).map(item => {
    if (item.fuente || item.tipoDocumento) return item;
    const matchingProa = baseHistory.find(candidate => candidate.fuente === 'PROA' && comparableText(candidate.ultimaEvolucion) && comparableText(candidate.ultimaEvolucion) === comparableText(item.ultimaEvolucion));
    return matchingProa ? { ...item, fuente: 'PROA', tipoDocumento: 'proa', titulo: 'Evolución clínica PROA', documentoOriginal: matchingProa.documentoOriginal, ultimaEvolucion: matchingProa.ultimaEvolucion, planesPendientes: matchingProa.planesPendientes || item.planesPendientes } : item;
  });
  merged.historialActualizaciones = [...baseHistory, ...repairedLocalHistory].filter((item, index, items) => items.findIndex(candidate => String(candidate.id || candidate.guardadoEn || candidate.fecha) === String(item.id || item.guardadoEn || item.fecha)) === index).sort((a, b) => String(b.guardadoEn || b.fecha || '').localeCompare(String(a.guardadoEn || a.fecha || ''))).slice(0, 100);
  return merged;
}

function Field({ label, children, wide = false }) {
  return <label className={wide ? 'block sm:col-span-2' : 'block'}><span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>{children}</label>;
}

const miniInput = `${input} h-8 px-2 text-xs`;
const miniLabel = 'mb-0.5 block text-[10px] font-semibold text-slate-500';

function QuickChips({ options, onPick }) {
  return <div className="mt-1 flex flex-wrap gap-1.5">{options.map(option => <button key={option} type="button" onClick={() => onPick(option)} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800">{option}</button>)}</div>;
}

function PamCalculator({ onInsert }) {
  const [pas, setPas] = useState('');
  const [pad, setPad] = useState('');
  const pas_n = parseFloat(pas);
  const pad_n = parseFloat(pad);
  const pam = Number.isFinite(pas_n) && Number.isFinite(pad_n) ? Math.round((pas_n + 2 * pad_n) / 3) : null;
  return <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
    <div className="w-20"><span className={miniLabel}>PAS</span><input type="number" value={pas} onChange={e => setPas(e.target.value)} className={miniInput} placeholder="mmHg" /></div>
    <div className="w-20"><span className={miniLabel}>PAD</span><input type="number" value={pad} onChange={e => setPad(e.target.value)} className={miniInput} placeholder="mmHg" /></div>
    <p className="pb-1.5 text-xs font-bold text-slate-700">PAM: {pam ?? '—'}</p>
    <Button type="button" size="sm" variant="outline" disabled={pam == null} onClick={() => onInsert(`PA ${pas}/${pad} (PAM ${pam})`)}>Insertar</Button>
  </div>;
}

const OXYGEN_FLOW_TYPES = ['Cánula nasal', 'Mascarilla simple', 'Mascarilla con reservorio'];
function estimateFiO2(tipo, flow) {
  const l = parseFloat(flow);
  if (!Number.isFinite(l) || l <= 0) return null;
  if (tipo === 'Cánula nasal') return Math.min(44, Math.round(20 + 4 * l));
  if (tipo === 'Mascarilla simple') return l < 6 ? 40 : l < 7 ? 50 : 60;
  if (tipo === 'Mascarilla con reservorio') return Math.min(95, Math.round(60 + Math.max(0, l - 10) * 7));
  return null;
}
function parseOxygenQuantity(text) {
  const flujoMatch = String(text || '').match(/([\d.,]+)\s*L\/?\s*min/i);
  const fioMatch = String(text || '').match(/([\d.,]+)\s*%/);
  return { flujo: flujoMatch ? flujoMatch[1].replace(',', '.') : '', fio2: fioMatch ? fioMatch[1].replace(',', '.') : '' };
}

function OxygenFields({ tipo, value, onChange }) {
  const initial = parseOxygenQuantity(value);
  const [flujo, setFlujo] = useState(initial.flujo);
  const [fio2, setFio2] = useState(initial.fio2);
  const [autoFio2, setAutoFio2] = useState(/est\./i.test(String(value || '')));
  const isLowFlow = OXYGEN_FLOW_TYPES.includes(tipo);
  const emit = (nextFlujo, nextFio2, isAuto) => onChange([nextFlujo && `${nextFlujo} L/min`, nextFio2 && `FiO₂ ${nextFio2}%${isAuto ? ' (est.)' : ''}`].filter(Boolean).join(' · '));
  const changeFlujo = raw => {
    let nextFio2 = fio2, nextAuto = autoFio2;
    if (isLowFlow && (autoFio2 || !fio2)) {
      const estimate = estimateFiO2(tipo, raw);
      nextFio2 = estimate != null ? String(estimate) : '';
      nextAuto = true;
    }
    setFlujo(raw); setFio2(nextFio2); setAutoFio2(nextAuto); emit(raw, nextFio2, nextAuto);
  };
  const changeFio2 = raw => { setFio2(raw); setAutoFio2(false); emit(flujo, raw, false); };
  return <div className="mt-2 space-y-1.5">
    <div className="grid grid-cols-2 gap-2">
      <div><span className={miniLabel}>Flujo (L/min)</span><input type="number" min="0" step="0.5" value={flujo} onChange={e => changeFlujo(e.target.value)} className={input} placeholder="L/min" /></div>
      <div><span className={miniLabel}>FiO₂ (%){autoFio2 && fio2 ? ' · estimada' : ''}</span><input type="number" min="21" max="100" value={fio2} onChange={e => changeFio2(e.target.value)} className={input} placeholder="%" /></div>
    </div>
    {tipo === 'Venturi' && <QuickChips options={['24', '28', '31', '35', '40', '50']} onPick={picked => changeFio2(picked)} />}
  </div>;
}

function InfusionCalculator({ onInsert }) {
  const [farmaco, setFarmaco] = useState('');
  const [peso, setPeso] = useState('');
  const [mg, setMg] = useState('');
  const [mlTotal, setMlTotal] = useState('');
  const [dosis, setDosis] = useState('');
  const p = parseFloat(peso), m = parseFloat(mg), v = parseFloat(mlTotal), d = parseFloat(dosis);
  const valid = [p, m, v, d].every(Number.isFinite) && p > 0 && m > 0 && v > 0 && d > 0;
  const rate = valid ? Math.round(((d * p * 60) / ((m * 1000) / v)) * 100) / 100 : null;
  return <div className="mt-2 space-y-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
    <p className="text-[10px] font-semibold text-slate-500">Calculadora de bomba de infusión (mcg/kg/min → mL/h), para drogas dosificadas en mcg/kg/min</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div><span className={miniLabel}>Fármaco</span><input value={farmaco} onChange={e => setFarmaco(e.target.value)} className={miniInput} placeholder="Ej: Noradrenalina" /></div>
      <div><span className={miniLabel}>Peso (kg)</span><input type="number" value={peso} onChange={e => setPeso(e.target.value)} className={miniInput} /></div>
      <div><span className={miniLabel}>Dilución (mg)</span><input type="number" value={mg} onChange={e => setMg(e.target.value)} className={miniInput} /></div>
      <div><span className={miniLabel}>En (mL)</span><input type="number" value={mlTotal} onChange={e => setMlTotal(e.target.value)} className={miniInput} /></div>
    </div>
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-36"><span className={miniLabel}>Dosis (mcg/kg/min)</span><input type="number" value={dosis} onChange={e => setDosis(e.target.value)} className={miniInput} /></div>
      <p className="pb-1.5 text-xs font-bold text-slate-700">Bomba: {rate != null ? `${rate} mL/h` : '—'}</p>
      <Button type="button" size="sm" variant="outline" disabled={rate == null} onClick={() => onInsert(`${farmaco || 'Droga vasoactiva'} ${mg}mg/${mlTotal}mL EV a ${dosis} mcg/kg/min (peso ${peso} kg) → ${rate} mL/h`)}>Insertar</Button>
    </div>
  </div>;
}

const BIC_DRUGS = [
  { nombre: 'Morfina', mg: 10 },
  { nombre: 'Midazolam', mg: 5 },
  { nombre: 'Fentanilo', mg: 0.5 },
  { nombre: 'Haloperidol', mg: 5 },
  { nombre: 'Butilescopolamina', mg: 20 },
  { nombre: 'Levomepromazina', mg: 25 },
  { nombre: 'Metoclopramida', mg: 10 },
  { nombre: 'Ondansetrón', mg: 8 },
  { nombre: 'Dexametasona', mg: 4 },
];

function BicBuilder({ onInsert }) {
  const [rows, setRows] = useState([{ nombre: 'Morfina', mgAmpolla: '10', ampollas: '' }]);
  const [volumen, setVolumen] = useState('');
  const [velocidad, setVelocidad] = useState('');
  const update = (index, patch) => setRows(old => old.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const fmt = numberValue => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(numberValue);
  const vol = parseFloat(volumen), rate = parseFloat(velocidad);
  const flowsValid = Number.isFinite(vol) && vol > 0 && Number.isFinite(rate) && rate > 0;
  const dosePerHour = mgTotal => (mgTotal / vol) * rate;
  const doseLabel = mgHora => mgHora < 1 ? `${fmt(mgHora * 1000)} µg/h` : `${fmt(mgHora)} mg/h`;
  const activeRows = rows.map(row => ({ ...row, totalMg: parseFloat(row.mgAmpolla) * parseFloat(row.ampollas) })).filter(row => String(row.nombre).trim() && Number.isFinite(row.totalMg) && row.totalMg > 0);
  const durationHours = flowsValid ? vol / rate : null;
  const durationLabel = durationHours == null ? null : durationHours >= 1 ? `${fmt(Math.round(durationHours * 10) / 10)} h` : `${Math.round(durationHours * 60)} min`;
  const summary = flowsValid && activeRows.length > 0
    ? `BIC: ${activeRows.map(row => `${row.nombre.toLocaleLowerCase('es-CL')} ${fmt(parseFloat(row.ampollas))} amp (${fmt(row.totalMg)} mg)`).join(' + ')} en ${fmt(vol)} mL a ${fmt(rate)} mL/h → ${activeRows.map(row => `${row.nombre.toLocaleLowerCase('es-CL')} ${doseLabel(dosePerHour(row.totalMg))}`).join(' · ')} · duración ≈ ${durationLabel}`
    : '';
  return <div className="mt-2 space-y-2 rounded-lg border border-dashed border-violet-300 bg-violet-50/40 p-2">
    <p className="text-[10px] font-black uppercase tracking-wide text-violet-800">Armar BIC</p>
    {rows.map((row, index) => {
      const isPreset = BIC_DRUGS.some(drug => drug.nombre === row.nombre);
      const totalMg = parseFloat(row.mgAmpolla) * parseFloat(row.ampollas);
      return <div key={index} className="flex flex-wrap items-end gap-2">
        <div className="w-36"><span className={miniLabel}>Fármaco</span><select className={miniInput} value={isPreset ? row.nombre : 'Otro'} onChange={e => { const preset = BIC_DRUGS.find(drug => drug.nombre === e.target.value); update(index, preset ? { nombre: preset.nombre, mgAmpolla: String(preset.mg) } : { nombre: '', mgAmpolla: '' }); }}>{BIC_DRUGS.map(drug => <option key={drug.nombre}>{drug.nombre}</option>)}<option>Otro</option></select></div>
        {!isPreset && <div className="w-28"><span className={miniLabel}>Nombre</span><input className={miniInput} value={row.nombre} onChange={e => update(index, { nombre: e.target.value })} /></div>}
        <div className="w-24"><span className={miniLabel}>mg/ampolla</span><input type="number" min="0" step="any" className={miniInput} value={row.mgAmpolla} onChange={e => update(index, { mgAmpolla: e.target.value })} /></div>
        <div className="w-20"><span className={miniLabel}>Ampollas</span><input type="number" min="0" step="any" className={miniInput} value={row.ampollas} onChange={e => update(index, { ampollas: e.target.value })} /></div>
        <p className="pb-1.5 text-[11px] font-bold text-slate-700">{Number.isFinite(totalMg) && totalMg > 0 ? `${fmt(totalMg)} mg${flowsValid ? ` · ${doseLabel(dosePerHour(totalMg))}` : ''}` : '—'}</p>
        {rows.length > 1 && <button type="button" onClick={() => setRows(old => old.filter((_, rowIndex) => rowIndex !== index))} className="pb-1.5 text-[11px] font-bold text-red-600">Quitar</button>}
      </div>;
    })}
    <button type="button" onClick={() => setRows(old => [...old, { nombre: 'Midazolam', mgAmpolla: '5', ampollas: '' }])} className="text-[11px] font-bold text-violet-700 hover:text-violet-900">+ Agregar fármaco</button>
    <div className="flex flex-wrap items-end gap-2 border-t border-violet-200 pt-2">
      <div className="w-28"><span className={miniLabel}>Volumen total (mL)</span><input type="number" min="0" step="any" className={miniInput} value={volumen} onChange={e => setVolumen(e.target.value)} placeholder="Ej: 100" /></div>
      <div className="w-28"><span className={miniLabel}>Velocidad (mL/h)</span><input type="number" min="0" step="any" className={miniInput} value={velocidad} onChange={e => setVelocidad(e.target.value)} placeholder="Ej: 4" /></div>
      <p className="pb-1.5 text-xs font-bold text-slate-700">Duración: {durationLabel || '—'}</p>
      <Button type="button" size="sm" variant="outline" disabled={!summary} onClick={() => onInsert(summary)}>Insertar</Button>
    </div>
    {summary && <p className="text-[11px] leading-snug text-slate-600">{summary}</p>}
  </div>;
}

const formatDatesInClinicalText = value => String(value || '').replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3/$2/$1');

function studyVisitSummary(record) {
  const scale = record.escalas?.[0];
  const nutrition = record.evaluacionesNutricionales?.[0];
  return [record.estudiosComplementarios, scale && `Escala ${scale.nombre} (${scale.fecha}): ${scale.puntaje} pts${scale.resultado ? ` · ${scale.resultado}` : ''}`, nutrition && `Nutrición (${nutrition.fecha}): ${nutrition.tamizaje}${nutrition.puntaje ? ` · ${nutrition.puntaje} pts · ${nutrition.riesgo}` : ''} · Eval.: ${nutrition.evaluacion}`].filter(Boolean).join('\n');
}

function nutritionVisitSummary(record) {
  const nutrition = record.evaluacionesNutricionales?.[0];
  if (!nutrition) return '';
  if (nutrition.tamizaje !== 'Sí') return `Nutri: tamizaje ${String(nutrition.tamizaje || 'NC').toLocaleLowerCase('es-CL')} · Eval. ${String(nutrition.evaluacion || 'NC').toLocaleLowerCase('es-CL')}`;
  const risk = nutrition.riesgo ? nutrition.riesgo.replace(/nutricional/gi, '').trim().toLocaleLowerCase('es-CL') : '';
  return `Nutri: ${nutrition.puntaje || '—'} pt${risk ? ` · ${risk}` : ''} · Eval. ${String(nutrition.evaluacion || 'NC').toLocaleLowerCase('es-CL')}`;
}

function VisitTable({ rows, service }) {
  return <>
    <div className="hospital-print-header"><div><h1>Visita médica — Hospitalizados</h1><p>{service} · {new Date().toLocaleDateString('es-CL')}</p></div><p>{rows.length} paciente{rows.length === 1 ? '' : 's'}</p></div>
    <table><thead><tr><th>Cama / paciente / edad</th><th>Día / diagnósticos / antecedentes</th><th>Resumen clínico</th><th>Estado clínico actual</th><th>Estudios</th><th>ATB / patógeno</th><th>Últ. lab.</th><th>Planes / alta / adecuación</th><th>Notas</th></tr></thead><tbody>
      {rows.map(({ bed, record }) => <tr key={bed.code}>
        <td><strong>{bed.serviceShort} · {bed.cell}</strong><br />{record.nombre || 'Sin nombre'}<br /><span>{record.rut || ''}</span>{record.edad !== '' && record.edad != null && <><br /><strong>{record.edad} años</strong></>}</td>
        <td><strong>Día {hospitalDays(record.fechaIngreso)}</strong><br /><strong>{record.diagnosticoPrincipal || record.diagnostico || '—'}{record.pacienteSocial ? ' (caso sociosanitario)' : ''}</strong>{record.diagnosticoPrincipal && record.diagnostico && <><br />{record.diagnostico}</>}{record.antecedentes && <div className="mt-1 border-t border-slate-300 pt-1"><strong>Antecedentes:</strong><br />{record.antecedentes}</div>}</td>
        <td>{record.resumenCaso || (!nutritionVisitSummary(record) ? '—' : '')}{nutritionVisitSummary(record) && <div className="mt-1 text-[0.92em] font-semibold text-lime-800">{nutritionVisitSummary(record)}</div>}</td>
        <td>{record.ultimaEvolucion || '—'}</td>
        <td>{formatDatesInClinicalText(studyVisitSummary(record)) || '—'}</td>
        <td>{record.antibioterapia || record.antibioticos?.length ? (() => { const groups = antibioticVisitItems(record); return <><strong>ATB actual:</strong>{groups.current.length ? groups.current.map((item, index) => <div key={`current-${index}`} className="font-bold text-slate-950">{item}</div>) : <div className="text-slate-500">Sin ATB activo</div>}{groups.suspended.length > 0 && <div className="mt-1 border-t border-slate-300 pt-1 text-slate-400 opacity-70"><span className="font-semibold">Suspendido:</span>{groups.suspended.map((item, index) => <div key={`suspended-${index}`}>{item}</div>)}</div>}</>; })() : 'Sin ATB'}{record.patogenoAislado && <><br /><strong>Patógeno:</strong> {record.patogenoAislado}</>}</td>
        <td>{formatDatesInClinicalText(record.ultimoLaboratorio) || '—'}</td>
        <td>{record.planesPendientes && <div><strong>Plan{record.proaRecordId ? ' (PROA)' : ''}:</strong><br />{record.planesPendientes}</div>}{!record.planesPendientes && !record.planAlta ? '—' : ''}{record.planAlta && <div className="mt-1 border-t border-slate-300 pt-1"><strong>Plan de alta:</strong><br />{record.planAlta}</div>}<div className="mt-1 border-t border-slate-400 pt-1 text-[0.92em]"><strong>Adecuación:</strong><br />LET {record.letIndicacion || 'NC'} · IOT {record.iotIndicacion || 'NC'} · RCP {record.rcpIndicacion || 'NC'}</div></td>
        <td className="visit-notes-cell" aria-label="Notas para completar durante la visita">&nbsp;</td>
      </tr>)}
    </tbody></table>
  </>;
}

const CHART_COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#d97706', '#0891b2', '#65a30d'];
function StatisticsDashboard({ statistics }) {
  const percentageChart = (key) => statistics.byService.map(item => ({ servicio: item.label, porcentaje: item[key] }));
  const metricCards = [
    ['Ocupación global', statistics.overall.occupancyPct, `${statistics.overall.occupied}/${statistics.overall.capacity} camas`],
    ['Hospitalización >7 días', statistics.overall.longStayPct, `${statistics.overall.longStay}/${statistics.overall.nonSocial} pacientes no sociales`],
    ['Con antibioterapia', statistics.overall.atbPct, `${statistics.overall.withAtb}/${statistics.overall.occupied} pacientes`],
  ];
  const ServiceBars = ({ data, color }) => <ResponsiveContainer width="100%" height={250}><BarChart data={data} margin={{ top: 8, right: 18, left: -12, bottom: 12 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="servicio" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tickFormatter={value => `${value}%`} tick={{ fontSize: 10 }} /><Tooltip formatter={value => [`${value}%`, 'Porcentaje']} /><Bar dataKey="porcentaje" fill={color} radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer>;
  return <main className="mx-auto max-w-[1500px] space-y-5 p-4 pb-32">
    <div><h2 className="text-2xl font-black text-slate-950">Estadística hospitalaria</h2><p className="text-sm text-slate-500">Indicadores calculados con la ocupación vigente de Vista General.</p></div>
    <section className="grid gap-3 md:grid-cols-3">{metricCards.map(([label, value, detail], index) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm font-bold text-slate-600">{label}</p><span className="h-3 w-3 rounded-full" style={{ backgroundColor: CHART_COLORS[index] }} /></div><p className="mt-2 text-4xl font-black text-slate-950">{value}%</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>)}</section>
    <section className="grid gap-4 xl:grid-cols-3">
      {[['Ocupación de camas por servicio', 'occupancyPct', '#0f766e'], ['Hospitalización >7 días por servicio', 'longStayPct', '#7c3aed'], ['Antibioterapia por servicio', 'atbPct', '#d97706']].map(([title, key, color]) => <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="font-black text-slate-900">{title}</h3><p className="mb-2 text-xs text-slate-500">{key === 'longStayPct' ? 'Excluye pacientes sociales del denominador.' : 'Porcentaje sobre el servicio correspondiente.'}</p><ServiceBars data={percentageChart(key)} color={color} /></div>)}
    </section>
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-teal-200 bg-white p-4 shadow-sm"><h3 className="font-black text-teal-950">PROA · Antibióticos activos</h3><p className="mb-3 text-xs text-slate-500">Distribución de tratamientos vigentes.</p>{statistics.antibiotics.length ? <ResponsiveContainer width="100%" height={300}><BarChart data={statistics.antibiotics} layout="vertical" margin={{ left: 30, right: 20 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis dataKey="name" type="category" width={135} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="count" name="Pacientes" fill="#0f766e" radius={[0, 7, 7, 0]} /></BarChart></ResponsiveContainer> : <p className="py-16 text-center text-sm text-slate-400">Sin antibioterapia activa registrada.</p>}</div>
      <div className="rounded-2xl border border-cyan-200 bg-white p-4 shadow-sm"><h3 className="font-black text-cyan-950">PROA · Patógenos aislados</h3><p className="mb-3 text-xs text-slate-500">Registros microbiológicos vigentes.</p>{statistics.pathogens.length ? <ResponsiveContainer width="100%" height={300}><PieChart><Pie data={statistics.pathogens} dataKey="count" nameKey="name" innerRadius={55} outerRadius={100} paddingAngle={2} label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}>{statistics.pathogens.map((item, index) => <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <p className="py-16 text-center text-sm text-slate-400">Sin patógenos aislados registrados.</p>}</div>
    </section>
  </main>;
}

function ProaQuickModal({ bed, hasRecord, value, setValue, saving, onClose, onFull, onSave }) {
  const [preview, setPreview] = useState(false);
  const updateAtb = (index, key, nextValue) => setValue(old => ({ ...old, antibioticos: old.antibioticos.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: nextValue } : item) }));
  const selectAtb = (index, name) => setValue(old => ({ ...old, antibioticos: old.antibioticos.map((item, itemIndex) => itemIndex === index ? { ...item, nombre: name, ...(DEFAULT_DOSIS_ATB[name] || {}) } : item), antibioticos_eliminados: (old.antibioticos_eliminados || []).filter(item => item.toLocaleLowerCase('es') !== name.toLocaleLowerCase('es')) }));
  const setCultivos = updater => setValue(old => ({ ...old, cultivos: typeof updater === 'function' ? updater(old.cultivos) : updater }));
  return <div className="fixed inset-0 z-[86] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-5 shadow-2xl">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-100/80 p-3"><div><h2 className="text-lg font-black text-teal-950">Evolución PROA — Cama {bed?.cell}</h2><p className="text-xs text-emerald-800">La primera evolución constituye el ingreso PROA; las siguientes quedan en el mismo historial.</p></div><Button type="button" variant="outline" onClick={() => setPreview(current => !current)} className="gap-2 border-teal-300 bg-white text-teal-800 hover:bg-teal-50"><Printer className="h-4 w-4" />{preview ? 'Ocultar vista previa' : 'Vista previa'}</Button></div>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
      {!hasRecord && <section className="rounded-xl border border-emerald-200 bg-white/80 p-4"><div className="mb-3 flex items-center justify-between gap-2"><div><h3 className="text-sm font-black text-emerald-950">Datos precargados del paciente</h3><p className="text-xs text-emerald-700">Puedes corregirlos antes de crear el registro PROA.</p></div><span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800">NUEVO PROA</span></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Nombre completo" wide><input className={input} value={value.paciente || ''} onChange={e => setValue(old => ({ ...old, paciente: e.target.value }))} /></Field><Field label="RUT"><input className={input} value={value.rut || ''} onChange={e => setValue(old => ({ ...old, rut: formatRut(e.target.value) }))} /></Field><Field label="Edad"><input type="number" min="0" max="130" className={input} value={value.edad || ''} onChange={e => setValue(old => ({ ...old, edad: e.target.value }))} /></Field><Field label="Sexo"><select className={input} value={value.sexo || ''} onChange={e => setValue(old => ({ ...old, sexo: e.target.value }))}><option value="">No consignado</option><option value="F">Femenino</option><option value="M">Masculino</option><option value="Otro">Otro</option></select></Field><Field label="Fecha de ingreso"><input type="date" className={input} value={value.fecha_ingreso || ''} onChange={e => setValue(old => ({ ...old, fecha_ingreso: e.target.value }))} /></Field><Field label="Diagnóstico principal" wide><textarea className={textarea} value={value.diagnostico || ''} onChange={e => setValue(old => ({ ...old, diagnostico: e.target.value }))} /></Field></div></section>}
      <Field label="Aislamiento / precauciones"><input list="hospital-proa-isolations" className={input} value={value.aislamiento} onChange={e => setValue(old => ({ ...old, aislamiento: e.target.value }))} placeholder="Seleccionar o escribir…" /><datalist id="hospital-proa-isolations">{ISOLATION_TYPES.map(item => <option key={item} value={item} />)}</datalist></Field>
      <Field label="Resumen clínico"><textarea className={textarea} value={value.resumen_caso || ''} onChange={e => setValue(old => ({ ...old, resumen_caso: e.target.value }))} placeholder="Síntesis general del cuadro clínico" /></Field>
      <Field label="Evolución actual"><textarea className={textarea} value={value.evolucion || ''} onChange={e => setValue(old => ({ ...old, evolucion: e.target.value }))} placeholder="Cambios clínicos y estado actual del paciente" /></Field>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Estudios complementarios"><textarea className={textarea} value={value.estudios_imagen || ''} onChange={e => setValue(old => ({ ...old, estudios_imagen: e.target.value }))} /></Field><Field label="Plan sugerido"><textarea className={textarea} value={value.plan_duracion || ''} onChange={e => setValue(old => ({ ...old, plan_duracion: e.target.value }))} /></Field></div>
      <section><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-black text-slate-900">Exámenes de sangre</h3><Button type="button" size="sm" variant="outline" onClick={() => setValue(old => ({ ...old, examenes_sangre: [...old.examenes_sangre, { fecha: '', pcr: '', pct: '', leucocitos: '', crea: '' }] }))}><Plus className="mr-1 h-3.5 w-3.5" />Agregar control</Button></div><div className="space-y-2">{value.examenes_sangre.map((exam,index) => <div key={index} className="grid gap-2 rounded-lg border bg-slate-50 p-2 sm:grid-cols-[140px_repeat(4,1fr)_auto]"><input type="date" className={input} value={exam.fecha || ''} onChange={e => setValue(old => ({ ...old, examenes_sangre: old.examenes_sangre.map((item,i) => i === index ? { ...item, fecha: e.target.value } : item) }))} />{[['pcr','PCR'],['pct','PCT'],['leucocitos','Leucocitos'],['crea','Creatinina']].map(([key,label]) => <input key={key} className={input} value={exam[key] || ''} onChange={e => setValue(old => ({ ...old, examenes_sangre: old.examenes_sangre.map((item,i) => i === index ? { ...item, [key]: e.target.value } : item) }))} placeholder={label} />)}<Button type="button" variant="ghost" size="sm" onClick={() => setValue(old => ({ ...old, examenes_sangre: old.examenes_sangre.length === 1 ? [{ fecha: '', pcr: '', pct: '', leucocitos: '', crea: '' }] : old.examenes_sangre.filter((_,i) => i !== index) }))} className="text-red-600">Quitar</Button></div>)}</div></section>
      <section><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-black text-slate-900">Exámenes complementarios</h3><Button type="button" size="sm" variant="outline" onClick={() => setValue(old => ({ ...old, examenes_complementarios: [...old.examenes_complementarios, { fecha: '', nombre: '', resultado: '' }] }))}><Plus className="mr-1 h-3.5 w-3.5" />Agregar examen</Button></div><div className="space-y-2">{value.examenes_complementarios.map((exam,index) => <div key={index} className="grid gap-2 rounded-lg border border-sky-200 bg-sky-50/50 p-2 sm:grid-cols-[140px_1fr_2fr_auto]"><input type="date" className={input} value={exam.fecha || ''} onChange={e => setValue(old => ({ ...old, examenes_complementarios: old.examenes_complementarios.map((item,i) => i === index ? { ...item, fecha: e.target.value } : item) }))} /><input className={input} value={exam.nombre || ''} onChange={e => setValue(old => ({ ...old, examenes_complementarios: old.examenes_complementarios.map((item,i) => i === index ? { ...item, nombre: e.target.value } : item) }))} placeholder="Examen / estudio" /><input className={input} value={exam.resultado || ''} onChange={e => setValue(old => ({ ...old, examenes_complementarios: old.examenes_complementarios.map((item,i) => i === index ? { ...item, resultado: e.target.value } : item) }))} placeholder="Resultado / hallazgo" /><Button type="button" variant="ghost" size="sm" onClick={() => setValue(old => ({ ...old, examenes_complementarios: old.examenes_complementarios.length === 1 ? [{ fecha: '', nombre: '', resultado: '' }] : old.examenes_complementarios.filter((_,i) => i !== index) }))} className="text-red-600">Quitar</Button></div>)}</div></section>
      <section><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-black text-slate-900">Antibioterapia actual</h3><Button type="button" size="sm" variant="outline" onClick={() => setValue(old => ({ ...old, antibioticos: [...old.antibioticos, { ...EMPTY_QUICK_ATB }] }))}><Plus className="mr-1 h-3.5 w-3.5" />Agregar ATB</Button></div>
        <div className="space-y-2">{value.antibioticos.map((atb, index) => { const days = treatmentDays(atb.inicio, atb.termino); const isCurrent = !atb.termino; return <div key={index} className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-12 ${isCurrent ? 'border-emerald-300 bg-emerald-50/60' : 'border-red-200 bg-red-50/50'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-12"><p className={`text-xs font-black uppercase tracking-wide ${isCurrent ? 'text-emerald-900' : 'text-red-800'}`}>Antimicrobiano {index + 1}</p><span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${isCurrent ? 'bg-emerald-600 text-white' : 'bg-red-100 text-red-800'}`}>{isCurrent ? `Vigente${days ? ` · Día ${days}` : ''}` : `Suspendido${days ? ` · ${days} ${days === 1 ? 'día total' : 'días totales'}` : ''}`}</span></div>
          <div className="sm:col-span-3"><Field label="Antibiótico"><input list="vista-proa-antibioticos" className={input} value={atb.nombre || ''} onChange={e => selectAtb(index, e.target.value)} /></Field></div>
          <div className="sm:col-span-3"><Field label="Presentación"><select className={input} value={atb.presentacion || ''} onChange={e => updateAtb(index, 'presentacion', e.target.value)}><option value="">Seleccionar…</option>{(PRESENTACIONES_ATB[atb.nombre] || []).map(option => <option key={option.label} value={option.label}>{option.label}</option>)}</select></Field></div>
          <div className="sm:col-span-2"><Field label="Dosis"><input className={input} value={atb.dosis_cantidad || atb.dosis || ''} onChange={e => { updateAtb(index, 'dosis_cantidad', e.target.value); updateAtb(index, 'dosis', ''); }} /></Field></div>
          <div className="sm:col-span-1"><Field label="Unidad"><select className={input} value={atb.dosis_unidad || 'mg'} onChange={e => updateAtb(index, 'dosis_unidad', e.target.value)}>{['mg','g','UI','MUI','comprimido','ampolla'].map(unit => <option key={unit}>{unit}</option>)}</select></Field></div>
          <div className="sm:col-span-1"><Field label="Cada h"><input className={input} value={atb.intervalo_horas || ''} onChange={e => updateAtb(index, 'intervalo_horas', e.target.value)} /></Field></div>
          <div className="sm:col-span-1"><Field label="Vía"><select className={input} value={atb.via || 'EV'} onChange={e => updateAtb(index, 'via', e.target.value)}>{['EV','VO','IM','SC'].map(via => <option key={via}>{via}</option>)}</select></Field></div>
          <div className="sm:col-span-2"><Field label={atb.inicio && treatmentDays(atb.inicio, atb.termino) ? `Inicio · Día ${treatmentDays(atb.inicio, atb.termino)}` : 'Inicio'}><input type="date" className={input} value={atb.inicio || ''} onChange={e => updateAtb(index, 'inicio', e.target.value)} /></Field></div>
          <div className="sm:col-span-3"><Field label="Fecha de término (opcional)"><div className="flex gap-1"><input type="date" className={input} value={atb.termino || ''} onChange={e => updateAtb(index, 'termino', e.target.value)} />{atb.termino && <Button type="button" variant="outline" size="sm" onClick={() => updateAtb(index, 'termino', '')} className="h-10 shrink-0 border-red-200 px-2 text-xs text-red-700">Borrar fecha</Button>}</div><p className="mt-1 text-[10px] text-slate-500">Vacía mientras esté vigente.</p></Field></div>
          <div className="flex items-end sm:col-span-2"><Button type="button" variant="outline" size="sm" onClick={() => setValue(old => ({ ...old, antibioticos: old.antibioticos.length === 1 ? [{ ...EMPTY_QUICK_ATB }] : old.antibioticos.filter((_, itemIndex) => itemIndex !== index), antibioticos_eliminados: atb.nombre ? [...new Set([...(old.antibioticos_eliminados || []), atb.nombre])] : (old.antibioticos_eliminados || []) }))} className="gap-1 border-red-200 text-red-700"><Trash2 className="h-3.5 w-3.5" />Eliminar registrado</Button></div>
        </div>; })}</div>
        <datalist id="vista-proa-antibioticos">{ANTIBIOTICOS.map(name => <option key={name} value={name} />)}</datalist>
      </section>
      <CultureRegistryEditor cultures={value.cultivos} setCultures={setCultivos} />
      {preview && <div className="proa-quick-print mx-auto w-full max-w-[210mm] overflow-hidden rounded-xl border border-slate-300 bg-white shadow-lg"><ProaEvolutionDocument form={value} bed={bed} /></div>}
    </div>
    <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={onClose}>Cerrar</Button>{preview && <Button variant="outline" onClick={() => printPreviewElement('.proa-quick-print', 'Evolución clínica PROA')}><Printer className="mr-1 h-4 w-4" />Imprimir / PDF</Button>}<Button variant="outline" onClick={onFull} className="border-teal-300 text-teal-800">Abrir formulario ampliado</Button><Button variant="outline" onClick={() => onSave({ keepOpen: true, previewAfter: true, setPreview })} disabled={saving || (!hasRecord && (!value.paciente || !value.rut))} className="border-teal-400 bg-teal-50 text-teal-800">Guardar y vista previa</Button><Button onClick={() => onSave()} disabled={saving || (!hasRecord && (!value.paciente || !value.rut))} className="bg-teal-700 hover:bg-teal-800">{saving ? 'Guardando…' : 'Guardar evolución PROA'}</Button></div>
  </div></div>;
}

function HospitalLabEntry({ rows, setRows, cultures, setCultures, pasteText, setPasteText, parseMessage, setParseMessage, onParse }) {
  return <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
    <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-4"><div className="mb-2"><h3 className="text-sm font-black text-blue-950">Carga automática desde informe</h3><p className="text-xs text-blue-700">Reconoce laboratorio general y microbiología. Los cultivos se sincronizan con PROA cuando el paciente está vinculado.</p></div><textarea className={`${textarea} min-h-32 bg-white font-mono text-xs`} value={pasteText} onChange={e => { setPasteText(e.target.value); setParseMessage(''); }} placeholder="Pega hemograma, función renal/hepática, electrolitos, coagulación, perfil lipídico, cultivos o paneles microbiológicos…" /><div className="mt-2 flex flex-wrap items-center justify-between gap-2">{parseMessage ? <p className={`text-xs font-semibold ${parseMessage.startsWith('No se') ? 'text-amber-700' : 'text-emerald-700'}`}>{parseMessage}</p> : <span />}<Button type="button" size="sm" onClick={onParse} disabled={!pasteText.trim()} className="bg-blue-700 hover:bg-blue-800"><FlaskConical className="mr-1 h-4 w-4" />Procesar y cargar</Button></div></section>
    {rows.map((row, index) => <section key={`${row.fecha}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="mb-3 flex items-end justify-between gap-3"><Field label={`Control ${index + 1} · fecha`}><input type="date" className={input} value={row.fecha} onChange={e => setRows(current => current.map((item, rowIndex) => rowIndex === index ? { ...item, fecha: e.target.value } : item))} /></Field><Button type="button" variant="ghost" size="sm" onClick={() => setRows(current => current.filter((_, rowIndex) => rowIndex !== index))} className="text-red-600">Eliminar fecha y exámenes</Button></div><div className="space-y-2">{HOSPITAL_LAB_GROUPS.map((group, groupIndex) => <details key={group.name} open={groupIndex < 3} className="rounded-lg border border-slate-200 bg-white"><summary className="cursor-pointer px-3 py-2 text-xs font-black text-slate-700">{group.name}</summary><div className="grid gap-3 border-t border-slate-100 p-3 sm:grid-cols-3 lg:grid-cols-4">{group.fields.map(([key, label, unit]) => <Field key={key} label={`${label}${unit ? ` · ${unit}` : ''}`}><input className={input} value={row[key] || ''} onChange={e => setRows(current => current.map((item, rowIndex) => rowIndex === index ? { ...item, [key]: e.target.value } : item))} /></Field>)}</div></details>)}</div></section>)}
    <Button type="button" variant="outline" onClick={() => setRows(current => [...current, emptyHospitalLabRow()])} className="w-full border-dashed border-blue-300 text-blue-700"><Plus className="mr-1 h-4 w-4" />Agregar otra fecha</Button>
    <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-4"><div className="mb-3"><h3 className="text-sm font-black text-violet-950">Microbiología</h3><p className="text-xs text-violet-700">Resultados detectados por el parser, provenientes de PROA o registrados manualmente. Se sincronizan con la ficha y con PROA al guardar.</p></div><CultureRegistryEditor cultures={cultures} setCultures={setCultures} /></section>
  </div>;
}

const ACTIONS = [
  { label: 'Evolución PROA', route: 'GestionPROA', proa: true, icon: ShieldCheck, color: 'text-teal-800 bg-teal-50' },
  { label: 'Solicitud de exámenes', route: 'SolicitudExamenes', icon: FlaskConical, color: 'text-blue-700 bg-blue-50' },
  { label: 'Microbiología', route: 'SolicitudMicrobiologia', icon: Microscope, color: 'text-cyan-700 bg-cyan-50' },
  { label: 'Fármaco restringido', route: 'SolicitudFarmacoRestringido', icon: Pill, color: 'text-amber-700 bg-amber-50' },
  { label: 'HODOM / consentimientos', route: 'FormulariosHODOM', icon: FileText, color: 'text-indigo-700 bg-indigo-50' },
  { label: 'Formulario / Constancia GES', route: 'FormularioGES', icon: ShieldCheck, color: 'text-emerald-700 bg-emerald-50' },
  { label: 'IRA grave / ISP', route: 'FormularioIRAGrave', icon: Activity, color: 'text-rose-700 bg-rose-50' },
  { label: 'Solicitar protocolo de imágenes', route: 'Templates?image=1', icon: Image, color: 'text-violet-700 bg-violet-50' },
];

function CompactLabMetric({ rows, field, label, unit, color }) {
  const data = (rows || []).map(row => ({ fecha: String(row.fecha || '').slice(5), valor: Number(String(row[field] ?? '').replace(',', '.')) })).filter(item => Number.isFinite(item.valor));
  const latest = data[data.length - 1];
  return <div className="rounded-xl border border-cyan-100 bg-white p-3"><div className="flex items-baseline justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-wide text-slate-600">{label}</p><p className="text-sm font-black text-slate-900">{latest ? latest.valor : '—'} <span className="text-[9px] font-medium text-slate-400">{latest ? unit : ''}</span></p></div><div className="mt-1 h-14">{data.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 7, right: 4, left: 4, bottom: 2 }}><Tooltip labelFormatter={value => `Fecha ${value}`} formatter={value => [`${value} ${unit}`, label]} contentStyle={{ fontSize: 10, borderRadius: 8 }} /><Line type="monotone" dataKey="valor" stroke={color} strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-[10px] text-slate-400">Sin datos seriados</div>}</div></div>;
}

function VistaHospitalizados() {
  const navigate = useNavigate();
  const returningToBed = sessionStorage.getItem(RETURN_TO_BED_KEY) === '1';
  const [registry, setRegistry] = useState(readRegistry);
  const [hodomRows, setHodomRows] = useState([]);
  const [selectedCode, setSelectedCode] = useState(() => returningToBed ? sessionStorage.getItem(SELECTED_BED_KEY) || '' : '');
  const [draft, setDraft] = useState(() => { const code = returningToBed ? sessionStorage.getItem(SELECTED_BED_KEY) || '' : ''; return { ...EMPTY, ...(code ? readRegistry()[code] : {}) }; });
  const [service, setService] = useState('MQ1');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [bedViewMode, setBedViewMode] = useState('grid');
  const [activeTab, setActiveTab] = useState('camas');
  const [patientViewTab, setPatientViewTab] = useState('clinical');
  const [demographicsOpen, setDemographicsOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [syncState, setSyncState] = useState('loading');
  const [printPreview, setPrintPreview] = useState(false);
  const [printServices, setPrintServices] = useState(() => PRINT_SERVICE_OPTIONS.map(option => option.value));
  const [careDocumentOpen, setCareDocumentOpen] = useState(false);
  const [medicalReportsOpen, setMedicalReportsOpen] = useState(false);
  const [documentArchiveOpen, setDocumentArchiveOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [draftHistoryRevision, setDraftHistoryRevision] = useState(0);
  const [labWorkspaceTab, setLabWorkspaceTab] = useState('registro');
  const [labCurveLoading, setLabCurveLoading] = useState(false);
  const [labCurveRows, setLabCurveRows] = useState([]);
  const compactLabRows = useMemo(() => mergeLaboratoryRows([], draft.laboratorios || []).slice(0, 8).reverse(), [draft.laboratorios]);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [labOpen, setLabOpen] = useState(false);
  const [microOpen, setMicroOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [generalOpen, setGeneralOpen] = useState(false);
  const [fullGeneralOpen, setFullGeneralOpen] = useState(false);
  const [generalDraftRestored, setGeneralDraftRestored] = useState(false);
  const [generalDraft, setGeneralDraft] = useState(EMPTY);
  const [plansOpen, setPlansOpen] = useState(false);
  const [plansDraft, setPlansDraft] = useState({ planProa: '', planesAmbitos: [{ ...EMPTY_PLAN_AMBITO }], planAlta: '' });
  const [editingHistoryIndex, setEditingHistoryIndex] = useState(null);
  const [diagnosisAndHistoryDraft, setDiagnosisAndHistoryDraft] = useState('');
  const [evolutionOpen, setEvolutionOpen] = useState(false);
  const [evolutionDraft, setEvolutionDraft] = useState('');
  const [evolutionDraftRestored, setEvolutionDraftRestored] = useState(false);
  const [clinicalStatusDraft, setClinicalStatusDraft] = useState({ signosVitales: '', oxigenoterapiaTipo: '', oxigenoterapiaCantidad: '', drogasVasoactivas: '', soporteClinico: '' });
  const [clinicalSupportVisible, setClinicalSupportVisible] = useState({ vasoactives: false, supports: false });
  const appendClinicalStatus = (key, text) => setClinicalStatusDraft(old => ({ ...old, [key]: old[key] ? `${old[key]} · ${text}` : text }));
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [scalesOpen, setScalesOpen] = useState(false);
  const [scaleDraft, setScaleDraft] = useState({ fecha: new Date().toISOString().slice(0, 10), calculatorId: '', nombre: '', puntaje: '', resultado: '' });
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const [nutritionNrsVisible, setNutritionNrsVisible] = useState(false);
  const [nutritionDraft, setNutritionDraft] = useState({ fecha: new Date().toISOString().slice(0, 10), tamizaje: '', puntaje: '', evaluacion: '' });
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [diagnosisDraft, setDiagnosisDraft] = useState({ principal: '', desglose: '', antecedentes: '' });
  const [diagnosisSearch, setDiagnosisSearch] = useState('');
  const [diagnosisCategory, setDiagnosisCategory] = useState('Todas');
  const [studiesOpen, setStudiesOpen] = useState(false);
  const [studiesRows, setStudiesRows] = useState([]);
  const [proaOpen, setProaOpen] = useState(false);
  const [proaSaving, setProaSaving] = useState(false);
  const [dischargeOpen, setDischargeOpen] = useState(false);
  const [discharging, setDischarging] = useState(false);
  const [dischargeDraft, setDischargeDraft] = useState({ fecha: new Date().toISOString().slice(0, 10), motivo: '', destinoServicio: '', destinoCama: '', antibioticActions: {}, antibioticStopDates: {}, antibioticoAltaIndicacion: '' });
  const [proaQuick, setProaQuick] = useState({ paciente: '', rut: '', edad: '', sexo: '', fecha_ingreso: '', diagnostico: '', aislamiento: '', evolucion: '', resumen_caso: '', estudios_imagen: '', plan_duracion: '', examenes_sangre: [{ fecha: '', pcr: '', pct: '', leucocitos: '', crea: '' }], examenes_complementarios: [{ fecha: '', nombre: '', resultado: '' }], antibioticos: [{ ...EMPTY_QUICK_ATB }], antibioticos_eliminados: [], cultivos: [{ fecha: '', tipo_muestra: '', estado_resultado: 'pendiente', patogeno: '', sensibilidad: 'Pendiente' }] });
  const [labSaving, setLabSaving] = useState(false);
  const [labCultures, setLabCultures] = useState([]);
  const [labPasteText, setLabPasteText] = useState('');
  const [labParseMessage, setLabParseMessage] = useState('');
  const [readmissionOpen, setReadmissionOpen] = useState(false);
  const [readmissionDraft, setReadmissionDraft] = useState({ value: '', detected: false, previousDischargeDate: '' });
  const pendingClinicalAction = useRef(null);
  const emptyLabRow = () => emptyHospitalLabRow();
  const [labRows, setLabRows] = useState(() => [emptyLabRow()]);

  useEffect(() => { sessionStorage.removeItem(RETURN_TO_BED_KEY); }, []);

  useEffect(() => {
    const refreshHospitalRegistry = event => {
      const nextRegistry = readRegistry();
      setRegistry(nextRegistry);
      if (selectedCode && (!event?.detail?.bedCode || event.detail.bedCode === selectedCode)) {
        setDraft({ ...EMPTY, ...(nextRegistry[selectedCode] || {}) });
      }
    };
    window.addEventListener(HOSPITAL_REGISTRY_UPDATED_EVENT, refreshHospitalRegistry);
    return () => window.removeEventListener(HOSPITAL_REGISTRY_UPDATED_EVENT, refreshHospitalRegistry);
  }, [selectedCode]);

  useEffect(() => {
    if (!selectedCode) return;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedCode]);

  useEffect(() => {
    let active = true;
    const synchronize = () => fetchProaRecords().then(records => {
      if (!active) return;
      const currentHodomRows = records.filter(record => !isHistoricalProaRecord(record) && (/^HD-/i.test(record.bedCode) || /domiciliaria/i.test(record.servicio || ''))).map(record => ({
        bed: { code: record.bedCode, cell: record.bedCode, serviceShort: 'HODOM', salaLabel: 'Hospitalización domiciliaria' },
        record: proaToPatient(record),
      }));
      setHodomRows(currentHodomRows);
      setRegistry(current => {
        const fromProa = {};
        const activeRecordLocations = new Map();
        records.filter(record => !isHistoricalProaRecord(record)).forEach(record => {
          const catalogCode = PROA_TO_CATALOG.get(record.bedCode)
            || (ALL_BEDS.some(bed => bed.code === record.bedCode) ? record.bedCode : null);
          if (catalogCode) {
            fromProa[catalogCode] = proaToPatient(record);
            activeRecordLocations.set(record.id, catalogCode);
          }
        });
        currentHodomRows.forEach(({ bed, record }) => {
          fromProa[bed.code] = record;
          if (record.proaRecordId) activeRecordLocations.set(record.proaRecordId, bed.code);
        });
        const merged = { ...fromProa };
        Object.entries(current).forEach(([bedCode, local]) => {
          if (local?.proaRecordId && activeRecordLocations.get(local.proaRecordId) !== bedCode) return;
          merged[bedCode] = mergePatient(fromProa[bedCode] || {}, local);
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        return merged;
      });
      setSyncState('ready');
    }).catch(() => { if (active) setSyncState('offline'); });
    synchronize();
    const intervalId = window.setInterval(synchronize, 60000);
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') synchronize(); };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', synchronize);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', synchronize);
    };
  }, []);

  const displayBeds = useMemo(() => [...ALL_BEDS, ...hodomRows.map(item => item.bed), TEST_BED].sort((a, b) => (PRINT_SERVICE_ORDER.get(a.serviceShort) ?? 99) - (PRINT_SERVICE_ORDER.get(b.serviceShort) ?? 99)
    || String(a.cell).localeCompare(String(b.cell), 'es', { numeric: true })), [hodomRows]);
  const services = [...new Set(displayBeds.map(b => b.serviceShort))];
  const changeService = direction => {
    const currentIndex = Math.max(0, services.indexOf(service));
    setService(services[(currentIndex + direction + services.length) % services.length]);
  };
  const selectedBed = displayBeds.find(b => b.code === selectedCode);
  const savedEvolutionHistory = Array.isArray(draft.historialActualizaciones) ? draft.historialActualizaciones : [];
  const evolutionHistoryDrafts = useMemo(() => evolutionDraftHistoryEntries(selectedCode), [selectedCode, draftHistoryRevision]);
  const totalEvolutionHistory = savedEvolutionHistory.length + evolutionHistoryDrafts.length;
  const showSavedEvolutionHistory = historyFilter === 'all' || historyFilter === 'saved';
  const showDraftEvolutionHistory = historyFilter === 'all' || historyFilter === 'drafts';
  const latestEvolutionMeta = useMemo(() => latestFieldMetadata(draft.historialActualizaciones, 'ultimaEvolucion', draft.ultimaEvolucion), [draft.historialActualizaciones, draft.ultimaEvolucion]);
  const clinicalStateStatus = useMemo(() => clinicalStateIndicator(draft, latestEvolutionMeta), [draft, latestEvolutionMeta]);
  const latestPlanMeta = useMemo(() => latestFieldMetadata(draft.historialActualizaciones, 'planesPendientes', draft.planesPendientes), [draft.historialActualizaciones, draft.planesPendientes]);
  const destinationBeds = useMemo(() => displayBeds
    .filter(bed => bed.serviceShort === dischargeDraft.destinoServicio && bed.code !== selectedCode)
    .map(bed => {
      const record = registry[bed.code] || {};
      return { ...bed, occupied: Boolean(record.nombre || record.rut || record.fechaIngreso || record.diagnosticoPrincipal || record.diagnostico) };
    }), [displayBeds, dischargeDraft.destinoServicio, registry, selectedCode]);
  const selectedCalculator = allCalculators.find(item => item.id === scaleDraft.calculatorId);
  const SelectedCalculatorComponent = selectedCalculator?.component;
  const occupied = Boolean(draft.nombre || draft.rut || draft.fechaIngreso || draft.diagnostico);
  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const visibleBeds = useMemo(() => displayBeds.filter(b => {
    const record = registry[b.code] || {};
    const isOccupied = Boolean(record.nombre || record.rut || record.fechaIngreso || record.diagnostico);
    if (service !== 'all' && b.serviceShort !== service) return false;
    if (status === 'occupied' && !isOccupied) return false;
    if (status === 'free' && isOccupied) return false;
    if (!normalizedQuery) return true;
    return [b.code, b.cell, b.serviceShort, b.salaLabel, record.nombre, record.rut, record.diagnostico]
      .some(value => String(value || '').toLocaleLowerCase('es').includes(normalizedQuery));
  }), [displayBeds, registry, service, status, normalizedQuery]);

  const totals = useMemo(() => {
    const censusBeds = displayBeds.filter(b => b.code !== TEST_BED.code);
    const occupiedCount = censusBeds.filter(b => { const r = registry[b.code] || {}; return r.nombre || r.rut || r.fechaIngreso || r.diagnosticoPrincipal || r.diagnostico; }).length;
    return { occupied: occupiedCount, free: censusBeds.length - occupiedCount };
  }, [displayBeds, registry]);

  const statistics = useMemo(() => {
    const percent = (numerator, denominator) => denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
    const today = new Date().toISOString().slice(0, 10);
    const censusBeds = displayBeds.filter(bed => bed.code !== TEST_BED.code);
    const occupiedRows = censusBeds.map(bed => ({ bed, record: registry[bed.code] || {} })).filter(({ record }) => record.nombre || record.rut || record.fechaIngreso || record.diagnosticoPrincipal || record.diagnostico);
    const hasActiveAtb = record => (record.antibioticos || []).some(item => item?.nombre && (!item.termino || item.termino >= today)) || (!record.antibioticos?.length && Boolean(record.antibioterapia));
    const byService = PRINT_SERVICE_OPTIONS.map(option => {
      const serviceBeds = displayBeds.filter(bed => bed.serviceShort === option.value);
      const patients = occupiedRows.filter(({ bed }) => bed.serviceShort === option.value);
      const nonSocial = patients.filter(({ record }) => !record.pacienteSocial);
      const longStay = nonSocial.filter(({ record }) => hospitalDays(record.fechaIngreso) > 7);
      const withAtb = patients.filter(({ record }) => hasActiveAtb(record));
      return { service: option.value, label: option.label, capacity: serviceBeds.length, occupied: patients.length, nonSocial: nonSocial.length, longStay: longStay.length, withAtb: withAtb.length, occupancyPct: percent(patients.length, serviceBeds.length), longStayPct: percent(longStay.length, nonSocial.length), atbPct: percent(withAtb.length, patients.length) };
    });
    const nonSocial = occupiedRows.filter(({ record }) => !record.pacienteSocial);
    const longStay = nonSocial.filter(({ record }) => hospitalDays(record.fechaIngreso) > 7);
    const withAtb = occupiedRows.filter(({ record }) => hasActiveAtb(record));
    const antibioticCounts = new Map(); const pathogenCounts = new Map();
    occupiedRows.forEach(({ record }) => {
      (record.antibioticos || []).filter(item => item?.nombre && (!item.termino || item.termino >= today)).forEach(item => antibioticCounts.set(item.nombre, (antibioticCounts.get(item.nombre) || 0) + 1));
      String(record.patogenoAislado || '').split(/\n|,|;/).map(item => item.trim()).filter(Boolean).forEach(item => pathogenCounts.set(item, (pathogenCounts.get(item) || 0) + 1));
    });
    return {
      byService,
      overall: { capacity: censusBeds.length, occupied: occupiedRows.length, nonSocial: nonSocial.length, longStay: longStay.length, withAtb: withAtb.length, occupancyPct: percent(occupiedRows.length, censusBeds.length), longStayPct: percent(longStay.length, nonSocial.length), atbPct: percent(withAtb.length, occupiedRows.length) },
      antibiotics: [...antibioticCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      pathogens: [...pathogenCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    };
  }, [displayBeds, registry]);

  const printRows = useMemo(() => [
    ...ALL_BEDS.map(bed => ({ bed, record: registry[bed.code] || {} })),
    ...hodomRows,
  ].filter(({ bed, record }) => printServices.includes(bed.serviceShort) && (record.nombre || record.rut || record.fechaIngreso || record.diagnosticoPrincipal || record.diagnostico))
    .sort((a, b) => (PRINT_SERVICE_ORDER.get(a.bed.serviceShort) ?? 99) - (PRINT_SERVICE_ORDER.get(b.bed.serviceShort) ?? 99)
      || String(a.bed.cell).localeCompare(String(b.bed.cell), 'es', { numeric: true })), [registry, hodomRows, printServices]);
  const printServiceLabel = printServices.length === PRINT_SERVICE_OPTIONS.length
    ? 'Todos los servicios'
    : PRINT_SERVICE_OPTIONS.filter(option => printServices.includes(option.value)).map(option => option.label).join(' · ') || 'Sin servicios seleccionados';
  const togglePrintService = value => setPrintServices(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]);

  const openBed = (bed) => {
    setSelectedCode(bed.code);
    sessionStorage.setItem(SELECTED_BED_KEY, bed.code);
    setDraft({ ...EMPTY, ...(registry[bed.code] || {}) });
    setDetailsOpen(true);
    setPatientViewTab('clinical');
    setDemographicsOpen(false);
    setSaved(false);
  };

  const update = (key, value) => { setDraft(old => ({ ...old, [key]: value })); setSaved(false); };
  // Persiste el estado actual SIN crear una entrada en la historia de
  // evoluciones: abrir una acción (nota, PROA, exámenes…) no es un guardado
  // definitivo. Las entradas de historia solo las crean los botones Guardar.
  const save = () => {
    const savedDraft = { ...draft, updatedAt: new Date().toISOString() };
    const next = { ...registry, [selectedCode]: savedDraft };
    setDraft(savedDraft);
    setRegistry(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSaved(true);
  };
  const saveAllChanges = async () => {
    if (!selectedCode || savingAll) return;
    setSavingAll(true); setSaved(false);
    const savedDraft = withHistorySnapshot({ ...draft, nombre: normalizeName(draft.nombre), diagnosticoPrincipal: normalizeClinicalText(draft.diagnosticoPrincipal), diagnostico: normalizeClinicalText(draft.diagnostico), updatedAt: new Date().toISOString() });
    const next = { ...registry, [selectedCode]: savedDraft };
    setDraft(savedDraft); setRegistry(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    try {
      if (savedDraft.proaRecordId) {
        const records = await fetchProaRecords();
        const latest = getLatestProaForm(records.find(item => item.id === savedDraft.proaRecordId)) || {};
        const diagnoses = [savedDraft.diagnosticoPrincipal, ...String(savedDraft.diagnostico || '').split(/\n|;/)].map(item => item.trim()).filter(Boolean);
        await saveProaRecord({
          ...latest, paciente: savedDraft.nombre, rut: savedDraft.rut, fecha_nacimiento: savedDraft.fechaNacimiento, edad: savedDraft.edad, sexo: savedDraft.sexo,
          direccion: savedDraft.direccion, comuna: savedDraft.comuna, fecha_ingreso: savedDraft.fechaIngreso, antecedentes: savedDraft.antecedentes,
          diagnostico_principal: savedDraft.diagnosticoPrincipal, diagnostico_desglose: savedDraft.diagnostico, diagnosticos_actuales: diagnoses, diagnostico_actual: diagnoses.join('; '),
          resumen_caso: savedDraft.resumenCaso, vista_ultima_evolucion: savedDraft.ultimaEvolucion, vista_ultima_evolucion_actualizada_en: savedDraft.ultimaEvolucionActualizadaEn || '', vista_planes_pendientes: savedDraft.planesPendientes, vista_plan_alta: savedDraft.planAlta,
          vista_estudios_complementarios: savedDraft.estudiosComplementarios, vista_estudios_detalle: savedDraft.estudiosDetalle || [], vista_observaciones: savedDraft.observaciones,
          let_indicacion: savedDraft.letIndicacion, iot_indicacion: savedDraft.iotIndicacion, rcp_indicacion: savedDraft.rcpIndicacion, paciente_social: Boolean(savedDraft.pacienteSocial),
          reingreso_evaluado: Boolean(savedDraft.reingresoEvaluado), reingreso_menor_30: Boolean(savedDraft.reingresoMenor30),
          reingreso_fecha_egreso_previa: savedDraft.reingresoFechaEgresoPrevia || '', reingreso_evaluado_en: savedDraft.reingresoEvaluadoEn || '',
          vista_escalas: savedDraft.escalas || [], vista_evaluaciones_nutricionales: savedDraft.evaluacionesNutricionales || [],
          fecha: new Date().toISOString().slice(0, 10), hora: new Date().toTimeString().slice(0, 5), proa_entry_type: 'actualizacion_general_vista_hospitalizados',
        });
      }
      setSaved(true); setSyncState('ready');
    } catch {
      setSyncState('offline');
    } finally {
      setSavingAll(false);
    }
  };
  const saveMedicalReport = async (report) => {
    const reports = [report, ...(Array.isArray(draft.informesMedicos) ? draft.informesMedicos : [])].slice(0, 100);
    const savedDraft = { ...draft, informesMedicos: reports, updatedAt: new Date().toISOString() };
    const next = { ...registry, [selectedCode]: savedDraft };
    setDraft(savedDraft); setRegistry(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setSaved(true);
    if (!savedDraft.proaRecordId) return { synced: false };
    try {
      const records = await fetchProaRecords();
      const latest = getLatestProaForm(records.find(item => item.id === savedDraft.proaRecordId)) || {};
      await saveProaRecord({ ...latest, vista_informes_medicos: reports, fecha: new Date().toISOString().slice(0, 10), hora: new Date().toTimeString().slice(0, 5), proa_entry_type: 'informe_medico_vista_hospitalizados' });
      setSyncState('ready');
      return { synced: true };
    } catch (error) {
      setSyncState('offline');
      return { synced: false, error };
    }
  };
  const generalSeed = () => ({ ...draft, planesAmbitos: normalizedPlanRows(draft.planesAmbitos).length ? normalizedPlanRows(draft.planesAmbitos) : [{ ...EMPTY_PLAN_AMBITO }], antibioticos: Array.isArray(draft.antibioticos) ? draft.antibioticos : [] });
  const openGeneral = () => {
    setEditingHistoryIndex(null);
    const seed = generalSeed();
    const stored = readEvolutionDrafts()[selectedCode]?.actualizacionClinica;
    // Solo los campos editados vienen del borrador; el resto (datos, exámenes)
    // se toma fresco del registro actual.
    setGeneralDraft(stored ? { ...seed, ...(stored.changed || {}) } : seed);
    setDiagnosisAndHistoryDraft(stored?.diagnosisAndHistoryDraft ?? combinedDiagnosisAndHistory(draft));
    setGeneralDraftRestored(Boolean(stored));
    setFullGeneralOpen(true);
  };
  const discardGeneralDraft = () => { writeEvolutionDraft(selectedCode, 'actualizacionClinica', null); setDraftHistoryRevision(value => value + 1); setGeneralDraft(generalSeed()); setDiagnosisAndHistoryDraft(combinedDiagnosisAndHistory(draft)); setGeneralDraftRestored(false); };
  const closeGeneralAsDraft = () => {
    if (editingHistoryIndex == null) {
      const seed = generalSeed();
      const changed = {};
      Object.entries(generalDraft).forEach(([key, value]) => { if (JSON.stringify(value) !== JSON.stringify(seed[key])) changed[key] = value; });
      const combined = combinedDiagnosisAndHistory(draft);
      const changedDiagnosis = diagnosisAndHistoryDraft !== combined ? diagnosisAndHistoryDraft : null;
      writeEvolutionDraft(selectedCode, 'actualizacionClinica', Object.keys(changed).length || changedDiagnosis ? { changed, diagnosisAndHistoryDraft: changedDiagnosis, savedAt: new Date().toISOString() } : null);
      setDraftHistoryRevision(value => value + 1);
    }
    setEditingHistoryIndex(null); setFullGeneralOpen(false);
  };
  const openPlans = () => {
    const rows = normalizedPlanRows(draft.planesAmbitos);
    setPlansDraft({ planProa: draft.planProa || (draft.proaRecordId && !rows.length ? String(draft.planesPendientes || '').replace(/^\(PROA\):\s*/i, '') : ''), planesAmbitos: rows.length ? rows : [{ ...EMPTY_PLAN_AMBITO }], planAlta: draft.planAlta || '' });
    setPlansOpen(true);
  };
  const editHospitalHistory = index => { const snapshot = draft.historialActualizaciones?.[index]; if (!snapshot) return; setEditingHistoryIndex(index); setGeneralDraft({ ...draft, ...snapshot }); setDiagnosisAndHistoryDraft(combinedDiagnosisAndHistory({ ...draft, ...snapshot })); setDocumentArchiveOpen(false); setFullGeneralOpen(true); };
  const deleteHospitalHistory = index => { if (!draft.historialActualizaciones?.[index] || !window.confirm('¿Borrar esta evolución almacenada?')) return; const savedDraft = { ...draft, historialActualizaciones: draft.historialActualizaciones.filter((_, itemIndex) => itemIndex !== index), updatedAt: new Date().toISOString() }; const next = { ...registry, [selectedCode]: savedDraft }; setDraft(savedDraft); setRegistry(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); };
  const updateGeneral = (key, value) => setGeneralDraft(old => ({ ...old, [key]: value }));
  const saveGeneral = async () => {
    const diagnosisParts = splitDiagnosisAndHistory(diagnosisAndHistoryDraft);
    const antibiotics = (generalDraft.antibioticos || []).filter(item => item?.nombre);
    const planRows = normalizedPlanRows(generalDraft.planesAmbitos);
    const planText = combinedPlansText(generalDraft.planProa, planRows) || generalDraft.planesPendientes;
    const now = new Date().toISOString();
    const clinicalStateChanged = String(generalDraft.ultimaEvolucion || '').trim() !== String(draft.ultimaEvolucion || '').trim();
    const normalizedDraft = { ...generalDraft, nombre: normalizeName(generalDraft.nombre), diagnosticoPrincipal: normalizeClinicalText(generalDraft.diagnosticoPrincipal), diagnostico: normalizeClinicalText(diagnosisParts.diagnostico || generalDraft.diagnostico), antecedentes: normalizeClinicalText(diagnosisParts.antecedentes || generalDraft.antecedentes), antibioticos: antibiotics, antibioterapia: antibiotics.length ? structuredAntibioticSummary(antibiotics) : generalDraft.antibioterapia, planesAmbitos: planRows, planesPendientes: planText, ultimaEvolucionActualizadaEn: clinicalStateChanged ? now : draft.ultimaEvolucionActualizadaEn, updatedAt: now };
    const savedDraft = editingHistoryIndex == null ? withHistorySnapshot(normalizedDraft, { fuente: 'Actualización clínica general', titulo: 'Actualización clínica general', tipoDocumento: 'actualizacion_general' }) : { ...draft, ...normalizedDraft, historialActualizaciones: (draft.historialActualizaciones || []).map((item, index) => index === editingHistoryIndex ? { ...item, ...normalizedDraft, guardadoEn: item.guardadoEn, fecha: item.fecha } : item) };
    const next = { ...registry, [selectedCode]: savedDraft };
    setDraft(savedDraft); setRegistry(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (savedDraft.proaRecordId) {
      const records = await fetchProaRecords();
      const latest = getLatestProaForm(records.find(item => item.id === savedDraft.proaRecordId)) || {};
      const diagnoses = [savedDraft.diagnosticoPrincipal, ...String(savedDraft.diagnostico || '').split(/\n|;/)].map(item => item.trim()).filter(Boolean);
      await saveProaRecord({ ...latest, paciente: savedDraft.nombre, rut: savedDraft.rut, edad: savedDraft.edad, sexo: savedDraft.sexo, direccion: savedDraft.direccion, comuna: savedDraft.comuna, fecha_ingreso: savedDraft.fechaIngreso, antecedentes: savedDraft.antecedentes, diagnostico_principal: savedDraft.diagnosticoPrincipal, diagnostico_desglose: savedDraft.diagnostico, diagnosticos_actuales: diagnoses, diagnostico_actual: diagnoses.join('; '), resumen_caso: savedDraft.resumenCaso, evolucion: savedDraft.ultimaEvolucion, vista_ultima_evolucion: savedDraft.ultimaEvolucion, vista_ultima_evolucion_actualizada_en: savedDraft.ultimaEvolucionActualizadaEn || '', antibioticos: savedDraft.antibioticos, antibioterapia_preingreso: savedDraft.antibioterapia, aislamiento: savedDraft.aislamiento, diagnostico_microbiologico: savedDraft.patogenoAislado, estudios_imagen: savedDraft.estudiosComplementarios, plan_duracion: savedDraft.planProa, vista_planes_ambitos: savedDraft.planesAmbitos, vista_planes_pendientes: savedDraft.planesPendientes, vista_plan_alta: savedDraft.planAlta, vista_observaciones: savedDraft.observaciones, let_indicacion: savedDraft.letIndicacion, iot_indicacion: savedDraft.iotIndicacion, rcp_indicacion: savedDraft.rcpIndicacion, fecha: new Date().toISOString().slice(0, 10), hora: new Date().toTimeString().slice(0, 5), proa_entry_type: 'actualizacion_clinica_vista_general' });
    }
    writeEvolutionDraft(selectedCode, 'actualizacionClinica', null);
    setDraftHistoryRevision(value => value + 1);
    setEditingHistoryIndex(null); setGeneralOpen(false); setFullGeneralOpen(false); setSaved(true);
  };
  const savePlans = async () => {
    const planRows = normalizedPlanRows(plansDraft.planesAmbitos);
    const planText = combinedPlansText(plansDraft.planProa, planRows);
    const savedDraft = withHistorySnapshot({ ...draft, planProa: plansDraft.planProa.trim(), planesAmbitos: planRows, planesPendientes: planText, planAlta: plansDraft.planAlta, updatedAt: new Date().toISOString() }, { fuente: 'Planes', titulo: 'Actualización de planes', tipoDocumento: 'planes' });
    const next = { ...registry, [selectedCode]: savedDraft };
    setDraft(savedDraft); setRegistry(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setPlansOpen(false); setSaved(true);
    if (savedDraft.proaRecordId) {
      const records = await fetchProaRecords();
      const latest = getLatestProaForm(records.find(item => item.id === savedDraft.proaRecordId)) || {};
      await saveProaRecord({ ...latest, plan_duracion: savedDraft.planProa, vista_planes_ambitos: planRows, vista_planes_pendientes: planText, vista_plan_alta: savedDraft.planAlta, fecha: new Date().toISOString().slice(0, 10), hora: new Date().toTimeString().slice(0, 5), proa_entry_type: 'actualizacion_planes_vista_hospitalizados' });
    }
  };
  const toggleSocialPatient = async () => {
    const nextValue = !draft.pacienteSocial;
    const savedDraft = { ...draft, pacienteSocial: nextValue, updatedAt: new Date().toISOString() };
    const next = { ...registry, [selectedCode]: savedDraft };
    setDraft(savedDraft); setRegistry(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setSaved(true);
    if (savedDraft.proaRecordId) {
      const records = await fetchProaRecords();
      const latest = getLatestProaForm(records.find(item => item.id === savedDraft.proaRecordId)) || {};
      await saveProaRecord({ ...latest, paciente_social: nextValue, fecha: new Date().toISOString().slice(0, 10), hora: new Date().toTimeString().slice(0, 5), proa_entry_type: 'clasificacion_social_vista_general' });
    }
  };
  const openDischarge = () => {
    const today = new Date().toISOString().slice(0, 10);
    const activeActions = Object.fromEntries((draft.antibioticos || []).map((item, index) => [index, item.termino && item.termino < today ? 'suspendido' : 'suspender']));
    const stopDates = Object.fromEntries((draft.antibioticos || []).map((item, index) => [index, item.termino || today]));
    setDischargeDraft({ fecha: today, motivo: '', destinoServicio: '', destinoCama: '', antibioticActions: activeActions, antibioticStopDates: stopDates, antibioticoAltaIndicacion: '' });
    setDischargeOpen(true);
  };
  const confirmDischarge = async () => {
    const missingDestination = dischargeDraft.motivo === 'Traslado a otro servicio' && (!dischargeDraft.destinoServicio || !dischargeDraft.destinoCama);
    if (!dischargeDraft.fecha || !dischargeDraft.motivo || missingDestination || discharging) return;
    setDischarging(true);
    try {
      const antibiotics = draft.antibioticos || [];
      const antibioticStops = {};
      const continued = [];
      antibiotics.forEach((item, index) => {
        if (!item?.nombre) return;
        const action = dischargeDraft.antibioticActions[index];
        if (action === 'suspender' || action === 'suspendido') antibioticStops[index] = dischargeDraft.antibioticStopDates[index] || item.termino || dischargeDraft.fecha;
        if (action === 'continuar') continued.push([item.nombre, item.dosis || [item.dosis_cantidad, item.dosis_unidad].filter(Boolean).join(' '), item.intervalo_horas && `c/${item.intervalo_horas} h`, item.via].filter(Boolean).join(' '));
      });
      if (draft.proaRecordId) {
        const records = await fetchProaRecords();
        const record = records.find(item => item.id === draft.proaRecordId);
        if (record) await archiveProaRecord(record, dischargeDraft.fecha, { motivo: dischargeDraft.motivo, destinoServicio: dischargeDraft.destinoServicio, destinoCama: dischargeDraft.destinoCama, antibioticStops, antibioticoAlta: continued.join('\n'), antibioticoAltaIndicacion: dischargeDraft.antibioticoAltaIndicacion });
      }
      const next = { ...registry }; delete next[selectedCode];
      setRegistry(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setHodomRows(rows => rows.filter(item => item.bed.code !== selectedCode));
      setDraft({ ...EMPTY }); setSelectedCode(''); sessionStorage.removeItem(SELECTED_BED_KEY);
      setDischargeOpen(false); setSaved(false);
    } finally {
      setDischarging(false);
    }
  };
  const seedEvolutionFromRecord = () => {
    setEvolutionDraft(draft.ultimaEvolucion || '');
    setClinicalStatusDraft({ signosVitales: draft.signosVitales || '', oxigenoterapiaTipo: draft.oxigenoterapiaTipo || '', oxigenoterapiaCantidad: draft.oxigenoterapiaCantidad || '', drogasVasoactivas: draft.drogasVasoactivas || '', soporteClinico: draft.soporteClinico || '' });
    setClinicalSupportVisible({ vasoactives: Boolean(String(draft.drogasVasoactivas || '').trim()), supports: Boolean(String(draft.soporteClinico || '').trim()) });
    setEvolutionDraftRestored(false);
  };
  const openLatestEvolution = () => {
    const stored = readEvolutionDrafts()[selectedCode]?.estadoClinico;
    if (stored) {
      setEvolutionDraft(stored.evolutionDraft || '');
      setClinicalStatusDraft({ signosVitales: '', oxigenoterapiaTipo: '', oxigenoterapiaCantidad: '', drogasVasoactivas: '', soporteClinico: '', ...(stored.clinicalStatusDraft || {}) });
      setClinicalSupportVisible({ vasoactives: false, supports: false, ...(stored.clinicalSupportVisible || {}) });
      setEvolutionDraftRestored(true);
    } else {
      seedEvolutionFromRecord();
    }
    setEvolutionOpen(true);
  };
  const closeEvolutionAsDraft = () => {
    const differsFromSaved = evolutionDraft !== (draft.ultimaEvolucion || '')
      || clinicalStatusDraft.signosVitales !== (draft.signosVitales || '')
      || clinicalStatusDraft.oxigenoterapiaTipo !== (draft.oxigenoterapiaTipo || '')
      || clinicalStatusDraft.oxigenoterapiaCantidad !== (draft.oxigenoterapiaCantidad || '')
      || clinicalStatusDraft.drogasVasoactivas !== (draft.drogasVasoactivas || '')
      || clinicalStatusDraft.soporteClinico !== (draft.soporteClinico || '');
    writeEvolutionDraft(selectedCode, 'estadoClinico', differsFromSaved ? { evolutionDraft, clinicalStatusDraft, clinicalSupportVisible, savedAt: new Date().toISOString() } : null);
    setDraftHistoryRevision(value => value + 1);
    setEvolutionOpen(false);
  };
  const discardEvolutionDraft = () => { writeEvolutionDraft(selectedCode, 'estadoClinico', null); setDraftHistoryRevision(value => value + 1); seedEvolutionFromRecord(); };
  const continueEvolutionHistoryDraft = kind => {
    setDocumentArchiveOpen(false);
    if (kind === 'estadoClinico') openLatestEvolution();
    else openGeneral();
  };
  const discardEvolutionHistoryDraft = kind => {
    const label = kind === 'estadoClinico' ? 'estado clínico actual' : 'actualización clínica';
    if (!window.confirm(`¿Descartar el borrador de ${label}? Esta acción no elimina registros clínicos guardados.`)) return;
    writeEvolutionDraft(selectedCode, kind, null);
    setDraftHistoryRevision(value => value + 1);
  };
  const openClinicalSummary = () => { setSummaryDraft(draft.resumenCaso || ''); setSummaryOpen(true); };
  const saveClinicalSummary = () => {
    const savedDraft = withHistorySnapshot({ ...draft, resumenCaso: summaryDraft, updatedAt: new Date().toISOString() });
    const next = { ...registry, [selectedCode]: savedDraft };
    setDraft(savedDraft); setRegistry(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setSummaryOpen(false); setSaved(true);
  };
  const saveLatestEvolution = () => {
    const now = new Date().toISOString();
    const visibleClinicalStatus = { ...clinicalStatusDraft, drogasVasoactivas: clinicalSupportVisible.vasoactives ? clinicalStatusDraft.drogasVasoactivas : '', soporteClinico: clinicalSupportVisible.supports ? clinicalStatusDraft.soporteClinico : '' };
    const savedDraft = withHistorySnapshot({ ...draft, ultimaEvolucion: evolutionDraft, ...visibleClinicalStatus, ultimaEvolucionActualizadaEn: now, updatedAt: now }, { fuente: 'Estado clínico actual', titulo: 'Estado clínico actual' });
    const next = { ...registry, [selectedCode]: savedDraft };
    setDraft(savedDraft); setRegistry(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    writeEvolutionDraft(selectedCode, 'estadoClinico', null);
    setDraftHistoryRevision(value => value + 1);
    setEvolutionOpen(false); setSaved(true);
  };
  const saveScale = () => {
    if (!scaleDraft.nombre || !scaleDraft.puntaje) return;
    const item = { ...scaleDraft, guardadoEn: new Date().toISOString() };
    const savedDraft = withHistorySnapshot({ ...draft, escalas: [item, ...(draft.escalas || [])], updatedAt: item.guardadoEn });
    const next = { ...registry, [selectedCode]: savedDraft };
    setDraft(savedDraft); setRegistry(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setScalesOpen(false); setSaved(true);
  };
  const nutritionRisk = score => score === '' ? '' : Number(score) >= 3 ? 'Riesgo nutricional' : 'Sin riesgo nutricional';
  const applyNrsResult = result => {
    const numericScore = Number(result?.score);
    const isNumeric = Number.isFinite(numericScore);
    setNutritionDraft(old => ({
      ...old,
      fecha: old.fecha || todayLocalIso(),
      tamizaje: isNumeric || result?.score === '★' ? 'Sí' : 'No aplica',
      puntaje: isNumeric ? String(numericScore) : '',
    }));
    setNutritionNrsVisible(false);
  };
  const saveNutrition = () => {
    if (!nutritionDraft.tamizaje || !nutritionDraft.evaluacion) return;
    const item = { ...nutritionDraft, riesgo: nutritionDraft.tamizaje === 'Sí' ? nutritionRisk(nutritionDraft.puntaje) : nutritionDraft.tamizaje, guardadoEn: new Date().toISOString() };
    const savedDraft = withHistorySnapshot({ ...draft, evaluacionesNutricionales: [item, ...(draft.evaluacionesNutricionales || [])], updatedAt: item.guardadoEn });
    const next = { ...registry, [selectedCode]: savedDraft };
    setDraft(savedDraft); setRegistry(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setNutritionOpen(false); setSaved(true);
  };
  const openDiagnosis = () => { setDiagnosisDraft({ principal: draft.diagnosticoPrincipal || '', desglose: draft.diagnostico || '', antecedentes: draft.antecedentes || '' }); setDiagnosisSearch(''); setDiagnosisCategory('Todas'); setDiagnosisOpen(true); };
  const addCatalogDiagnosis = (item) => setDiagnosisDraft(current => {
    const line = item.label;
    if (!current.principal.trim()) return { ...current, principal: line };
    const associated = current.desglose.split('\n').map(value => value.trim()).filter(Boolean);
    if (current.principal.trim() === line || associated.includes(line)) return current;
    return { ...current, desglose: [...associated, line].join('\n') };
  });
  const saveDiagnosis = async () => {
    const savedDraft = withHistorySnapshot({ ...draft, diagnosticoPrincipal: normalizeClinicalText(diagnosisDraft.principal), diagnostico: normalizeClinicalText(diagnosisDraft.desglose), antecedentes: normalizeClinicalText(diagnosisDraft.antecedentes), updatedAt: new Date().toISOString() });
    const next = { ...registry, [selectedCode]: savedDraft };
    setDraft(savedDraft); setRegistry(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (savedDraft.proaRecordId) {
      const records = await fetchProaRecords(); const latest = getLatestProaForm(records.find(item => item.id === savedDraft.proaRecordId)) || {};
      const diagnoses = [savedDraft.diagnosticoPrincipal, ...savedDraft.diagnostico.split(/\n|;/)].map(item => item.trim()).filter(Boolean);
      await saveProaRecord({ ...latest, antecedentes: savedDraft.antecedentes, diagnostico_principal: savedDraft.diagnosticoPrincipal, diagnostico_desglose: savedDraft.diagnostico, diagnosticos_actuales: diagnoses, diagnostico_actual: diagnoses.join('; '), fecha: new Date().toISOString().slice(0, 10), hora: new Date().toTimeString().slice(0, 5), proa_entry_type: 'diagnosticos_antecedentes_vista_general' });
    }
    setDiagnosisOpen(false); setSaved(true);
  };

  const prefill = (sourceDraft = draft) => {
    const data = {
      patient_name: sourceDraft.nombre, patient_rut: sourceDraft.rut, patient_fecha_nac: sourceDraft.fechaNacimiento, patient_edad: sourceDraft.edad,
      patient_direccion: sourceDraft.direccion, direccion: sourceDraft.direccion, domicilio: sourceDraft.direccion, patient_comuna: sourceDraft.comuna, comuna: sourceDraft.comuna, patient_telefono: sourceDraft.telefono,
      prevision: sourceDraft.prevision, diagnostico: sourceDraft.diagnosticoPrincipal || sourceDraft.diagnostico, diagnostico_principal: sourceDraft.diagnosticoPrincipal, diagnostico_desglose: sourceDraft.diagnostico, n_ficha: sourceDraft.nFicha,
      aislamiento: sourceDraft.aislamiento, clinical_text: sourceDraft.resumenCaso || '', resumen_caso: sourceDraft.resumenCaso || '', antecedentes_relevantes: sourceDraft.antecedentes || '', antecedentes: sourceDraft.antecedentes || '',
      edad: sourceDraft.edad, sexo: sourceDraft.sexo, fecha_ingreso: sourceDraft.fechaIngreso, proa_antibioticos: sourceDraft.antibioticos || [], proa_examenes: sourceDraft.laboratorios || [], ultimo_laboratorio: sourceDraft.ultimoLaboratorio || '',
      servicio: selectedBed?.serviceShort || '', unidad: selectedBed?.salaLabel || '', cama: selectedBed?.cell || selectedBed?.code || '',
      sala_cama: [selectedBed?.serviceShort, selectedBed?.salaLabel, selectedBed?.cell && `Cama ${selectedBed.cell}`].filter(Boolean).join(' · '),
      ubicacion: [selectedBed?.serviceShort, selectedBed?.salaLabel, selectedBed?.cell && `Cama ${selectedBed.cell}`].filter(Boolean).join(' · '),
      source: 'vista_general', source_service: selectedBed?.serviceShort || '', source_bed: sourceDraft.proaBedCode || selectedBed?.code || '',
    };
    setMultiPrefill(data);
    return data;
  };

  const requestFirstClinicalUse = async (action) => {
    if (draft.reingresoEvaluado) { action(); return; }
    pendingClinicalAction.current = action;
    let previousDischargeDate = draft.egresoPrevioConocido || '';
    if (!previousDischargeDate && draft.rut) {
      try {
        const normalizedRut = String(draft.rut).replace(/[^0-9k]/gi, '').toUpperCase();
        const records = await fetchProaRecords();
        previousDischargeDate = records
          .filter(record => isHistoricalProaRecord(record))
          .map(record => getLatestProaForm(record) || {})
          .filter(form => String(form.rut || '').replace(/[^0-9k]/gi, '').toUpperCase() === normalizedRut && form.fecha_egreso)
          .map(form => form.fecha_egreso)
          .sort().at(-1) || '';
      } catch { /* Permite confirmar manualmente si el histórico remoto no está disponible. */ }
    }
    const admission = draft.fechaIngreso ? new Date(`${draft.fechaIngreso}T00:00:00`) : new Date();
    const previous = previousDischargeDate ? new Date(`${previousDischargeDate}T00:00:00`) : null;
    const elapsedDays = previous && !Number.isNaN(previous.getTime()) ? Math.floor((admission.getTime() - previous.getTime()) / 86400000) : null;
    const detected = elapsedDays !== null && elapsedDays >= 0 && elapsedDays <= 30;
    setReadmissionDraft({ value: detected ? 'Sí' : '', detected, previousDischargeDate: detected ? previousDischargeDate : '' });
    setReadmissionOpen(true);
  };

  const confirmReadmission = async () => {
    if (!readmissionDraft.value) return;
    const now = new Date().toISOString();
    const savedDraft = {
      ...draft,
      reingresoEvaluado: true,
      reingresoMenor30: readmissionDraft.value === 'Sí',
      reingresoFechaEgresoPrevia: readmissionDraft.value === 'Sí' ? readmissionDraft.previousDischargeDate : '',
      reingresoEvaluadoEn: now,
      updatedAt: now,
    };
    const next = { ...registry, [selectedCode]: savedDraft };
    setDraft(savedDraft); setRegistry(next); localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (savedDraft.proaRecordId) {
      try {
        const records = await fetchProaRecords();
        const latest = getLatestProaForm(records.find(item => item.id === savedDraft.proaRecordId)) || {};
        await saveProaRecord({
          ...latest,
          reingreso_evaluado: true,
          reingreso_menor_30: savedDraft.reingresoMenor30,
          reingreso_fecha_egreso_previa: savedDraft.reingresoFechaEgresoPrevia,
          reingreso_evaluado_en: now,
          fecha: new Date().toISOString().slice(0, 10),
          hora: new Date().toTimeString().slice(0, 5),
          proa_entry_type: 'verificacion_reingreso',
        });
      } catch { /* La copia local evita repetir la pregunta aunque falle temporalmente la sincronización. */ }
    }
    setReadmissionOpen(false);
    const action = pendingClinicalAction.current; pendingClinicalAction.current = null;
    action?.(savedDraft);
  };

  const openActionDirect = (route, isProa = false, sourceDraft = draft) => {
    if (sourceDraft === draft) save();
    prefill(sourceDraft);
    sessionStorage.setItem(RETURN_TO_BED_KEY, '1');
    if (isProa) {
      const proaBed = sourceDraft.proaBedCode || catalogToProaBed(selectedBed);
      navigate(`${createPageUrl('GestionPROA')}?bed=${encodeURIComponent(proaBed || selectedBed.code)}&action=${sourceDraft.proaEnrolled ? 'evolve' : 'admit'}`);
      return;
    }
    const [page, search] = route.split('?');
    navigate(`${createPageUrl(page)}${search ? `?${search}` : ''}`);
  };
  const openAction = (route, isProa = false) => requestFirstClinicalUse((confirmedDraft) => openActionDirect(route, isProa, confirmedDraft || draft));
  const openFullProa = () => {
    setProaOpen(false); save(); prefill();
    sessionStorage.setItem(RETURN_TO_BED_KEY, '1');
    const proaBed = draft.proaBedCode || catalogToProaBed(selectedBed);
    navigate(`${createPageUrl('GestionPROA')}?bed=${encodeURIComponent(proaBed || selectedBed.code)}&action=${draft.proaEnrolled ? 'evolve' : 'admit'}`);
  };

  const goToSection = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const openLabCurve = async () => {
    setLabWorkspaceTab('curva');
    setLabOpen(true);
    setLabCurveLoading(true);
    try {
      let rows = Array.isArray(draft.laboratorios) ? draft.laboratorios : [];
      if (draft.proaRecordId) {
        const records = await fetchProaRecords();
        const record = records.find(item => item.id === draft.proaRecordId);
        const proaRows = collectProaLaboratoryRows(record);
        if (proaRows.length) rows = mergeLaboratoryRows(rows, proaRows);
      }
      setLabCurveRows(rows);
    } catch {
      setLabCurveRows(Array.isArray(draft.laboratorios) ? draft.laboratorios : []);
    } finally { setLabCurveLoading(false); }
  };
  const parsePastedLabs = () => {
    const fallbackDate = labRows[0]?.fecha || new Date().toISOString().slice(0, 10);
    const parsed = parseLabReportText(labPasteText, fallbackDate);
    const grouped = new Map();
    parsed.forEach(result => {
      if (result.category === 'Microbiología') return;
      const field = LAB_FIELD_BY_EXAM[result.examKey];
      if (!field || result.value == null || !Number.isFinite(Number(result.value))) return;
      const fecha = String(result.collectedAt || fallbackDate).slice(0, 10);
      const row = grouped.get(fecha) || emptyHospitalLabRow(fecha);
      row[field] = `${result.comparator || ''}${result.value}`;
      grouped.set(fecha, row);
    });
    const rows = [...grouped.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const parsedCultures = parsed.filter(result => result.category === 'Microbiología' && result.valueText).map(cultureFromParsedResult);
    if (parsedCultures.length) setLabCultures(current => deduplicateCultures([...parsedCultures, ...current]));
    if (!rows.length && !parsedCultures.length) {
      setLabParseMessage('No se reconocieron resultados compatibles. Revisa el texto o ingrésalos manualmente.');
      return;
    }
    if (rows.length) setLabRows(current => mergeLaboratoryRows(current, rows));
    const resultCount = rows.reduce((total, row) => total + Object.entries(row).filter(([key, value]) => key !== 'fecha' && value !== '').length, 0);
    setLabParseMessage(`Se cargaron ${rows.length} fecha(s), ${resultCount} resultado(s) y ${parsedCultures.length} estudio(s) microbiológico(s). Revísalos antes de guardar.`);
  };
  const saveLab = async (rowsOverride, culturesOverride) => {
    setLabSaving(true);
    try {
      const sourceRows = Array.isArray(rowsOverride) ? rowsOverride : labRows;
      const rows = sourceRows.filter(row => Object.entries(row).some(([key, value]) => key !== 'fecha' && value));
      const allRows = mergeLaboratoryRows([], rows);
      const cultures = deduplicateCultures(Array.isArray(culturesOverride) ? culturesOverride : labCultures);
      const latestRow = allRows[0];
      const populated = HOSPITAL_LAB_FIELDS.filter(([key]) => latestRow?.[key] !== '' && latestRow?.[key] != null).slice(0, 6);
      const summary = latestRow ? [latestRow.fecha, ...populated.map(([key, label]) => `${label} ${latestRow[key]}`)].join(' · ') : '';
      const pathogen = cultures.filter(item => item.patogeno && !isNegativeMicroResult(item.patogeno) && !isNegativeMicroResult(item.sensibilidad)).map(item => `${item.tipo_muestra}: ${item.patogeno}`).join('\n');
      const nextDraft = { ...draft, laboratorios: allRows, cultivos: cultures, ultimoLaboratorio: summary, patogenoAislado: pathogen, updatedAt: new Date().toISOString() };
      const nextRegistry = { ...registry, [selectedCode]: nextDraft };
      setDraft(nextDraft);
      setRegistry(nextRegistry);
      setLabRows(allRows);
      setLabCultures(cultures);
      setLabCurveRows(allRows);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRegistry));
      if (draft.proaRecordId) {
        const records = await fetchProaRecords();
        const record = records.find(item => item.id === draft.proaRecordId);
        const latest = getLatestProaForm(record) || {};
        await saveProaRecord({
          ...latest, fecha: latestRow?.fecha || new Date().toISOString().slice(0, 10), hora: new Date().toTimeString().slice(0, 5), proa_entry_type: 'laboratorio_microbiologia_vista_general',
          parametros_inflamatorios: allRows, estudios_micro: cultures, diagnostico_microbiologico: pathogen,
          creatinina: latestRow?.crea || '', fecha_creatinina: latestRow?.crea ? latestRow.fecha : '',
        });
      }
      setLabPasteText('');
      setLabParseMessage(draft.proaRecordId ? 'Guardado en la ficha hospitalaria y sincronizado con PROA. Puedes procesar otro informe.' : 'Guardado en la ficha hospitalaria. Puedes procesar otro informe.');
    } finally { setLabSaving(false); }
  };
  const deleteLabDate = async (date) => {
    if (!window.confirm(`¿Eliminar todos los exámenes registrados el ${displayClinicalDate(date)}? Esta acción se aplicará también en PROA.`)) return;
    await saveLab(labCurveRows.filter(row => String(row.fecha).slice(0, 10) !== String(date).slice(0, 10)), draft.cultivos || []);
  };
  const deleteLabResult = async (date, key) => {
    const definition = HOSPITAL_LAB_FIELDS.find(([field]) => field === key);
    if (!window.confirm(`¿Eliminar ${definition?.[1] || key} del ${displayClinicalDate(date)}?`)) return;
    const rows = labCurveRows.map(row => String(row.fecha).slice(0, 10) === String(date).slice(0, 10) ? { ...row, [key]: '' } : row)
      .filter(row => HOSPITAL_LAB_FIELDS.some(([field]) => row[field] !== '' && row[field] != null));
    await saveLab(rows, draft.cultivos || []);
  };
  const saveStats = async () => {
    const nextDraft = { ...draft, updatedAt: new Date().toISOString() };
    const nextRegistry = { ...registry, [selectedCode]: nextDraft };
    setRegistry(nextRegistry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRegistry));
    if (draft.proaRecordId) {
      const records = await fetchProaRecords();
      const record = records.find(item => item.id === draft.proaRecordId);
      const latest = getLatestProaForm(record) || {};
      await saveProaRecord({ ...latest, paciente: draft.nombre, rut: draft.rut, edad: draft.edad, sexo: draft.sexo, fecha_nacimiento: draft.fechaNacimiento, prevision: draft.prevision, fecha: new Date().toISOString().slice(0, 10), hora: new Date().toTimeString().slice(0, 5), proa_entry_type: 'datos_vista_general' });
    }
    setStatsOpen(false);
    setSaved(true);
  };
  const openStudies = () => {
    setStudiesRows((draft.estudiosDetalle || []).length ? draft.estudiosDetalle : [{ fecha: '', tipo: 'Imagenología', estudio: '', estado: 'Pendiente' }]);
    setStudiesOpen(true);
  };
  const saveStudies = async () => {
    const rows = studiesRows.filter(item => item.estudio || item.fecha);
    const summary = rows.map(item => [item.tipo, item.fecha, item.estudio, item.estado].filter(Boolean).join(' · ')).join('\n');
    const nextDraft = { ...draft, estudiosDetalle: rows, estudiosComplementarios: summary, updatedAt: new Date().toISOString() };
    const nextRegistry = { ...registry, [selectedCode]: nextDraft };
    setDraft(nextDraft); setRegistry(nextRegistry); localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRegistry));
    if (draft.proaRecordId) {
      const records = await fetchProaRecords();
      const latest = getLatestProaForm(records.find(item => item.id === draft.proaRecordId)) || {};
      const byType = type => rows.filter(item => item.tipo === type).map(item => [item.fecha, item.estudio, item.estado].filter(Boolean).join(' · ')).join('\n');
      await saveProaRecord({ ...latest, estudios_imagen: byType('Imagenología'), estudios_funcionales: byType('Estudio funcional'), estudios_anatomopatologicos: byType('Anatomía patológica'), estudios_otros: byType('Otro'), fecha: new Date().toISOString().slice(0, 10), hora: new Date().toTimeString().slice(0, 5), proa_entry_type: 'estudios_vista_general' });
    }
    setStudiesOpen(false); setSaved(true);
  };
  const openProaPopup = async () => {
    let latest = {};
    let selectedRecord = null;
    if (draft.proaRecordId) {
      const records = await fetchProaRecords();
      selectedRecord = records.find(item => item.id === draft.proaRecordId) || null;
      latest = getLatestProaForm(selectedRecord) || {};
    }
    const storedAntibiotics = latestStructuredAntibiotics(selectedRecord);
    setProaQuick({
      paciente: latest.paciente || draft.nombre || '', rut: latest.rut || draft.rut || '', edad: latest.edad || draft.edad || '', sexo: latest.sexo || draft.sexo || '',
      fecha_ingreso: latest.fecha_ingreso || draft.fechaIngreso || '', diagnostico: latest.diagnostico_principal || latest.diagnostico_actual || draft.diagnosticoPrincipal || draft.diagnostico || '',
      aislamiento: latest.aislamiento || draft.aislamiento || '',
      evolucion: latest.evolucion || latest.vista_ultima_evolucion || draft.ultimaEvolucion || '',
      resumen_caso: latest.resumen_caso || draft.resumenCaso || '', estudios_imagen: latest.estudios_imagen || draft.estudiosComplementarios || '', plan_duracion: latest.plan_duracion || draft.planesPendientes || '',
      examenes_sangre: mergeLaboratoryRows(draft.laboratorios || [], latest.parametros_inflamatorios || []).length ? mergeLaboratoryRows(draft.laboratorios || [], latest.parametros_inflamatorios || []) : [{ fecha: '', pcr: '', pct: '', leucocitos: '', crea: '' }],
      examenes_complementarios: (latest.examenes_complementarios || []).length ? latest.examenes_complementarios : [{ fecha: '', nombre: '', resultado: '' }],
      antibioticos: storedAntibiotics.length ? storedAntibiotics : [{ ...EMPTY_QUICK_ATB, nombre: antibioticSummary(latest) || draft.antibioterapia || '' }],
      antibioticos_eliminados: Array.isArray(latest.antibioticos_eliminados) ? latest.antibioticos_eliminados : [], cultivos: (latest.estudios_micro || []).length ? latest.estudios_micro.map(item => ({ ...item, estado_resultado: item.estado_resultado || (isNegativeMicroResult(item.patogeno) ? 'negativo' : item.patogeno ? 'positivo' : 'pendiente') })) : [{ fecha: '', tipo_muestra: '', estado_resultado: 'pendiente', patogeno: '', sensibilidad: 'Pendiente' }],
    });
    setProaOpen(true);
  };
  const openStudiesChecked = () => requestFirstClinicalUse(openStudies);
  const openProaChecked = () => requestFirstClinicalUse(openProaPopup);
  const openLabChecked = () => requestFirstClinicalUse(() => { setLabWorkspaceTab('registro'); setLabRows(Array.isArray(draft.laboratorios) && draft.laboratorios.length ? mergeLaboratoryRows([], draft.laboratorios) : [emptyLabRow()]); setLabCultures(Array.isArray(draft.cultivos) ? draft.cultivos : []); setLabPasteText(''); setLabParseMessage(''); setLabOpen(true); });
  const openMicroChecked = () => requestFirstClinicalUse(() => { setLabCultures(Array.isArray(draft.cultivos) && draft.cultivos.length ? draft.cultivos : [{ ...EMPTY_CULTURE }]); setMicroOpen(true); });
  const saveMicro = async () => {
    // No usa el `labRows` en memoria (puede seguir en su valor inicial si "Registrar exámenes"
    // no se abrió esta sesión); toma siempre los laboratorios ya guardados en la ficha.
    const rows = Array.isArray(draft.laboratorios) && draft.laboratorios.length ? mergeLaboratoryRows([], draft.laboratorios) : labRows;
    await saveLab(rows, labCultures);
    setMicroOpen(false);
  };
  const saveProaQuick = async ({ keepOpen = false, previewAfter = false, setPreview } = {}) => {
    setProaSaving(true);
    try {
      if (!draft.proaRecordId) {
        const antibiotics = proaQuick.antibioticos.filter(item => item.nombre);
        const cultures = proaQuick.cultivos.filter(item => item.fecha || item.tipo_muestra || item.patogeno);
        const created = await saveProaPreAdmission({
          paciente: proaQuick.paciente, rut: proaQuick.rut, edad: proaQuick.edad, sexo: proaQuick.sexo,
          fecha_ingreso: proaQuick.fecha_ingreso, diagnostico: proaQuick.diagnostico,
          diagnosticos: [proaQuick.diagnostico].filter(Boolean), servicio: selectedBed?.serviceShort || '', proa_is_test: selectedBed?.code === TEST_BED.code,
          cama: catalogToProaBed(selectedBed) || selectedBed?.code || '', antibioticos: antibiotics, cultivos: cultures,
          evolucion: proaQuick.evolucion, resumen_caso: proaQuick.resumen_caso, estudios_imagen: proaQuick.estudios_imagen, plan_duracion: proaQuick.plan_duracion,
          examenes_sangre: proaQuick.examenes_sangre, examenes_complementarios: proaQuick.examenes_complementarios,
        });
        const latestCreated = getLatestProaForm(created) || {};
        if (proaQuick.aislamiento) await saveProaRecord({ ...latestCreated, aislamiento: proaQuick.aislamiento, fecha: new Date().toISOString().slice(0, 10), hora: new Date().toTimeString().slice(0, 5), proa_entry_type: 'ingreso_rapido_vista_general' });
        const antibioticText = structuredAntibioticSummary(antibiotics);
        const storedProaForm = { ...latestCreated, paciente: proaQuick.paciente, rut: proaQuick.rut, edad: proaQuick.edad, sexo: proaQuick.sexo, fecha_ingreso: proaQuick.fecha_ingreso, diagnostico_actual: proaQuick.diagnostico, aislamiento: proaQuick.aislamiento, evolucion: proaQuick.evolucion, resumen_caso: proaQuick.resumen_caso, estudios_imagen: proaQuick.estudios_imagen, plan_duracion: proaQuick.plan_duracion, antibioticos: antibiotics, estudios_micro: cultures, fecha: new Date().toISOString().slice(0, 10), proa_entry_type: 'ingreso_rapido_vista_general' };
        const nextDraft = withProaHistorySnapshot({ ...draft, nombre: proaQuick.paciente, rut: formatRut(proaQuick.rut), edad: proaQuick.edad, sexo: proaQuick.sexo, fechaIngreso: proaQuick.fecha_ingreso, diagnosticoPrincipal: proaQuick.diagnostico, aislamiento: proaQuick.aislamiento, ultimaEvolucion: proaQuick.evolucion, resumenCaso: proaQuick.resumen_caso, estudiosComplementarios: proaQuick.estudios_imagen, planesPendientes: proaQuick.plan_duracion, antibioterapia: antibioticText, antibioticos: antibiotics, patogenoAislado: cultures.map(item => item.patogeno).filter(value => !isNegativeMicroResult(value)).join(', '), proaRecordId: created.id, proaBedCode: created.bedCode, proaUpdatedAt: created.updatedAt, updatedAt: new Date().toISOString() }, storedProaForm);
        const nextRegistry = { ...registry, [selectedCode]: nextDraft };
        setDraft(nextDraft); setRegistry(nextRegistry); localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRegistry)); if (!keepOpen) setProaOpen(false); if (previewAfter) setPreview?.(true); setSaved(true);
        return;
      }
      const records = await fetchProaRecords();
      const record = records.find(item => item.id === draft.proaRecordId);
      const latest = getLatestProaForm(record) || {};
      const cultures = proaQuick.cultivos.filter(item => item.fecha || item.tipo_muestra || item.patogeno);
      const antibiotics = proaQuick.antibioticos.filter(item => item.nombre);
      const antibioticText = structuredAntibioticSummary(antibiotics);
      const storedProaForm = {
        ...latest, aislamiento: proaQuick.aislamiento, evolucion: proaQuick.evolucion, vista_ultima_evolucion: proaQuick.evolucion, resumen_caso: proaQuick.resumen_caso, estudios_imagen: proaQuick.estudios_imagen, plan_duracion: proaQuick.plan_duracion, parametros_inflamatorios: proaQuick.examenes_sangre.filter(item => Object.entries(item).some(([key,value]) => key !== 'fecha' && value)), examenes_complementarios: proaQuick.examenes_complementarios.filter(item => item.fecha || item.nombre || item.resultado), antibioticos: antibiotics, antibioticos_eliminados: proaQuick.antibioticos_eliminados || [], antibioterapia_preingreso: antibioticText,
        estudios_micro: cultures, diagnostico_microbiologico: cultures.map(item => item.patogeno).filter(value => value && !isNegativeMicroResult(value)).join(', '),
        fecha: new Date().toISOString().slice(0, 10), hora: new Date().toTimeString().slice(0, 5), proa_entry_type: 'actualizacion_vista_general',
      };
      await saveProaRecord(storedProaForm);
      const pathogen = cultures.map(item => item.patogeno).filter(value => value && !isNegativeMicroResult(value)).join(', ');
      const nextDraft = withProaHistorySnapshot({ ...draft, aislamiento: proaQuick.aislamiento, ultimaEvolucion: proaQuick.evolucion, resumenCaso: proaQuick.resumen_caso, estudiosComplementarios: proaQuick.estudios_imagen, planesPendientes: proaQuick.plan_duracion, antibioterapia: antibioticText, antibioticos: antibiotics, patogenoAislado: pathogen, updatedAt: new Date().toISOString() }, storedProaForm);
      const nextRegistry = { ...registry, [selectedCode]: nextDraft };
      setDraft(nextDraft); setRegistry(nextRegistry); localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRegistry));
      if (!keepOpen) setProaOpen(false); if (previewAfter) setPreview?.(true); setSaved(true);
    } finally { setProaSaving(false); }
  };

  return <div className="min-h-screen bg-slate-100">
    {documentArchiveOpen && <div className="fixed inset-0 z-[99] flex items-center justify-center bg-slate-950/65 p-2 sm:p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Historia de evoluciones"><div className="flex max-h-[92vh] min-w-0 w-[calc(100vw-1rem)] max-w-4xl flex-col overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-2xl"><header className="flex min-w-0 items-start justify-between gap-3 border-b border-indigo-100 bg-indigo-50 px-4 py-4 sm:px-5"><div className="min-w-0"><h2 className="break-words text-lg font-black text-indigo-950">Historia de evoluciones</h2><p className="break-words text-xs text-indigo-700">{draft.nombre || `Cama ${selectedBed?.cell || ''}`} · {(draft.historialActualizaciones || []).length} registro{draft.historialActualizaciones?.length === 1 ? '' : 's'}</p></div><Button type="button" size="sm" variant="outline" onClick={() => setDocumentArchiveOpen(false)} className="shrink-0">Cerrar</Button></header><div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-3 sm:p-5"><section className="min-w-0 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3"><div className="min-w-0 space-y-2">{(draft.historialActualizaciones || []).length > 0 ? [...(draft.historialActualizaciones || [])].map((snapshot, index) => { const savedAt = snapshot.guardadoEn || snapshot.createdAt || snapshot.updatedAt || snapshot.fecha; return <div key={snapshot.id || savedAt || index} className="relative min-w-0 rounded-lg border border-indigo-100 bg-white"><Button type="button" size="icon" variant="ghost" title="Vista previa / imprimir" aria-label={`Imprimir evolución del ${savedAt || 'registro'}`} onClick={() => printHospitalSnapshot(snapshot, draft, selectedBed)} className="absolute right-9 top-2 z-10 h-8 w-8 text-indigo-700 hover:bg-indigo-50"><Printer className="h-4 w-4" /></Button><details className="group min-w-0" open={index === 0}><summary className="cursor-pointer list-none p-3 pr-20"><p className="break-words text-sm font-black text-slate-900">{savedAt ? new Date(savedAt).toLocaleString('es-CL') : 'Fecha no consignada'}</p><p className="mt-1 line-clamp-2 break-words text-xs text-slate-500">{snapshot.ultimaEvolucion || snapshot.resumenCaso || snapshot.diagnosticoPrincipal || snapshot.diagnostico || 'Actualización clínica'}</p><ChevronDown className="absolute right-3 top-4 h-4 w-4 text-indigo-700 transition-transform group-open:rotate-180" /></summary><div className="min-w-0 space-y-2 border-t border-indigo-100 p-3 text-sm text-slate-700"><p className="whitespace-pre-wrap break-words"><strong>Resumen clínico:</strong><br />{snapshot.resumenCaso || '—'}</p><p className="whitespace-pre-wrap break-words"><strong>Evolución actual:</strong><br />{snapshot.ultimaEvolucion || '—'}</p>{snapshot.planesPendientes && <p className="whitespace-pre-wrap break-words"><strong>Planes:</strong><br />{snapshot.planesPendientes}</p>}</div></details></div>; }) : <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">Aún no hay evoluciones almacenadas.</p>}</div></section><section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h3 className="text-sm font-black text-emerald-950">Informes médicos ({(draft.informesMedicos || []).length})</h3><p className="break-words text-xs text-emerald-800">También puede consultar y reimprimir sus versiones almacenadas.</p></div><Button type="button" size="sm" onClick={() => { setDocumentArchiveOpen(false); setMedicalReportsOpen(true); }} className="gap-2 bg-emerald-700 hover:bg-emerald-800"><FileText className="h-4 w-4" />Abrir informes</Button></div></section></div></div></div>}
    {summaryOpen && <div className="fixed inset-0 z-[97] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="w-full max-w-2xl rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-5 shadow-2xl"><div className="mb-4 rounded-xl bg-emerald-100/80 p-3"><h2 className="text-lg font-black text-emerald-950">Resumen clínico actual — Cama {selectedBed?.cell}</h2><p className="text-xs text-emerald-700">Edita solamente la síntesis general vigente del cuadro clínico.</p></div><Field label="Resumen clínico actual"><textarea className={`${textarea} min-h-48`} value={summaryDraft} onChange={e => setSummaryDraft(e.target.value)} placeholder="Síntesis general vigente del cuadro clínico" /></Field><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setSummaryOpen(false)}>Cancelar</Button><Button onClick={saveClinicalSummary} className="bg-emerald-700 hover:bg-emerald-800">Guardar resumen</Button></div></div></div>}
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ChevronLeft className="h-5 w-5" /></Button>
        <div className="shrink-0"><h1 className="truncate text-lg font-black text-slate-950">Vista general</h1>{syncState !== 'ready' && <p className="text-[10px] font-semibold text-slate-500">{syncState === 'loading' ? 'Sincronizando…' : 'Modo sin conexión'}</p>}</div>
        {!selectedBed && <label className="group relative hidden min-w-52 max-w-xl flex-1 md:block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition group-focus-within:text-teal-600" /><input value={query} onChange={e => setQuery(e.target.value)} className={`${input} h-10 rounded-xl bg-slate-50 pl-10 text-sm focus:bg-white`} placeholder="Buscar cama, paciente, RUT o diagnóstico…" /></label>}
        <div className="flex rounded-lg bg-slate-100 p-1"><button type="button" onClick={() => setActiveTab('camas')} className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${activeTab === 'camas' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}><BedDouble className="mr-1 inline h-3.5 w-3.5" />Camas</button><button type="button" onClick={() => setActiveTab('estadistica')} className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${activeTab === 'estadistica' ? 'bg-white text-violet-800 shadow-sm' : 'text-slate-500'}`}><Activity className="mr-1 inline h-3.5 w-3.5" />Estadística</button></div>
        <Button variant="outline" size="sm" onClick={() => setPrintPreview(true)} className="gap-2"><Printer className="h-4 w-4" /><span className="hidden sm:inline">Tabla de visita</span></Button>
      </div>
    </header>

    <main className={`${activeTab === 'camas' ? 'block' : 'hidden'} mx-auto max-w-[1700px] p-4 pb-32`}>
      <section className={`${selectedBed ? 'hidden' : 'block'} min-w-0`}>
        <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid items-stretch bg-slate-50/70 sm:grid-cols-[minmax(280px,1fr)_auto_auto_auto]">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 sm:border-b-0 sm:border-r">
              <Button type="button" size="icon" variant="ghost" onClick={() => changeService(-1)} title="Servicio anterior" className="rounded-full text-slate-600 hover:bg-white hover:text-teal-800"><ChevronLeft className="h-5 w-5" /></Button>
              <div className="min-w-0 px-4 text-center"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-700">Servicio seleccionado</p><p className="text-lg font-black text-slate-950">{service}</p></div>
              <Button type="button" size="icon" variant="ghost" onClick={() => changeService(1)} title="Servicio siguiente" className="rounded-full text-slate-600 hover:bg-white hover:text-teal-800"><ChevronRight className="h-5 w-5" /></Button>
            </div>
            <div className="flex items-center justify-center gap-2 border-b border-slate-100 px-4 py-3 sm:border-b-0 sm:border-r"><span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">{totals.occupied} ocupadas</span><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600 ring-1 ring-slate-200">{totals.free} libres</span></div>
            <label className="flex min-w-52 items-center gap-2 px-4 py-3"><span className="shrink-0 text-xs font-bold text-slate-500">Mostrar</span><select className={`${input} h-10 min-w-0 bg-white py-1.5`} value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todas las camas</option><option value="occupied">Solo ocupadas</option><option value="free">Solo libres</option></select></label>
            <div className="flex items-center border-t border-slate-100 px-3 py-2 sm:border-l sm:border-t-0"><div className="flex rounded-lg border border-slate-200 bg-white p-1"><button type="button" onClick={() => setBedViewMode('grid')} title="Vista de tarjetas" aria-pressed={bedViewMode === 'grid'} className={`grid h-8 w-9 place-items-center rounded-md transition ${bedViewMode === 'grid' ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}><LayoutGrid className="h-4 w-4" /></button><button type="button" onClick={() => setBedViewMode('list')} title="Vista en lista" aria-pressed={bedViewMode === 'list'} className={`grid h-8 w-9 place-items-center rounded-md transition ${bedViewMode === 'list' ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}><List className="h-4 w-4" /></button></div></div>
          </div>
        </div>
        <div className="mb-3 flex items-end justify-between gap-3 px-1"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-700">{bedViewMode === 'grid' ? 'Mapa de camas' : 'Listado de pacientes'}</p><h2 className="text-lg font-black text-slate-950">Servicio {service}</h2></div><p className="text-xs font-semibold text-slate-500">{visibleBeds.length} cama{visibleBeds.length === 1 ? '' : 's'} visible{visibleBeds.length === 1 ? '' : 's'}</p></div>
        <div className={`${bedViewMode === 'grid' ? 'grid' : 'hidden'} grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6`}>
          {visibleBeds.map(bed => {
            const record = registry[bed.code] || {};
            const isOccupied = Boolean(record.nombre || record.rut || record.fechaIngreso || record.diagnostico);
            const active = selectedCode === bed.code;
            return <button key={bed.code} onClick={() => openBed(bed)} className={`min-h-36 rounded-xl border p-3 text-left transition ${active ? 'border-teal-600 bg-teal-50 ring-2 ring-teal-200' : bed.code === TEST_BED.code ? 'border-violet-300 bg-violet-50 hover:border-violet-500' : isOccupied ? 'border-emerald-200 bg-white hover:border-emerald-400' : 'border-slate-200 bg-white hover:border-teal-300'}`}>
              <div className="flex items-start justify-between gap-2"><div><span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">{bed.serviceShort} · {bed.salaLabel}</span><span className="block text-lg font-black text-slate-950">Cama {bed.cell}</span></div><BedDouble className={`h-5 w-5 ${isOccupied ? 'text-emerald-600' : 'text-slate-300'}`} /></div>
              {isOccupied ? <><div className="mt-2 flex min-w-0 items-center gap-1.5"><p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{record.nombre || 'Paciente sin nombre'}</p>{bed.code === TEST_BED.code && <span className="rounded-full bg-violet-200 px-1.5 py-0.5 text-[9px] font-black text-violet-900">PRUEBA</span>}{record.pacienteSocial && <span title="Paciente social" aria-label="Paciente social" className="inline-flex shrink-0 items-center rounded-full bg-fuchsia-100 p-1 text-fuchsia-700"><HeartHandshake className="h-3.5 w-3.5" /></span>}</div><p className="truncate text-xs text-slate-500">{record.diagnosticoPrincipal || record.diagnostico || 'Sin diagnóstico registrado'}</p><p className="mt-2 text-[11px] font-bold text-emerald-700">Día {hospitalDays(record.fechaIngreso)} de hospitalización</p>{record.antibioterapia && <p className="mt-1 truncate text-[10px] font-semibold text-amber-700">ATB: {record.antibioterapia}</p>}</> : <><span className="mt-5 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">LIBRE / SIN INFORMACIÓN</span><p className="mt-2 text-[10px] text-slate-400">Abrir para ingresar paciente</p></>}
            </button>;
          })}
        </div>
        {bedViewMode === 'list' && <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="min-w-[1050px] w-full border-collapse text-left"><thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Cama</th><th className="px-4 py-3">Paciente</th><th className="px-4 py-3">Edad</th><th className="px-4 py-3">Diagnóstico principal</th><th className="px-4 py-3">Último laboratorio</th><th className="px-4 py-3">Antibioterapia</th><th className="px-4 py-3">Estado</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleBeds.map(bed => { const record = registry[bed.code] || {}; const isOccupied = Boolean(record.nombre || record.rut || record.fechaIngreso || record.diagnostico); const atb = antibioticVisitItems(record); return <tr key={bed.code} onClick={() => openBed(bed)} className="cursor-pointer transition hover:bg-teal-50/60"><td className="whitespace-nowrap px-4 py-3"><p className="font-black text-slate-900">{bed.cell}</p><p className="text-[10px] font-bold uppercase text-slate-500">{bed.salaLabel}</p></td><td className="px-4 py-3"><p className="font-bold text-slate-900">{record.nombre || 'Cama libre'}</p><p className="text-xs text-slate-500">{record.rut || 'Sin paciente registrado'}</p></td><td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-700">{record.edad ? `${record.edad} años` : '—'}</td><td className="max-w-72 px-4 py-3 text-sm text-slate-700">{record.diagnosticoPrincipal || record.diagnostico || '—'}</td><td className="max-w-72 px-4 py-3 text-xs text-slate-600">{record.ultimoLaboratorio || '—'}</td><td className="max-w-80 px-4 py-3"><p className="line-clamp-2 text-xs font-semibold text-emerald-800">{atb.current.join('\n') || '—'}</p>{atb.suspended.length > 0 && <p className="mt-1 line-clamp-1 text-[10px] font-semibold text-red-600">Suspendidos: {atb.suspended.join(' · ')}</p>}</td><td className="px-4 py-3">{isOccupied ? <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-800">Hospitalizado · Día {hospitalDays(record.fechaIngreso)}</span> : <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">Libre</span>}</td></tr>; })}</tbody></table></div>}
      </section>

      <aside className={`${selectedBed ? 'block' : 'hidden'} min-w-0 pb-20`}>
        {!selectedBed ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><BedDouble className="mx-auto h-12 w-12 text-slate-300" /><h2 className="mt-4 font-bold text-slate-800">Selecciona una cama</h2><p className="mt-1 text-sm text-slate-500">Podrás registrar al paciente y generar todos sus documentos desde una sola ficha.</p></div> : <div className="space-y-4">
          <Button type="button" variant="outline" onClick={() => { setSelectedCode(''); sessionStorage.removeItem(SELECTED_BED_KEY); }} className="gap-2"><ChevronLeft className="h-4 w-4" />Volver a camas</Button>
          <section className={`border border-slate-200 bg-white p-5 shadow-sm ${patientViewTab === 'documents' && detailsOpen ? 'rounded-t-2xl rounded-b-none pb-0' : 'rounded-2xl'}`}>
            <div className={`flex flex-wrap items-start justify-between gap-3 ${detailsOpen ? 'mb-4' : ''}`}><div><p className="text-xs font-bold uppercase tracking-wider text-teal-700">{selectedBed.serviceShort} · {selectedBed.salaLabel}</p><h2 className="text-2xl font-black text-slate-950">Cama {selectedBed.cell}</h2>{draft.nombre && <p className="flex flex-wrap items-center gap-1.5 font-bold text-slate-800">{draft.nombre} {draft.rut && <span className="font-normal text-slate-500">· {draft.rut}</span>}{draft.edad && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-800 ring-1 ring-sky-200">{draft.edad} años</span>}{draft.pacienteSocial && <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-100 px-2 py-0.5 text-[10px] font-bold text-fuchsia-800"><HeartHandshake className="h-3 w-3" />Paciente social</span>}</p>}{occupied && <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold text-emerald-700">Ingreso {draft.fechaIngreso || 'sin fecha'} · Día {hospitalDays(draft.fechaIngreso)}</p>{draft.reingresoEvaluado && <span title={draft.reingresoEvaluadoEn ? `Verificado el ${displayClinicalDate(String(draft.reingresoEvaluadoEn).slice(0, 10))}` : 'Verificación registrada'} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${draft.reingresoMenor30 ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-500'}`}>{draft.reingresoMenor30 ? 'Reingreso &lt;30 días' : 'No reingreso &lt;30 días'}</span>}</div>}</div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setDetailsOpen(open => !open)} className="gap-2">{detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{detailsOpen ? 'Ocultar ficha' : 'Ver ficha'}</Button><Button type="button" variant="outline" onClick={saveAllChanges} disabled={savingAll || !occupied} className="gap-2 border-emerald-300 bg-emerald-50 font-bold text-emerald-800 hover:bg-emerald-100"><Save className="h-4 w-4" />{savingAll ? 'Guardando…' : saved ? 'Cambios guardados' : 'Guardar todos los cambios'}</Button>{['MQ1', 'MQ2'].includes(selectedBed.serviceShort) && <Button type="button" variant="outline" onClick={() => openAction('FormulariosHODOM')} disabled={!occupied} className="gap-2 border-indigo-300 bg-indigo-50 font-bold text-indigo-800 hover:bg-indigo-100"><LogOut className="h-4 w-4" />Derivar a HODOM</Button>}<Button type="button" variant="outline" onClick={openDischarge} disabled={!occupied} className="gap-2 border-red-300 bg-red-50 font-bold text-red-700 hover:bg-red-100"><LogOut className="h-4 w-4" />Egresar paciente</Button><Button onClick={openGeneral} className="gap-2 bg-teal-700 hover:bg-teal-800"><ClipboardList className="h-4 w-4" />Editar ficha general</Button></div></div>
            {detailsOpen && <>
            <nav className={`${patientViewTab === 'documents' ? 'mb-0' : 'mb-5'} flex gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1.5`} aria-label="Secciones de la ficha">{[['clinical','Información clínica',ClipboardList,'bg-sky-50 text-sky-800'],['exams','Exámenes y calculadoras',FlaskConical,'bg-cyan-50 text-cyan-800'],['proa','PROA',ShieldCheck,'bg-emerald-50 text-emerald-800'],['documents','Documentos y solicitudes',FileText,'bg-indigo-50 text-indigo-800'],['evolutions','Evoluciones',Activity,'bg-violet-50 text-violet-800']].map(([key,label,Icon,color]) => <button key={key} type="button" onClick={() => setPatientViewTab(key)} className={`flex h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold transition sm:px-4 ${patientViewTab === key ? 'bg-teal-700 text-white shadow-sm' : `${color} hover:brightness-95`}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${patientViewTab === key ? 'bg-white/15' : 'bg-white/65'}`}><Icon className="h-4 w-4 stroke-[2]" /></span><span>{label}</span></button>)}</nav>
            <style>{`.patient-access-grid>section{display:none}.patient-access-grid[data-tab="clinical"]>section:nth-child(1),.patient-access-grid[data-tab="clinical"]>section:nth-child(4),.patient-access-grid[data-tab="clinical"]>section:nth-child(5),.patient-access-grid[data-tab="exams"]>section:nth-child(2){display:block}.patient-clinical-details>div:has(textarea[placeholder="Sin antibioterapia registrada en PROA"]){display:none}`}</style>
            {draft.reingresoMenor30 && <div className="mb-4 flex items-start gap-2 rounded-xl border-2 border-orange-300 bg-orange-50 p-3 text-orange-950 shadow-sm"><Activity className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" /><div><p className="text-sm font-black">Segundo ingreso en menos de 30 días</p><p className="text-xs text-orange-800">Reingreso marcado{draft.reingresoFechaEgresoPrevia ? ` · egreso previo: ${displayClinicalDate(draft.reingresoFechaEgresoPrevia)}` : ''}.</p></div></div>}
            <div className={`patient-access-grid mb-5 grid gap-3 ${patientViewTab === 'clinical' ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`} data-tab={patientViewTab}>
              <section className="rounded-xl border border-sky-200 bg-sky-50/50 p-3"><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-sky-800">Clínica y evolución</p><div className="flex flex-wrap gap-2">
                <ExpandIconButton icon={ClipboardList} label="Actualización clínica" onClick={openGeneral} className="border-sky-200 bg-white text-sky-700 hover:bg-sky-50" />
                <ExpandIconButton icon={FileText} label="Resumen clínico" onClick={openClinicalSummary} className="border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50" />
                <ExpandIconButton icon={Activity} label="Estado clínico" title={`Estado clínico actual: ${clinicalStateStatus.detail}`} onClick={openLatestEvolution} className={`relative ${CLINICAL_STATE_BUTTON_STYLES[clinicalStateStatus.state]}`}><span aria-hidden="true" className={`absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white ${clinicalStateStatus.state === 'current' ? 'bg-emerald-500' : clinicalStateStatus.state === 'stale' ? 'bg-rose-500' : 'bg-amber-400'}`} /><span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-max max-w-72 -translate-x-1/2 whitespace-normal rounded-lg bg-slate-950 px-3 py-2 text-left text-[10px] font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">{String(draft.ultimaEvolucion || '').trim() ? <>Última evolución · {clinicalStateStatus.label}{clinicalStateStatus.date ? ` · ${shortClinicalDate(clinicalStateStatus.date)}` : ''}<span className="mt-1 line-clamp-5 block font-normal text-slate-200">{draft.ultimaEvolucion}</span></> : 'Sin evolución registrada'}</span></ExpandIconButton>
                <ExpandIconButton icon={Pencil} label="Nota de evolución" onClick={() => openAction('NotaEvolucion')} className="border-violet-200 bg-white text-violet-700 hover:bg-violet-50" />
                <ExpandIconButton icon={ClipboardList} label="Planes" onClick={openPlans} className="border-amber-200 bg-white text-amber-700 hover:bg-amber-50" />
              </div></section>
              <section className="lg:col-span-2"><div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-4">
                  <p className="mb-3 text-xs font-black uppercase tracking-wider text-cyan-900">Exámenes y solicitudes</p>
                  <div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" onClick={openLabChecked} className="h-16 flex-col gap-1 border-blue-200 bg-white px-2 text-blue-900"><FlaskConical className="h-5 w-5" /><span className="text-[10px] font-bold">Parser / registrar</span></Button><Button type="button" variant="outline" onClick={() => openAction('SolicitudExamenes')} className="h-16 flex-col gap-1 border-indigo-200 bg-white px-2 text-indigo-900"><ClipboardList className="h-5 w-5" /><span className="text-[10px] font-bold">Solicitar exámenes</span></Button><Button type="button" variant="outline" onClick={() => openAction('SolicitudMicrobiologia')} className="h-16 flex-col gap-1 border-violet-200 bg-white px-2 text-violet-900"><Microscope className="h-5 w-5" /><span className="text-[10px] font-bold">Solicitar microbiología</span></Button><Button type="button" variant="outline" onClick={openMicroChecked} className="h-16 flex-col gap-1 border-fuchsia-200 bg-white px-2 text-fuchsia-900"><Microscope className="h-5 w-5" /><span className="text-[10px] font-bold">Registrar cultivos</span></Button></div>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-cyan-100 pt-3"><Button type="button" size="sm" variant="outline" onClick={() => setScalesOpen(true)} className="gap-1 border-rose-200 bg-white text-rose-800"><Calculator className="h-3.5 w-3.5" />Escalas</Button><Button type="button" size="sm" variant="outline" onClick={() => setNutritionOpen(true)} className="gap-1 border-lime-200 bg-white text-lime-800"><Apple className="h-3.5 w-3.5" />Nutrición</Button><Button type="button" size="sm" variant="outline" onClick={() => openAction('ProtocoloInsulina')} className="gap-1 border-sky-200 bg-white text-sky-800"><Activity className="h-3.5 w-3.5" />Protocolo insulínico</Button></div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-wider text-slate-700">Exámenes complementarios y estudios</p><Button type="button" size="sm" variant="outline" onClick={openStudiesChecked} className="shrink-0 gap-1 border-cyan-300 bg-white text-cyan-800"><Image className="h-3.5 w-3.5" />Agregar / ver</Button></div>
                  {(draft.estudiosDetalle || []).filter(study => study.estudio || study.tipo).length > 0
                    ? <ul className="space-y-1.5">{(draft.estudiosDetalle || []).filter(study => study.estudio || study.tipo).slice(0, 5).map((study, index) => <li key={index} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"><p className="text-xs font-bold text-slate-900">{study.estudio || study.tipo}</p><p className="text-[10px] font-semibold text-slate-500">{[study.tipo, study.fecha && displayClinicalDate(study.fecha), study.estado].filter(Boolean).join(' · ')}</p></li>)}{(draft.estudiosDetalle || []).filter(study => study.estudio || study.tipo).length > 5 && <li className="px-2.5 text-[10px] font-bold text-slate-500">+{(draft.estudiosDetalle || []).filter(study => study.estudio || study.tipo).length - 5} más en "Agregar / ver"</li>}</ul>
                    : String(draft.estudiosComplementarios || '').trim()
                      ? <p className="whitespace-pre-line text-xs text-slate-600">{draft.estudiosComplementarios}</p>
                      : <p className="text-xs font-semibold text-slate-400">Sin estudios registrados</p>}
                </div>
                <section className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-3 lg:col-span-2"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-black text-cyan-950">Curva de exámenes</p><Button type="button" size="sm" variant="outline" onClick={openLabCurve} className="shrink-0 gap-1 border-cyan-300 bg-white text-cyan-800"><Activity className="h-3.5 w-3.5" />Expandir</Button></div><button type="button" onClick={openLabCurve} className="block w-full text-left" aria-label="Abrir curva completa de exámenes"><div className="grid gap-2 sm:grid-cols-3"><CompactLabMetric rows={compactLabRows} field="pcr" label="PCR" unit="mg/L" color="#0891b2" /><CompactLabMetric rows={compactLabRows} field="blancos" label="Leucocitos" unit="/mm³" color="#4f46e5" /><CompactLabMetric rows={compactLabRows} field="crea" label="Creatinina" unit="mg/dL" color="#7c3aed" /></div></button></section>
              </div></section>
              <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3"><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-indigo-800">Documentos clínicos</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setMedicalReportsOpen(true)}>Informes médicos</Button><Button type="button" size="sm" variant="outline" onClick={() => openAction('CertificadoMedico')}>Certificado médico</Button><Button type="button" size="sm" variant="outline" onClick={() => setCareDocumentOpen(true)}>Adecuación / límites</Button><Button type="button" size="sm" variant="outline" onClick={() => goToSection('hospital-documentos')}>Documentos y solicitudes</Button><Button type="button" size="sm" variant="outline" onClick={() => setDocumentArchiveOpen(true)} className="gap-1 border-indigo-300 font-bold text-indigo-800"><Printer className="h-3.5 w-3.5" />Historia de evoluciones</Button></div></section>
              <section className="rounded-xl border border-fuchsia-200 bg-fuchsia-50/40 p-3"><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-fuchsia-800">Gestión del paciente</p><div className="flex flex-wrap gap-2"><ExpandIconButton icon={ClipboardList} label={demographicsOpen ? 'Ocultar demografía' : 'Ver demografía'} onClick={() => setDemographicsOpen(open => !open)} aria-expanded={demographicsOpen} className="border-sky-200 bg-white text-sky-800 hover:bg-sky-50" /><ExpandIconButton icon={Activity} label="Datos / estadísticas" onClick={() => setStatsOpen(true)} className="border-violet-200 bg-white text-violet-800 hover:bg-violet-50" /><ExpandIconButton icon={HeartHandshake} label={draft.pacienteSocial ? 'Paciente social ✓' : 'Paciente social'} aria-pressed={draft.pacienteSocial} onClick={toggleSocialPatient} className={draft.pacienteSocial ? 'border-fuchsia-400 bg-fuchsia-100 text-fuchsia-800 hover:bg-fuchsia-100' : 'border-fuchsia-200 bg-white text-fuchsia-800 hover:bg-fuchsia-50'} /></div></section>
              <section className="rounded-xl border border-lime-200 bg-lime-50/40 p-3"><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-lime-800">Herramientas rápidas</p><div className="flex flex-wrap gap-2"><ExpandIconButton icon={Calculator} label="Calculadoras y escalas" onClick={() => setScalesOpen(true)} className="border-rose-200 bg-white text-rose-800 hover:bg-rose-50" /><ExpandIconButton icon={Apple} label="Tamizaje nutricional" onClick={() => setNutritionOpen(true)} className="border-lime-200 bg-white text-lime-800 hover:bg-lime-50" /><ExpandIconButton icon={Activity} label="Protocolo insulínico" onClick={() => openAction('ProtocoloInsulina')} className="border-sky-200 bg-white text-sky-800 hover:bg-sky-50" /></div></section>
            </div>
            <div className="hidden">
              <Button type="button" size="sm" variant="outline" onClick={openGeneral} className="border-sky-300 bg-sky-50 text-sky-800 shadow-[0_0_0_3px_rgba(125,211,252,0.18)] hover:bg-sky-100"><ClipboardList className="mr-1 h-3.5 w-3.5" />Actualización clínica</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setMedicalReportsOpen(true)} className="border-emerald-300 bg-emerald-50 font-bold text-emerald-800 shadow-[0_0_0_3px_rgba(110,231,183,0.2)] hover:bg-emerald-100"><FileText className="mr-1 h-3.5 w-3.5" />Informes médicos</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => openAction('CertificadoMedico')} className="border-blue-300 bg-blue-50 font-bold text-blue-800 shadow-[0_0_0_3px_rgba(147,197,253,0.2)] hover:bg-blue-100"><FileText className="mr-1 h-3.5 w-3.5" />Certificado médico</Button>
              <Button type="button" size="sm" variant="outline" onClick={openPlans} className="border-amber-300 bg-amber-50 text-amber-800 shadow-[0_0_0_3px_rgba(252,211,77,0.18)] hover:bg-amber-100"><FileText className="mr-1 h-3.5 w-3.5" />Planes</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => openAction('NotaEvolucion')} className="border-slate-300 bg-slate-50 font-bold text-slate-800 shadow-[0_0_0_3px_rgba(203,213,225,0.24)] hover:bg-slate-100"><ClipboardList className="mr-1 h-3.5 w-3.5" />Nota de evolución</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setCareDocumentOpen(true)} className="border-amber-300 bg-amber-50 font-bold text-amber-900 shadow-[0_0_0_3px_rgba(252,211,77,0.22)] hover:bg-amber-100"><HeartHandshake className="mr-1 h-3.5 w-3.5" />Adecuación / límites</Button>
              <Button type="button" size="sm" variant="outline" onClick={openStudiesChecked} className="border-cyan-300 bg-cyan-50 text-cyan-800 shadow-[0_0_0_3px_rgba(103,232,249,0.18)] hover:bg-cyan-100"><Image className="mr-1 h-3.5 w-3.5" />Estudios</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setScalesOpen(true)} className="border-rose-300 bg-rose-50 text-rose-700 shadow-[0_0_0_3px_rgba(253,164,175,0.18)] hover:bg-rose-100"><Calculator className="mr-1 h-3.5 w-3.5" />Escalas</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setNutritionOpen(true)} className="border-lime-300 bg-lime-50 text-lime-800 shadow-[0_0_0_3px_rgba(190,242,100,0.2)] hover:bg-lime-100"><Apple className="mr-1 h-3.5 w-3.5" />Evaluación nutricional</Button>
              <Button type="button" size="sm" variant="outline" onClick={openLabChecked} className="border-blue-300 bg-blue-50 font-bold text-blue-800 shadow-[0_0_0_3px_rgba(147,197,253,0.2)] hover:bg-blue-100"><FlaskConical className="mr-1 h-3.5 w-3.5" />Laboratorio / curva</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => openAction('ProtocoloInsulina')} className="border-sky-300 bg-sky-50 font-bold text-sky-800 shadow-[0_0_0_3px_rgba(125,211,252,0.2)] hover:bg-sky-100"><Activity className="mr-1 h-3.5 w-3.5" />Protocolo insulínico</Button>
              <Button type="button" size="sm" variant="outline" onClick={openProaChecked} className="border-teal-400 bg-teal-50 font-bold text-teal-800 shadow-[0_0_0_3px_rgba(45,212,191,0.2)] hover:bg-teal-100"><ShieldCheck className="mr-1 h-3.5 w-3.5" />PROA</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setStatsOpen(true)} className="border-violet-300 bg-violet-50 text-violet-700 shadow-[0_0_0_3px_rgba(196,181,253,0.2)] hover:bg-violet-100"><Activity className="mr-1 h-3.5 w-3.5" />Datos / estadísticas</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => goToSection('hospital-documentos')} className="border-indigo-300 bg-indigo-50 text-indigo-700 shadow-[0_0_0_3px_rgba(165,180,252,0.2)] hover:bg-indigo-100"><FileText className="mr-1 h-3.5 w-3.5" />Documentos y solicitudes</Button>
              <Button type="button" size="sm" variant="outline" aria-pressed={draft.pacienteSocial} onClick={toggleSocialPatient} className={draft.pacienteSocial ? 'border-fuchsia-400 bg-fuchsia-100 font-bold text-fuchsia-800 shadow-[0_0_0_3px_rgba(232,121,249,0.2)] hover:bg-fuchsia-200' : 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100'}><span aria-hidden="true" className={`mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] ${draft.pacienteSocial ? 'border-fuchsia-700 bg-fuchsia-700 text-white' : 'border-fuchsia-400 bg-white'}`}>{draft.pacienteSocial ? '✓' : ''}</span><HeartHandshake className="mr-1 h-3.5 w-3.5" />Paciente social</Button>
            </div>
            <div className={`${patientViewTab === 'clinical' ? 'grid' : 'hidden'} patient-clinical-details gap-3 sm:grid-cols-2`}>
              {demographicsOpen && <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:col-span-2 sm:grid-cols-2">
                <Field label="Nombre completo" wide><input className={`${input} cursor-not-allowed bg-white`} value={draft.nombre} readOnly /></Field>
                <Field label="RUT"><input className={`${input} cursor-not-allowed bg-white`} value={draft.rut} readOnly /></Field>
                <Field label="Dirección"><input className={`${input} cursor-not-allowed bg-white`} value={draft.direccion} readOnly /></Field>
                <Field label="Comuna"><input className={`${input} cursor-not-allowed bg-white`} value={draft.comuna} readOnly /></Field>
                <Field label="Fecha de ingreso"><input type="date" className={`${input} cursor-not-allowed bg-white`} value={draft.fechaIngreso} readOnly /></Field>
              </div>}
              <div className="sm:col-span-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-black text-sky-950">Diagnósticos y antecedentes</p><Button type="button" size="sm" variant="outline" onClick={openDiagnosis} className="border-sky-300 bg-white text-sky-800">Editar</Button></div><div className="rounded-xl border-l-4 border-sky-600 bg-white px-3.5 py-2.5 shadow-sm"><p className="text-[11px] font-black uppercase tracking-wider text-sky-800">Diagnóstico principal</p><p className={`mt-0.5 whitespace-pre-wrap text-lg font-extrabold leading-snug ${String(draft.diagnosticoPrincipal || '').trim() ? 'text-slate-950' : 'font-semibold text-slate-400'}`}>{String(draft.diagnosticoPrincipal || '').trim() || 'Sin diagnóstico principal registrado'}</p></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Diagnósticos asociados"><textarea className={`${textarea} cursor-not-allowed bg-white/70`} value={draft.diagnostico} readOnly /></Field><Field label="Antecedentes relevantes"><textarea className={`${textarea} cursor-not-allowed bg-white/70`} value={draft.antecedentes} readOnly /></Field></div></div>
              <div className="sm:col-span-2 rounded-xl border border-teal-200 bg-teal-50/60 p-3"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-black text-teal-950">Información PROA</p><p className="text-xs text-teal-700">Antibioterapia, aislamiento, precauciones y cultivos se editan exclusivamente desde PROA.</p></div><Button type="button" size="sm" variant="outline" onClick={openProaChecked} className="border-teal-400 bg-white font-bold text-teal-800"><ShieldCheck className="mr-1 h-3.5 w-3.5" />Editar en PROA</Button></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Antibioterapia" wide><textarea className={`${textarea} cursor-not-allowed bg-white/70 text-slate-600`} value={draft.antibioterapia} readOnly aria-readonly="true" placeholder="Sin antibioterapia registrada en PROA" /></Field><Field label="Aislamiento / precauciones"><input className={`${input} cursor-not-allowed bg-white/70 text-slate-600`} value={draft.aislamiento} readOnly aria-readonly="true" placeholder="Sin indicación registrada" /></Field><Field label="Patógeno / cultivos"><input className={`${input} cursor-not-allowed bg-white/70 text-slate-600`} value={draft.patogenoAislado} readOnly aria-readonly="true" placeholder="Sin aislamiento registrado" /></Field></div></div>
              <Field label="Observaciones"><input className={`${input} cursor-not-allowed bg-slate-50`} value={draft.observaciones} readOnly /></Field>
              <div id="hospital-resumen" className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold text-emerald-900">Resumen clínico actual</p><p className="mt-1 whitespace-pre-line text-sm text-slate-700">{draft.resumenCaso || 'Sin resumen clínico registrado'}</p></div><Button type="button" size="sm" variant="outline" onClick={openClinicalSummary} className="shrink-0 border-emerald-300 bg-white text-emerald-800">Editar</Button></div></div>
              <div className={`sm:col-span-2 rounded-xl border p-3 ${clinicalStateStatus.state === 'current' ? 'border-emerald-200 bg-emerald-50/70' : clinicalStateStatus.state === 'stale' ? 'border-rose-200 bg-rose-50/70' : 'border-amber-200 bg-amber-50/70'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold text-slate-900">Estado clínico actual</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${clinicalStateStatus.state === 'current' ? 'bg-emerald-100 text-emerald-800' : clinicalStateStatus.state === 'stale' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{clinicalStateStatus.label}{clinicalStateStatus.date ? ` · ${shortClinicalDate(clinicalStateStatus.date)}` : ''}</span>{latestEvolutionMeta?.isProa && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-800">PROA</span>}</div><p className="mt-1 whitespace-pre-line text-sm text-slate-700">{draft.ultimaEvolucion || 'Sin estado clínico registrado'}</p>{(draft.signosVitales || draft.oxigenoterapiaTipo || draft.drogasVasoactivas || draft.soporteClinico) && <p className="mt-2 text-xs text-slate-700">{[draft.signosVitales && `SV: ${draft.signosVitales}`, draft.oxigenoterapiaTipo && `O₂: ${draft.oxigenoterapiaTipo}${draft.oxigenoterapiaCantidad ? ` ${draft.oxigenoterapiaCantidad}` : ''}`, draft.drogasVasoactivas && `DVA: ${draft.drogasVasoactivas}`, draft.soporteClinico && `Soporte: ${draft.soporteClinico}`].filter(Boolean).join(' · ')}</p>}</div><Button type="button" size="sm" variant="outline" onClick={openLatestEvolution} className={`shrink-0 bg-white ${clinicalStateStatus.state === 'current' ? 'border-emerald-300 text-emerald-800' : clinicalStateStatus.state === 'stale' ? 'border-rose-300 text-rose-800' : 'border-amber-300 text-amber-800'}`}>Editar</Button></div></div>
              <div id="hospital-planes" className="grid gap-3 sm:col-span-2 sm:grid-cols-2"><div><div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-slate-700">Planes pendientes</span>{latestPlanMeta?.date && <span className="text-[10px] font-semibold text-slate-500">Indicados {displayClinicalDate(String(latestPlanMeta.date).slice(0, 10))}</span>}{latestPlanMeta?.isProa && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-800">Plan PROA</span>}</div><textarea className={`${textarea} cursor-not-allowed bg-slate-50`} value={draft.planesPendientes} readOnly placeholder="Sin planes registrados" /></div><Field label="Plan de alta"><textarea className={`${textarea} cursor-not-allowed bg-emerald-50/60`} value={draft.planAlta || ''} readOnly placeholder="Sin plan de alta registrado" /></Field></div>
              <div id="hospital-estudios" className="sm:col-span-2"><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm font-bold text-slate-700">Estudios, escalas y evaluación nutricional</p><p className="mt-1 whitespace-pre-line text-xs text-slate-600">{studyVisitSummary(draft) || 'Sin estudios ni evaluaciones registradas'}</p></div><Button type="button" size="sm" variant="outline" onClick={openStudiesChecked} className="shrink-0">Agregar / ver</Button></div></div></div>
              <Field label="Último laboratorio"><input className={`${input} cursor-not-allowed bg-slate-50`} value={draft.ultimoLaboratorio} readOnly placeholder="Sin laboratorio registrado" /></Field>
              <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3"><p className="mb-2 text-xs font-black uppercase tracking-wide text-amber-900">Decisiones y adecuación del esfuerzo terapéutico</p><div className="grid grid-cols-3 gap-2"><Field label="LET"><input className={`${input} cursor-not-allowed bg-white/70`} value={draft.letIndicacion || 'No consignado'} readOnly /></Field><Field label="IOT"><input className={`${input} cursor-not-allowed bg-white/70`} value={draft.iotIndicacion || 'No consignado'} readOnly /></Field><Field label="RCP"><input className={`${input} cursor-not-allowed bg-white/70`} value={draft.rcpIndicacion || 'No consignado'} readOnly /></Field></div></div>
            </div>
            <section className={`${patientViewTab === 'proa' ? 'block' : 'hidden'} rounded-xl border border-emerald-200 bg-emerald-50/60 p-4`}><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black text-emerald-950">Información PROA</h3><p className="text-xs text-emerald-700">Antibioterapia, aislamiento, cultivos y planes del equipo PROA.</p></div><Button type="button" variant="outline" onClick={openProaChecked} className="gap-2 border-emerald-300 bg-white text-emerald-800"><ShieldCheck className="h-4 w-4" />Editar en PROA</Button></div><div className="grid gap-3 md:grid-cols-2"><div className="rounded-lg border border-emerald-100 bg-white p-3 md:col-span-2"><p className="text-xs font-black uppercase text-emerald-800">Antibioterapia</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{draft.antibioterapia || 'Sin antibioterapia registrada'}</p></div><div className="rounded-lg border border-emerald-100 bg-white p-3"><p className="text-xs font-black uppercase text-emerald-800">Aislamiento / precauciones</p><p className="mt-1 text-sm text-slate-700">{draft.aislamiento || 'No consignado'}</p></div><div className="rounded-lg border border-emerald-100 bg-white p-3"><p className="text-xs font-black uppercase text-emerald-800">Patógenos / cultivos</p><p className="mt-1 text-sm text-slate-700">{draft.patogenoAislado || 'Sin aislamiento microbiológico'}</p></div><div className="rounded-lg border border-teal-200 bg-teal-50 p-3 md:col-span-2"><p className="text-xs font-black uppercase text-teal-800">Plan PROA</p><p className="mt-1 whitespace-pre-wrap text-sm font-medium text-teal-950">{draft.planesPendientes || 'Sin plan PROA registrado'}</p></div></div></section>
            <div className={`${patientViewTab === 'evolutions' ? 'block' : 'hidden'} mt-5 rounded-xl border border-teal-200 bg-teal-50/60 p-4`}>
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-black text-teal-950">Historia de evoluciones</h3><p className="text-xs text-teal-700">Registros guardados y borradores pendientes, claramente diferenciados.</p></div><Button type="button" variant="outline" size="sm" onClick={() => setDocumentArchiveOpen(true)} className="gap-1 border-teal-300 bg-white text-teal-800 hover:bg-teal-50"><Printer className="h-3.5 w-3.5" />Abrir historia ({totalEvolutionHistory})</Button></div>
              <div className="mt-3"><EvolutionHistoryFilters value={historyFilter} onChange={setHistoryFilter} savedCount={savedEvolutionHistory.length} draftCount={evolutionHistoryDrafts.length} /></div>
              {showDraftEvolutionHistory && <div className="mt-3 space-y-2">{evolutionHistoryDrafts.map(entry => <DraftEvolutionCard key={entry.id} entry={entry} onEdit={continueEvolutionHistoryDraft} onDelete={discardEvolutionHistoryDraft} />)}{historyFilter === 'drafts' && !evolutionHistoryDrafts.length && <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50/50 p-4 text-sm text-amber-800">No hay borradores pendientes.</p>}</div>}
              <div className={`${showSavedEvolutionHistory ? 'mt-3 space-y-2' : 'hidden'}`}>{savedEvolutionHistory.map((snapshot, index) => { const savedAt = snapshot.guardadoEn || snapshot.createdAt || snapshot.updatedAt || snapshot.fecha; const documentLabel = historyDocumentLabel(snapshot); return <div key={snapshot.id || `${savedAt}-${index}`} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-100 bg-white p-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-900">{savedAt ? new Date(savedAt).toLocaleString('es-CL') : 'Fecha no consignada'}</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${documentLabel === 'PROA' ? 'bg-emerald-100 text-emerald-800' : documentLabel === 'Estado clínico actual' ? 'bg-cyan-100 text-cyan-800' : 'bg-indigo-100 text-indigo-800'}`}>{documentLabel}</span></div><p className="line-clamp-2 break-words text-xs text-slate-500">{snapshot.ultimaEvolucion || snapshot.resumenCaso || snapshot.diagnostico || 'Evolución clínica'}</p></div><div className="flex shrink-0 gap-1"><Button type="button" size="icon" variant="ghost" title="Editar" onClick={() => editHospitalHistory(index)} className="text-teal-700"><Pencil className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" title={`Imprimir ${documentLabel}`} onClick={() => printHospitalSnapshot(snapshot, draft, selectedBed)} className="text-indigo-700"><Printer className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" title="Borrar" onClick={() => deleteHospitalHistory(index)} className="text-red-600"><Trash2 className="h-4 w-4" /></Button></div></div>; })}{historyFilter === 'saved' && !savedEvolutionHistory.length && <p className="rounded-lg border border-dashed border-teal-200 bg-white p-4 text-sm text-slate-500">Sin evoluciones guardadas.</p>}</div>
              {historyFilter === 'all' && !totalEvolutionHistory && <p className="mt-3 rounded-lg border border-dashed border-teal-200 bg-white p-4 text-sm text-slate-500">Sin evoluciones ni borradores.</p>}
            </div>
            </>}
          </section>

          <section id="hospital-documentos" className={`${patientViewTab === 'documents' ? 'block' : 'hidden'} -mt-4 scroll-mt-24 rounded-b-2xl border border-t-0 border-slate-200 bg-white p-5 pt-4 shadow-sm`}>
            <div className="mb-4 flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700"><Plus className="h-4 w-4 stroke-[2]" /></span><div><h3 className="font-black text-slate-900">Documentos y solicitudes</h3><p className="text-xs text-slate-500">La ficha se guarda y los datos compatibles se cargan automáticamente.</p></div></div>
            <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"><button type="button" onClick={() => setMedicalReportsOpen(true)} title="Crear, consultar o reimprimir informes médicos" className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left text-emerald-900"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/70"><FileText className="h-4 w-4 stroke-[2]" /></span><span className="font-bold">Informes médicos</span></button><button type="button" onClick={() => openAction('CertificadoMedico')} title="Generar certificado médico con datos precargados" className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-left text-blue-900"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/70"><ClipboardList className="h-4 w-4 stroke-[2]" /></span><span className="font-bold">Certificado médico</span></button><button type="button" onClick={() => setCareDocumentOpen(true)} title="Adecuación y límites terapéuticos" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-amber-900"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/70"><HeartHandshake className="h-4 w-4 stroke-[2]" /></span><span className="font-bold">Adecuación / límites</span></button></div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ACTIONS.filter(action => !['SolicitudExamenes', 'SolicitudMicrobiologia'].includes(action.route)).map(action => { const Icon = action.icon; return <button key={action.label} title={`Abrir ${action.label}. Los datos del paciente y su ubicación se cargarán automáticamente.`} onClick={() => openAction(action.route, action.proa)} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-teal-300 hover:shadow-sm"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${action.color}`}><Icon className="h-4 w-4" /></span><span className="text-sm font-semibold text-slate-800">{action.label}</span></button>; })}</div>
          </section>
        </div>}
      </aside>
    </main>
    {activeTab === 'estadistica' && <StatisticsDashboard statistics={statistics} />}
    <HospitalCareDocuments open={careDocumentOpen} patient={draft} bed={selectedBed} onClose={() => setCareDocumentOpen(false)} />
    <HospitalMedicalReports open={medicalReportsOpen} patient={draft} bed={selectedBed} reports={draft.informesMedicos || []} onSave={saveMedicalReport} onClose={() => setMedicalReportsOpen(false)} />
    {readmissionOpen && <div className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"><div className="w-full max-w-xl overflow-hidden rounded-2xl border border-orange-300 bg-gradient-to-br from-orange-50 via-white to-amber-50 shadow-2xl"><div className="border-b border-orange-200 bg-orange-100/80 px-5 py-4"><h2 className="text-lg font-black text-orange-950">Verificación de reingreso</h2><p className="text-xs text-orange-800">Se registra una sola vez antes del primer uso clínico del paciente.</p></div><div className="space-y-4 p-5">{readmissionDraft.detected && <div className="rounded-xl border border-orange-300 bg-orange-100 p-3 text-sm font-semibold text-orange-950"><Activity className="mr-2 inline h-4 w-4" />Antecedente detectado automáticamente: egreso el {displayClinicalDate(readmissionDraft.previousDischargeDate)}, dentro de los 30 días previos al ingreso actual.</div>}<Field label="¿El paciente ha tenido un ingreso hospitalario en los últimos 30 días?"><select className={input} value={readmissionDraft.value} onChange={e => setReadmissionDraft(old => ({ ...old, value: e.target.value, detected: old.detected && e.target.value === 'Sí' }))}><option value="">Seleccionar…</option><option value="Sí">Sí</option><option value="No">No</option></select></Field>{readmissionDraft.value === 'Sí' && <Field label="Fecha de egreso anterior (si se conoce)"><input type="date" className={input} value={readmissionDraft.previousDischargeDate} onChange={e => setReadmissionDraft(old => ({ ...old, previousDischargeDate: e.target.value }))} /></Field>}<p className="text-xs text-slate-500">Si marcas “Sí”, la ficha mostrará una alerta de “Segundo ingreso en menos de 30 días”.</p></div><div className="flex justify-end gap-2 border-t border-orange-200 bg-white/80 px-5 py-4"><Button variant="outline" onClick={() => { pendingClinicalAction.current = null; setReadmissionOpen(false); }}>Cancelar</Button><Button onClick={confirmReadmission} disabled={!readmissionDraft.value} className="bg-orange-600 hover:bg-orange-700">Guardar y continuar</Button></div></div></div>}
    {dischargeOpen && <div className="fixed inset-0 z-[92] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 via-white to-amber-50 shadow-2xl">
        <div className="border-b border-red-200 bg-red-100/80 px-5 py-4"><h2 className="text-lg font-black text-red-950">Egresar paciente — {draft.nombre || selectedBed?.cell}</h2><p className="text-xs text-red-700">La ficha se conservará como histórica y la cama quedará libre.</p></div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Fecha de egreso"><input type="date" className={input} value={dischargeDraft.fecha} onChange={e => setDischargeDraft(old => ({ ...old, fecha: e.target.value }))} /></Field><Field label="Causa de egreso"><select className={input} value={dischargeDraft.motivo} onChange={e => setDischargeDraft(old => ({ ...old, motivo: e.target.value }))}><option value="">Seleccionar causa…</option>{DISCHARGE_REASONS.map(reason => <option key={reason}>{reason}</option>)}</select></Field></div>
          {dischargeDraft.motivo === 'Traslado a otro servicio' && <div className="grid gap-3 sm:grid-cols-2"><Field label="Servicio de destino"><select className={input} value={dischargeDraft.destinoServicio} onChange={e => setDischargeDraft(old => ({ ...old, destinoServicio: e.target.value, destinoCama: '' }))}><option value="">Seleccionar servicio…</option>{PRINT_SERVICE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label="Cama de destino"><select className={input} value={dischargeDraft.destinoCama} disabled={!dischargeDraft.destinoServicio} onChange={e => setDischargeDraft(old => ({ ...old, destinoCama: e.target.value }))}><option value="">{dischargeDraft.destinoServicio ? 'Seleccionar cama…' : 'Primero selecciona el servicio'}</option>{destinationBeds.map(bed => <option key={bed.code} value={bed.code} disabled={bed.occupied}>{bed.salaLabel} · Cama {bed.cell}{bed.occupied ? ' · Ocupada' : ' · Disponible'}</option>)}</select></Field></div>}
          {(draft.antibioticos || []).some(item => item?.nombre) ? <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-4"><h3 className="font-black text-amber-950">Conducta con antibioterapia registrada</h3><p className="mb-3 text-xs text-amber-700">Selecciona la conducta y registra directamente la fecha de cese.</p><div className="space-y-2">{(draft.antibioticos || []).map((item, index) => {
            if (!item?.nombre) return null;
            const action = dischargeDraft.antibioticActions[index] || 'suspender';
            const stopDate = dischargeDraft.antibioticStopDates[index] || '';
            const days = stopDate ? treatmentDays(item.inicio, stopDate) : null;
            return <div key={`${item.nombre}-${index}`} className="rounded-lg border border-amber-100 bg-white p-3"><div className="grid items-end gap-2 sm:grid-cols-[1fr_205px_170px]"><div><p className="text-sm font-bold text-slate-900">{item.nombre}{days ? ` (${days} días)` : ''}</p><p className="text-xs text-slate-500">{[item.dosis || [item.dosis_cantidad, item.dosis_unidad].filter(Boolean).join(' '), item.intervalo_horas && `c/${item.intervalo_horas} h`, item.via, item.inicio && `desde ${item.inicio}`].filter(Boolean).join(' · ')}</p></div><Field label="Conducta"><select className={input} value={action} onChange={e => setDischargeDraft(old => ({ ...old, antibioticActions: { ...old.antibioticActions, [index]: e.target.value }, antibioticStopDates: e.target.value === 'continuar' ? old.antibioticStopDates : { ...old.antibioticStopDates, [index]: old.antibioticStopDates[index] || old.fecha } }))}><option value="suspender">Suspender al egreso</option><option value="continuar">Continuar al alta</option><option value="suspendido">Ya estaba suspendido</option></select></Field>{action !== 'continuar' && <Field label="Fecha de cese"><input type="date" min={item.inicio || undefined} className={input} value={stopDate} onChange={e => setDischargeDraft(old => ({ ...old, antibioticStopDates: { ...old.antibioticStopDates, [index]: e.target.value } }))} /></Field>}</div></div>;
          })}</div>{Object.values(dischargeDraft.antibioticActions).includes('continuar') && <div className="mt-3"><Field label="Indicación antimicrobiana al alta"><textarea className={textarea} value={dischargeDraft.antibioticoAltaIndicacion} onChange={e => setDischargeDraft(old => ({ ...old, antibioticoAltaIndicacion: e.target.value }))} placeholder="Duración restante, controles y otras indicaciones" /></Field></div>}</section> : <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Sin antibioterapia registrada.</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-red-200 bg-white/80 px-5 py-4"><Button variant="outline" onClick={() => setDischargeOpen(false)} disabled={discharging}>Cancelar</Button><Button onClick={confirmDischarge} disabled={discharging || !dischargeDraft.fecha || !dischargeDraft.motivo || (dischargeDraft.motivo === 'Traslado a otro servicio' && (!dischargeDraft.destinoServicio || !dischargeDraft.destinoCama))} className="bg-red-700 hover:bg-red-800"><LogOut className="mr-1 h-4 w-4" />{discharging ? 'Egresando…' : 'Confirmar egreso'}</Button></div>
      </div>
    </div>}
    {diagnosisOpen && <div className="fixed inset-0 z-[88] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm"><div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-blue-50 shadow-2xl"><div className="border-b border-sky-200 bg-sky-100/80 px-5 py-4"><h2 className="text-lg font-black text-sky-950">Diagnósticos y antecedentes</h2><p className="text-xs text-sky-700">Selecciona diagnósticos CIE-10 o escribe libremente. Todo se sincroniza con PROA y la tabla de visita.</p></div><div className="min-h-0 flex-1 overflow-y-auto p-5"><div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]"><section className="space-y-3"><Field label="Diagnóstico principal"><textarea className={textarea} value={diagnosisDraft.principal} onChange={e => setDiagnosisDraft(old => ({ ...old, principal: e.target.value }))} placeholder="Código CIE-10 · diagnóstico principal" /></Field><Field label="Diagnósticos asociados"><textarea className={`${textarea} min-h-36`} value={diagnosisDraft.desglose} onChange={e => setDiagnosisDraft(old => ({ ...old, desglose: e.target.value }))} placeholder="Uno por línea" /></Field><Field label="Antecedentes relevantes"><textarea className={`${textarea} min-h-36`} value={diagnosisDraft.antecedentes} onChange={e => setDiagnosisDraft(old => ({ ...old, antecedentes: e.target.value }))} placeholder="Comorbilidades, antecedentes quirúrgicos, alergias u otros antecedentes relevantes" /></Field></section><section className="rounded-xl border border-sky-200 bg-white/80 p-4"><h3 className="font-black text-sky-950">Catálogo CIE-10 precargado</h3><p className="mb-3 text-xs text-slate-500">El primero seleccionado queda como principal; los siguientes se agregan como asociados.</p><div className="grid gap-2 sm:grid-cols-[1fr_210px]"><input className={input} value={diagnosisSearch} onChange={e => setDiagnosisSearch(e.target.value)} placeholder="Buscar código o diagnóstico…" /><select className={input} value={diagnosisCategory} onChange={e => setDiagnosisCategory(e.target.value)}><option>Todas</option>{[...new Set(DIAGNOSIS_CATALOG.map(item => item.category))].map(category => <option key={category}>{category}</option>)}</select></div><div className="mt-3 max-h-[430px] space-y-2 overflow-y-auto pr-1">{DIAGNOSIS_CATALOG.filter(item => diagnosisCategory === 'Todas' || item.category === diagnosisCategory).filter(item => !diagnosisSearch.trim() || `${item.code} ${item.name} ${item.category}`.toLocaleLowerCase('es').includes(diagnosisSearch.trim().toLocaleLowerCase('es'))).map(item => <button key={`${item.category}-${item.code}`} type="button" onClick={() => addCatalogDiagnosis(item)} className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-sky-400 hover:bg-sky-50"><span><span className="block text-xs font-bold text-sky-700">{item.category}</span><span className="block text-sm font-semibold text-slate-800">{item.name}</span></span><span className="shrink-0 rounded bg-slate-100 px-2 py-1 font-mono text-xs font-black text-slate-700">{item.code}</span></button>)}</div></section></div></div><div className="flex justify-end gap-2 border-t border-sky-200 bg-white/80 px-5 py-4"><Button variant="outline" onClick={() => setDiagnosisOpen(false)}>Cancelar</Button><Button onClick={saveDiagnosis} className="bg-sky-700 hover:bg-sky-800">Guardar y sincronizar</Button></div></div></div>}
    {scalesOpen && <div className="fixed inset-0 z-[88] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm"><div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-orange-50 shadow-2xl"><div className="flex items-start justify-between gap-3 border-b border-rose-200 bg-rose-100/80 px-5 py-4"><div><h2 className="text-lg font-black text-rose-950">Escalas, calculadoras y scores — Cama {selectedBed?.cell}</h2><p className="text-xs text-rose-700">Aplica la calculadora aquí mismo y guarda el resultado fechado para este paciente.</p></div><Button variant="outline" size="sm" onClick={() => setScalesOpen(false)}>Cerrar</Button></div><div className="min-h-0 flex-1 overflow-y-auto p-5"><div className="grid gap-3 sm:grid-cols-[180px_1fr]"><Field label="Fecha"><input type="date" className={input} value={scaleDraft.fecha} onChange={e => setScaleDraft(old => ({ ...old, fecha: e.target.value }))} /></Field><Field label="Escala / calculadora"><select className={input} value={scaleDraft.calculatorId} onChange={e => { const calculator = allCalculators.find(item => item.id === e.target.value); setScaleDraft(old => ({ ...old, calculatorId: e.target.value, nombre: calculator?.name || '', puntaje: '', resultado: '' })); }}><option value="">Seleccionar…</option>{calculatorReferences.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div>{SelectedCalculatorComponent ? <div className="mt-4 overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm"><SelectedCalculatorComponent key={scaleDraft.calculatorId} /></div> : <div className="mt-4 rounded-xl border border-dashed border-rose-300 bg-white/70 p-8 text-center text-sm text-rose-700"><Calculator className="mx-auto mb-2 h-7 w-7" />Selecciona una calculadora para aplicarla sin salir de la ficha.</div>}<div className="mt-4 rounded-xl border border-rose-200 bg-white/85 p-4"><p className="mb-3 text-sm font-black text-rose-950">Registrar resultado en la ficha</p><div className="grid gap-3 sm:grid-cols-2"><Field label="Puntaje / resultado"><input className={input} value={scaleDraft.puntaje} onChange={e => setScaleDraft(old => ({ ...old, puntaje: e.target.value }))} placeholder="Copia aquí el resultado calculado" /></Field><Field label="Interpretación"><input className={input} value={scaleDraft.resultado} onChange={e => setScaleDraft(old => ({ ...old, resultado: e.target.value }))} placeholder="Riesgo o interpretación clínica" /></Field></div></div>{(draft.escalas || []).length > 0 && <div className="mt-4 border-t border-rose-200 pt-3"><p className="mb-2 text-xs font-bold text-rose-900">Resultados previos</p>{draft.escalas.slice(0, 5).map((item, index) => <p key={index} className="text-xs text-slate-700">{item.fecha} · {item.nombre}: {item.puntaje} pts {item.resultado && `· ${item.resultado}`}</p>)}</div>}</div><div className="flex justify-end gap-2 border-t border-rose-200 bg-white/80 px-5 py-4"><Button variant="outline" onClick={() => setScalesOpen(false)}>Cancelar</Button><Button onClick={saveScale} disabled={!scaleDraft.nombre || !scaleDraft.puntaje} className="bg-rose-700 hover:bg-rose-800">Guardar resultado</Button></div></div></div>}
    {nutritionOpen && <div className="fixed inset-0 z-[88] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl border border-lime-200 bg-gradient-to-br from-lime-50 via-white to-green-50 shadow-2xl ${nutritionNrsVisible ? 'max-w-4xl' : 'max-w-2xl'}`}><div className="border-b border-lime-200 bg-lime-100/70 px-5 py-4"><h2 className="text-lg font-black text-lime-950">Evaluación nutricional</h2><p className="text-xs text-lime-800">Tamizaje NRS-2002: 0–2 puntos sin riesgo; ≥3 puntos con riesgo nutricional.</p></div><div className="min-h-0 flex-1 overflow-y-auto p-5">
      {nutritionNrsVisible ? <div className="space-y-3"><Button type="button" variant="outline" size="sm" onClick={() => setNutritionNrsVisible(false)}>← Volver al registro</Button><NRS2002Calculator onApplyResult={applyNrsResult} /></div> : <>
      {!nutritionDraft.tamizaje && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-lime-300 bg-lime-100/80 p-3"><p className="text-xs font-bold text-lime-900">Tamizaje aún no aplicado.</p><Button type="button" size="sm" onClick={() => setNutritionNrsVisible(true)} className="bg-lime-700 hover:bg-lime-800">Aplicar NRS-2002 ahora</Button></div>}
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Fecha"><input type="date" className={input} value={nutritionDraft.fecha} onChange={e => setNutritionDraft(old => ({ ...old, fecha: e.target.value }))} /></Field><Field label="Score / tamizaje aplicado"><select className={input} value={nutritionDraft.tamizaje} onChange={e => setNutritionDraft(old => ({ ...old, tamizaje: e.target.value }))}><option value="">Seleccionar…</option><option value="Sí">Sí</option><option value="No">No</option><option value="No aplica">No aplica</option></select></Field><Field label="Resultado (puntos)"><input type="number" min="0" className={input} value={nutritionDraft.puntaje} disabled={nutritionDraft.tamizaje !== 'Sí'} onChange={e => setNutritionDraft(old => ({ ...old, puntaje: e.target.value }))} /></Field><Field label="Riesgo automático"><input className={`${input} bg-white/70`} value={nutritionDraft.tamizaje === 'Sí' ? nutritionRisk(nutritionDraft.puntaje) : nutritionDraft.tamizaje} readOnly /></Field><Field label="Evaluación nutricional realizada" wide><select className={input} value={nutritionDraft.evaluacion} onChange={e => setNutritionDraft(old => ({ ...old, evaluacion: e.target.value }))}><option value="">Seleccionar…</option><option value="Sí">Sí</option><option value="No">No</option><option value="No aplica">No aplica</option></select></Field></div>
      </>}
    </div>{!nutritionNrsVisible && <div className="flex justify-end gap-2 border-t border-lime-200 bg-white/80 px-5 py-4"><Button variant="outline" onClick={() => { setNutritionOpen(false); setNutritionNrsVisible(false); }}>Cancelar</Button><Button onClick={saveNutrition} className="bg-lime-700 hover:bg-lime-800">Guardar evaluación</Button></div>}</div></div>}
    {evolutionOpen && <div className="fixed inset-0 z-[87] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-blue-50 shadow-2xl"><div className="border-b border-cyan-200 bg-cyan-100/80 p-4"><h2 className="text-lg font-black text-cyan-950">Estado clínico actual — Cama {selectedBed?.cell}</h2><p className="text-xs text-cyan-700">Resumen vigente para la tabla de visita. Cada modificación queda fechada en la historia como Estado clínico actual.</p></div><div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
      {evolutionDraftRestored && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3"><p className="text-xs font-bold text-amber-900">Borrador sin guardar recuperado — aún no es definitivo.</p><Button type="button" size="sm" variant="outline" onClick={discardEvolutionDraft} className="border-amber-300 bg-white text-amber-800">Descartar y usar datos actuales</Button></div>}
      <Field label="Síntesis del estado clínico actual"><textarea className={`${textarea} min-h-32`} value={evolutionDraft} onChange={e => setEvolutionDraft(e.target.value)} placeholder="Ej.: Afebril, hemodinámicamente estable, con menor requerimiento de oxígeno." /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Signos vitales">
          <textarea className={textarea} value={clinicalStatusDraft.signosVitales} onChange={e => setClinicalStatusDraft(old => ({ ...old, signosVitales: e.target.value }))} placeholder="PA, FC, FR, T°, SatO₂…" />
          <QuickChips options={['Afebril', 'Febril', 'Hemodinámicamente estable', 'SatO₂ ≥95% aire ambiental']} onPick={value => appendClinicalStatus('signosVitales', value)} />
          <PamCalculator onInsert={text => appendClinicalStatus('signosVitales', text)} />
        </Field>
        <div>
          <Field label="Oxigenoterapia"><select className={input} value={clinicalStatusDraft.oxigenoterapiaTipo} onChange={e => { const tipo = e.target.value; setClinicalStatusDraft(old => ({ ...old, oxigenoterapiaTipo: tipo, ...(tipo ? {} : { oxigenoterapiaCantidad: '' }) })); }}><option value="">Sin oxigenoterapia</option><option>Cánula nasal</option><option>Mascarilla simple</option><option>Venturi</option><option>Mascarilla con reservorio</option><option>CNAF</option><option>VNI</option><option>Ventilación mecánica invasiva</option><option>Otro</option></select></Field>
          {clinicalStatusDraft.oxigenoterapiaTipo && <OxygenFields key={clinicalStatusDraft.oxigenoterapiaTipo} tipo={clinicalStatusDraft.oxigenoterapiaTipo} value={clinicalStatusDraft.oxigenoterapiaCantidad} onChange={value => setClinicalStatusDraft(old => ({ ...old, oxigenoterapiaCantidad: value }))} />}
        </div>
        <section className={`rounded-xl border p-3 ${clinicalSupportVisible.vasoactives ? 'border-rose-200 bg-rose-50/70' : 'border-slate-200 bg-slate-50/70'}`}>
          <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-900">Drogas vasoactivas</p><p className="text-[10px] text-slate-500">Activa solo si el paciente recibe una infusión vasoactiva.</p></div><button type="button" role="switch" aria-checked={clinicalSupportVisible.vasoactives} onClick={() => { const next = !clinicalSupportVisible.vasoactives; setClinicalSupportVisible(old => ({ ...old, vasoactives: next })); if (!next) setClinicalStatusDraft(old => ({ ...old, drogasVasoactivas: '' })); }} className={`relative h-7 w-12 shrink-0 rounded-full transition ${clinicalSupportVisible.vasoactives ? 'bg-rose-600' : 'bg-slate-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${clinicalSupportVisible.vasoactives ? 'left-6' : 'left-1'}`} /></button></div>
          {clinicalSupportVisible.vasoactives && <div className="mt-3"><Field label="Fármaco, dosis y velocidad"><textarea className={textarea} value={clinicalStatusDraft.drogasVasoactivas} onChange={e => setClinicalStatusDraft(old => ({ ...old, drogasVasoactivas: e.target.value }))} placeholder="Ej.: noradrenalina 0,08 mcg/kg/min." /><QuickChips options={['Noradrenalina', 'Adrenalina', 'Dobutamina', 'Dopamina', 'Vasopresina']} onPick={value => appendClinicalStatus('drogasVasoactivas', value)} /><InfusionCalculator onInsert={text => appendClinicalStatus('drogasVasoactivas', text)} /></Field></div>}
        </section>
        <section className={`rounded-xl border p-3 ${clinicalSupportVisible.supports ? 'border-violet-200 bg-violet-50/70' : 'border-slate-200 bg-slate-50/70'}`}>
          <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-900">Otros soportes clínicos</p><p className="text-[10px] text-slate-500">BIC, sedoanalgesia, diálisis, nutrición o dispositivos.</p></div><button type="button" role="switch" aria-checked={clinicalSupportVisible.supports} onClick={() => { const next = !clinicalSupportVisible.supports; setClinicalSupportVisible(old => ({ ...old, supports: next })); if (!next) setClinicalStatusDraft(old => ({ ...old, soporteClinico: '' })); }} className={`relative h-7 w-12 shrink-0 rounded-full transition ${clinicalSupportVisible.supports ? 'bg-violet-600' : 'bg-slate-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${clinicalSupportVisible.supports ? 'left-6' : 'left-1'}`} /></button></div>
          {clinicalSupportVisible.supports && <div className="mt-3"><Field label="Soporte activo"><textarea className={textarea} value={clinicalStatusDraft.soporteClinico} onChange={e => setClinicalStatusDraft(old => ({ ...old, soporteClinico: e.target.value }))} placeholder="Describe el soporte, modalidad y parámetros relevantes." /><QuickChips options={['BIC', 'Sedoanalgesia', 'Hemodiálisis', 'Diálisis peritoneal', 'Nutrición enteral', 'Nutrición parenteral', 'Sonda nasogástrica', 'Traqueostomía', 'Catéter venoso central', 'Drenajes']} onPick={value => appendClinicalStatus('soporteClinico', value)} /><BicBuilder onInsert={text => appendClinicalStatus('soporteClinico', text)} /></Field></div>}
        </section>
      </div>
    </div><div className="flex items-center justify-between gap-2 border-t border-cyan-200 bg-white/80 p-4"><p className="text-[11px] text-slate-500">Al cerrar sin guardar, lo escrito queda como borrador de esta cama.</p><div className="flex gap-2"><Button variant="outline" onClick={closeEvolutionAsDraft}>Cerrar (guarda borrador)</Button><Button onClick={saveLatestEvolution} className="bg-cyan-700 hover:bg-cyan-800">Guardar estado actual</Button></div></div></div></div>}
    {generalOpen && <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-cyan-50 shadow-2xl"><div className="border-b border-teal-200 bg-teal-100/80 px-5 py-4"><h2 className="text-lg font-black text-teal-950">Actualización clínica — Cama {selectedBed?.cell}</h2><p className="text-xs text-teal-700">El resumen clínico y la última evolución se muestran en columnas distintas de la tabla.</p></div><div className="min-h-0 flex-1 overflow-y-auto p-5"><div className="grid gap-3 sm:grid-cols-2"><Field label="Nombre completo" wide><input className={input} value={generalDraft.nombre} onChange={e => updateGeneral('nombre', e.target.value)} /></Field><Field label="RUT"><input className={input} value={generalDraft.rut} onChange={e => updateGeneral('rut', formatRut(e.target.value))} placeholder="12.345.678-9" /></Field><Field label="Dirección"><input className={input} value={generalDraft.direccion} onChange={e => updateGeneral('direccion', e.target.value)} /></Field><Field label="Comuna"><input className={input} value={generalDraft.comuna} onChange={e => updateGeneral('comuna', e.target.value)} /></Field><Field label="Fecha de ingreso"><input type="date" className={input} value={generalDraft.fechaIngreso} onChange={e => updateGeneral('fechaIngreso', e.target.value)} /></Field><Field label="Diagnósticos y antecedentes relevantes" wide><textarea className={`${textarea} min-h-44`} value={diagnosisAndHistoryDraft} onChange={e => setDiagnosisAndHistoryDraft(e.target.value)} placeholder={'DIAGNÓSTICO(S):\n\nANTECEDENTES RELEVANTES:'} /></Field><Field label="Resumen clínico actual · columna Resumen clínico" wide><textarea className={textarea} value={generalDraft.resumenCaso} onChange={e => updateGeneral('resumenCaso', e.target.value)} placeholder="Síntesis general vigente del cuadro clínico" /></Field><Field label="Última evolución · columna Última evolución" wide><textarea className={textarea} value={generalDraft.ultimaEvolucion || ''} onChange={e => updateGeneral('ultimaEvolucion', e.target.value)} placeholder="Cambios y estado observados en la evaluación más reciente" /></Field><Field label="Observaciones" wide><input className={input} value={generalDraft.observaciones} onChange={e => updateGeneral('observaciones', e.target.value)} /></Field><div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="mb-2 text-xs font-black uppercase tracking-wide text-amber-900">Decisiones terapéuticas</p><div className="grid grid-cols-3 gap-2">{[['letIndicacion','LET'],['iotIndicacion','IOT'],['rcpIndicacion','RCP']].map(([key, label]) => <Field key={key} label={label}><select className={input} value={generalDraft[key]} onChange={e => updateGeneral(key, e.target.value)}><option value="">No consignado</option><option value="Sí">Sí</option><option value="No">No</option></select></Field>)}</div></div><Field label="Planes pendientes · columna Planes / alta" wide><textarea className={textarea} value={generalDraft.planesPendientes} onChange={e => updateGeneral('planesPendientes', e.target.value)} placeholder="Conductas o decisiones por completar" /></Field><Field label="Plan de alta · columna Planes / alta" wide><textarea className={`${textarea} border-emerald-200 bg-emerald-50/50`} value={generalDraft.planAlta || ''} onChange={e => updateGeneral('planAlta', e.target.value)} placeholder="Ej.: alta probable en 24–48 h, completar tratamiento, control en APS y signos de alarma" /></Field></div></div><div className="flex justify-end gap-2 border-t border-teal-200 bg-white/80 px-5 py-4"><Button variant="outline" onClick={() => setGeneralOpen(false)}>Cancelar</Button><Button onClick={saveGeneral} className="bg-teal-700 hover:bg-teal-800"><Save className="mr-1 h-4 w-4" />Guardar actualización clínica</Button></div></div></div>}
    {plansOpen && <div className="fixed inset-0 z-[92] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm"><div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl"><header className="border-b border-amber-200 bg-amber-50 px-5 py-4"><h2 className="text-lg font-black text-amber-950">Planes — Cama {selectedBed?.cell}</h2><p className="text-xs text-amber-800">El plan PROA se mantiene como una entidad independiente; luego se muestran los planes de los demás equipos.</p></header><div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"><section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="mb-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-700" /><h3 className="text-sm font-black text-emerald-950">Plan PROA</h3></div><textarea className={`${textarea} min-h-28 border-emerald-200 bg-white`} value={plansDraft.planProa} onChange={e => setPlansDraft(old => ({ ...old, planProa: e.target.value }))} placeholder="Ej.: Completar 7 días de cefazolina, controlar PCR y reevaluar paso a vía oral." /><p className="mt-1 text-[10px] text-emerald-700">Se visualizará discretamente como “(PROA): …” y se sincronizará con la evolución PROA.</p></section><section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-900">Otros planes por ámbito</h3><Button type="button" size="sm" variant="outline" onClick={() => setPlansDraft(old => ({ ...old, planesAmbitos: [...old.planesAmbitos, { ...EMPTY_PLAN_AMBITO }] }))}><Plus className="mr-1 h-4 w-4" />Agregar</Button></div><div className="space-y-3">{plansDraft.planesAmbitos.map((row, index) => <div key={index} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[180px_1fr_auto]"><select className={input} value={row.ambito} onChange={e => setPlansDraft(old => ({ ...old, planesAmbitos: old.planesAmbitos.map((item, itemIndex) => itemIndex === index ? { ...item, ambito: e.target.value } : item) }))}><option value="">Seleccionar ámbito</option>{PLAN_AMBITOS.map(item => <option key={item}>{item}</option>)}</select><textarea className={`${textarea} min-h-20`} value={row.plan} onChange={e => setPlansDraft(old => ({ ...old, planesAmbitos: old.planesAmbitos.map((item, itemIndex) => itemIndex === index ? { ...item, plan: e.target.value } : item) }))} placeholder="Conducta pendiente o recomendación" /><Button type="button" size="icon" variant="ghost" onClick={() => setPlansDraft(old => ({ ...old, planesAmbitos: old.planesAmbitos.length === 1 ? [{ ...EMPTY_PLAN_AMBITO }] : old.planesAmbitos.filter((_, itemIndex) => itemIndex !== index) }))} className="text-red-600"><Trash2 className="h-4 w-4" /></Button></div>)}</div></section><Field label="Plan de alta"><textarea className={`${textarea} border-blue-200 bg-blue-50/40`} value={plansDraft.planAlta} onChange={e => setPlansDraft(old => ({ ...old, planAlta: e.target.value }))} placeholder="Condiciones, controles y tratamiento para el alta" /></Field></div><footer className="flex justify-end gap-2 border-t border-amber-200 bg-white px-5 py-4"><Button variant="outline" onClick={() => setPlansOpen(false)}>Cancelar</Button><Button onClick={savePlans} className="bg-amber-600 text-white hover:bg-amber-700"><Save className="mr-1 h-4 w-4" />Guardar planes</Button></footer></div></div>}

    {fullGeneralOpen && <div className="fixed inset-0 z-[93] flex items-center justify-center bg-slate-950/65 p-2 backdrop-blur-sm sm:p-4"><div className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-2xl"><header className="border-b border-teal-200 bg-gradient-to-r from-teal-50 to-cyan-50 px-5 py-4"><h2 className="text-xl font-black text-teal-950">Editar ficha general — Cama {selectedBed?.cell}</h2><p className="text-xs text-teal-700">Edición integral. Al guardar se actualizan las vistas relacionadas y se crea una versión en la historia de evoluciones.</p></header><div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">{generalDraftRestored && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3"><p className="text-xs font-bold text-amber-900">Borrador sin guardar recuperado: tus campos editados se conservaron y el resto se actualizó con los datos vigentes.</p><Button type="button" size="sm" variant="outline" onClick={discardGeneralDraft} className="border-amber-300 bg-white text-amber-800">Descartar borrador</Button></div>}<section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-800">Identificación e ingreso</h3><div className="grid gap-3 sm:grid-cols-2"><Field label="Nombre completo" wide><input className={input} value={generalDraft.nombre} onChange={e => updateGeneral('nombre', e.target.value)} /></Field><Field label="RUT"><input className={input} value={generalDraft.rut} onChange={e => updateGeneral('rut', formatRut(e.target.value))} /></Field><Field label="Edad"><input type="number" className={input} value={generalDraft.edad || ''} onChange={e => updateGeneral('edad', e.target.value)} /></Field><Field label="Sexo"><select className={input} value={generalDraft.sexo || ''} onChange={e => updateGeneral('sexo', e.target.value)}><option value="">No consignado</option><option value="F">Femenino</option><option value="M">Masculino</option><option value="Otro">Otro</option></select></Field><Field label="Fecha de ingreso"><input type="date" className={input} value={generalDraft.fechaIngreso} onChange={e => updateGeneral('fechaIngreso', e.target.value)} /></Field><Field label="Dirección"><input className={input} value={generalDraft.direccion} onChange={e => updateGeneral('direccion', e.target.value)} /></Field><Field label="Comuna"><input className={input} value={generalDraft.comuna} onChange={e => updateGeneral('comuna', e.target.value)} /></Field></div></section>
      <section className="rounded-xl border border-sky-200 bg-sky-50/50 p-4"><h3 className="mb-3 text-sm font-black uppercase tracking-wide text-sky-900">Diagnósticos y situación clínica</h3><div className="grid gap-3 sm:grid-cols-2"><Field label="Diagnóstico principal" wide><textarea className={textarea} value={generalDraft.diagnosticoPrincipal || ''} onChange={e => updateGeneral('diagnosticoPrincipal', e.target.value)} /></Field><Field label="Diagnósticos asociados y antecedentes" wide><textarea className={`${textarea} min-h-36`} value={diagnosisAndHistoryDraft} onChange={e => setDiagnosisAndHistoryDraft(e.target.value)} placeholder={'DIAGNÓSTICO(S):\n\nANTECEDENTES RELEVANTES:'} /></Field><Field label="Resumen clínico actual" wide><textarea className={`${textarea} min-h-32`} value={generalDraft.resumenCaso || ''} onChange={e => updateGeneral('resumenCaso', e.target.value)} /></Field><Field label="Estado clínico actual" wide><textarea className={`${textarea} min-h-32`} value={generalDraft.ultimaEvolucion || ''} onChange={e => updateGeneral('ultimaEvolucion', e.target.value)} /></Field><Field label="Signos vitales"><textarea className={textarea} value={generalDraft.signosVitales || ''} onChange={e => updateGeneral('signosVitales', e.target.value)} /></Field><Field label="Oxigenoterapia"><input className={input} value={[generalDraft.oxigenoterapiaTipo, generalDraft.oxigenoterapiaCantidad].filter(Boolean).join(' · ')} onChange={e => { const [tipo, ...cantidad] = e.target.value.split(' · '); setGeneralDraft(old => ({ ...old, oxigenoterapiaTipo: tipo, oxigenoterapiaCantidad: cantidad.join(' · ') })); }} placeholder="Tipo · flujo/FiO₂" /></Field><Field label="Drogas vasoactivas"><textarea className={textarea} value={generalDraft.drogasVasoactivas || ''} onChange={e => updateGeneral('drogasVasoactivas', e.target.value)} /></Field><Field label="Otros soportes"><textarea className={textarea} value={generalDraft.soporteClinico || ''} onChange={e => updateGeneral('soporteClinico', e.target.value)} /></Field></div></section>
      <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-black uppercase tracking-wide text-amber-950">Antibioterapia</h3><p className="text-[10px] text-amber-700">Los cambios actualizan el resumen de ATB y el registro PROA vinculado.</p></div><Button type="button" size="sm" variant="outline" onClick={() => updateGeneral('antibioticos', [...(generalDraft.antibioticos || []), { ...EMPTY_QUICK_ATB }])}><Plus className="mr-1 h-4 w-4" />Agregar ATB</Button></div><div className="space-y-3">{(generalDraft.antibioticos || []).map((item, index) => <div key={index} className="grid gap-2 rounded-lg border border-amber-200 bg-white p-3 sm:grid-cols-6"><Field label="Antibiótico"><input className={input} value={item.nombre || ''} onChange={e => updateGeneral('antibioticos', generalDraft.antibioticos.map((row, rowIndex) => rowIndex === index ? { ...row, nombre: e.target.value } : row))} /></Field><Field label="Dosis"><input className={input} value={item.dosis_cantidad || ''} onChange={e => updateGeneral('antibioticos', generalDraft.antibioticos.map((row, rowIndex) => rowIndex === index ? { ...row, dosis_cantidad: e.target.value } : row))} /></Field><Field label="Unidad"><input className={input} value={item.dosis_unidad || ''} onChange={e => updateGeneral('antibioticos', generalDraft.antibioticos.map((row, rowIndex) => rowIndex === index ? { ...row, dosis_unidad: e.target.value } : row))} /></Field><Field label="Cada h"><input className={input} value={item.intervalo_horas || ''} onChange={e => updateGeneral('antibioticos', generalDraft.antibioticos.map((row, rowIndex) => rowIndex === index ? { ...row, intervalo_horas: e.target.value } : row))} /></Field><Field label="Vía"><input className={input} value={item.via || ''} onChange={e => updateGeneral('antibioticos', generalDraft.antibioticos.map((row, rowIndex) => rowIndex === index ? { ...row, via: e.target.value } : row))} /></Field><div className="flex items-end"><Button type="button" variant="ghost" onClick={() => updateGeneral('antibioticos', generalDraft.antibioticos.filter((_, rowIndex) => rowIndex !== index))} className="text-red-600"><Trash2 className="mr-1 h-4 w-4" />Quitar</Button></div><Field label="Inicio"><input type="date" className={input} value={item.inicio || ''} onChange={e => updateGeneral('antibioticos', generalDraft.antibioticos.map((row, rowIndex) => rowIndex === index ? { ...row, inicio: e.target.value } : row))} /></Field><Field label="Término / suspensión"><input type="date" className={input} value={item.termino || ''} onChange={e => updateGeneral('antibioticos', generalDraft.antibioticos.map((row, rowIndex) => rowIndex === index ? { ...row, termino: e.target.value, termino_manual: Boolean(e.target.value) } : row))} /></Field></div>)}</div>{!(generalDraft.antibioticos || []).length && <textarea className={textarea} value={generalDraft.antibioterapia || ''} onChange={e => updateGeneral('antibioterapia', e.target.value)} placeholder="Antibioterapia en texto libre" />}</section>
      <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"><h3 className="mb-3 text-sm font-black uppercase tracking-wide text-emerald-950">PROA, estudios y microbiología</h3><div className="grid gap-3 sm:grid-cols-2"><Field label="Aislamiento / precauciones"><input className={input} value={generalDraft.aislamiento || ''} onChange={e => updateGeneral('aislamiento', e.target.value)} /></Field><Field label="Patógenos / cultivos"><input className={input} value={generalDraft.patogenoAislado || ''} onChange={e => updateGeneral('patogenoAislado', e.target.value)} /></Field><Field label="Estudios complementarios" wide><textarea className={textarea} value={generalDraft.estudiosComplementarios || ''} onChange={e => updateGeneral('estudiosComplementarios', e.target.value)} /></Field></div></section>
      <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-4"><h3 className="mb-3 text-sm font-black uppercase tracking-wide text-violet-950">Planes y adecuación terapéutica</h3><div className="grid gap-3 sm:grid-cols-2"><Field label="Plan PROA" wide><textarea className={`${textarea} border-emerald-200 bg-emerald-50/60`} value={generalDraft.planProa || ''} onChange={e => updateGeneral('planProa', e.target.value)} placeholder="Plan exclusivo del equipo PROA" /></Field><div className="space-y-2 sm:col-span-2">{(generalDraft.planesAmbitos || []).map((row, index) => <div key={index} className="grid gap-2 sm:grid-cols-[180px_1fr_auto]"><select className={input} value={row.ambito || ''} onChange={e => updateGeneral('planesAmbitos', generalDraft.planesAmbitos.map((item, itemIndex) => itemIndex === index ? { ...item, ambito: e.target.value } : item))}><option value="">Ámbito</option>{PLAN_AMBITOS.map(item => <option key={item}>{item}</option>)}</select><textarea className={`${textarea} min-h-20`} value={row.plan || ''} onChange={e => updateGeneral('planesAmbitos', generalDraft.planesAmbitos.map((item, itemIndex) => itemIndex === index ? { ...item, plan: e.target.value } : item))} /><Button type="button" size="icon" variant="ghost" onClick={() => updateGeneral('planesAmbitos', generalDraft.planesAmbitos.filter((_, itemIndex) => itemIndex !== index))} className="text-red-600"><Trash2 className="h-4 w-4" /></Button></div>)}<Button type="button" size="sm" variant="outline" onClick={() => updateGeneral('planesAmbitos', [...(generalDraft.planesAmbitos || []), { ...EMPTY_PLAN_AMBITO }])}><Plus className="mr-1 h-4 w-4" />Agregar otro plan</Button></div><Field label="Plan de alta" wide><textarea className={textarea} value={generalDraft.planAlta || ''} onChange={e => updateGeneral('planAlta', e.target.value)} /></Field><div className="grid grid-cols-3 gap-2 sm:col-span-2">{[['letIndicacion','LET'],['iotIndicacion','IOT'],['rcpIndicacion','RCP']].map(([key, label]) => <Field key={key} label={label}><select className={input} value={generalDraft[key] || ''} onChange={e => updateGeneral(key, e.target.value)}><option value="">No consignado</option><option value="Sí">Sí</option><option value="No">No</option></select></Field>)}</div><Field label="Observaciones" wide><textarea className={textarea} value={generalDraft.observaciones || ''} onChange={e => updateGeneral('observaciones', e.target.value)} /></Field></div></section></div><footer className="flex items-center justify-between gap-2 border-t border-teal-200 bg-white px-5 py-4"><p className="text-[11px] text-slate-500">Al cerrar sin guardar, tus cambios quedan como borrador de esta cama.</p><div className="flex gap-2"><Button variant="outline" onClick={closeGeneralAsDraft}>Cerrar (guarda borrador)</Button><Button onClick={saveGeneral} className="bg-teal-700 hover:bg-teal-800"><Save className="mr-1 h-4 w-4" />Guardar ficha y registrar evolución</Button></div></footer></div></div>}

    {proaOpen && <ProaQuickModal bed={selectedBed} hasRecord={Boolean(draft.proaRecordId)} value={proaQuick} setValue={setProaQuick} saving={proaSaving} onClose={() => setProaOpen(false)} onFull={openFullProa} onSave={saveProaQuick} />}
    {studiesOpen && <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-emerald-50 p-5 shadow-2xl"><div className="mb-4 rounded-xl bg-teal-100/80 p-3"><h2 className="text-lg font-black text-teal-950">Estudios complementarios — Cama {selectedBed?.cell}</h2><p className="text-xs text-teal-700">Registra varias fechas y clasifica cada estudio para mantener un resumen clínico breve.</p></div><div className="mb-3 rounded-xl border border-teal-200 bg-white/70 p-3"><p className="mb-2 text-[10px] font-black uppercase tracking-wide text-teal-800">Estudios frecuentes</p><div className="flex flex-wrap gap-1.5">{FREQUENT_STUDIES.map(preset => <button key={preset.estudio} type="button" onClick={() => setStudiesRows(rows => { const emptyIndex = rows.findIndex(item => !String(item.estudio || '').trim()); return emptyIndex >= 0 ? rows.map((item, rowIndex) => rowIndex === emptyIndex ? { ...item, tipo: preset.tipo, estudio: preset.estudio } : item) : [...rows, { fecha: '', tipo: preset.tipo, estudio: preset.estudio, estado: 'Pendiente' }]; })} className="rounded-full border border-teal-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-teal-800 transition hover:border-teal-400 hover:bg-teal-50">{preset.estudio}</button>)}</div></div><datalist id="frequent-studies-list">{FREQUENT_STUDIES.map(preset => <option key={preset.estudio} value={preset.estudio} />)}</datalist><div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">{studiesRows.map((row, index) => <div key={index} className="rounded-xl border border-teal-100 bg-white/80 p-3"><div className="mb-2 flex items-center justify-between"><strong className="text-xs text-slate-700">Estudio {index + 1}</strong>{studiesRows.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => setStudiesRows(rows => rows.filter((_, rowIndex) => rowIndex !== index))} className="text-red-600">Quitar</Button>}</div><div className="grid gap-3 sm:grid-cols-[150px_190px_1fr_150px]"><Field label="Fecha"><input type="date" className={input} value={row.fecha} onChange={e => setStudiesRows(rows => rows.map((item, rowIndex) => rowIndex === index ? { ...item, fecha: e.target.value } : item))} /></Field><Field label="Tipo"><select className={input} value={row.tipo} onChange={e => setStudiesRows(rows => rows.map((item, rowIndex) => rowIndex === index ? { ...item, tipo: e.target.value } : item))}><option>Imagenología</option><option>Estudio funcional</option><option>Anatomía patológica</option><option>Otro</option></select></Field><Field label="Estudio / resultado"><input className={input} list="frequent-studies-list" value={row.estudio} onChange={e => setStudiesRows(rows => rows.map((item, rowIndex) => rowIndex === index ? { ...item, estudio: e.target.value } : item))} placeholder="Ej.: TAC tórax solicitado" /></Field><Field label="Estado"><select className={input} value={row.estado} onChange={e => setStudiesRows(rows => rows.map((item, rowIndex) => rowIndex === index ? { ...item, estado: e.target.value } : item))}><option>Pendiente</option><option>Solicitado</option><option>Informado</option><option>Suspendido</option></select></Field></div></div>)}<Button type="button" variant="outline" onClick={() => setStudiesRows(rows => [...rows, { fecha: '', tipo: 'Imagenología', estudio: '', estado: 'Pendiente' }])} className="w-full border-dashed border-teal-300 bg-white/70 text-teal-700"><Plus className="mr-1 h-4 w-4" />Agregar otro estudio / fecha</Button></div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setStudiesOpen(false)}>Cancelar</Button><Button onClick={saveStudies} disabled={!studiesRows.some(row => row.estudio || row.fecha)} className="bg-teal-700 hover:bg-teal-800">Guardar estudios</Button></div></div></div>}
    {statsOpen && <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-4"><h2 className="text-lg font-black text-slate-900">Datos del paciente</h2><p className="text-xs text-slate-500">Identificación y variables estadísticas que no se muestran permanentemente en la ficha.</p></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Nombre completo" wide><input className={input} value={draft.nombre} onChange={e => update('nombre', e.target.value)} /></Field><Field label="RUT"><input className={input} value={draft.rut} onChange={e => update('rut', formatRut(e.target.value))} placeholder="12.345.678-9" /></Field><Field label="Fecha de nacimiento"><input type="date" className={input} value={draft.fechaNacimiento} onChange={e => update('fechaNacimiento', e.target.value)} /></Field><Field label="Edad"><input type="number" min="0" max="130" className={input} value={draft.edad} onChange={e => update('edad', e.target.value)} /></Field><Field label="Sexo clínico"><select className={input} value={draft.sexo} onChange={e => update('sexo', e.target.value)}><option value="">No consignado</option><option value="F">Femenino</option><option value="M">Masculino</option><option value="Otro">Otro</option></select></Field><Field label="Previsión"><input className={input} value={draft.prevision} onChange={e => update('prevision', e.target.value)} placeholder="Fonasa A, B, C, D…" /></Field></div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setStatsOpen(false)}>Cancelar</Button><Button onClick={saveStats} className="bg-violet-700 hover:bg-violet-800">Guardar datos</Button></div></div></div>}
    {labOpen && <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="flex h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div><h2 className="text-lg font-black text-slate-900">Laboratorio — Cama {selectedBed?.cell}</h2><p className="text-xs text-slate-500">Registro y seguimiento longitudinal en una sola ventana.</p></div>
          <div className="flex items-center gap-3"><div className="flex rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setLabWorkspaceTab('registro')} className={`rounded-lg px-4 py-2 text-xs font-bold transition ${labWorkspaceTab === 'registro' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-500'}`}><FlaskConical className="mr-1 inline h-4 w-4" />Registrar exámenes</button><button type="button" onClick={openLabCurve} className={`rounded-lg px-4 py-2 text-xs font-bold transition ${labWorkspaceTab === 'curva' ? 'bg-white text-cyan-800 shadow-sm' : 'text-slate-500'}`}><Activity className="mr-1 inline h-4 w-4" />Curva de exámenes</button></div><Button variant="outline" size="sm" onClick={() => setLabOpen(false)}>Cerrar</Button></div>
        </div>
        {labWorkspaceTab === 'curva' ? <HospitalLabCurvePreview embedded open rows={labCurveRows} patient={draft} bed={selectedBed} loading={labCurveLoading || labSaving} onDeleteDate={deleteLabDate} onDeleteResult={deleteLabResult} onClose={() => setLabOpen(false)} /> : <>
          <HospitalLabEntry rows={labRows} setRows={setLabRows} cultures={labCultures} setCultures={setLabCultures} pasteText={labPasteText} setPasteText={setLabPasteText} parseMessage={labParseMessage} setParseMessage={setLabParseMessage} onParse={parsePastedLabs} />
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3"><p className="text-xs text-slate-500">{draft.proaRecordId ? 'Guardado hospitalario + sincronización PROA' : 'Guardado en ficha hospitalaria'}</p><Button onClick={() => saveLab()} disabled={labSaving || (!labRows.some(row => Object.entries(row).some(([key, value]) => key !== 'fecha' && value)) && !labCultures.some(item => item.fecha || item.tipo_muestra || item.patogeno) && !(draft.laboratorios?.length || draft.cultivos?.length))} className="bg-blue-700 hover:bg-blue-800">{labSaving ? 'Guardando…' : 'Guardar cambios de laboratorio'}</Button></div>
        </>}
      </div>
    </div>}
    {microOpen && <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-violet-200 bg-violet-50/80 p-4"><h2 className="text-lg font-black text-violet-950">Cultivos / microbiología — Cama {selectedBed?.cell}</h2><p className="text-xs text-violet-700">Mismo registro que usa PROA. Se sincroniza con la ficha hospitalaria y, si el paciente está vinculado, con el registro PROA.</p></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5"><CultureRegistryEditor cultures={labCultures} setCultures={setLabCultures} /></div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3"><Button variant="outline" onClick={() => setMicroOpen(false)}>Cancelar</Button><Button onClick={saveMicro} disabled={labSaving} className="bg-violet-700 hover:bg-violet-800">{labSaving ? 'Guardando…' : 'Guardar cultivos'}</Button></div>
      </div>
    </div>}
    {printPreview && <div className="hospital-preview-overlay" role="dialog" aria-modal="true" aria-label="Vista previa de tabla de visita">
      <div className="hospital-preview-dialog">
        <div className="hospital-preview-toolbar"><div><h2>Vista previa — Tabla de visita</h2><p>A4 horizontal · selecciona uno o varios servicios</p></div><div className="flex flex-wrap items-center gap-2">{PRINT_SERVICE_OPTIONS.map(option => <label key={option.value} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${printServices.includes(option.value) ? 'border-teal-400 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-500'}`}><input type="checkbox" checked={printServices.includes(option.value)} onChange={() => togglePrintService(option.value)} className="h-3.5 w-3.5 accent-teal-700" />{option.label}</label>)}<Button variant="outline" onClick={() => setPrintPreview(false)}>Cerrar</Button><Button onClick={() => window.print()} disabled={!printServices.length || !printRows.length} className="gap-2 bg-teal-700 hover:bg-teal-800"><Printer className="h-4 w-4" />Imprimir</Button></div></div>
        <div className="hospital-preview-canvas"><div className="hospital-preview-page"><VisitTable rows={printRows} service={printServiceLabel} /></div></div>
      </div>
    </div>}
    <section className="hospital-print-sheet">
      <VisitTable rows={printRows} service={printServiceLabel} />
    </section>
    <style>{`
      .hospital-print-sheet{display:none}
      .hospital-preview-overlay{position:fixed;inset:0;z-index:80;background:rgba(15,23,42,.72);padding:18px;backdrop-filter:blur(4px)}
      .hospital-preview-dialog{display:flex;height:100%;flex-direction:column;overflow:hidden;border-radius:16px;background:#fff;box-shadow:0 24px 80px rgba(15,23,42,.35)}
      .hospital-preview-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #e2e8f0;padding:14px 18px}.hospital-preview-toolbar h2{font-size:16px;font-weight:800;color:#0f172a}.hospital-preview-toolbar p{font-size:11px;color:#64748b}
      .hospital-preview-canvas{flex:1;overflow:auto;background:#cbd5e1;padding:22px}.hospital-preview-page{box-sizing:border-box;width:1120px;min-height:792px;margin:0 auto;background:#fff;padding:28px;box-shadow:0 5px 24px rgba(15,23,42,.25);color:#000;font-family:Arial,sans-serif}
      .hospital-preview-page .hospital-print-header{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:6px;margin-bottom:10px}.hospital-preview-page .hospital-print-header h1{font-size:18px;font-weight:800}.hospital-preview-page .hospital-print-header p{font-size:10px;margin-top:2px}.hospital-preview-page table{width:100%;height:auto!important;border-collapse:collapse;table-layout:fixed;font-size:9px;line-height:1.2}.hospital-preview-page thead,.hospital-preview-page thead tr,.hospital-preview-page th{height:auto!important;min-height:0!important}.hospital-preview-page th,.hospital-preview-page td{border:1px solid #64748b;padding:4px;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}.hospital-preview-page th{background:#e2e8f0;font-size:7.5px;line-height:1.1;text-transform:uppercase;text-align:left}.hospital-preview-page th:nth-child(1){width:10%}.hospital-preview-page th:nth-child(2){width:15%}.hospital-preview-page th:nth-child(3){width:11%}.hospital-preview-page th:nth-child(4){width:12%}.hospital-preview-page th:nth-child(5){width:8%}.hospital-preview-page th:nth-child(6){width:13%}.hospital-preview-page th:nth-child(7){width:9%}.hospital-preview-page th:nth-child(8){width:14%}.hospital-preview-page th:nth-child(9){width:8%}.hospital-preview-page .visit-notes-cell{min-height:72px;background:repeating-linear-gradient(to bottom,transparent 0,transparent 17px,#cbd5e1 18px)}
      @media print{
        @page{size:A4 landscape;margin:7mm}
        html,body,#root{background:#fff!important}
        body *{visibility:hidden!important}
        .hospital-print-sheet,.hospital-print-sheet *{visibility:visible!important}
        .hospital-print-sheet{display:block!important;position:absolute;inset:0;width:100%;color:#000;font-family:Arial,sans-serif}
        .hospital-print-header{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:4px;margin-bottom:7px}
        .hospital-print-header h1{font-size:14px;font-weight:800;margin:0}.hospital-print-header p{font-size:8px;margin:2px 0 0}
        .hospital-print-sheet table{width:100%;height:auto!important;border-collapse:collapse;table-layout:fixed;font-size:7px;line-height:1.18}
        .hospital-print-sheet thead,.hospital-print-sheet thead tr,.hospital-print-sheet th{height:auto!important;min-height:0!important}
        .hospital-print-sheet th,.hospital-print-sheet td{border:1px solid #64748b;padding:3px;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}
        .hospital-print-sheet th{background:#e2e8f0;font-size:6.5px;line-height:1.05;text-transform:uppercase;text-align:left}
        .hospital-print-sheet th:nth-child(1){width:10%}.hospital-print-sheet th:nth-child(2){width:15%}.hospital-print-sheet th:nth-child(3){width:11%}.hospital-print-sheet th:nth-child(4){width:12%}.hospital-print-sheet th:nth-child(5){width:8%}.hospital-print-sheet th:nth-child(6){width:13%}.hospital-print-sheet th:nth-child(7){width:9%}.hospital-print-sheet th:nth-child(8){width:14%}.hospital-print-sheet th:nth-child(9){width:8%}.hospital-print-sheet .visit-notes-cell{min-height:60px;background:repeating-linear-gradient(to bottom,transparent 0,transparent 14px,#cbd5e1 15px)}
        .hospital-print-sheet tr{break-inside:avoid}
      }
    `}</style>
  </div>;
}

export default conAccesoMedispense(VistaHospitalizados);
