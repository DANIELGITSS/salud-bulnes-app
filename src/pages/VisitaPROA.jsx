import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { AlertTriangle, ChevronLeft, Printer, RotateCcw, Plus, Trash2, ShieldPlus, Sparkles, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { conAccesoMedispense } from '@/components/MedispenseAccess';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { invokeLLM } from '@/lib/gemini';
import InflammatoryCurve from '@/components/visita-proa/InflammatoryCurve';
import ProaEvolutionDocument from '@/components/visita-proa/ProaEvolutionDocument';
import DateInputDdmm from '@/components/sdm/DateInputDdmm';
import { PROA_BED_MAP as BASE_PROA_BED_MAP } from '@/lib/hospitalSuggestions';
import { archiveProaRecord, saveProaRecord, takePendingProaForm } from '@/lib/proaRegistry';
import { buildRenalFunctionText, calculateEgfrCkdEpi2021 } from '@/lib/renalFunction';
import { parseLabReportText } from '@/pages/CurvaExamenes';
import { getRenalAntimicrobialAlert, getRenalAntimicrobialAlerts } from '@/lib/renalAntimicrobialAlerts';
import { supabase } from '@/lib/supabase';

// ── Catálogos ──────────────────────────────────────────────
const EVOLUTION_BED_MAP = [
  ...BASE_PROA_BED_MAP,
  { servicio: 'Hospitalización domiciliaria', groups: [{ label: 'Cupos', beds: Array.from({ length: 15 }, (_, index) => `HD-${index + 1}`) }] },
];
export const ANTIBIOTICOS = [
  'Ampicilina', 'Ampicilina + sulbactam', 'Amoxicilina', 'Amoxicilina + ácido clavulánico',
  'Cloxacilina', 'Penicilina G sódica', 'Penicilina G benzatina', 'Penicilina V',
  'Cefazolina', 'Cefuroxima', 'Cefotaxima', 'Ceftriaxona', 'Ceftazidima', 'Cefepime',
  'Ertapenem', 'Meropenem', 'Imipenem + cilastatina',
  'Piperacilina + tazobactam',
  'Vancomicina', 'Teicoplanina', 'Linezolid', 'Daptomicina',
  'Clindamicina', 'Metronidazol',
  'Azitromicina', 'Claritromicina',
  'Ciprofloxacino', 'Levofloxacino', 'Moxifloxacino',
  'Cotrimoxazol (TMP/SMX)', 'Nitrofurantoína', 'Fosfomicina',
  'Doxiciclina', 'Tigeciclina', 'Gentamicina', 'Amikacina', 'Colistina',
  'Fluconazol', 'Voriconazol', 'Anfotericina B', 'Caspofungina',
  'Aciclovir', 'Oseltamivir',
];

// Presentaciones disponibles para construir dosis concretas por administración.
export const PRESENTACIONES_ATB = {
  'Penicilina G sódica': [{ label: 'Frasco ampolla 1.000.000 UI', cantidad: 1000000, unidad: 'UI', envase: 'frasco ampolla' }, { label: 'Frasco ampolla 5.000.000 UI', cantidad: 5000000, unidad: 'UI', envase: 'frasco ampolla' }],
  'Penicilina G benzatina': [{ label: 'Frasco ampolla 1.200.000 UI', cantidad: 1200000, unidad: 'UI', envase: 'frasco ampolla' }, { label: 'Frasco ampolla 2.400.000 UI', cantidad: 2400000, unidad: 'UI', envase: 'frasco ampolla' }],
  'Penicilina V': [{ label: 'Comprimido 500 mg', cantidad: 500, unidad: 'mg', envase: 'comprimido' }],
  'Amoxicilina + ácido clavulánico': [{ label: 'Comprimido 500/125 mg', cantidad: 1, unidad: 'comprimido', envase: 'comprimido' }, { label: 'Comprimido 875/125 mg', cantidad: 1, unidad: 'comprimido', envase: 'comprimido' }],
  'Amikacina': [{ label: 'Ampolla 500 mg/2 mL', cantidad: 500, unidad: 'mg', envase: 'ampolla' }, { label: 'Ampolla 100 mg/2 mL', cantidad: 100, unidad: 'mg', envase: 'ampolla' }],
  'Gentamicina': [{ label: 'Ampolla 80 mg/2 mL', cantidad: 80, unidad: 'mg', envase: 'ampolla' }],
  'Ceftriaxona': [{ label: 'Frasco ampolla 1 g', cantidad: 1, unidad: 'g', envase: 'frasco ampolla' }, { label: 'Frasco ampolla 2 g', cantidad: 2, unidad: 'g', envase: 'frasco ampolla' }],
  'Cefepime': [{ label: 'Frasco ampolla 1 g', cantidad: 1, unidad: 'g', envase: 'frasco ampolla' }, { label: 'Frasco ampolla 2 g', cantidad: 2, unidad: 'g', envase: 'frasco ampolla' }],
  'Ceftazidima': [{ label: 'Frasco ampolla 1 g', cantidad: 1, unidad: 'g', envase: 'frasco ampolla' }],
  'Cefotaxima': [{ label: 'Frasco ampolla 1 g', cantidad: 1, unidad: 'g', envase: 'frasco ampolla' }],
  'Cefazolina': [{ label: 'Frasco ampolla 1 g', cantidad: 1, unidad: 'g', envase: 'frasco ampolla' }],
  'Cefuroxima': [{ label: 'Frasco ampolla 750 mg', cantidad: 750, unidad: 'mg', envase: 'frasco ampolla' }],
  'Meropenem': [{ label: 'Frasco ampolla 1 g', cantidad: 1, unidad: 'g', envase: 'frasco ampolla' }],
  'Imipenem + cilastatina': [{ label: 'Frasco ampolla 500/500 mg', cantidad: 500, unidad: 'mg', envase: 'frasco ampolla' }],
  'Ertapenem': [{ label: 'Frasco ampolla 1 g', cantidad: 1, unidad: 'g', envase: 'frasco ampolla' }],
  'Piperacilina + tazobactam': [{ label: 'Frasco ampolla 4 g/0,5 g', cantidad: 4, unidad: 'g', envase: 'frasco ampolla' }],
  'Ampicilina': [{ label: 'Frasco ampolla 1 g', cantidad: 1, unidad: 'g', envase: 'frasco ampolla' }],
  'Ampicilina + sulbactam': [{ label: 'Frasco ampolla 1,5 g', cantidad: 1.5, unidad: 'g', envase: 'frasco ampolla' }, { label: 'Frasco ampolla 3 g', cantidad: 3, unidad: 'g', envase: 'frasco ampolla' }],
  'Cloxacilina': [{ label: 'Frasco ampolla 500 mg', cantidad: 500, unidad: 'mg', envase: 'frasco ampolla' }],
  'Vancomicina': [{ label: 'Frasco ampolla 500 mg', cantidad: 500, unidad: 'mg', envase: 'frasco ampolla' }, { label: 'Frasco ampolla 1 g', cantidad: 1, unidad: 'g', envase: 'frasco ampolla' }],
  'Linezolid': [{ label: 'Bolsa 600 mg/300 mL EV', cantidad: 600, unidad: 'mg', envase: 'bolsa' }, { label: 'Comprimido 600 mg', cantidad: 600, unidad: 'mg', envase: 'comprimido' }],
  'Clindamicina': [{ label: 'Ampolla 600 mg/4 mL', cantidad: 600, unidad: 'mg', envase: 'ampolla' }, { label: 'Cápsula 300 mg', cantidad: 300, unidad: 'mg', envase: 'cápsula' }],
  'Metronidazol': [{ label: 'Frasco 500 mg/100 mL EV', cantidad: 500, unidad: 'mg', envase: 'frasco' }, { label: 'Comprimido 500 mg', cantidad: 500, unidad: 'mg', envase: 'comprimido' }],
  'Ciprofloxacino': [{ label: 'Bolsa 400 mg EV', cantidad: 400, unidad: 'mg', envase: 'bolsa' }, { label: 'Comprimido 500 mg', cantidad: 500, unidad: 'mg', envase: 'comprimido' }],
  'Levofloxacino': [{ label: 'Comprimido 500 mg', cantidad: 500, unidad: 'mg', envase: 'comprimido' }, { label: 'Comprimido 750 mg', cantidad: 750, unidad: 'mg', envase: 'comprimido' }],
  'Fluconazol': [{ label: 'Frasco 200 mg/100 mL EV', cantidad: 200, unidad: 'mg', envase: 'frasco' }, { label: 'Cápsula 150 mg', cantidad: 150, unidad: 'mg', envase: 'cápsula' }],
};

export const DEFAULT_DOSIS_ATB = {
  'Penicilina G sódica': { presentacion: 'Frasco ampolla 5.000.000 UI', dosis_cantidad: 4000000, dosis_unidad: 'UI', intervalo_horas: '4', via: 'EV' },
  'Penicilina G benzatina': { presentacion: 'Frasco ampolla 1.200.000 UI', dosis_cantidad: 1200000, dosis_unidad: 'UI', intervalo_horas: '24', via: 'IM' },
  'Penicilina V': { presentacion: 'Comprimido 500 mg', dosis_cantidad: 500, dosis_unidad: 'mg', intervalo_horas: '6', via: 'VO' },
  'Amoxicilina + ácido clavulánico': { presentacion: 'Comprimido 875/125 mg', dosis_cantidad: 1, dosis_unidad: 'comprimido', intervalo_horas: '12', via: 'VO' },
  'Amikacina': { presentacion: 'Ampolla 500 mg/2 mL', dosis_por_kg: 15, dosis_unidad: 'mg', intervalo_horas: '24', via: 'EV' },
  'Gentamicina': { presentacion: 'Ampolla 80 mg/2 mL', dosis_por_kg: 5, dosis_unidad: 'mg', intervalo_horas: '24', via: 'EV' },
  'Vancomicina': { presentacion: 'Frasco ampolla 1 g', dosis_por_kg: 15, dosis_unidad: 'mg', intervalo_horas: '12', via: 'EV' },
  'Ceftriaxona': { presentacion: 'Frasco ampolla 2 g', dosis_cantidad: 2, dosis_unidad: 'g', intervalo_horas: '24', via: 'EV' },
  'Cefepime': { presentacion: 'Frasco ampolla 2 g', dosis_cantidad: 2, dosis_unidad: 'g', intervalo_horas: '8', via: 'EV' },
  'Ceftazidima': { presentacion: 'Frasco ampolla 1 g', dosis_cantidad: 2, dosis_unidad: 'g', intervalo_horas: '8', via: 'EV' },
  'Cefotaxima': { presentacion: 'Frasco ampolla 1 g', dosis_cantidad: 1, dosis_unidad: 'g', intervalo_horas: '8', via: 'EV' },
  'Cefazolina': { presentacion: 'Frasco ampolla 1 g', dosis_cantidad: 1, dosis_unidad: 'g', intervalo_horas: '8', via: 'EV' },
  'Cefuroxima': { presentacion: 'Frasco ampolla 750 mg', dosis_cantidad: 750, dosis_unidad: 'mg', intervalo_horas: '8', via: 'EV' },
  'Meropenem': { presentacion: 'Frasco ampolla 1 g', dosis_cantidad: 1, dosis_unidad: 'g', intervalo_horas: '8', via: 'EV' },
  'Ertapenem': { presentacion: 'Frasco ampolla 1 g', dosis_cantidad: 1, dosis_unidad: 'g', intervalo_horas: '24', via: 'EV' },
  'Ampicilina': { presentacion: 'Frasco ampolla 1 g', dosis_cantidad: 2, dosis_unidad: 'g', intervalo_horas: '6', via: 'EV' },
  'Ampicilina + sulbactam': { presentacion: 'Frasco ampolla 1,5 g', dosis_cantidad: 1.5, dosis_unidad: 'g', intervalo_horas: '8', via: 'EV' },
  'Piperacilina + tazobactam': { presentacion: 'Frasco ampolla 4 g/0,5 g', dosis_modo: 'ampolla', unidades_por_dosis: 1, dosis_unidad: 'g', intervalo_horas: '8', via: 'EV' },
  'Cloxacilina': { presentacion: 'Frasco ampolla 500 mg', dosis_cantidad: 2000, dosis_unidad: 'mg', intervalo_horas: '4', via: 'EV' },
  'Linezolid': { presentacion: 'Bolsa 600 mg/300 mL EV', dosis_cantidad: 600, dosis_unidad: 'mg', intervalo_horas: '12', via: 'EV' },
  'Clindamicina': { presentacion: 'Ampolla 600 mg/4 mL', dosis_cantidad: 600, dosis_unidad: 'mg', intervalo_horas: '8', via: 'EV' },
  'Metronidazol': { presentacion: 'Frasco 500 mg/100 mL EV', dosis_cantidad: 500, dosis_unidad: 'mg', intervalo_horas: '8', via: 'EV' },
  'Ciprofloxacino': { presentacion: 'Bolsa 400 mg EV', dosis_cantidad: 400, dosis_unidad: 'mg', intervalo_horas: '12', via: 'EV' },
  'Levofloxacino': { presentacion: 'Comprimido 750 mg', dosis_cantidad: 750, dosis_unidad: 'mg', intervalo_horas: '24', via: 'VO' },
  'Fluconazol': { presentacion: 'Frasco 200 mg/100 mL EV', dosis_cantidad: 400, dosis_unidad: 'mg', intervalo_horas: '24', via: 'EV' },
};

const DOSIS_UNIDADES = ['mg', 'g', 'MUI', 'UI', 'comprimido', 'cápsula', 'ampolla', 'frasco ampolla', 'bolsa'];
const INTERVALOS = ['6', '8', '12', '24', '48'];
const ANTIBIOGRAMA_POOL = [
  ...ANTIBIOTICOS,
  'Oxacilina',
  'Eritromicina',
  'Rifampicina',
  'Tetraciclina',
  'Minociclina',
  'Amoxicilina/clavulánico',
  'Ceftolozano/tazobactam',
  'Ceftazidima/avibactam',
];

const VIAS = ['EV', 'IM', 'VO', 'SC', 'Inhalado'];
const normalizeMedicationName = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase('es');

function arsenalPresentationOption(medication) {
  const strength = medication?.dose_value != null && medication?.dose_unit
    ? `${medication.dose_value} ${medication.dose_unit}`
    : '';
  const presentationText = String(medication?.presentation || '');
  const envase = /polvo.*inyect|frasco/i.test(presentationText)
    ? 'frasco ampolla'
    : /soluci[oó]n.*inyect|ampolla/i.test(presentationText)
      ? 'ampolla'
      : /comprimido|tableta/i.test(presentationText)
        ? 'comprimido'
        : /c[aá]psula/i.test(presentationText)
          ? 'cápsula'
          : /bolsa/i.test(presentationText)
            ? 'bolsa'
            : 'unidad';
  return {
    label: [medication?.presentation, strength].filter(Boolean).join(' · '),
    cantidad: medication?.dose_value ?? '',
    unidad: medication?.dose_unit || '',
    envase,
    source: 'arsenal',
  };
}

export const TIPOS_MUESTRA = [
  'Hemocultivo',
  'Urocultivo',
  'Cultivo expectoración / esputo',
  'Lavado broncoalveolar (LBA)',
  'Aspirado endotraqueal',
  'Cultivo líquido pleural',
  'Cultivo líquido peritoneal',
  'Cultivo LCR',
  'Cultivo de herida / absceso',
  'Cultivo punta de catéter',
  'Coprocultivo',
  'PCR multiplex respiratoria',
  'IFI viral respiratoria',
  'Panel viral respiratorio',
  'PCR Clostridioides difficile',
  'Antígeno urinario (Neumococo / Legionella)',
  'Otro',
];

export const PATOGENOS = [
  'Pendiente',
  'Sin desarrollo',
  'Negativo',
  'Urocultivo negativo',
  'Hemocultivo negativo',
  'Escherichia coli',
  'Escherichia coli BLEE',
  'Klebsiella pneumoniae',
  'Klebsiella pneumoniae BLEE',
  'Klebsiella pneumoniae KPC',
  'Pseudomonas aeruginosa',
  'Pseudomonas aeruginosa MDR',
  'Acinetobacter baumannii',
  'Enterobacter cloacae',
  'Proteus mirabilis',
  'Serratia marcescens',
  'Staphylococcus aureus (MSSA)',
  'Staphylococcus aureus (MRSA)',
  'Staphylococcus epidermidis',
  'Staphylococcus coagulasa negativo',
  'Enterococcus faecalis',
  'Enterococcus faecium',
  'Enterococcus faecium VRE',
  'Streptococcus pneumoniae',
  'Streptococcus pyogenes',
  'Streptococcus agalactiae',
  'Listeria monocytogenes',
  'Haemophilus influenzae',
  'Moraxella catarrhalis',
  'Clostridioides difficile',
  'Candida albicans',
  'Candida glabrata',
  'Candida tropicalis',
  'Candida auris',
  'Aspergillus spp.',
  'Influenza A',
  'Influenza B',
  'Virus sincicial respiratorio (VRS)',
  'SARS-CoV-2',
];

const SENSIBILIDAD_OPCIONES = ['Pendiente', 'Multisensible', 'Sensible al esquema actual', 'Resistente al esquema actual', 'Multidrogo-resistente', 'No aplica'];

// Diagnósticos infectológicos típicos del adulto hospitalizado. Lista cerrada
// para autocomplete; el campo igual permite escribir libre si no está aquí.
export const DIAGNOSTICOS_INFECTO = [
  'Neumonía adquirida en la comunidad (NAC)',
  'Neumonía nosocomial / asociada al cuidado de salud',
  'Neumonía asociada a ventilación mecánica (NAVM)',
  'ITU baja / cistitis',
  'Pielonefritis aguda / ITU complicada',
  'ITU asociada a catéter (CAUTI)',
  'Prostatitis aguda',
  'Bacteriemia primaria',
  'Bacteriemia asociada a catéter (BACAT)',
  'Sepsis sin foco / shock séptico',
  'Endocarditis infecciosa',
  'Celulitis / erisipela',
  'Infección de tejidos blandos complicada',
  'Pie diabético infectado',
  'Infección de sitio quirúrgico',
  'Absceso intraabdominal',
  'Colangitis aguda',
  'Colecistitis aguda complicada',
  'Peritonitis bacteriana espontánea (PBE)',
  'Apendicitis perforada con peritonitis',
  'Diverticulitis complicada',
  'Colitis por Clostridioides difficile',
  'Meningitis bacteriana',
  'Encefalitis',
  'Osteomielitis',
  'Artritis séptica',
  'Empiema pleural',
  'Neutropenia febril',
  'Asma exacerbada con sospecha infecciosa',
  'EPOC exacerbado con sospecha infecciosa',
  'Bronquitis aguda',
  'Neumonía aspirativa',
  'Infección de úlcera por presión',
  'Infección protésica articular',
  'Fascitis necrosante',
  'COVID-19',
  'Influenza',
  'Candidemia / candidiasis invasora',
  'Aspergilosis invasora',
  'Otro',
  'J18.9 · Neumonía, no especificada',
  'J15.9 · Neumonía bacteriana, no especificada',
  'J44.1 · EPOC con exacerbación aguda',
  'J45.9 · Asma, no especificada',
  'J96.0 · Insuficiencia respiratoria aguda',
  'N30.0 · Cistitis aguda',
  'N10 · Pielonefritis aguda',
  'A41.9 · Sepsis, no especificada',
  'R57.2 · Shock séptico',
  'I33.0 · Endocarditis infecciosa aguda y subaguda',
  'L03.9 · Celulitis, no especificada',
  'K83.0 · Colangitis',
  'K81.0 · Colecistitis aguda',
  'G00.9 · Meningitis bacteriana, no especificada',
  'D70 · Neutropenia / agranulocitosis',
  'U07.1 · COVID-19, virus identificado',
  'F32.9 · Episodio depresivo, no especificado',
  'F41.1 · Trastorno de ansiedad generalizada',
  'F05 · Delirium debido a condición fisiológica conocida',
  'I10 · Hipertensión esencial',
  'I21.9 · Infarto agudo de miocardio, no especificado',
  'I50.9 · Insuficiencia cardíaca, no especificada',
  'I48.9 · Fibrilación auricular y flutter, no especificados',
  'I26.9 · Embolia pulmonar sin cor pulmonale agudo',
  'I63.9 · Infarto cerebral, no especificado',
  'K52.9 · Gastroenteritis y colitis no infecciosa, no especificada',
  'K92.2 · Hemorragia gastrointestinal, no especificada',
  'K85.9 · Pancreatitis aguda, no especificada',
  'K74.6 · Cirrosis hepática, no especificada',
  'D64.9 · Anemia, no especificada',
  'D69.6 · Trombocitopenia, no especificada',
  'C34.9 · Neoplasia maligna de bronquio o pulmón, no especificada',
  'C18.9 · Neoplasia maligna de colon, no especificada',
  'C50.9 · Neoplasia maligna de mama, no especificada',
  'C61 · Neoplasia maligna de próstata',
  'N73.9 · Enfermedad inflamatoria pélvica femenina, no especificada',
  'N93.9 · Hemorragia uterina o vaginal anormal, no especificada',
  'O14.9 · Preeclampsia, no especificada',
  'O24.4 · Diabetes mellitus gestacional',
  'O42.9 · Ruptura prematura de membranas, no especificada',
];

// Parámetros inflamatorios que se rellenan en la planilla curva.
const PARAM_COLS = [
  { key: 'fecha', label: 'Fecha', type: 'date', width: '11ch' },
  { key: 'pcr',   label: 'PCR (mg/dL)',  type: 'text', width: '8ch' },
  { key: 'blancos', label: 'Leucos (×10³)', type: 'text', width: '8ch' },
  { key: 'crea',  label: 'Crea (mg/dL)', type: 'text', width: '8ch' },
  { key: 'vhs',   label: 'VHS (mm/h)',   type: 'text', width: '8ch' },
  { key: 'pct',   label: 'PCT (ng/mL)',  type: 'text', width: '8ch' },
  { key: 'temp',  label: 'T° (°C)',      type: 'text', width: '7ch' },
];
const EMPTY_PARAM_ROW = { fecha: '', pcr: '', blancos: '', crea: '', vhs: '', pct: '', temp: '' };

const RECOMENDACIONES = [
  'Continuar mismo esquema',
  'Desescalar según antibiograma',
  'Escalar cobertura antibiótica',
  'Cambiar de antibiótico',
  'Suspender (no requiere ATB)',
  'Ajustar dosis por función renal / peso',
  'Pasar a vía oral (terapia secuencial)',
  'Completar duración programada',
  'Solicitar nuevos cultivos',
  'Solicitar estudio de foco / complicación',
  'Solicitar interconsulta Infectología',
  'Otra (especificar abajo)',
];

// ── Utilidades ─────────────────────────────────────────────
function formatRut(raw) {
  if (!raw) return '';
  const clean = String(raw).replace(/[^0-9kK]/g, '').toUpperCase();
  if (!clean) return '';
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!body) return dv;
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}

function todayIso() { return new Date().toISOString().slice(0, 10); }
function currentTime() { return new Date().toTimeString().slice(0, 5); }
function formatDateLocal(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

function parseClinicalNumber(value) {
  if (value === '' || value == null) return null;
  const normalized = String(value).replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (!normalized) return null;
  const n = Number(normalized[0]);
  return Number.isFinite(n) ? n : null;
}

function summarizeTrend(rows, key) {
  const values = (rows || [])
    .map(row => ({ fecha: row.fecha, value: parseClinicalNumber(row[key]) }))
    .filter(item => item.value != null)
    .sort((a, b) => {
      const da = parseAnyDate(a.fecha);
      const db = parseAnyDate(b.fecha);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });
  if (values.length < 2) return { estado: 'insuficiente', detalle: 'menos de 2 mediciones' };
  const first = values[0];
  const last = values[values.length - 1];
  const diff = Number((last.value - first.value).toFixed(2));
  const pct = first.value !== 0 ? Number(((diff / first.value) * 100).toFixed(1)) : null;
  const estado = diff > 0 ? 'al alza' : diff < 0 ? 'a la baja' : 'estable';
  return {
    estado,
    primero: first,
    ultimo: last,
    cambio_absoluto: diff,
    cambio_porcentual: pct,
  };
}

function summarizeInflammatoryTrends(rows) {
  const keys = ['pcr', 'blancos', 'pct', 'crea', 'vhs', 'temp'];
  return keys.reduce((acc, key) => {
    acc[key] = summarizeTrend(rows, key);
    return acc;
  }, {});
}

function availableInflammatoryParams(rows) {
  return PARAM_COLS
    .filter(col => col.key !== 'fecha')
    .map(col => ({
      key: col.key,
      label: col.label,
      mediciones: (rows || [])
        .filter(row => parseClinicalNumber(row[col.key]) != null)
        .map(row => ({ fecha: row.fecha, valor: row[col.key] }))
        .sort((a, b) => {
          const da = parseAnyDate(a.fecha);
          const db = parseAnyDate(b.fecha);
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          return da - db;
        }),
    }))
    .filter(item => item.mediciones.length > 0);
}
// Convierte una fecha (ISO YYYY-MM-DD, o DD/MM/YYYY, o DD-MM-YYYY) a un objeto
// Date al mediodía local. Devuelve null si no se puede parsear.
function parseAnyDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  let y, m, d;
  let mm = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);        // YYYY-MM-DD
  if (mm) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
  else {
    mm = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); // DD/MM/YYYY o DD-MM-YYYY
    if (mm) { d = +mm[1]; m = +mm[2]; y = +mm[3]; }
    else return null;
  }
  const date = new Date(y, m - 1, d, 12, 0, 0);
  return isNaN(date.getTime()) ? null : date;
}

// Día de tratamiento calculado desde la fecha de inicio hasta la fecha de visita.
// Si fechaVisita viene vacía, se usa la fecha de hoy como fallback para que el
// usuario vea inmediatamente el día calculado al ingresar la fecha de inicio.
function calcDiaTto(inicio, fechaVisita) {
  const a = parseAnyDate(inicio);
  if (!a) return null;
  const b = parseAnyDate(fechaVisita) || parseAnyDate(todayIso());
  if (!b) return null;
  const diff = Math.floor((b - a) / 86400000);
  return diff >= 0 ? diff + 1 : null; // día 1 = mismo día de inicio
}

function hasTermino(a) {
  return Boolean(a.termino_manual && a.termino);
}

function calcDiaTtoAtb(a, fechaVisita) {
  return calcDiaTto(a.inicio, hasTermino(a) ? a.termino : fechaVisita);
}

function formatTtoLabel(a, fechaVisita) {
  const dia = calcDiaTtoAtb(a, fechaVisita);
  if (dia == null) return '—';
  return hasTermino(a) ? `${dia} días` : `Día ${dia}`;
}

// Detalle de tratamiento considerando la hora de inicio: cuántas horas
// transcurrieron desde la primera dosis hasta el momento de la visita y cuántos
// días COMPLETOS (ciclos de 24 h) lleva. Permite saber si el día actual de
// tratamiento está completo o es parcial al momento de la visita.
function calcTtoDetail(inicio, hora, fechaVisita, horaVisita) {
  const start = parseAnyDate(inicio);
  if (!start) return null;
  if (hora && /^\d{1,2}:\d{2}$/.test(hora)) {
    const [hh, mm] = hora.split(':').map(Number);
    start.setHours(hh, mm, 0, 0);
  } else {
    start.setHours(0, 0, 0, 0);
  }
  // Momento de referencia: la fecha de la visita a la hora de la visita
  // (o la hora actual si no se indicó).
  const ref = parseAnyDate(fechaVisita) || parseAnyDate(todayIso());
  if (!ref) return null;
  if (horaVisita && /^\d{1,2}:\d{2}$/.test(horaVisita)) {
    const [vh, vm] = horaVisita.split(':').map(Number);
    ref.setHours(vh, vm, 0, 0);
  } else {
    const now = new Date();
    ref.setHours(now.getHours(), now.getMinutes(), 0, 0);
  }
  const ms = ref - start;
  const diaCalendario = calcDiaTto(inicio, fechaVisita);
  if (ms < 0) return { dia: diaCalendario, horas: 0, diasCompletos: 0, completo: false, conHora: !!hora };
  const horas = ms / 3600000;
  const diasCompletos = Math.floor(horas / 24);
  // El día de tratamiento actual está "completo" si ya transcurrieron al menos
  // (dia)*24 h desde la primera dosis.
  const completo = diaCalendario != null && horas >= diaCalendario * 24;
  return { dia: diaCalendario, horas: Math.round(horas), diasCompletos, completo, conHora: !!hora };
}

function getPresentaciones(nombre) {
  return PRESENTACIONES_ATB[nombre] || [];
}

function getPresentation(nombre, label, antibiotic = null) {
  const local = getPresentaciones(nombre).find(p => p.label === label);
  if (local) return local;
  if (antibiotic?.presentacion === label && antibiotic?.presentacion_cantidad && antibiotic?.presentacion_unidad) {
    return {
      label,
      cantidad: Number(antibiotic.presentacion_cantidad),
      unidad: antibiotic.presentacion_unidad,
      envase: antibiotic.presentacion_envase || 'unidad',
    };
  }
  return null;
}

function formatNumber(n) {
  if (n === '' || n == null || Number.isNaN(Number(n))) return '';
  return Number(n).toLocaleString('es-CL', { maximumFractionDigits: 2 });
}

function pluralizeEnvase(envase, count) {
  if (!envase) return 'unidad';
  if (Number(count) === 1) return envase;
  if (envase.endsWith('s')) return envase;
  if (envase.endsWith('z')) return `${envase.slice(0, -1)}ces`;
  return `${envase}s`;
}

function presentationDoseText(presentacion) {
  if (!presentacion) return '';
  return presentacion.label.replace(/^(Ampolla|Frasco ampolla|Frasco|Bolsa|Comprimido|Cápsula)\s+/i, '');
}

function convertDoseUnit(value, fromUnit, toUnit) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (fromUnit === toUnit) return numeric;
  const massToMg = { mcg: 0.001, mg: 1, g: 1000 };
  if (massToMg[fromUnit] && massToMg[toUnit]) {
    return (numeric * massToMg[fromUnit]) / massToMg[toUnit];
  }
  return null;
}

function calcUnidadesPorDosis(a) {
  const presentacion = getPresentation(a.nombre, a.presentacion, a);
  const finalDose = Number(a.dosis_final_cantidad);
  const finalUnit = a.dosis_final_unidad || a.dosis_unidad;
  if (presentacion && finalDose > 0) {
    const doseInPresentationUnit = convertDoseUnit(finalDose, finalUnit, presentacion.unidad);
    if (doseInPresentationUnit != null && presentacion.cantidad > 0) {
      const units = doseInPresentationUnit / presentacion.cantidad;
      return Number.isFinite(units) ? Number(units.toFixed(2)) : '';
    }
  }
  if (a.dosis_modo === 'ampolla') {
    const unidades = Number(a.unidades_por_dosis || 1);
    return Number.isFinite(unidades) && unidades > 0 ? unidades : '';
  }
  const dosis = getDosisTotal(a);
  if (!presentacion || !dosis || a.dosis_unidad !== presentacion.unidad) return '';
  const unidades = dosis / presentacion.cantidad;
  return Number.isFinite(unidades) ? Number(unidades.toFixed(2)) : '';
}

function getDosisTotal(a) {
  const finalDose = Number(a.dosis_final_cantidad);
  if (finalDose > 0) return finalDose;
  if (a.dosis_modo === 'ampolla') {
    const presentacion = getPresentation(a.nombre, a.presentacion, a);
    const unidades = Number(a.unidades_por_dosis || 1);
    if (!presentacion || !unidades) return '';
    return Number((presentacion.cantidad * unidades).toFixed(2));
  }
  if (a.dosis_modo === 'kg') {
    const dosisKg = Number(a.dosis_por_kg);
    const peso = Number(a.peso_kg);
    if (dosisKg > 0 && peso > 0) {
      return Number((dosisKg * peso).toFixed(2));
    }
    return '';
  }
  const dosisManual = Number(a.dosis_cantidad);
  if (dosisManual > 0) return dosisManual;
  const dosisKg = Number(a.dosis_por_kg);
  const peso = Number(a.peso_kg);
  if (dosisKg > 0 && peso > 0) {
    return Number((dosisKg * peso).toFixed(2));
  }
  return '';
}

function getDosisPorKgCalculada(a) {
  const dosisKg = Number(a.dosis_por_kg);
  if (dosisKg > 0) return dosisKg;
  const dosisTotal = Number(a.dosis_final_cantidad || a.dosis_cantidad);
  const peso = Number(a.peso_kg);
  if (dosisTotal > 0 && peso > 0) return Number((dosisTotal / peso).toFixed(2));
  return '';
}

function getWeightDoseApproximation(a) {
  const dosePerKg = Number(a.dosis_por_kg);
  const weight = Number(a.peso_kg);
  if (!(dosePerKg > 0) || !(weight > 0)) return null;
  const theoretical = dosePerKg * weight;
  const presentation = getPresentation(a.nombre, a.presentacion, a);
  if (presentation?.cantidad > 0 && presentation.unidad === a.dosis_unidad) {
    const units = Math.max(1, Math.round(theoretical / presentation.cantidad));
    return {
      theoretical: Number(theoretical.toFixed(2)),
      rounded: Number((units * presentation.cantidad).toFixed(2)),
      units,
      unit: a.dosis_unidad,
      method: `aproximado a ${formatNumber(units)} ${pluralizeEnvase(presentation.envase, units)}`,
    };
  }
  const increment = a.dosis_unidad === 'g' ? 0.1 : theoretical < 500 ? 10 : theoretical < 2000 ? 50 : 100;
  return {
    theoretical: Number(theoretical.toFixed(2)),
    rounded: Number((Math.round(theoretical / increment) * increment).toFixed(2)),
    units: null,
    unit: a.dosis_unidad,
    method: `aproximado al múltiplo de ${formatNumber(increment)} ${a.dosis_unidad}`,
  };
}

function buildDosisConcreta(a) {
  if (a.dosis) return a.dosis;
  const presentacion = getPresentation(a.nombre, a.presentacion, a);
  const unidades = a.unidades_por_dosis || calcUnidadesPorDosis(a);
  if (a.dosis_modo === 'ampolla' && presentacion && unidades) {
    const intervalo = a.intervalo_horas ? ` c/${a.intervalo_horas}h` : '';
    const via = a.via ? ` ${a.via}` : '';
    const envases = `${formatNumber(unidades)} ${pluralizeEnvase(presentacion.envase, unidades)}`;
    const dosisPresentacion = presentationDoseText(presentacion);
    const dosis = Number(unidades) === 1 ? `${dosisPresentacion} (${envases})` : `${envases} de ${dosisPresentacion}`;
    return `${dosis}${intervalo}${via}`.trim();
  }
  const dosisTotal = getDosisTotal(a);
  const dosisKg = getDosisPorKgCalculada(a);
  const doseUnit = a.dosis_final_unidad || a.dosis_unidad || '';
  const dosis = dosisTotal
    ? `${formatNumber(dosisTotal)} ${doseUnit}`.trim()
    : (dosisKg ? `${formatNumber(dosisKg)} ${a.dosis_unidad || 'mg'}/kg` : '');
  const detalleDosisKg = dosisTotal && dosisKg ? `${formatNumber(dosisKg)} ${a.dosis_unidad || 'mg'}/kg` : '';
  const detalleEnvase = presentacion && unidades
    ? `${formatNumber(unidades)} ${pluralizeEnvase(presentacion.envase, unidades)} de ${presentationDoseText(presentacion)}`
    : '';
  const detalles = [detalleDosisKg, detalleEnvase].filter(Boolean);
  const detalle = detalles.length ? ` (${detalles.join('; ')})` : '';
  const intervalo = a.intervalo_horas ? ` c/${a.intervalo_horas}h` : '';
  const via = a.via ? ` ${a.via}` : '';
  return `${dosis}${detalle}${intervalo}${via}`.trim();
}

function buildFinalAntibioticInstruction(a) {
  if (!a?.nombre) return '';
  const presentation = getPresentation(a.nombre, a.presentacion, a);
  const dose = getDosisTotal(a);
  const doseUnit = a.dosis_final_unidad || a.dosis_unidad || '';
  const units = calcUnidadesPorDosis({ ...a, dosis_unidad: doseUnit });
  const presentationText = a.presentacion ? ` (${a.presentacion})` : '';
  const doseText = dose ? `${formatNumber(dose)} ${doseUnit}`.trim() : 'dosis pendiente';
  const unitText = presentation && units
    ? ` (${formatNumber(units)} ${pluralizeEnvase(presentation.envase, units)})`
    : '';
  const frequency = a.intervalo_horas ? ` cada ${a.intervalo_horas} horas` : ' frecuencia pendiente';
  const route = a.via ? ` ${a.via}` : '';
  return `${a.nombre}${presentationText} · ${doseText}${unitText}${frequency}${route}`.trim();
}

function buildAntibiograma(c) {
  if (c.antibiograma) return c.antibiograma;
  const partes = [];
  if (c.resistente?.length) partes.push(`Resistente a ${c.resistente.join(', ')}`);
  if (c.sensible?.length) partes.push(`Sensible a ${c.sensible.join(', ')}`);
  if (c.intermedio?.length) partes.push(`Intermedio a ${c.intermedio.join(', ')}`);
  if (c.antibiograma_nota) partes.push(c.antibiograma_nota);
  return partes.join('. ');
}

const EMPTY_ATB    = { nombre: '', via: 'EV', presentacion: '', presentacion_cantidad: '', presentacion_unidad: '', presentacion_envase: '', dosis_modo: 'total', dosis_por_kg: '', dosis_cantidad: '', dosis_final_cantidad: '', dosis_final_unidad: '', dosis_unidad: 'mg', unidades_por_dosis: '', intervalo_horas: '', dosis: '', inicio: '', termino: '', termino_manual: false };
const EMPTY_CULT   = { tipo_muestra: '', fecha: '', patogeno: '', sensibilidad: 'Pendiente', resistente: [], sensible: [], intermedio: [], antibiograma_nota: '', antibiograma: '' };

const INVASIVE_DEVICES = [
  'Sonda Foley (CUP)',
  'VVP (vía venosa periférica)',
  'CVC (catéter venoso central)',
  'PICC',
  'SNG (sonda nasogástrica)',
  'Ventilación mecánica (TOT)',
  'Traqueostomía',
  'Drenaje',
  'Otro',
];

const EMPTY = {
  fecha: '',
  hora: '',
  servicio: '',
  cama: '',
  paciente: '',
  rut: '',
  edad: '',
  sexo: '',
  diabetes_evaluado: false,
  diabetes: null,
  diabetes_evaluado_en: '',
  creatinina: '',
  fecha_creatinina: '',
  creatininas: [],
  vfg_estimada: '',
  peso_kg: '',
  n_ficha: '',
  fecha_ingreso: '',
  usa_invasivo: 'no',
  invasivos: [{ cual: '', desde: '' }],
  alergias: '',
  comorbilidades: '',
  funcion_renal: '',
  resultados_examenes_parser: [],
  parametros_inflamatorios: [{ ...EMPTY_PARAM_ROW }], // ahora es una planilla curva
  diagnostico_actual: '',
  diagnosticos_actuales: [''],
  diagnostico_microbiologico: '',
  diag_micro_auto: true, // si true, el campo se autocompleta desde estudios_micro
  estudios_micro: [{ ...EMPTY_CULT }],
  estudios_imagen: '',
  antibioticos: [{ ...EMPTY_ATB }],
  resumen_caso: '',
  evolucion: '',
  publicar_estado_clinico_general: false,
  recomendaciones: [],
  recomendaciones_otra: '',
  sugerencias_ia: '',
  plan_duracion: '',
  proa_discharge_requested: false,
  fecha_egreso: '',
  proxima_revision: '',
  medico_firma: '',
};

// Días de hospitalización = días entre la fecha de ingreso y la fecha de la visita
// (o hoy si no hay fecha de visita). Devuelve '' si la fecha de ingreso no es válida.
function diasHospitalizacion(fechaIngresoIso, fechaVisitaIso) {
  if (!fechaIngresoIso) return '';
  const from = new Date(`${fechaIngresoIso}T00:00:00`);
  const to = fechaVisitaIso ? new Date(`${fechaVisitaIso}T00:00:00`) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return '';
  const days = Math.floor((to - from) / 86400000);
  return days >= 0 ? String(days) : '';
}

// Construye el texto del diagnóstico microbiológico a partir de los estudios
// (ej: "Urocultivo + S. aureus (MSSA); Hemocultivo + E. coli BLEE").
function buildDiagMicro(estudios) {
  const partes = (estudios || [])
    .filter(c => c.patogeno && !/pendiente|sin desarrollo|sin crecimiento|no desarrollo|negativ|no detectado|est[ée]ril/i.test(c.patogeno))
    .map(c => {
      const muestra = c.tipo_muestra || 'Cultivo';
      return `${muestra} + ${c.patogeno}`;
    });
  return partes.join('; ');
}

function buildProaContext(f) {
  return {
    identificacion: {
      fecha: f.fecha,
      hora: f.hora,
      servicio: f.servicio,
      cama: f.cama,
      edad: f.edad,
      peso_kg: f.peso_kg,
      alergias: f.alergias,
      comorbilidades: f.comorbilidades,
      funcion_renal: f.funcion_renal,
    },
    diagnosticos: {
      actual: f.diagnostico_actual,
      microbiologico: f.diag_micro_auto ? buildDiagMicro(f.estudios_micro) : f.diagnostico_microbiologico,
    },
    estudios_micro: f.estudios_micro.map(c => ({
      muestra: c.tipo_muestra,
      fecha: c.fecha,
      patogeno: c.patogeno,
      sensibilidad: c.sensibilidad,
      antibiograma: buildAntibiograma(c),
    })),
    antibioticos: f.antibioticos.map(a => ({
      nombre: a.nombre,
      dosis: buildDosisConcreta({ ...a, peso_kg: f.peso_kg }),
      inicio: a.inicio,
      termino: hasTermino(a) ? a.termino : '',
      dia_o_duracion: formatTtoLabel(a, f.fecha),
    })),
    parametros_cronologicos: (f.parametros_inflamatorios || [])
      .filter(row => Object.values(row).some(Boolean))
      .sort((a, b) => {
        const da = parseAnyDate(a.fecha);
        const db = parseAnyDate(b.fecha);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da - db;
      }),
    parametros_disponibles: availableInflammatoryParams(f.parametros_inflamatorios),
    tendencia_parametros: summarizeInflammatoryTrends(f.parametros_inflamatorios),
    imagenes: f.estudios_imagen,
    resumen: f.resumen_caso,
    evolucion: f.evolucion,
    recomendaciones_actuales: f.recomendaciones,
    plan_duracion: f.plan_duracion,
  };
}

function HospitalLogo({ height = 46 }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src="/logo-hospital.png"
      alt="Hospital Comunitario de Salud Familiar de Bulnes"
      style={{ height: `${height}px`, width: 'auto', objectFit: 'contain', display: 'block' }}
      onError={() => setFailed(true)}
    />
  );
}

function printProaDocument() {
  const documentElement = document.querySelector('.proa-evolution-document');
  if (!documentElement) return;
  const popup = window.open('', '_blank', 'width=900,height=1100');
  if (!popup) return;
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map(node => node.outerHTML).join('');
  popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Evolución clínica PROA</title>${styles}<style>*{box-sizing:border-box}html,body{margin:0!important;min-height:100%;background:#e2e8f0!important}.proa-preview-toolbar{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 18px;background:#fff;border-bottom:1px solid #cbd5e1;font-family:Arial,sans-serif}.proa-preview-toolbar p{margin:0;color:#475569;font-size:13px}.proa-preview-toolbar button{border:0;border-radius:8px;background:#0f766e;color:#fff;padding:10px 16px;font-weight:800;cursor:pointer}.proa-evolution-document{width:190mm!important;max-width:calc(100vw - 32px)!important;min-height:0!important;margin:18px auto!important;background:#fff!important;box-shadow:0 6px 24px #33415555!important}.proa-document-table{table-layout:fixed!important}.proa-document-table th,.proa-document-table td{overflow-wrap:anywhere!important}.proa-chart,.proa-chart>div,.recharts-responsive-container{width:100%!important;max-width:100%!important}.recharts-wrapper,.recharts-surface{max-width:100%!important}@page{size:A4 portrait;margin:10mm}@media print{html,body{width:auto!important;background:#fff!important}.proa-preview-toolbar{display:none!important}.proa-evolution-document{width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;box-shadow:none!important}.proa-document-block,.proa-chart{break-inside:avoid;page-break-inside:avoid}}</style></head><body><div class="proa-preview-toolbar"><p>Vista previa de la evolución PROA. Revise el contenido antes de imprimir.</p><button type="button" onclick="window.print()">Imprimir / guardar PDF</button></div>${documentElement.outerHTML}</body></html>`);
  popup.document.close();
}

function VisitaPROA() {
  const navigate = useNavigate();
  const exitPage = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(createPageUrl('GestionPROA'));
  };
  const [f, setF] = useState(() => {
    const pending = takePendingProaForm();
    const merged = {
      ...EMPTY,
      ...(pending || {}),
      __diabetesPreviouslyRecorded: pending?.diabetes_evaluado === true,
      proa_entry_type: 'evolucion',
      publicar_estado_clinico_general: pending?.__proaEditLatest ? Boolean(pending?.publicar_estado_clinico_general) : false,
      fecha: todayIso(),
      hora: currentTime(),
      n_ficha: '',
    };
    return {
      ...merged,
      parametros_inflamatorios: merged.parametros_inflamatorios?.length
        ? merged.parametros_inflamatorios
        : [{ ...EMPTY_PARAM_ROW }],
      estudios_micro: merged.estudios_micro?.length
        ? merged.estudios_micro
        : [{ ...EMPTY_CULT }],
      antibioticos: merged.antibioticos?.length
        ? merged.antibioticos
        : [{ ...EMPTY_ATB }],
      diagnosticos_actuales: merged.diagnosticos_actuales?.length
        ? merged.diagnosticos_actuales
        : [merged.diagnostico_actual || ''],
      fecha_creatinina: merged.fecha_creatinina || merged.fecha || todayIso(),
    };
  });
  const initialSnapshotRef = useRef(JSON.stringify(f));
  const [showExitPrompt, setShowExitPrompt] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [doseEditorIdx, setDoseEditorIdx] = useState(null);
  const [antibiogramEditorIdx, setAntibiogramEditorIdx] = useState(null);
  const [antibiogramSearch, setAntibiogramSearch] = useState('');
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [registryMessage, setRegistryMessage] = useState('');
  const [parserText, setParserText] = useState('');
  const [parserDate, setParserDate] = useState(todayIso());
  const [parserMessage, setParserMessage] = useState('');
  const [activeArsenal, setActiveArsenal] = useState([]);
  const [arsenalStatus, setArsenalStatus] = useState('loading');
  const hasUnsavedChanges = JSON.stringify(f) !== initialSnapshotRef.current;
  const goBack = () => {
    if (hasUnsavedChanges) setShowExitPrompt(true);
    else exitPage();
  };
  useEffect(() => {
    const warnBeforeUnload = (event) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasUnsavedChanges]);
  useEffect(() => {
    let active = true;
    supabase
      .from('medications')
      .select('id,name,active_ingredient,presentation,dose_value,dose_unit,category,is_active')
      .eq('is_active', true)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('No fue posible cargar el arsenal vigente en Evolución PROA:', error);
          setArsenalStatus('fallback');
          return;
        }
        setActiveArsenal((data || []).filter((medication) => {
          const category = normalizeMedicationName(medication.category);
          const names = `${normalizeMedicationName(medication.name)} ${normalizeMedicationName(medication.active_ingredient)}`;
          return /antibi|antimicrob|antifung|antiviral/.test(category)
            || ANTIBIOTICOS.some((item) => names.includes(normalizeMedicationName(item)));
        }));
        setArsenalStatus('loaded');
      });
    return () => { active = false; };
  }, []);
  const arsenalPresentations = useMemo(() => {
    const grouped = new Map();
    activeArsenal.forEach((medication) => {
      [medication.name, medication.active_ingredient]
        .map(normalizeMedicationName)
        .filter(Boolean)
        .forEach((name) => {
          if (!grouped.has(name)) grouped.set(name, []);
          const option = arsenalPresentationOption(medication);
          if (option.label && !grouped.get(name).some((item) => item.label === option.label)) {
            grouped.get(name).push(option);
          }
        });
    });
    return grouped;
  }, [activeArsenal]);
  const getEvolutionPresentations = (name) => {
    const current = arsenalPresentations.get(normalizeMedicationName(name)) || [];
    if (current.length) return current;
    return getPresentaciones(name).map((item) => ({ ...item, source: 'respaldo' }));
  };
  const u = (k, v) => setF(prev => {
    const next = { ...prev, [k]: v };
    if (['edad', 'sexo', 'creatinina'].includes(k)) {
      next.vfg_estimada = calculateEgfrCkdEpi2021(next) ?? '';
      next.funcion_renal = buildRenalFunctionText(next);
    }
    return next;
  });
  const diasHosp = diasHospitalizacion(f.fecha_ingreso, f.fecha);
  const renalAntimicrobialAlerts = getRenalAntimicrobialAlerts(f.antibioticos, f.vfg_estimada);
  const addInvasivo = () => setF(prev => ({ ...prev, invasivos: [...(prev.invasivos || []), { cual: '', desde: '' }] }));
  const updateInvasivo = (i, key, val) => setF(prev => ({ ...prev, invasivos: (prev.invasivos || []).map((d, idx) => idx === i ? { ...d, [key]: val } : d) }));
  const removeInvasivo = (i) => setF(prev => ({ ...prev, invasivos: (prev.invasivos || []).length <= 1 ? prev.invasivos : prev.invasivos.filter((_, idx) => idx !== i) }));
  const updateDiagnosis = (index, value) => setF((prev) => ({ ...prev, diagnosticos_actuales: prev.diagnosticos_actuales.map((item, itemIndex) => itemIndex === index ? value : item) }));
  const addDiagnosis = () => setF((prev) => ({ ...prev, diagnosticos_actuales: [...prev.diagnosticos_actuales, ''] }));
  const removeDiagnosis = (index) => setF((prev) => ({ ...prev, diagnosticos_actuales: prev.diagnosticos_actuales.length === 1 ? [''] : prev.diagnosticos_actuales.filter((_, itemIndex) => itemIndex !== index) }));
  const clear = () => {
    setRegistryMessage('');
    setF({ ...EMPTY, fecha: todayIso(), hora: currentTime() });
  };

  const [saving, setSaving] = useState(false);
  const handleSaveRegistry = async (dischargePatient = false) => {
    if (!f.cama?.trim()) {
      setRegistryMessage('Selecciona una cama antes de guardar el registro PROA.');
      return false;
    }
    if (f.diabetes_evaluado !== true) {
      setRegistryMessage('Antes de guardar, confirma obligatoriamente si el paciente es diabético. Esta pregunta se realiza una sola vez.');
      return false;
    }
    const dischargeDate = dischargePatient ? todayIso() : '';
    if (dischargePatient && f.fecha_ingreso && dischargeDate < f.fecha_ingreso) {
      setRegistryMessage('La fecha de egreso no puede ser anterior a la fecha de ingreso.');
      return false;
    }
    const clinicalStateTimestamp = (() => {
      const parsed = new Date(`${f.fecha || todayIso()}T${f.hora || currentTime()}`);
      return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
    })();
    const publishedClinicalState = String(f.evolucion || '').trim();
    const formToSave = {
      ...f,
      diabetes_evaluado_en: f.diabetes_evaluado_en || new Date().toISOString(),
      diagnostico_actual: (f.diagnosticos_actuales || []).filter(Boolean).join('; ') || f.diagnostico_actual,
      creatininas: f.creatinina
        ? [...(f.creatininas || []).filter((item) => item.fecha !== f.fecha_creatinina), { fecha: f.fecha_creatinina || f.fecha || todayIso(), valor: f.creatinina }]
        : (f.creatininas || []),
      proa_discharge_requested: dischargePatient,
      fecha_egreso: dischargeDate,
      ...(f.publicar_estado_clinico_general && publishedClinicalState ? {
        vista_ultima_evolucion: publishedClinicalState,
        vista_ultima_evolucion_actualizada_en: clinicalStateTimestamp,
      } : {}),
    };
    setSaving(true);
    setRegistryMessage('Guardando…');
    try {
      const editingExistingEvolution = Boolean(formToSave.__proaEditLatest);
      const record = await saveProaRecord(formToSave, {
        replaceExisting: formToSave.__proaRegistryMode === 'new_patient',
        editLatestEvolution: editingExistingEvolution,
      });
      if (dischargePatient) {
        await archiveProaRecord(record, dischargeDate);
        initialSnapshotRef.current = JSON.stringify(formToSave);
        navigate(createPageUrl('GestionPROA'), { replace: true });
        return true;
      }
      const savedForm = { ...formToSave, __proaRegistryMode: '', __proaEditLatest: false, __diabetesPreviouslyRecorded: true };
      initialSnapshotRef.current = JSON.stringify(savedForm);
      setF(savedForm);
      setRegistryMessage(editingExistingEvolution
          ? `✅ Evolución existente de ${record.code} editada y sincronizada. No se creó una evolución nueva.`
          : `✅ Registro ${record.code} guardado en cama ${record.bedCode} y sincronizado.${formToSave.publicar_estado_clinico_general && publishedClinicalState ? ' El estado clínico actual y la tabla de visita fueron actualizados.' : ''} En PROA se conservaron nombre, RUT y edad; la ficha clínica no fue almacenada.`);
      return true;
    } catch (e) {
      setRegistryMessage(`❌ No se pudo guardar en el servidor (${e?.message || e}). Revisa tu conexión e inténtalo de nuevo.`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const toggleRec = (rec) => {
    setF(prev => ({
      ...prev,
      recomendaciones: prev.recomendaciones.includes(rec)
        ? prev.recomendaciones.filter(r => r !== rec)
        : [...prev.recomendaciones, rec],
    }));
  };

  const suggestModifications = async () => {
    setAiSuggesting(true);
    try {
      const prompt = `Eres apoyo clínico para un equipo PROA hospitalario. Revisa los datos estructurados de una visita PROA y sugiere modificaciones prudentes del manejo antimicrobiano.

Entrega 3 a 6 sugerencias concretas en español, en formato de viñetas breves.
Debes analizar explícitamente la tendencia de los exámenes/PI disponibles. Los parámetros vienen en orden cronológico por fecha en "parametros_cronologicos" y resumidos en "tendencia_parametros"; NO interpretes la tendencia por el orden visual de ingreso de filas.
Valora solo los exámenes que fueron entregados. No preguntes por creatinina, VHS, PCT u otros parámetros ausentes solo porque no están medidos. Si un dato no está, simplemente razona con lo disponible.
Si hay parámetros inflamatorios al alza o mala evolución tras 48-72 h de antibiótico, plantea falla terapéutica posible, foco no controlado, resistencia, complicación o diagnóstico alternativo.
Enfócate en analizar la antibioterapia actual: espectro, días de tratamiento, respuesta clínica/laboratorio, microbiología/antibiograma y necesidad de continuar, cambiar, escalar, desescalar, suspender o completar duración.
Prioriza: desescalamiento según cultivos, escalamiento/cambio de antibiótico si corresponde, ajuste por función renal/peso cuando el dato esté disponible o sea crítico para la alternativa, duración total, paso a vía oral, suspensión si no hay indicación, nuevos cultivos, imágenes/control de foco.
Cuando propongas alternativas farmacológicas, SIEMPRE incluye dosis, vía y frecuencia. Ejemplo: "Meropenem 1 g EV c/8h" o "Piperacilina/tazobactam 4 g/0,5 g EV c/6-8h". Si requiere ajuste renal, indica "ajustar según ClCr/función renal" y solicita confirmar creatinina/ClCr.
Estas reglas aplican de forma general a cualquier foco infeccioso, patógeno o esquema antibiótico registrado: neumonía, ITU, bacteriemia, piel/partes blandas, intraabdominal, SNC, osteoarticular, foco no precisado, hongos/virus si corresponde.
Si hay mala respuesta con el esquema actual, sugiere alternativas según foco, gravedad, antibiograma, riesgo BLEE/KPC/MDR/Pseudomonas/MRSA/Enterococcus/VRE u otros mecanismos relevantes; incluye estudio de foco/complicación y nuevo control microbiológico cuando corresponda.
No inventes datos ausentes. Evita convertir cada dato ausente en una pregunta; solo pide confirmar información crítica que cambie directamente la decisión antibiótica o dosis.
No indiques que reemplaza el criterio clínico.

DATOS:
${JSON.stringify(buildProaContext(f), null, 2)}`;
      const text = await invokeLLM({ prompt });
      u('sugerencias_ia', String(text || '').trim());
    } catch (err) {
      u('sugerencias_ia', `No se pudo generar sugerencia IA: ${err.message || 'error desconocido'}`);
    } finally {
      setAiSuggesting(false);
    }
  };

  // ATB
  const updateAtb = (idx, key, value) => {
    setF(prev => ({
      ...prev,
      antibioticos: prev.antibioticos.map((a, i) => {
        if (i !== idx) return a;
        const next = { ...a, [key]: value };
        if (key === 'nombre') {
          const canonicalName = ANTIBIOTICOS.find((name) => normalizeMedicationName(name) === normalizeMedicationName(value)) || value;
          next.nombre = canonicalName;
          const defaults = DEFAULT_DOSIS_ATB[canonicalName];
          const presentaciones = getEvolutionPresentations(canonicalName);
          if (defaults) {
            const defaultAvailable = presentaciones.find((item) => item.label === defaults.presentacion);
            const selectedPresentation = defaultAvailable || presentaciones[0] || null;
            next.presentacion = selectedPresentation?.label || defaults.presentacion || '';
            next.presentacion_cantidad = selectedPresentation?.cantidad || '';
            next.presentacion_unidad = selectedPresentation?.unidad || '';
            next.presentacion_envase = selectedPresentation?.envase || '';
            next.dosis_por_kg = defaults.dosis_por_kg || '';
            next.dosis_cantidad = defaults.dosis_cantidad || '';
            next.dosis_final_cantidad = defaults.dosis_por_kg ? '' : (defaults.dosis_cantidad || '');
            next.dosis_final_unidad = defaults.dosis_unidad || selectedPresentation?.unidad || 'mg';
            next.dosis_modo = defaults.dosis_modo || (defaults.dosis_por_kg ? 'kg' : 'total');
            next.dosis_unidad = defaults.dosis_unidad || selectedPresentation?.unidad || 'mg';
            next.intervalo_horas = defaults.intervalo_horas || '';
            next.via = defaults.via || a.via || 'EV';
            next.unidades_por_dosis = defaults.unidades_por_dosis || '';
            next.dosis = '';
          } else if (presentaciones.length && !a.presentacion) {
            next.presentacion = presentaciones[0].label;
            next.dosis_unidad = presentaciones[0].unidad;
            next.presentacion_cantidad = presentaciones[0].cantidad || '';
            next.presentacion_unidad = presentaciones[0].unidad || '';
            next.presentacion_envase = presentaciones[0].envase || '';
          }
          if (a.dosis && !a.dosis_cantidad) next.dosis = '';
        }
        if (key === 'presentacion') {
          const presentacion = getEvolutionPresentations(a.nombre).find((item) => item.label === value);
          if (presentacion) {
            next.dosis_unidad = presentacion.unidad;
            next.presentacion_cantidad = presentacion.cantidad || '';
            next.presentacion_unidad = presentacion.unidad || '';
            next.presentacion_envase = presentacion.envase || '';
          }
        }
        if (['presentacion', 'dosis_cantidad', 'dosis_unidad', 'peso_kg', 'dosis_por_kg'].includes(key)) {
          next.unidades_por_dosis = '';
        }
        if (key === 'termino') {
          next.termino_manual = Boolean(value);
        }
        return next;
      }),
    }));
  };
  const addAtb = () => setF(prev => ({ ...prev, antibioticos: [...prev.antibioticos, { ...EMPTY_ATB }] }));
  const removeAtb = (idx) => setF(prev => ({
    ...prev,
    antibioticos: prev.antibioticos.length > 1 ? prev.antibioticos.filter((_, i) => i !== idx) : prev.antibioticos,
  }));

  // Parámetros inflamatorios (planilla curva)
  const updateParamRow = (idx, key, value) => {
    setF(prev => ({
      ...prev,
      parametros_inflamatorios: prev.parametros_inflamatorios.map((r, i) => i === idx ? { ...r, [key]: value } : r),
    }));
  };
  const addParamRow = () => setF(prev => ({ ...prev, parametros_inflamatorios: [...prev.parametros_inflamatorios, { ...EMPTY_PARAM_ROW }] }));
  const removeParamRow = (idx) => setF(prev => ({
    ...prev,
    parametros_inflamatorios: prev.parametros_inflamatorios.length > 1 ? prev.parametros_inflamatorios.filter((_, i) => i !== idx) : prev.parametros_inflamatorios,
  }));

  const parseQuickLabs = () => {
    const results = parseLabReportText(parserText, parserDate);
    if (!results.length) {
      setParserMessage('No se reconocieron resultados. Revisa el texto o la fecha.');
      return;
    }
    const proaKeys = { pcr: 'pcr', leu: 'blancos', leucocitos: 'blancos', gb: 'blancos', crea: 'crea', creatinina: 'crea', vhs: 'vhs', pct: 'pct', temp: 'temp', temperatura: 'temp' };
    const quickRow = { ...EMPTY_PARAM_ROW, fecha: parserDate };
    results.forEach(result => {
      const target = proaKeys[String(result.examKey || '').toLocaleLowerCase('es')];
      if (target && result.value != null && result.value !== '') {
        const normalizedValue = target === 'pcr' && /mg\s*\/\s*l/i.test(String(result.unit || '')) ? Number(result.value) / 10 : result.value;
        quickRow[target] = String(normalizedValue);
      }
    });
    const importedCount = Object.entries(quickRow).filter(([key, value]) => key !== 'fecha' && value !== '').length;
    setF(prev => {
      const existingRows = Array.isArray(prev.parametros_inflamatorios) ? prev.parametros_inflamatorios : [];
      const sameDate = existingRows.findIndex(row => row.fecha === parserDate);
      const parametros = sameDate >= 0
        ? existingRows.map((row, index) => index === sameDate ? { ...row, ...Object.fromEntries(Object.entries(quickRow).filter(([, value]) => value !== '')) } : row)
        : [...existingRows.filter(row => Object.values(row).some(Boolean)), quickRow];
      const previousResults = Array.isArray(prev.resultados_examenes_parser) ? prev.resultados_examenes_parser : [];
      const completeResults = [...previousResults, ...results].filter((item, index, items) => items.findIndex(candidate => candidate.id === item.id) === index);
      return { ...prev, parametros_inflamatorios: parametros, resultados_examenes_parser: completeResults };
    });
    setParserMessage(`${results.length} resultados almacenados; ${importedCount} parámetros relevantes agregados a la curva PROA.`);
    setParserText('');
  };

  // Estudios microbiológicos
  const updateCult = (idx, key, value) => {
    setF(prev => ({
      ...prev,
      estudios_micro: prev.estudios_micro.map((c, i) => i === idx ? { ...c, [key]: value } : c),
    }));
  };
  const toggleAntibiogramAtb = (idx, key, atb) => {
    setF(prev => ({
      ...prev,
      estudios_micro: prev.estudios_micro.map((c, i) => {
        if (i !== idx) return c;
        const current = Array.isArray(c[key]) ? c[key] : [];
        return {
          ...c,
          antibiograma: '',
          [key]: current.includes(atb) ? current.filter(x => x !== atb) : [...current, atb],
        };
      }),
    }));
  };
  const addCult = () => setF(prev => ({ ...prev, estudios_micro: [...prev.estudios_micro, { ...EMPTY_CULT }] }));
  const removeCult = (idx) => setF(prev => ({
    ...prev,
    estudios_micro: prev.estudios_micro.length > 1 ? prev.estudios_micro.filter((_, i) => i !== idx) : prev.estudios_micro,
  }));

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 10mm 12mm; }
        @media print {
          html, body { padding: 0 !important; margin: 0 !important; background: #fff !important; }
          html, body, #root, body > div { background: #fff !important; }
          .proa-screen-only { display: none !important; }
          .proa-pdf-viewer { background: #fff !important; padding: 0 !important; min-height: 0 !important; }
          .proa-print-page {
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            max-width: none !important;
            width: 100% !important;
            min-height: 0 !important;
          }
        }
        .proa-pdf-viewer {
          background: #525659;
          padding: 24px 16px;
          min-height: calc(100vh - 60px);
        }
        .proa-pdf-viewer .proa-print-page {
          background: #fff;
          box-shadow: 0 8px 28px rgba(0,0,0,0.45);
          width: 210mm;
          margin: 0 auto;
        }
      `}</style>

      {/* Header en pantalla con logo del hospital arriba a la izquierda */}
      <div className="proa-screen-only sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-xl shrink-0" onClick={goBack} title="Volver">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="shrink-0"><HospitalLogo height={40} /></div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldPlus className="h-4 w-4 text-teal-600" />
              Evolución PROA
            </h1>
            <p className="text-xs text-slate-500">Programa de Optimización del Uso de Antimicrobianos · HCSFB</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(createPageUrl('GestionPROA'))}
            className="gap-1.5 border-teal-200 text-teal-700 hover:bg-teal-50"
          >
            <ShieldPlus className="h-4 w-4" /> <span className="hidden sm:inline">Gestión PROA</span>
          </Button>
          <Button variant="outline" size="sm" onClick={clear} className="gap-1.5">
            <RotateCcw className="h-4 w-4" /> Limpiar
          </Button>
          {showPreview && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowPreview(false)}>Volver a datos</Button>
              <Button size="sm" onClick={printProaDocument} className="gap-1.5 bg-teal-600 hover:bg-teal-700">
                <Printer className="h-4 w-4" /> Imprimir / PDF
              </Button>
            </>
          )}
        </div>
      </div>

      {!showPreview && (
        <div className="proa-screen-only max-w-5xl mx-auto px-4 mt-4 pb-12">
          <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4 space-y-4">

            {/* Identificación */}
            <Section title="Identificación">
              <Grid>
                <Field label="Fecha de visita">
                  <DateInputDdmm value={f.fecha} onChange={v => u('fecha', v)} className="h-9" />
                </Field>
                <Field label="Hora">
                  <Input type="time" value={f.hora} onChange={e => u('hora', e.target.value)} className="h-9" />
                </Field>
                <Field label="Servicio">
                  <select
                    value={f.servicio}
                    onChange={e => setF((prev) => ({ ...prev, servicio: e.target.value, cama: '' }))}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-teal-400 focus:outline-none"
                  ><option value="">Seleccionar servicio…</option>{EVOLUTION_BED_MAP.map((service) => <option key={service.servicio} value={service.servicio}>{service.servicio}</option>)}</select>
                </Field>
                <Field label="Cama">
                  <select
                    value={f.cama}
                    onChange={e => u('cama', e.target.value)}
                    disabled={!f.servicio}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-teal-400 focus:outline-none disabled:bg-slate-100"
                  ><option value="">{f.servicio ? 'Seleccionar cama…' : 'Primero selecciona un servicio'}</option>{EVOLUTION_BED_MAP.find((service) => service.servicio === f.servicio)?.groups.flatMap((group) => group.beds).map((bed) => <option key={bed} value={bed}>{bed.replace(/^MQ2-/, '')}</option>)}</select>
                </Field>
                <Field label="N° Ficha">
                  <Input value={f.n_ficha} onChange={e => u('n_ficha', e.target.value)} className="h-9" />
                </Field>
                <Field label="Paciente" span="md:col-span-3">
                  <Input value={f.paciente} onChange={e => u('paciente', e.target.value)} className="h-9" />
                </Field>
                <Field label="Edad">
                  <Input value={f.edad} onChange={e => u('edad', e.target.value)} className="h-9" placeholder="años" />
                </Field>
                <Field label="Peso">
                  <Input type="number" min="0" step="0.1" value={f.peso_kg} onChange={e => u('peso_kg', e.target.value)} className="h-9" placeholder="kg" />
                </Field>
                <Field label="RUT" span="md:col-span-2">
                  <Input value={f.rut} onChange={e => u('rut', formatRut(e.target.value))} className="h-9" placeholder="12.345.678-9" />
                </Field>
                <Field label="Alergias" span="md:col-span-2">
                  <Input value={f.alergias} onChange={e => u('alergias', e.target.value)} className="h-9" placeholder="Ninguna conocida" />
                </Field>
                <Field label="Comorbilidades" span="md:col-span-2">
                  <Input value={f.comorbilidades} onChange={e => u('comorbilidades', e.target.value)} className="h-9" />
                </Field>
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 md:col-span-4">
                  <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-sky-900">Diabetes · verificación inicial *</p><p className="text-[11px] text-sky-700">Obligatoria sólo la primera vez; luego queda almacenada en la ficha.</p></div>{f.diabetes_evaluado === true && <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-sky-900 ring-1 ring-sky-300">Registrado: {f.diabetes ? 'Sí' : 'No'}</span>}</div>
                  {!f.__diabetesPreviouslyRecorded && <div className="mt-3 flex gap-2">{[['Sí', true], ['No', false]].map(([label, value]) => <button key={label} type="button" onClick={() => setF(prev => ({ ...prev, diabetes_evaluado: true, diabetes: value, diabetes_evaluado_en: prev.diabetes_evaluado_en || new Date().toISOString() }))} className={`rounded-lg border px-4 py-2 text-sm font-bold ${f.diabetes_evaluado === true && f.diabetes === value ? 'border-sky-500 bg-sky-700 text-white' : 'border-sky-200 bg-white text-sky-800'}`}>{label}</button>)}</div>}
                </div>
                <Field label="Sexo para VFG">
                  <select value={f.sexo} onChange={e => u('sexo', e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                    <option value="">Seleccionar...</option>
                    <option value="femenino">Femenino</option>
                    <option value="masculino">Masculino</option>
                  </select>
                </Field>
                <Field label="Creatinina sérica">
                  <div className="flex">
                    <Input type="number" min="0" step="0.01" value={f.creatinina} onChange={e => u('creatinina', e.target.value)} placeholder="Ej.: 1,20" className="h-9 rounded-r-none" />
                    <span className="flex h-9 items-center rounded-r-md border border-l-0 border-slate-200 bg-slate-50 px-2 text-xs text-slate-600">mg/dL</span>
                  </div>
                </Field>
                <Field label="Fecha de creatinina"><DateInputDdmm value={f.fecha_creatinina} onChange={v => u('fecha_creatinina', v)} className="h-9" /></Field>
                <Field label="Función renal calculada">
                  <div className="flex min-h-9 items-center rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                    {f.funcion_renal || 'Completa creatinina, edad y sexo para calcular VFG.'}
                  </div>
                </Field>
                <Field label="Fecha de ingreso">
                  <DateInputDdmm value={f.fecha_ingreso} onChange={v => u('fecha_ingreso', v)} className="h-9" />
                </Field>
                <Field label="Días de hospitalización">
                  <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                    {diasHosp !== '' ? `${diasHosp} días` : '— (ingresa la fecha de ingreso)'}
                  </div>
                </Field>
                <Field label="¿Usa dispositivo invasivo?">
                  <select
                    value={f.usa_invasivo}
                    onChange={e => u('usa_invasivo', e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm bg-white focus:border-teal-400 focus:outline-none"
                  >
                    <option value="no">No</option>
                    <option value="si">Sí</option>
                  </select>
                </Field>
                {f.usa_invasivo === 'si' && (
                  <Field label="Dispositivos (¿cuál? y ¿desde cuándo?)" span="md:col-span-4">
                    <div className="space-y-2">
                      {(f.invasivos || []).map((dev, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <select
                            value={dev.cual}
                            onChange={e => updateInvasivo(i, 'cual', e.target.value)}
                            className="h-9 min-w-[200px] flex-1 rounded-md border border-slate-200 px-3 text-sm bg-white focus:border-teal-400 focus:outline-none"
                          >
                            <option value="">Seleccionar dispositivo…</option>
                            {INVASIVE_DEVICES.map(d => <option key={d}>{d}</option>)}
                          </select>
                          <span className="text-[11px] text-slate-500">desde</span>
                          <div className="w-40"><DateInputDdmm value={dev.desde} onChange={v => updateInvasivo(i, 'desde', v)} className="h-9" /></div>
                          <button
                            type="button"
                            onClick={() => removeInvasivo(i)}
                            className="shrink-0 rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                            title="Quitar dispositivo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <Button type="button" size="sm" variant="outline" onClick={addInvasivo} className="gap-1 text-xs h-7">
                        <Plus className="h-3 w-3" /> Agregar dispositivo
                      </Button>
                    </div>
                  </Field>
                )}
              </Grid>
            </Section>

            {/* Diagnósticos */}
            <Section title="Diagnósticos">
              <Grid>
                <Field label="Diagnósticos actuales" span="md:col-span-2">
                  <div className="space-y-2">{f.diagnosticos_actuales.map((diagnosis, index) => <div key={index} className="flex gap-2"><input value={diagnosis} onChange={e => updateDiagnosis(index, e.target.value)} list="proa-diag-suggestions" className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm focus:border-teal-400 focus:outline-none" placeholder="Buscá: NAC, asma exacerbada, pie diabético…" /><button type="button" onClick={() => removeDiagnosis(index)} className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>)}<Button type="button" size="sm" variant="outline" onClick={addDiagnosis} className="h-7 gap-1 text-xs"><Plus className="h-3 w-3" /> Agregar diagnóstico</Button></div>
                </Field>
                <Field label={f.diag_micro_auto ? 'Diagnóstico microbiológico (auto — deducido de estudios)' : 'Diagnóstico microbiológico'} span="md:col-span-2">
                  <div className="flex gap-2 items-center">
                    <Input
                      value={f.diag_micro_auto ? (buildDiagMicro(f.estudios_micro) || '— pendiente / sin desarrollo') : f.diagnostico_microbiologico}
                      onChange={e => u('diagnostico_microbiologico', e.target.value)}
                      className="h-9 flex-1"
                      placeholder="Ej: Hemocultivo + S. aureus MRSA"
                      readOnly={f.diag_micro_auto}
                      title={f.diag_micro_auto ? 'Auto-deducido — desactivá para editar' : ''}
                    />
                    <label className="flex items-center gap-1 text-[11px] text-slate-600 shrink-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={f.diag_micro_auto}
                        onChange={e => u('diag_micro_auto', e.target.checked)}
                        className="accent-teal-600"
                      />
                      Auto
                    </label>
                  </div>
                </Field>
              </Grid>
            </Section>

            {/* Resumen de caso */}
            <Section title="Resumen de caso">
              <Textarea value={f.resumen_caso} onChange={e => u('resumen_caso', e.target.value)} className="min-h-[80px]" placeholder="Resumen breve: ingreso, hospitalización, eventos clave, intervenciones." />
            </Section>

            {/* Estudios microbiológicos */}
            <Section title="Estudios microbiológicos" right={
              <Button size="sm" variant="outline" onClick={addCult} className="gap-1 text-xs h-7"><Plus className="h-3 w-3" /> Agregar</Button>
            }>
              <div className="space-y-2">
                {f.estudios_micro.map((c, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 md:col-span-3">
                      <label className="block text-[11px] text-slate-600 mb-0.5">Vía de cultivo / muestra</label>
                      <input
                        value={c.tipo_muestra}
                        onChange={e => updateCult(i, 'tipo_muestra', e.target.value)}
                        list="proa-muestra-suggestions"
                        className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:border-teal-400 focus:outline-none"
                        placeholder="Hemocultivo, urocultivo…"
                      />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <label className="block text-[11px] text-slate-600 mb-0.5">Fecha</label>
                      <DateInputDdmm value={c.fecha} onChange={v => updateCult(i, 'fecha', v)} className="h-9" />
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className="block text-[11px] text-slate-600 mb-0.5">Patógeno</label>
                      <input
                        value={c.patogeno}
                        onChange={e => updateCult(i, 'patogeno', e.target.value)}
                        list="proa-patogenos-suggestions"
                        className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:border-teal-400 focus:outline-none"
                        placeholder="Buscá: S. aureus, E. coli…"
                      />
                    </div>
                    <div className="col-span-10 md:col-span-2">
                      <label className="block text-[11px] text-slate-600 mb-0.5">Sensibilidad</label>
                      <select
                        value={c.sensibilidad}
                        onChange={e => updateCult(i, 'sensibilidad', e.target.value)}
                        className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:border-teal-400 focus:outline-none bg-white"
                      >
                        {SENSIBILIDAD_OPCIONES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2 md:col-span-1 md:flex md:justify-end">
                      <Button variant="ghost" size="icon" onClick={() => removeCult(i)} className="h-8 w-8 text-rose-600 hover:bg-rose-50" title="Quitar">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {/* Antibiograma / resistencias específicas */}
                    <div className="col-span-12">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="block text-[11px] text-slate-600">Antibiograma / resistencias específicas</label>
                        <Button type="button" size="sm" variant="outline" onClick={() => { setAntibiogramSearch(''); setAntibiogramEditorIdx(i); }} className="h-7 text-xs">
                          Seleccionar antibiograma
                        </Button>
                      </div>
                      <div className="min-h-[38px] rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-700">
                        {buildAntibiograma(c) || <span className="text-slate-400">Sin resistencias/sensibilidades seleccionadas</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Estudios imagenológicos */}
            <Section title="Estudios imagenológicos">
              <Textarea value={f.estudios_imagen} onChange={e => u('estudios_imagen', e.target.value)} className="min-h-[60px]" placeholder="TAC, Rx, ecografía — fecha y hallazgos relevantes" />
            </Section>

            {/* Parámetros inflamatorios — planilla curva */}
            <Section title="Parámetros inflamatorios (curva por día)" right={
              <Button size="sm" variant="outline" onClick={addParamRow} className="gap-1 text-xs h-7"><Plus className="h-3 w-3" /> Agregar día</Button>
            }>
              <details className="mb-3 rounded-lg border border-cyan-200 bg-cyan-50/60">
                <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-cyan-900">Carga rápida desde informe de laboratorio</summary>
                <div className="space-y-2 border-t border-cyan-200 p-3">
                  <p className="text-[11px] text-cyan-800">Pega el informe completo. Se conservarán todos los resultados y la curva PROA extraerá solamente PCR, leucocitos/GB, creatinina, VHS, PCT y temperatura.</p>
                  <div className="grid gap-2 sm:grid-cols-[150px_1fr_auto]"><DateInputDdmm value={parserDate} onChange={setParserDate} className="h-10" /><Textarea value={parserText} onChange={event => setParserText(event.target.value)} className="min-h-20 bg-white" placeholder="Pegar aquí el informe completo…" /><Button type="button" onClick={parseQuickLabs} disabled={!parserText.trim()} className="self-end bg-cyan-700 hover:bg-cyan-800">Procesar informe</Button></div>
                  {parserMessage && <p className="rounded-md bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700">{parserMessage}</p>}
                </div>
              </details>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-teal-50">
                      {PARAM_COLS.map(c => (
                        <th key={c.key} className="border border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700">{c.label}</th>
                      ))}
                      <th className="border border-slate-200 px-2 py-1.5 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {f.parametros_inflamatorios.map((row, i) => (
                      <tr key={i}>
                        {PARAM_COLS.map(c => (
                          <td key={c.key} className="border border-slate-200 p-0.5">
                            {c.key === 'fecha' ? (
                              <DateInputDdmm
                                value={row[c.key]}
                                onChange={v => updateParamRow(i, c.key, v)}
                                className="w-full h-8 px-2 text-sm bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-teal-400 outline-none rounded"
                                style={{ minWidth: c.width }}
                              />
                            ) : (
                              <input
                                type={c.type}
                                value={row[c.key]}
                                onChange={e => updateParamRow(i, c.key, e.target.value)}
                                className="w-full h-8 px-2 text-sm bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-teal-400 outline-none rounded"
                                style={{ minWidth: c.width }}
                              />
                            )}
                          </td>
                        ))}
                        <td className="border border-slate-200 text-center">
                          <Button variant="ghost" size="icon" onClick={() => removeParamRow(i)} className="h-7 w-7 text-rose-600 hover:bg-rose-50" title="Quitar fila">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 italic">Dejá vacío lo que no se midió ese día. Agregá una fila por cada control.</p>
              <div className="mt-3">
                <InflammatoryCurve
                  parametros={f.parametros_inflamatorios}
                  antibioticos={f.antibioticos}
                />
              </div>
            </Section>

            {/* Antibioterapia actual */}
            <Section title="Antibioterapia actual" right={
              <Button size="sm" variant="outline" onClick={addAtb} className="gap-1 text-xs h-7"><Plus className="h-3 w-3" /> Agregar</Button>
            }>
              <div className="space-y-2">
                {f.antibioticos.map((a, i) => {
                  const dia = calcDiaTtoAtb(a, f.fecha);
                  const vigente = !hasTermino(a);
                  const renalAlert = vigente ? getRenalAntimicrobialAlert(a.nombre, f.vfg_estimada) : null;
                  const presentationOptions = getEvolutionPresentations(a.nombre);
                  const requiresWeightDose = Boolean(DEFAULT_DOSIS_ATB[a.nombre]?.dosis_por_kg);
                  return (
                    <div
                      key={i}
                      className={`grid grid-cols-12 gap-2 items-end p-2 rounded-lg border transition-colors ${
                        vigente
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : 'bg-rose-50/40 border-rose-200'
                      }`}
                    >
                      <div className="col-span-12 flex flex-wrap items-center justify-between gap-2">
                        <p className={`text-[11px] font-black uppercase tracking-wide ${vigente ? 'text-emerald-900' : 'text-red-800'}`}>Antimicrobiano {i + 1}</p>
                        <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${vigente ? 'bg-emerald-600 text-white' : 'bg-red-100 text-red-800'}`}>
                          {vigente
                            ? `Vigente${dia != null ? ` · Día ${dia}` : ''}`
                            : `Suspendido${dia != null ? ` · ${dia} ${dia === 1 ? 'día total' : 'días totales'}` : ''}`}
                        </span>
                      </div>
                      <div className="col-span-12 md:col-span-3">
                        <label className="block text-[11px] text-slate-600 mb-0.5">Antibiótico</label>
                        <input
                          value={a.nombre}
                          onChange={e => updateAtb(i, 'nombre', e.target.value)}
                          list="proa-atb-suggestions"
                          className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm focus:border-teal-400 focus:outline-none"
                          placeholder="Ej: Ceftriaxona"
                        />
                      </div>
                      <div className="col-span-12 md:col-span-4">
                        <label className="block text-[11px] text-slate-600 mb-0.5">Presentación disponible</label>
                        <select
                          value={a.presentacion || ''}
                          onChange={e => updateAtb(i, 'presentacion', e.target.value)}
                          className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white"
                        >
                          <option value="">— Seleccionar presentación —</option>
                          {a.presentacion && !presentationOptions.some((item) => item.label === a.presentacion) && (
                            <option value={a.presentacion}>{a.presentacion} (registro previo)</option>
                          )}
                          {presentationOptions.map((item) => (
                            <option key={item.label} value={item.label}>{item.label}</option>
                          ))}
                        </select>
                        {a.nombre && (
                          <p className={`mt-1 text-[10px] ${presentationOptions[0]?.source === 'arsenal' ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {presentationOptions[0]?.source === 'arsenal'
                              ? 'Arsenal vigente'
                              : arsenalStatus === 'loading'
                                ? 'Cargando arsenal…'
                                : 'Presentación local de respaldo'}
                          </p>
                        )}
                      </div>
                      <div className="col-span-12 md:col-span-3">
                        <label className="block text-[11px] text-slate-600 mb-0.5">Dosis por administración</label>
                        <div className="flex">
                          <Input
                            type="number"
                            min="0"
                            step="0.1"
                            value={a.dosis_final_cantidad !== undefined ? a.dosis_final_cantidad : (a.dosis_cantidad || '')}
                            onChange={e => updateAtb(i, 'dosis_final_cantidad', e.target.value)}
                            className="h-9 rounded-r-none"
                            placeholder="Ej.: 2"
                          />
                          <select
                            value={a.dosis_final_unidad || a.dosis_unidad || 'mg'}
                            onChange={e => updateAtb(i, 'dosis_final_unidad', e.target.value)}
                            className="h-9 w-24 rounded-r-md border border-l-0 border-slate-200 bg-white px-2 text-sm"
                          >
                            {DOSIS_UNIDADES.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                          </select>
                        </div>
                        {requiresWeightDose && (
                          <p className={`mt-1 flex items-center gap-1 text-[10px] font-bold ${
                            f.peso_kg ? 'text-amber-800' : 'text-red-700'
                          }`}>
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            {f.peso_kg
                              ? `Medicamento dosificado por peso · paciente ${formatNumber(f.peso_kg)} kg`
                              : 'Medicamento dosificado por peso · falta registrar el peso del paciente'}
                          </p>
                        )}
                      </div>
                      <div className="col-span-12 md:col-span-2">
                        <label className="block text-[11px] text-slate-600 mb-0.5">Cálculo avanzado</label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (requiresWeightDose && a.dosis_modo !== 'kg') updateAtb(i, 'dosis_modo', 'kg');
                            setDoseEditorIdx(i);
                          }}
                          className={`h-9 w-full whitespace-nowrap px-2 ${
                            requiresWeightDose ? 'border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100' : ''
                          }`}
                        >
                          {requiresWeightDose ? 'Ajustar por peso' : 'Más opciones'}
                        </Button>
                      </div>
                      <div className="col-span-6 md:col-span-3">
                        <label className="block text-[11px] text-slate-600 mb-0.5">Frecuencia</label>
                        <select value={a.intervalo_horas || ''} onChange={e => updateAtb(i, 'intervalo_horas', e.target.value)} className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white">
                          <option value="">—</option>
                          {INTERVALOS.map(h => <option key={h} value={h}>c/{h}h</option>)}
                        </select>
                      </div>
                      <div className="col-span-6 md:col-span-2">
                        <label className="block text-[11px] text-slate-600 mb-0.5">Vía</label>
                        <select value={a.via || 'EV'} onChange={e => updateAtb(i, 'via', e.target.value)} className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white">
                          {VIAS.map(via => <option key={via} value={via}>{via}</option>)}
                        </select>
                      </div>
                      <div className="col-span-6 md:col-span-2">
                        <label className="block text-[11px] text-slate-600 mb-0.5">Inicio</label>
                        <DateInputDdmm value={a.inicio} onChange={v => updateAtb(i, 'inicio', v)} className="h-9" />
                      </div>
                      <div className="col-span-6 md:col-span-2">
                        <label className="block text-[11px] text-slate-600 mb-0.5">Término</label>
                        <DateInputDdmm value={hasTermino(a) ? a.termino : ''} onChange={v => updateAtb(i, 'termino', v)} className="h-9" />
                      </div>
                      <div className="col-span-4 md:col-span-2">
                        <label className="block text-[11px] text-slate-600 mb-0.5">{hasTermino(a) ? 'Duración' : 'Día de tto'}</label>
                        <div className={`h-9 rounded-md border px-2 text-sm flex items-center justify-center font-semibold ${
                          dia == null ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-teal-300 bg-teal-50 text-teal-800'
                        }`}>
                          {formatTtoLabel(a, f.fecha)}
                        </div>
                      </div>
                      <div className="col-span-2 md:col-span-1 md:flex md:justify-end">
                        <Button variant="ghost" size="icon" onClick={() => removeAtb(i)} className="h-8 w-8 text-rose-600 hover:bg-rose-50" title="Quitar">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="col-span-12 rounded-md border border-teal-200 bg-white px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-teal-700">Indicación final</p>
                        <p className="mt-0.5 text-sm font-semibold text-slate-800">
                          {buildFinalAntibioticInstruction({ ...a, peso_kg: f.peso_kg }) || 'Completa antibiótico, dosis, frecuencia y vía.'}
                        </p>
                      </div>
                      {renalAlert && (
                        <div className="col-span-12 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                          <div>
                            <p className="font-bold">Ajuste renal a revisar · VFG estimada {renalAlert.vfg} mL/min/1,73 m²</p>
                            <p>{renalAlert.advice}</p>
                            <p className="mt-1 text-[10px] text-red-700">Orientación para adulto sin diálisis. Las tablas usan habitualmente CrCl; confirmar con Cockcroft–Gault, indicación, protocolo local y Farmacia/PROA.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* Evolución clínica */}
            <Section title="Evolución clínica" right={
              <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${f.publicar_estado_clinico_general ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`} title="Publica esta evolución en Estado clínico actual y en la tabla de visita general.">
                <span>Actualizar estado general</span>
                <button type="button" role="switch" aria-checked={f.publicar_estado_clinico_general} onClick={() => u('publicar_estado_clinico_general', !f.publicar_estado_clinico_general)} className={`relative h-6 w-10 shrink-0 rounded-full transition ${f.publicar_estado_clinico_general ? 'bg-emerald-600' : 'bg-slate-300'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${f.publicar_estado_clinico_general ? 'left-5' : 'left-1'}`} /></button>
              </div>
            }>
              <Textarea value={f.evolucion} onChange={e => u('evolucion', e.target.value)} className="min-h-[80px]" placeholder="Tendencia, respuesta al tratamiento, eventos de las últimas 24-48 h." />
              <p className={`mt-2 rounded-lg px-3 py-2 text-[11px] ${f.publicar_estado_clinico_general ? 'border border-emerald-200 bg-emerald-50 font-semibold text-emerald-800' : 'bg-slate-50 text-slate-500'}`}>{f.publicar_estado_clinico_general ? 'Al guardar, este texto renovará el Estado clínico actual y se mostrará en la tabla de visita general.' : 'Esta evolución permanecerá solo en PROA. Activa el interruptor si también representa el estado clínico general vigente.'}</p>
            </Section>

            {/* Recomendaciones PROA */}
            <Section title="Recomendaciones del equipo PROA" right={
              <Button type="button" size="sm" variant="outline" onClick={suggestModifications} disabled={aiSuggesting} className="gap-1 text-xs h-7">
                <Sparkles className="h-3 w-3" /> {aiSuggesting ? 'Generando…' : 'Sugerencia'}
              </Button>
            }>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {RECOMENDACIONES.map(rec => (
                  <label key={rec} className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer hover:bg-teal-50/60 rounded px-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={f.recomendaciones.includes(rec)}
                      onChange={() => toggleRec(rec)}
                      className="mt-1 accent-teal-600"
                    />
                    <span>{rec}</span>
                  </label>
                ))}
              </div>
              {f.recomendaciones.includes('Otra (especificar abajo)') && (
                <Input
                  value={f.recomendaciones_otra}
                  onChange={e => u('recomendaciones_otra', e.target.value)}
                  placeholder="Especificar otra recomendación…"
                  className="h-9 mt-2"
                />
              )}
              <Grid className="mt-3">
                <Field label="Plan / duración total" span="md:col-span-2">
                  <Input value={f.plan_duracion} onChange={e => u('plan_duracion', e.target.value)} className="h-9" placeholder="Ej: completar 7 días totales (hasta 12-06)" />
                </Field>
                <Field label="Próxima revisión" span="md:col-span-2">
                  <DateInputDdmm value={f.proxima_revision} onChange={v => u('proxima_revision', v)} className="h-9" />
                </Field>
              </Grid>
              <div className="mt-3">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Sugerencia</label>
                <Textarea
                  value={f.sugerencias_ia}
                  onChange={e => u('sugerencias_ia', e.target.value)}
                  className="min-h-[76px] text-sm"
                  placeholder="Usá el botón Sugerencia para proponer modificaciones con los datos ingresados."
                />
              </div>
            </Section>

            {/* Firmas */}
            <Section title="Firmas">
              <Grid>
                <Field label="Médico que firma" span="md:col-span-2">
                  <Input value={f.medico_firma} onChange={e => u('medico_firma', e.target.value)} className="h-9" placeholder="Nombre y apellido · Equipo PROA" />
                </Field>
              </Grid>
            </Section>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-h-5 text-xs font-medium text-teal-700">{registryMessage}</p>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => handleSaveRegistry(false)} disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? 'Guardando…' : 'Guardar registro PROA'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleSaveRegistry(true)}
                  disabled={saving}
                  className="gap-2 border-amber-400 text-amber-800 hover:bg-amber-50"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Guardando…' : 'Guardar y egresar'}
                </Button>
                <Button variant="outline" onClick={clear}>Limpiar</Button>
                <Button
                  onClick={() => { if (f.cama?.trim()) handleSaveRegistry(false); setShowPreview(true); }}
                  disabled={saving}
                  className="bg-teal-600 hover:bg-teal-700 gap-2"
                >
                  {saving ? 'Guardando…' : 'Generar y guardar →'}
                </Button>
              </div>
            </div>
          </div>

          {doseEditorIdx != null && f.antibioticos[doseEditorIdx] && (
            <EditorOverlay title="Definir dosis fija, por peso o por presentación" onClose={() => setDoseEditorIdx(null)}>
              {(() => {
                const a = { ...f.antibioticos[doseEditorIdx], peso_kg: f.peso_kg };
                const unidades = a.unidades_por_dosis || calcUnidadesPorDosis(a);
                const dosisTotal = getDosisTotal(a);
                const dosisKg = getDosisPorKgCalculada(a);
                const requiresWeightDose = Boolean(DEFAULT_DOSIS_ATB[a.nombre]?.dosis_por_kg);
                const weightApproximation = getWeightDoseApproximation(a);
                return (
                  <div className="space-y-3">
                    {requiresWeightDose && (
                      <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        Este antimicrobiano requiere dosificación por peso. Confirma el peso actual y revisa función renal cuando corresponda.
                      </div>
                    )}
	                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
	                      <Field label="Antibiótico">
	                        <Input value={a.nombre} onChange={e => updateAtb(doseEditorIdx, 'nombre', e.target.value)} list="proa-atb-suggestions" className="h-9" />
	                      </Field>
	                      <Field label="Tipo de dosis">
	                        <select
	                          value={a.dosis_modo || 'total'}
	                          onChange={e => {
	                            updateAtb(doseEditorIdx, 'dosis_modo', e.target.value);
	                            if (e.target.value === 'ampolla') {
	                              updateAtb(doseEditorIdx, 'unidades_por_dosis', a.unidades_por_dosis || 1);
	                              updateAtb(doseEditorIdx, 'dosis_cantidad', '');
	                              updateAtb(doseEditorIdx, 'dosis_por_kg', '');
	                            } else if (e.target.value === 'kg') {
	                              updateAtb(doseEditorIdx, 'dosis_por_kg', a.dosis_por_kg || '');
	                              updateAtb(doseEditorIdx, 'dosis_cantidad', '');
	                            } else {
	                              updateAtb(doseEditorIdx, 'dosis_cantidad', getDosisTotal(a) || '');
	                              updateAtb(doseEditorIdx, 'dosis_por_kg', '');
	                            }
	                          }}
	                          className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white"
	                        >
	                          <option value="kg">Dosis por kg</option>
	                          {!requiresWeightDose && <option value="total">Dosis fija</option>}
	                          {!requiresWeightDose && <option value="ampolla">Por ampolla / presentación</option>}
	                        </select>
	                      </Field>
	                      <Field label={a.dosis_modo === 'ampolla' ? 'Dosis' : 'Dosis base'}>
	                        <div className="flex gap-2">
	                          {a.dosis_modo === 'ampolla' ? (
	                            <>
	                              <Input
	                                type="number"
	                                min="0"
	                                step="0.5"
	                                value={a.unidades_por_dosis || 1}
	                                onChange={e => updateAtb(doseEditorIdx, 'unidades_por_dosis', e.target.value)}
	                                className="h-9"
	                              />
	                              <select value={a.presentacion || ''} onChange={e => updateAtb(doseEditorIdx, 'presentacion', e.target.value)} className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white">
	                                <option value="">— Presentación —</option>
	                                {getEvolutionPresentations(a.nombre).map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
	                              </select>
	                            </>
	                          ) : (
	                            <>
	                              <Input
	                                type="number"
	                                min="0"
	                                step="0.1"
	                                value={a.dosis_modo === 'kg' ? (a.dosis_por_kg || '') : (a.dosis_cantidad || '')}
	                                onChange={e => {
	                                  if (a.dosis_modo === 'kg') updateAtb(doseEditorIdx, 'dosis_por_kg', e.target.value);
	                                  else updateAtb(doseEditorIdx, 'dosis_cantidad', e.target.value);
	                                }}
	                                className="h-9"
	                                placeholder="Ej: 15"
	                              />
	                              <select value={a.dosis_unidad || 'mg'} onChange={e => updateAtb(doseEditorIdx, 'dosis_unidad', e.target.value)} className="w-28 h-9 rounded-md border border-slate-200 px-2 text-sm bg-white">
	                                {DOSIS_UNIDADES.map(u => <option key={u} value={u}>{a.dosis_modo === 'kg' ? `${u}/kg` : u}</option>)}
	                              </select>
	                            </>
	                          )}
	                        </div>
	                      </Field>
	                      <Field label="Frecuencia">
	                        <select value={a.intervalo_horas || ''} onChange={e => updateAtb(doseEditorIdx, 'intervalo_horas', e.target.value)} className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white">
	                          <option value="">— Seleccionar —</option>
	                          {INTERVALOS.map(h => <option key={h} value={h}>Cada {h} horas</option>)}
	                        </select>
	                      </Field>
	                      <Field label="Peso del paciente">
	                        <Input value={f.peso_kg ? `${formatNumber(f.peso_kg)} kg` : ''} readOnly className="h-9 bg-slate-100 text-slate-500" placeholder="Registrar en Identificación" />
	                      </Field>
	                      <Field label={a.dosis_modo === 'kg' ? 'Dosis teórica según peso' : 'Dosis total calculada'}>
	                        <Input
                            value={a.dosis_modo === 'kg'
                              ? (weightApproximation ? `${formatNumber(weightApproximation.theoretical)} ${weightApproximation.unit}` : '')
                              : a.dosis_modo === 'ampolla'
                                ? (getPresentation(a.nombre, a.presentacion, a) ? `${formatNumber(a.unidades_por_dosis || 1)} ${pluralizeEnvase(getPresentation(a.nombre, a.presentacion, a)?.envase, a.unidades_por_dosis || 1)} de ${presentationDoseText(getPresentation(a.nombre, a.presentacion, a))}` : '')
                                : (dosisTotal ? `${formatNumber(dosisTotal)} ${a.dosis_unidad || ''}` : '')}
                            readOnly
                            className="h-9 bg-slate-100 text-slate-500"
                            placeholder="Se calcula automáticamente"
                          />
	                      </Field>
	                      <Field label="Dosis por kilo calculada">
	                        <Input value={dosisKg ? `${formatNumber(dosisKg)} ${a.dosis_unidad || 'mg'}/kg` : ''} readOnly className="h-9 bg-slate-100 text-slate-500" placeholder="Requiere peso" />
	                      </Field>
                      <Field label="Equivalencia por dosis">
                        <Input
                          value={unidades ? `${formatNumber(unidades)} ${pluralizeEnvase(getPresentation(a.nombre, a.presentacion, a)?.envase, unidades)}` : ''}
                          readOnly
                          className="h-9 bg-slate-100 text-slate-500"
	                          placeholder="Se calcula según presentación"
	                        />
	                      </Field>
	                      <Field label="Presentación calculada">
	                        <Input value={a.presentacion || ''} readOnly className="h-9 bg-slate-100 text-slate-500" />
	                      </Field>
	                      <Field label="Vía">
	                        <select value={a.via} onChange={e => updateAtb(doseEditorIdx, 'via', e.target.value)} className="w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white">
                          {VIAS.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </Field>
	                    </div>
                    {a.dosis_modo === 'kg' && weightApproximation && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                        <p className="text-sm font-bold text-amber-950">
                          Dosis teórica: {formatNumber(weightApproximation.theoretical)} {weightApproximation.unit}
                        </p>
                        <p className="mt-1 text-sm text-amber-900">
                          Dosis administrable sugerida: <strong>{formatNumber(weightApproximation.rounded)} {weightApproximation.unit}</strong>
                          {' '}({weightApproximation.method}).
                        </p>
                        <p className="mt-1 text-[11px] text-amber-800">
                          La aproximación facilita una dosis compatible con la presentación; confirma máximos, función renal, niveles plasmáticos y protocolo correspondiente.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            updateAtb(doseEditorIdx, 'dosis_final_cantidad', weightApproximation.rounded);
                            updateAtb(doseEditorIdx, 'dosis_final_unidad', weightApproximation.unit);
                          }}
                          className="mt-2 bg-amber-700 text-white hover:bg-amber-800"
                        >
                          Aplicar dosis aproximada
                        </Button>
                      </div>
                    )}
                    <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900">
                      {buildDosisConcreta({ ...a, unidades_por_dosis: unidades }) || 'Complete dosis e intervalo'}
                    </div>
                    <div className="flex justify-end">
                      <Button type="button" onClick={() => setDoseEditorIdx(null)} className="bg-teal-600 hover:bg-teal-700">Listo</Button>
                    </div>
                  </div>
                );
              })()}
            </EditorOverlay>
          )}

          {antibiogramEditorIdx != null && f.estudios_micro[antibiogramEditorIdx] && (
            <EditorOverlay title="Antibiograma" onClose={() => setAntibiogramEditorIdx(null)}>
              {(() => {
                const c = f.estudios_micro[antibiogramEditorIdx];
                const filteredPool = ANTIBIOGRAMA_POOL.filter(atb =>
                  atb.toLowerCase().includes(antibiogramSearch.trim().toLowerCase())
                );
                return (
                  <div className="space-y-3">
                    <Input
                      value={antibiogramSearch}
                      onChange={e => setAntibiogramSearch(e.target.value)}
                      className="h-9"
                      placeholder="Buscar antibiótico..."
                    />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        ['resistente', 'Resistente'],
                        ['sensible', 'Sensible'],
                        ['intermedio', 'Intermedio'],
                      ].map(([key, label]) => (
                        <div key={key}>
                          <p className="text-xs font-semibold text-slate-700 mb-1">{label}</p>
                          <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 p-2 space-y-1">
                            {filteredPool.map(atb => (
                              <label key={`${key}-${atb}`} className="flex items-start gap-2 text-xs text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={(c[key] || []).includes(atb)}
                                  onChange={() => toggleAntibiogramAtb(antibiogramEditorIdx, key, atb)}
                                  className="mt-0.5 accent-teal-600"
                                />
                                <span>{atb}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <Field label="Nota adicional">
                      <Textarea value={c.antibiograma_nota || ''} onChange={e => updateCult(antibiogramEditorIdx, 'antibiograma_nota', e.target.value)} className="min-h-[54px]" placeholder="Ej: BLEE positivo, KPC positivo, pendiente confirmación..." />
                    </Field>
                    <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
                      {buildAntibiograma(c) || 'Seleccione antibióticos del pool precargado'}
                    </div>
                    <div className="flex justify-end">
                      <Button type="button" onClick={() => setAntibiogramEditorIdx(null)} className="bg-teal-600 hover:bg-teal-700">Listo</Button>
                    </div>
                  </div>
                );
              })()}
            </EditorOverlay>
          )}

          {/* Datalists globales */}
          <datalist id="proa-atb-suggestions">
            {ANTIBIOTICOS.map(s => <option key={s} value={s} />)}
          </datalist>
          <datalist id="proa-muestra-suggestions">
            {TIPOS_MUESTRA.map(s => <option key={s} value={s} />)}
          </datalist>
          <datalist id="proa-patogenos-suggestions">
            {PATOGENOS.map(s => <option key={s} value={s} />)}
          </datalist>
          <datalist id="proa-diag-suggestions">
            {DIAGNOSTICOS_INFECTO.map(s => <option key={s} value={s} />)}
          </datalist>
        </div>
      )}

      {/* Vista impresa */}
      {showPreview && (
        <div className="proa-pdf-viewer">
          <div
            className="proa-print-page"
            style={{ padding: 0, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10pt', color: '#000' }}
          >
            <ProaEvolutionDocument form={f} professional={f.medico_firma} />
            <div style={{ display: 'none' }} aria-hidden="true">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12pt', marginBottom: '6pt' }}>
              <HospitalLogo />
              <div style={{ flex: 1, fontSize: '9pt', lineHeight: 1.3 }}>
                <p style={{ margin: 0 }}>Hospital Comunitario de Salud Familiar de Bulnes</p>
                <p style={{ margin: 0 }}>Servicio Salud Ñuble</p>
                <p style={{ margin: 0, fontWeight: 'bold', marginTop: '2pt' }}>Programa de Optimización del Uso de Antimicrobianos (PROA)</p>
              </div>
              <div style={{ textAlign: 'right', fontSize: '9pt' }}>
                <p style={{ margin: 0, fontWeight: 'bold' }}>Fecha: {formatDateLocal(f.fecha)}{f.hora ? ` ${f.hora}` : ''}</p>
              </div>
            </div>

            <h1 style={{ textAlign: 'center', fontSize: '13pt', fontWeight: 'bold', textDecoration: 'underline', margin: '6pt 0 8pt' }}>
              EVOLUCIÓN PROA
            </h1>

            <PrintBlock title="Identificación">
              <PrintGrid>
                <PrintField label="Paciente" value={f.paciente} flex={3} />
                <PrintField label="RUT" value={f.rut} flex={1} />
                <PrintField label="Edad" value={f.edad ? `${f.edad} años` : ''} flex={1} />
                <PrintField label="Peso" value={f.peso_kg ? `${formatNumber(f.peso_kg)} kg` : ''} flex={1} />
              </PrintGrid>
              <PrintGrid>
                <PrintField label="Servicio" value={f.servicio} flex={1} />
                <PrintField label="Cama" value={f.cama} flex={1} />
                <PrintField label="N° Ficha" value={f.n_ficha} flex={1} />
                <PrintField label="Alergias" value={f.alergias || 'Ninguna conocida'} flex={2} />
              </PrintGrid>
              <PrintGrid>
                <PrintField label="Comorbilidades" value={f.comorbilidades} flex={2} />
                <PrintField label="Función renal" value={f.funcion_renal} flex={2} />
              </PrintGrid>
              <PrintGrid>
                <PrintField label="Fecha de ingreso" value={f.fecha_ingreso ? formatDateLocal(f.fecha_ingreso) : ''} flex={1} />
                <PrintField label="Días de hospitalización" value={diasHosp !== '' ? `${diasHosp} días` : ''} flex={1} />
                <PrintField label="Dispositivos invasivos" value={f.usa_invasivo === 'si' ? ((f.invasivos || []).filter(d => d.cual || d.desde).map(d => `${d.cual || 'Dispositivo'}${d.desde ? ` (desde ${formatDateLocal(d.desde)})` : ''}`).join('; ') || 'Sí') : 'No'} flex={2} />
              </PrintGrid>
            </PrintBlock>

            <PrintBlock title="Diagnósticos">
              <PrintGrid>
                <PrintField label="Diagnóstico actual" value={f.diagnostico_actual} flex={2} />
                <PrintField label="Diagnóstico microbiológico" value={f.diag_micro_auto ? (buildDiagMicro(f.estudios_micro) || '— pendiente / sin desarrollo') : f.diagnostico_microbiologico} flex={2} />
              </PrintGrid>
            </PrintBlock>

            {f.resumen_caso && (
              <PrintBlock title="Resumen de caso">
                <div style={box}>{f.resumen_caso}</div>
              </PrintBlock>
            )}

            <PrintBlock title="Estudios microbiológicos">
              <table style={tbl}>
                <thead>
                  <tr style={{ background: '#e6f4f1' }}>
                    <th style={cellHead}>Vía / muestra</th>
                    <th style={cellHead}>Fecha</th>
                    <th style={cellHead}>Patógeno</th>
                    <th style={cellHead}>Sensibilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {f.estudios_micro.filter(c => c.tipo_muestra || c.patogeno).map((c, i) => (
                    <>
                      <tr key={`r-${i}`}>
                        <td style={cell}>{c.tipo_muestra}</td>
                        <td style={cell}>{formatDateLocal(c.fecha)}</td>
                        <td style={cell}>{c.patogeno}</td>
                        <td style={cell}>{c.sensibilidad}</td>
                      </tr>
                      {buildAntibiograma(c) && (
                        <tr key={`a-${i}`}>
                          <td colSpan={4} style={{ ...cell, background: '#f9fafb', fontSize: '9pt' }}>
                            <strong>Antibiograma:</strong> {buildAntibiograma(c)}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {f.estudios_micro.filter(c => c.tipo_muestra || c.patogeno).length === 0 && (
                    <tr><td colSpan={4} style={{ ...cell, fontStyle: 'italic', color: '#666' }}>— sin estudios registrados —</td></tr>
                  )}
                </tbody>
              </table>
            </PrintBlock>

            {f.estudios_imagen && (
              <PrintBlock title="Estudios imagenológicos">
                <div style={box}>{f.estudios_imagen}</div>
              </PrintBlock>
            )}

            {/* Parámetros inflamatorios — planilla curva */}
            <PrintBlock title="Parámetros inflamatorios (curva)">
              <div style={{ marginBottom: '6pt', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                <InflammatoryCurve
                  parametros={f.parametros_inflamatorios}
                  antibioticos={f.antibioticos}
                />
              </div>
              <table style={tbl}>
                <thead>
                  <tr style={{ background: '#e6f4f1' }}>
                    {PARAM_COLS.map(c => <th key={c.key} style={cellHead}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {f.parametros_inflamatorios.filter(r => Object.values(r).some(v => v)).map((r, i) => (
                    <tr key={i}>
                      {PARAM_COLS.map(c => (
                        <td key={c.key} style={cell}>{c.key === 'fecha' ? formatDateLocal(r[c.key]) : r[c.key]}</td>
                      ))}
                    </tr>
                  ))}
                  {f.parametros_inflamatorios.filter(r => Object.values(r).some(v => v)).length === 0 && (
                    <tr><td colSpan={PARAM_COLS.length} style={{ ...cell, fontStyle: 'italic', color: '#666' }}>— sin parámetros registrados —</td></tr>
                  )}
                </tbody>
              </table>
            </PrintBlock>

            <PrintBlock title="Antibioterapia actual">
              <table style={tbl}>
                <thead>
                  <tr style={{ background: '#e6f4f1' }}>
                    <th style={cellHead}>Antibiótico</th>
                    <th style={cellHead}>Vía</th>
                    <th style={cellHead}>Dosis / frecuencia</th>
                    <th style={cellHead}>Inicio</th>
                    <th style={cellHead}>Término</th>
                    <th style={cellHead}>Día de tto</th>
                  </tr>
                </thead>
                <tbody>
                  {f.antibioticos.filter(a => a.nombre).map((a, i) => (
                    <tr key={i}>
                      <td style={cell}>{a.nombre}</td>
                      <td style={cell}>{a.via}</td>
                      <td style={cell}>{buildDosisConcreta({ ...a, peso_kg: f.peso_kg })}</td>
                      <td style={cell}>{formatDateLocal(a.inicio)}</td>
                      <td style={cell}>{hasTermino(a) ? formatDateLocal(a.termino) : ''}</td>
                      <td style={{ ...cell, fontWeight: 'bold', textAlign: 'center' }}>{formatTtoLabel(a, f.fecha)}</td>
                    </tr>
                  ))}
                  {f.antibioticos.filter(a => a.nombre).length === 0 && (
                    <tr><td colSpan={6} style={{ ...cell, fontStyle: 'italic', color: '#666' }}>— sin antibióticos registrados —</td></tr>
                  )}
                </tbody>
              </table>
              {renalAntimicrobialAlerts.length > 0 && (
                <div style={{ marginTop: '5pt', border: '1px solid #dc2626', background: '#fef2f2', padding: '5pt', color: '#7f1d1d', fontSize: '8pt' }}>
                  <p style={{ margin: '0 0 3pt', fontWeight: 'bold' }}>⚠ ALERTA DE AJUSTE POR FUNCIÓN RENAL — VFG estimada {f.vfg_estimada} mL/min/1,73 m²</p>
                  {renalAntimicrobialAlerts.map((alert) => (
                    <p key={alert.antimicrobial} style={{ margin: '2pt 0' }}>
                      <strong>{alert.antimicrobial}:</strong> {alert.advice}
                    </p>
                  ))}
                  <p style={{ margin: '3pt 0 0', fontSize: '7pt' }}>
                    Orientación para adulto sin diálisis. Confirmar CrCl por Cockcroft–Gault, indicación, protocolo local y Farmacia/PROA antes de modificar.
                  </p>
                </div>
              )}
            </PrintBlock>

            {f.evolucion && (
              <PrintBlock title="Evolución clínica">
                <div style={box}>{f.evolucion}</div>
              </PrintBlock>
            )}

            <PrintBlock title="Recomendaciones del equipo PROA">
              <ul style={{ margin: 0, paddingLeft: '14pt' }}>
                {f.recomendaciones.filter(r => r !== 'Otra (especificar abajo)').map(r => (
                  <li key={r} style={{ marginBottom: '2pt' }}>{r}</li>
                ))}
                {f.recomendaciones.includes('Otra (especificar abajo)') && f.recomendaciones_otra && (
                  <li>{f.recomendaciones_otra}</li>
                )}
                {f.recomendaciones.length === 0 && <li style={{ fontStyle: 'italic', color: '#666' }}>— sin recomendaciones —</li>}
              </ul>
              <PrintGrid>
                <PrintField label="Plan / duración total" value={f.plan_duracion} flex={3} />
                <PrintField label="Próxima revisión" value={formatDateLocal(f.proxima_revision)} flex={2} />
              </PrintGrid>
              {f.sugerencias_ia && (
                <div style={{ ...box, minHeight: '24pt', marginTop: '4pt' }}>
                  <strong>Sugerencia:</strong>
                  <br />
                  {f.sugerencias_ia}
                </div>
              )}
            </PrintBlock>

            <PrintBlock title="Firmas">
              <div style={{ marginTop: '16pt', display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: '58%' }}>
                  <div style={{ borderTop: '0.75pt solid #000', paddingTop: '2pt', textAlign: 'center', fontSize: '9pt' }}>
                    {f.medico_firma || '—'}
                  </div>
                  <p style={{ margin: 0, fontSize: '8.5pt', textAlign: 'center', color: '#555' }}>Médico firmante · Equipo PROA Hospital de Bulnes</p>
                </div>
              </div>
            </PrintBlock>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={showExitPrompt} onOpenChange={setShowExitPrompt}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Guardar cambios antes de salir?</AlertDialogTitle>
            <AlertDialogDescription>
              Hay cambios pendientes en esta Evolución PROA. Puedes guardarlos antes de volver o desestimarlos y salir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setShowExitPrompt(false);
                exitPage();
              }}
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              Desestimar y salir
            </Button>
            <AlertDialogAction
              disabled={saving}
              onClick={async (event) => {
                event.preventDefault();
                const saved = await handleSaveRegistry(false);
                if (saved) {
                  setShowExitPrompt(false);
                  exitPage();
                }
              }}
              className="bg-teal-700 text-white hover:bg-teal-800"
            >
              {saving ? 'Guardando…' : 'Guardar y salir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Helpers UI ─────────────────────────────────────────────
function Section({ title, children, right }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function Grid({ children, className = '' }) {
  return <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 ${className}`}>{children}</div>;
}

function Field({ label, children, span = '' }) {
  return (
    <div className={span}>
      <label className="block text-[11px] font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function EditorOverlay({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6">
      <div className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">{title}</h3>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
        </div>
        <div className="max-h-[76vh] overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Helpers impresión ─────────────────────────────────────
function PrintBlock({ title, children }) {
  return (
    <div style={{ marginBottom: '8pt' }}>
      <p style={{ margin: '0 0 3pt 0', fontSize: '9.5pt', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.4pt', borderBottom: '0.75pt solid #000', paddingBottom: '1pt' }}>
        {title}
      </p>
      <div style={{ fontSize: '10pt' }}>{children}</div>
    </div>
  );
}

function PrintGrid({ children }) {
  return <div style={{ display: 'flex', gap: '10pt', marginBottom: '4pt', alignItems: 'baseline' }}>{children}</div>;
}

function PrintField({ label, value, flex = 1 }) {
  return (
    <div style={{ flex, display: 'flex', alignItems: 'baseline', minWidth: 0 }}>
      <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap', marginRight: '4pt', fontSize: '9.5pt' }}>{label}:</span>
      <span style={{ flex: 1, borderBottom: '0.5pt solid #000', minHeight: '12pt', padding: '0 3pt', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  );
}

const tbl       = { width: '100%', borderCollapse: 'collapse', fontSize: '9.5pt' };
const cellHead  = { border: '0.5pt solid #555', padding: '3pt 5pt', textAlign: 'left', fontSize: '9pt' };
const cell      = { border: '0.5pt solid #555', padding: '3pt 5pt', fontSize: '9.5pt' };
const box       = { border: '0.75pt solid #000', padding: '4pt 6pt', minHeight: '40pt', whiteSpace: 'pre-wrap' };

export default conAccesoMedispense(VisitaPROA);
