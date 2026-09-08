import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpCircle,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Copy,
  FileSignature,
  FlaskConical,
  HeartPulse,
  Info,
  RefreshCw,
  Send,
  UserCheck,
} from 'lucide-react';
import { MoriskyAssessment } from '@/components/calculators/MoriskyCalculator';

const STAGES = [
  {
    number: 1,
    label: 'Inicio',
    medicines: ['Losartán 50 mg al día', 'Amlodipino 5 mg al día'],
    escalation: 'Subir a etapa 2 (profesional autorizado) y controlar con TENS en 2–4 semanas.',
  },
  {
    number: 2,
    label: 'Primera intensificación',
    medicines: ['Losartán 100 mg al día', 'Amlodipino 10 mg al día'],
    escalation: 'Subir a etapa 3 (profesional autorizado) y controlar con TENS en 2–4 semanas.',
  },
  {
    number: 3,
    label: 'Segunda intensificación',
    medicines: ['Losartán 100 mg al día', 'Amlodipino 10 mg al día', 'Hidroclorotiazida 25 mg al día'],
    escalation: 'Subir a etapa 4 (profesional autorizado); control TENS en 2–4 semanas (propuesta Bulnes: 4–6 semanas).',
  },
  {
    number: 4,
    label: 'Tercera intensificación',
    medicines: ['Losartán 100 mg al día', 'Amlodipino 10 mg al día', 'Hidroclorotiazida 50 mg al día'],
    escalation: 'No hay etapa 5: derivar a médico en poli de descompensados en 2–4 semanas.',
  },
];

const EXCLUSIONS = [
  ['pregnancy', 'Embarazo o potencial embarazo'],
  ['frailty', 'Persona mayor frágil'],
  ['age', 'Edad menor de 15 o mayor o igual a 80 años'],
  ['allergy', 'Alergia a fármacos del algoritmo'],
  ['contraindication', 'Contraindicación a algún medicamento del algoritmo'],
  ['heartFailure', 'Insuficiencia cardíaca'],
  ['priorMi', 'Infarto agudo al miocardio previo'],
  ['advancedCkd', 'ERC etapa 4–5 o albuminuria A2 persistente (RAC ≥30 mg/g)'],
  ['cirrhosis', 'Cirrosis hepática'],
];

const EXAMS = [
  'Glicemia',
  'Creatinina + VFG',
  'BUN / uremia',
  'Electrolitos plasmáticos',
  'Orina completa',
  'RAC',
  'Perfil lipídico',
  'Perfil hepático',
  'Recuento globular',
  'Electrocardiograma',
];

const ENTRY_ITEMS = [
  ['diagnosis', 'Diagnóstico de HTA confirmado por médico'],
  ['ges', 'Constancia GES firmada'],
  ['pscv', 'Ingreso cardiovascular o ECICEP registrado'],
  ['rayen', 'Iniciativa HEARTS activada en formulario integral'],
  ['lifestyle', 'Acuerdos de estilo de vida consensuados'],
  ['referrals', 'Necesidad de nutrición, QF y TENS evaluada'],
];

const MOMENTS = [
  { id: 'ingreso', label: 'Ingreso', control: 0 },
  { id: 'c1', label: 'Control 1', control: 1 },
  { id: 'c2', label: 'Control 2', control: 2 },
  { id: 'c3', label: 'Control 3', control: 3 },
  { id: 'c4', label: 'Control 4 o más', control: 4 },
];

const STEP_META = [
  { title: 'Candidatura', icon: UserCheck },
  { title: 'Exámenes', icon: FlaskConical },
  { title: 'Diagnóstico y GES', icon: FileSignature },
  { title: 'Escalón actual', icon: HeartPulse },
  { title: 'Control y conducta', icon: Activity },
  { title: 'Resumen', icon: ClipboardCheck },
];

const emptyState = {
  moment: '',
  age: '',
  profileConfirmed: false,
  exclusions: {},
  exams: {},
  entry: {},
  stage: 1,
  treatmentRecorded: false,
  systolic: '',
  diastolic: '',
  morisky: '',
};

// Motor de conducta: traduce momento + PA + etapa + Morisky en acciones concretas
// (aumentar o no, a quién derivar, plazo del próximo control y qué registrar).
function buildConduct(ctx) {
  const {
    moment, controlNumber, eligibilityComplete, eligible, examCount, entryCount,
    stage, hasPressure, atGoal, systolic, diastolic, morisky, lowAdherence, midAdherence,
  } = ctx;

  if (!moment) {
    return {
      tone: 'info',
      headline: 'Selecciona el momento de atención (ingreso o número de control) para obtener la conducta.',
      aumentar: '—',
      proximoControl: '—',
      derivar: [],
      registrar: [],
    };
  }

  if (moment === 'ingreso') {
    if (!eligibilityComplete) {
      return {
        tone: 'info',
        headline: 'Completa edad y confirmación del perfil de PA en el paso Candidatura.',
        aumentar: '—',
        proximoControl: '—',
        derivar: [],
        registrar: [],
      };
    }
    if (!eligible) {
      return {
        tone: 'warn',
        headline: 'No es candidato al algoritmo HEARTS. Ingresa igual a PSCV/ECICEP por su diagnóstico de HTA (GES), con manejo individualizado.',
        aumentar: 'No aplica la escalera HEARTS: tratamiento individualizado por médico',
        proximoControl: 'Según indicación médica del PSCV',
        derivar: ['Médico PSCV — plan individualizado', 'Nutricionista y QF según protocolo local'],
        registrar: ['Constancia GES firmada', 'Ingreso PSCV o ECICEP en Rayen', 'Motivo de exclusión HEARTS en ficha'],
      };
    }
    const pendientes = [];
    if (examCount < EXAMS.length) pendientes.push(`exámenes (${examCount}/${EXAMS.length})`);
    if (entryCount < ENTRY_ITEMS.length) pendientes.push(`registro de ingreso (${entryCount}/${ENTRY_ITEMS.length})`);
    return {
      tone: 'ok',
      headline: pendientes.length
        ? `Candidato HEARTS: iniciar etapa 1. Pendiente: ${pendientes.join(' y ')}.`
        : 'Candidato HEARTS: iniciar etapa 1 (losartán 50 mg + amlodipino 5 mg).',
      aumentar: 'Iniciar etapa 1 — receta HEARTS separada de la receta crónica',
      proximoControl: '2–4 semanas — PA con TENS capacitado',
      derivar: ['Nutricionista — dentro del primer mes', 'Químico farmacéutico — dentro del primer mes', 'TENS PSCV — calendario de controles'],
      registrar: ['Constancia GES', 'Ingreso PSCV/ECICEP', 'Activar HEARTS en formulario CV integral', 'Receta etapa 1 y acuerdos de estilo de vida'],
    };
  }

  if (!hasPressure) {
    return {
      tone: 'info',
      headline: `Control ${controlNumber}: registra la PA estandarizada para obtener la conducta.`,
      aumentar: '—',
      proximoControl: '—',
      derivar: [],
      registrar: ['PA del control en pestaña HEARTS'],
    };
  }

  const paLabel = `${systolic}/${diastolic} mmHg`;
  const moriskyPending = morisky === null ? ['Aplicar Morisky MMAS-8 en este control'] : [];

  if (lowAdherence) {
    return {
      tone: 'danger',
      headline: `Control ${controlNumber} — PA ${paLabel}: adherencia baja (Morisky <6). Reforzar adherencia antes de intensificar.`,
      aumentar: `No aumentar todavía — mantener etapa ${stage.number} y corregir adherencia primero`,
      proximoControl: '2–4 semanas — PA con TENS',
      derivar: ['Químico farmacéutico — evaluación de adherencia y educación farmacoterapéutica'],
      registrar: ['PA y Morisky en pestaña HEARTS', 'Derivación a QF', 'Citación al próximo control'],
    };
  }

  if (atGoal) {
    if (controlNumber >= 4) {
      return {
        tone: 'ok',
        headline: `Control ${controlNumber} — PA ${paLabel} en meta con al menos 4 controles: cerrar la ruta HEARTS compensado.`,
        aumentar: `No — mantener etapa ${stage.number}`,
        proximoControl: 'Control habitual PSCV (propuesta Bulnes: control de cierre a 8 semanas)',
        derivar: ['Continuidad en PSCV o ECICEP — médico/enfermera según calendario del programa'],
        registrar: [...moriskyPending, 'Cierre HEARTS compensado en formulario CV integral', 'PA de salida y receta de mantención'],
      };
    }
    return {
      tone: 'ok',
      headline: `Control ${controlNumber} — PA ${paLabel} en meta: mantener etapa ${stage.number} y completar los 4 controles.`,
      aumentar: `No — mantener etapa ${stage.number}`,
      proximoControl: `2–4 semanas — control ${controlNumber + 1} con TENS`,
      derivar: midAdherence ? ['QF — apoyo por adherencia intermedia (Anexo 4)'] : ['No requiere derivación'],
      registrar: [...moriskyPending, 'PA y Morisky en pestaña HEARTS', 'Citación al próximo control'],
    };
  }

  if (stage.number < 4) {
    const next = STAGES[stage.number];
    return {
      tone: 'warn',
      headline: `Control ${controlNumber} — PA ${paLabel} fuera de meta: aumentar a etapa ${next.number}.`,
      aumentar: `Sí — etapa ${next.number}: ${next.medicines.join(' + ')} (indica médico, enfermera/o o QF autorizado)`,
      proximoControl: next.number === 4
        ? '2–4 semanas con TENS (propuesta Bulnes: 4–6 semanas tras pasar a etapa 4)'
        : '2–4 semanas — PA con TENS',
      derivar: midAdherence
        ? ['QF — apoyo por adherencia intermedia (Anexo 4)']
        : ['Profesional autorizado para intensificar, si el control lo realiza TENS'],
      registrar: [...moriskyPending, `Nueva receta HEARTS etapa ${next.number}`, 'PA y Morisky en pestaña HEARTS', 'Citación al próximo control'],
    };
  }

  return {
    tone: 'danger',
    headline: `Control ${controlNumber} — PA ${paLabel} fuera de meta en etapa 4: derivar a poli de descompensados.`,
    aumentar: 'No — la escalera HEARTS termina en etapa 4',
    proximoControl: '2–4 semanas — médico en poli de descompensados',
    derivar: ['Poli descompensados (médico)', 'Nivel secundario si persiste fuera de meta pese a intervenciones'],
    registrar: [...moriskyPending, 'Derivación y motivo en ficha Rayen', 'PA y Morisky en pestaña HEARTS'],
  };
}

const CONDUCT_TONES = {
  ok: 'border-emerald-300 bg-emerald-50',
  warn: 'border-amber-300 bg-amber-50',
  danger: 'border-rose-300 bg-rose-50',
  info: 'border-slate-300 bg-slate-50',
};

function ConductCard({ conduct }) {
  const rows = [
    { icon: ArrowUpCircle, label: '¿Aumentar tratamiento?', value: conduct.aumentar },
    { icon: CalendarClock, label: 'Próximo control', value: conduct.proximoControl },
    { icon: Send, label: 'Derivar a', value: conduct.derivar.length ? conduct.derivar : ['—'] },
    { icon: ClipboardList, label: 'Registrar', value: conduct.registrar.length ? conduct.registrar : ['—'] },
  ];
  return (
    <div className={`rounded-2xl border-2 p-4 ${CONDUCT_TONES[conduct.tone]}`}>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Conducta según el flujo</p>
      <p className="mt-1.5 font-bold leading-relaxed text-slate-900">{conduct.headline}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map(row => {
          const Icon = row.icon;
          const values = Array.isArray(row.value) ? row.value : [row.value];
          return (
            <div key={row.label} className="rounded-xl bg-white/80 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <Icon className="h-3.5 w-3.5" /> {row.label}
              </p>
              <ul className="space-y-1">
                {values.map(value => (
                  <li key={value} className="text-sm font-medium leading-snug text-slate-800">{value}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToggleRow({ checked, label, onChange, tone = 'slate' }) {
  const checkedClass = tone === 'danger'
    ? 'border-rose-300 bg-rose-50 text-rose-900'
    : 'border-emerald-300 bg-emerald-50 text-emerald-900';

  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
        checked ? checkedClass : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
      }`}
      aria-pressed={checked}
    >
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
        checked ? (tone === 'danger' ? 'border-rose-500 bg-rose-500' : 'border-emerald-500 bg-emerald-500') : 'border-slate-300 bg-white'
      }`}>
        {checked && <Check className="h-3.5 w-3.5 text-white" />}
      </span>
      <span className="leading-relaxed">{label}</span>
    </button>
  );
}

function SectionHeading({ icon: Icon, title, description }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <h3 className="font-bold text-slate-900">{title}</h3>
        {description && <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{description}</p>}
      </div>
    </div>
  );
}

function ProtocolBadge({ children, tone = 'local' }) {
  const classes = tone === 'network'
    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
    : tone === 'proposal'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${classes}`}>
      {children}
    </span>
  );
}

export function HeartsTreatmentLadder() {
  return (
    <div className="overflow-hidden rounded-2xl border border-teal-200 bg-gradient-to-br from-white to-teal-50 shadow-sm">
      <div className="border-b border-teal-100 px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-900">Escalera de intensificación HEARTS</h3>
            <p className="mt-1 text-sm text-slate-600">Cada escalón indica qué hacer si el paciente sigue fuera de meta en el control.</p>
          </div>
          <ProtocolBadge tone="network">Ordinario SSÑ 2026</ProtocolBadge>
        </div>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-4 md:items-end md:p-6">
        {STAGES.map((stage, index) => (
          <div
            key={stage.number}
            className="relative rounded-2xl border border-teal-200 bg-white p-4 shadow-sm"
            style={{ minHeight: `${180 + index * 34}px` }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-700 text-sm font-black text-white">
                {stage.number}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal-700">Etapa {stage.number}</span>
            </div>
            <p className="mb-3 text-sm font-bold text-slate-900">{stage.label}</p>
            <ul className="space-y-2">
              {stage.medicines.map(medicine => (
                <li key={medicine} className="flex items-start gap-2 text-sm leading-snug text-slate-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                  {medicine}
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-slate-100 pt-2 text-xs leading-snug text-slate-600">
              <strong className="text-rose-700">Fuera de meta:</strong> {stage.escalation}
            </p>
            {index < STAGES.length - 1 && (
              <ArrowRight className="absolute -right-5 top-1/2 z-10 hidden h-5 w-5 text-teal-500 md:block" />
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-3 border-t border-teal-100 bg-white/70 p-4 text-sm md:grid-cols-2 md:p-5">
        <div className="rounded-xl bg-teal-50 p-3 text-teal-900">
          <strong>Control:</strong> PA con técnica estandarizada por TENS cada 2–4 semanas; aplicar Morisky MMAS-8 en cada control.
        </div>
        <div className="rounded-xl bg-indigo-50 p-3 text-indigo-900">
          <strong>Si logra meta:</strong> mantener etapa, completar al menos 4 controles y cerrar compensado a control habitual PSCV.
        </div>
        <div className="rounded-xl bg-rose-50 p-3 text-rose-900">
          <strong>Fuera de meta tras etapa 4:</strong> médico en poli descompensados en 2–4 semanas; nivel secundario si persiste.
        </div>
        <div className="rounded-xl bg-slate-100 p-3 text-slate-800">
          <strong>Registrar siempre:</strong> PA, Morisky, etapa y receta HEARTS en el formulario CV integral (pestaña HEARTS).
        </div>
      </div>
    </div>
  );
}

export default function HeartsPathway() {
  const [activeStep, setActiveStep] = useState(0);
  const [state, setState] = useState(emptyState);
  const [copied, setCopied] = useState(false);
  const [moriskyOpen, setMoriskyOpen] = useState(false);

  const age = Number(state.age);
  const validAge = Number.isFinite(age) && age >= 15 && age < 80;
  const hasExclusion = Object.values(state.exclusions).some(Boolean);
  const eligibilityComplete = state.age !== '' && state.profileConfirmed;
  const eligible = eligibilityComplete && validAge && !hasExclusion;
  const examCount = Object.values(state.exams).filter(Boolean).length;
  const entryCount = Object.values(state.entry).filter(Boolean).length;
  const stage = STAGES[state.stage - 1];
  const systolic = Number(state.systolic);
  const diastolic = Number(state.diastolic);
  const hasPressure = Number.isFinite(systolic) && systolic > 0 && Number.isFinite(diastolic) && diastolic > 0;
  const atGoal = hasPressure && systolic < 140 && diastolic < 90;
  const morisky = state.morisky === '' ? null : Number(state.morisky);
  const lowAdherence = morisky !== null && morisky < 6;
  const midAdherence = morisky !== null && morisky >= 6 && morisky < 8;
  const momentMeta = MOMENTS.find(item => item.id === state.moment) || null;
  const controlNumber = momentMeta ? momentMeta.control : 0;
  const isControl = controlNumber > 0;

  const conduct = useMemo(() => buildConduct({
    moment: state.moment,
    controlNumber,
    eligibilityComplete,
    eligible,
    examCount,
    entryCount,
    stage,
    hasPressure,
    atGoal,
    systolic,
    diastolic,
    morisky,
    lowAdherence,
    midAdherence,
  }), [state.moment, controlNumber, eligibilityComplete, eligible, examCount, entryCount, stage, hasPressure, atGoal, systolic, diastolic, morisky, lowAdherence, midAdherence]);

  const summaryLines = useMemo(() => [
    'RUTA HEARTS — RESUMEN DE APOYO',
    `Momento: ${momentMeta ? momentMeta.label : 'no seleccionado'}`,
    `Candidatura HEARTS: ${!eligibilityComplete ? 'pendiente' : eligible ? 'cumple criterios registrados' : 'no cumple (continúa en PSCV/ECICEP individualizado)'}`,
    `Batería inicial: ${examCount}/${EXAMS.length}`,
    `Ingreso / GES: ${entryCount}/${ENTRY_ITEMS.length}`,
    `Etapa actual: ${stage.number} — ${stage.medicines.join(' + ')}`,
    `Pauta verificada: ${state.treatmentRecorded ? 'sí' : 'no'}`,
    `PA de control: ${hasPressure ? `${systolic}/${diastolic} mmHg (${atGoal ? 'en meta del flujo' : 'fuera de meta del flujo'})` : 'no registrada'}`,
    `Morisky MMAS-8: ${morisky === null ? 'no registrado' : `${morisky}/8${lowAdherence ? ' — baja adherencia' : midAdherence ? ' — adherencia intermedia' : ' — alta adherencia'}`}`,
    `Conducta: ${conduct.headline}`,
    `Aumentar tratamiento: ${conduct.aumentar}`,
    `Próximo control: ${conduct.proximoControl}`,
    `Derivar: ${conduct.derivar.length ? conduct.derivar.join('; ') : '—'}`,
    `Registrar: ${conduct.registrar.length ? conduct.registrar.join('; ') : '—'}`,
  ], [momentMeta, eligibilityComplete, eligible, examCount, entryCount, stage, state.treatmentRecorded, hasPressure, systolic, diastolic, atGoal, morisky, lowAdherence, midAdherence, conduct]);

  const patchMap = (key, item, value) => {
    setState(current => ({ ...current, [key]: { ...current[key], [item]: value } }));
  };

  const setAllExams = value => {
    setState(current => ({ ...current, exams: value ? Object.fromEntries(EXAMS.map(exam => [exam, true])) : {} }));
  };

  const selectMoment = momentId => {
    setState(current => ({ ...current, moment: momentId }));
    const meta = MOMENTS.find(item => item.id === momentId);
    setActiveStep(meta && meta.control > 0 ? 4 : 0);
  };

  const reset = () => {
    setState(emptyState);
    setActiveStep(0);
    setCopied(false);
    setMoriskyOpen(false);
  };

  const copySummary = async () => {
    await navigator.clipboard.writeText(summaryLines.join('\n'));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const stepComplete = [
    eligibilityComplete,
    examCount === EXAMS.length,
    entryCount === ENTRY_ITEMS.length,
    state.treatmentRecorded,
    isControl && hasPressure && state.morisky !== '',
    false,
  ];

  const moriskyIsInteger = morisky === null || Number.isInteger(morisky);

  return (
    <div className="overflow-hidden rounded-2xl border border-teal-200 bg-white shadow-sm">
      <div className="border-b border-teal-100 bg-gradient-to-r from-teal-700 to-cyan-700 px-5 py-5 text-white md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest">Ruta interactiva</span>
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest">Ordinario SSÑ 2026</span>
            </div>
            <h3 className="text-xl font-black">Ingreso, intensificación y salida de HEARTS</h3>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-teal-50">
              Guía paso a paso sin datos identificatorios. La decisión y prescripción corresponden al profesional autorizado.
            </p>
          </div>
          <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20">
            <RefreshCw className="h-4 w-4" /> Reiniciar
          </button>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-500">¿En qué momento estás?</span>
          {MOMENTS.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectMoment(item.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                state.moment === item.id
                  ? 'border-teal-600 bg-teal-600 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-teal-400'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="border-b border-slate-200 bg-slate-50 p-3 md:border-b-0 md:border-r">
          <div className="flex gap-2 overflow-x-auto md:flex-col">
            {STEP_META.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  className={`flex min-w-max items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors md:w-full ${
                    activeStep === index ? 'bg-white text-teal-800 shadow-sm ring-1 ring-teal-200' : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${stepComplete[index] ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                    {stepComplete[index] ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span>{index + 1}. {item.title}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="min-h-[500px] p-5 md:p-6">
          {activeStep === 0 && (
            <div>
              <SectionHeading icon={UserCheck} title="¿Es candidato al algoritmo HEARTS?" description="Estos criterios definen la candidatura a la escalera HEARTS, no el ingreso a PSCV." />
              <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 p-3.5 text-sm leading-relaxed text-sky-900">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                <span>
                  <strong>Ingreso a PSCV ≠ candidatura HEARTS.</strong> Toda persona con HTA confirmada ingresa a PSCV o ECICEP
                  con su constancia GES, cumpla o no estos criterios. Aquí solo se define si además puede usar la escalera
                  farmacológica estandarizada HEARTS.
                </span>
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-slate-700">
                    Edad
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={state.age}
                      onChange={event => setState(current => ({ ...current, age: event.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                      placeholder="Años"
                    />
                  </label>
                  <ToggleRow
                    checked={state.profileConfirmed}
                    onChange={value => setState(current => ({ ...current, profileConfirmed: value }))}
                    label="Perfil confirmado: promedio PA ≥140/90 mmHg, en días distintos y dentro de 15 días"
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Marcar si está presente (exclusiones HEARTS)</p>
                  <div className="space-y-2">
                    {EXCLUSIONS.map(([key, label]) => (
                      <ToggleRow key={key} tone="danger" checked={Boolean(state.exclusions[key])} onChange={value => patchMap('exclusions', key, value)} label={label} />
                    ))}
                  </div>
                </div>
              </div>
              {eligibilityComplete && (
                <div className={`mt-5 rounded-xl border p-4 ${eligible ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
                  <p className="font-bold">{eligible ? 'Cumple criterios registrados para usar la escalera HEARTS.' : 'No cumple criterios registrados para la escalera HEARTS.'}</p>
                  {!eligible && <p className="mt-1 text-sm">Ingresa igual a PSCV o ECICEP por su diagnóstico de HTA (GES); el tratamiento lo individualiza el médico, sin aplicar esta escalera.</p>}
                </div>
              )}
            </div>
          )}

          {activeStep === 1 && (
            <div>
              <SectionHeading icon={FlaskConical} title="Batería general e inicial" description="Exámenes definidos en el protocolo PSCV HCSF Bulnes 2023 para HTA." />
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-700">Completados</span>
                  <span className="rounded-full bg-teal-100 px-3 py-1 text-sm font-black text-teal-800">{examCount}/{EXAMS.length}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAllExams(true)}
                    className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-100"
                  >
                    Marcar todos
                  </button>
                  {examCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setAllExams(false)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {EXAMS.map(exam => (
                  <ToggleRow key={exam} checked={Boolean(state.exams[exam])} onChange={value => patchMap('exams', exam, value)} label={exam} />
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Si se inicia IECA/ARA II junto con espironolactona, el protocolo local exige control de potasio.
              </div>
            </div>
          )}

          {activeStep === 2 && (
            <div>
              <SectionHeading icon={FileSignature} title="Confirmación, GES e ingreso" description="Acciones que deben quedar registradas antes de completar el ingreso HEARTS." />
              <div className="space-y-2">
                {ENTRY_ITEMS.map(([key, label]) => (
                  <ToggleRow key={key} checked={Boolean(state.entry[key])} onChange={value => patchMap('entry', key, value)} label={label} />
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <ProtocolBadge>Protocolo local</ProtocolBadge>
                <ProtocolBadge tone="network">Flujo SSÑ</ProtocolBadge>
                <span className="text-xs leading-7 text-slate-500">Nutrición y QF dentro del primer mes según protocolo PSCV local.</span>
              </div>
            </div>
          )}

          {activeStep === 3 && (
            <div>
              <SectionHeading icon={HeartPulse} title="Escalón farmacológico actual" description="Seleccionar la etapa indicada y verificar que la receta HEARTS esté separada de la receta crónica." />
              <div className="grid gap-3 sm:grid-cols-2">
                {STAGES.map(item => (
                  <button
                    key={item.number}
                    type="button"
                    onClick={() => setState(current => ({ ...current, stage: item.number, treatmentRecorded: false }))}
                    className={`rounded-2xl border p-4 text-left transition-all ${state.stage === item.number ? 'border-teal-400 bg-teal-50 ring-2 ring-teal-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-700 text-sm font-black text-white">{item.number}</span>
                      <strong className="text-sm text-slate-900">{item.label}</strong>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700">{item.medicines.join(' + ')}</p>
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <ToggleRow
                  checked={state.treatmentRecorded}
                  onChange={value => setState(current => ({ ...current, treatmentRecorded: value }))}
                  label={`Pauta de etapa ${stage.number} verificada, prescrita por profesional autorizado y registrada en HEARTS`}
                />
              </div>
            </div>
          )}

          {activeStep === 4 && (
            <div>
              <SectionHeading icon={Activity} title="Control HEARTS y conducta" description="Indica el número de control, la PA estandarizada y la adherencia: la conducta se arma sola." />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm font-semibold text-slate-700">N° de control
                  <select
                    value={state.moment}
                    onChange={event => setState(current => ({ ...current, moment: event.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  >
                    <option value="">Seleccionar…</option>
                    {MOMENTS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </label>
                <label className="text-sm font-semibold text-slate-700">PAS
                  <input type="number" value={state.systolic} onChange={event => setState(current => ({ ...current, systolic: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" placeholder="mmHg" />
                </label>
                <label className="text-sm font-semibold text-slate-700">PAD
                  <input type="number" value={state.diastolic} onChange={event => setState(current => ({ ...current, diastolic: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" placeholder="mmHg" />
                </label>
                <div className="text-sm font-semibold text-slate-700">Morisky MMAS-8
                  <select
                    value={state.morisky}
                    onChange={event => setState(current => ({ ...current, morisky: event.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  >
                    <option value="">Sin aplicar</option>
                    {!moriskyIsInteger && <option value={state.morisky}>{morisky}/8 (cuestionario)</option>}
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(value => <option key={value} value={value}>{value}/8</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setMoriskyOpen(true)}
                    className="mt-1.5 w-full rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-100"
                  >
                    Aplicar cuestionario
                  </button>
                </div>
              </div>
              <div className="mt-5">
                <ConductCard conduct={conduct} />
              </div>
            </div>
          )}

          {activeStep === 5 && (
            <div>
              <SectionHeading icon={ClipboardCheck} title="Resumen de la ruta" description="Síntesis para apoyar el registro. Revisar clínicamente antes de copiar." />
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="space-y-2">
                  {summaryLines.slice(1).map(line => {
                    const [label, ...rest] = line.split(':');
                    return (
                      <div key={line} className="grid gap-1 border-b border-slate-200 pb-2 last:border-0 last:pb-0 sm:grid-cols-[190px_1fr]">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
                        <span className="text-sm font-medium leading-relaxed text-slate-800">{rest.join(':').trim()}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={copySummary} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Resumen copiado' : 'Copiar resumen'}
                </button>
                <button type="button" onClick={() => setActiveStep(0)} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Revisar desde el inicio
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 flex items-start gap-2 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            Meta operativa mostrada: PA &lt;140/90 mmHg. Individualizar metas, contraindicaciones y decisiones clínicas; no intensificar solo por este asistente.
          </div>
        </div>
      </div>

      {moriskyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setMoriskyOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <MoriskyAssessment
              onClose={() => setMoriskyOpen(false)}
              onApply={score => {
                setState(current => ({ ...current, morisky: String(score) }));
                setMoriskyOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
