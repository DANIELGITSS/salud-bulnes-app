import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpCircle,
  CalendarClock,
  Check,
  ClipboardCheck,
  ClipboardList,
  Copy,
  FileSignature,
  FlaskConical,
  HeartPulse,
  Info,
  MinusCircle,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Send,
  Stethoscope,
  UserCheck,
} from 'lucide-react';
import { MoriskyAssessment } from '@/components/calculators/MoriskyCalculator';

const DRUG_STYLES = {
  'ARA II': { chip: 'bg-indigo-100 text-indigo-800', dot: 'bg-indigo-500' },
  'Bloqueador de calcio': { chip: 'bg-teal-100 text-teal-800', dot: 'bg-teal-500' },
  Tiazida: { chip: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
};

const STAGES = [
  {
    number: 1,
    label: 'Inicio',
    medicines: [
      { name: 'Losartán', dose: '50 mg', freq: 'cada 24 h', klass: 'ARA II' },
      { name: 'Amlodipino', dose: '5 mg', freq: 'cada 24 h', klass: 'Bloqueador de calcio' },
    ],
    escalation: 'Subir a etapa 2 y controlar en 2–4 semanas.',
  },
  {
    number: 2,
    label: 'Primera intensificación',
    medicines: [
      { name: 'Losartán', dose: '100 mg', freq: 'cada 24 h', klass: 'ARA II', note: '2 comprimidos de 50 mg' },
      { name: 'Amlodipino', dose: '10 mg', freq: 'cada 24 h', klass: 'Bloqueador de calcio' },
    ],
    escalation: 'Subir a etapa 3 y controlar en 2–4 semanas.',
  },
  {
    number: 3,
    label: 'Segunda intensificación',
    medicines: [
      { name: 'Losartán', dose: '100 mg', freq: 'cada 24 h', klass: 'ARA II', note: '2 comprimidos de 50 mg' },
      { name: 'Amlodipino', dose: '10 mg', freq: 'cada 24 h', klass: 'Bloqueador de calcio' },
      { name: 'Hidroclorotiazida', dose: '25 mg', freq: 'cada 24 h', klass: 'Tiazida' },
    ],
    escalation: 'Subir a etapa 4 y controlar en 2–4 semanas (propuesta Bulnes: 4–6 semanas).',
  },
  {
    number: 4,
    label: 'Tercera intensificación',
    medicines: [
      { name: 'Losartán', dose: '100 mg', freq: 'cada 24 h', klass: 'ARA II', note: '2 comprimidos de 50 mg' },
      { name: 'Amlodipino', dose: '10 mg', freq: 'cada 24 h', klass: 'Bloqueador de calcio' },
      { name: 'Hidroclorotiazida', dose: '50 mg', freq: 'cada 24 h', klass: 'Tiazida' },
    ],
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
  { id: 'ingreso', label: 'Ingreso', hint: 'Primera atención: confirmación, GES y etapa 1', control: 0 },
  { id: 'c1', label: 'Control 1', hint: '2–4 semanas después del ingreso', control: 1 },
  { id: 'c2', label: 'Control 2', hint: 'Segundo control HEARTS', control: 2 },
  { id: 'c3', label: 'Control 3', hint: 'Tercer control HEARTS', control: 3 },
  { id: 'c4', label: 'Control 4 o más', hint: 'Permite cerrar la ruta si está en meta', control: 4 },
];

const ARRIVALS = [
  { id: 'intensificado', label: 'Viene recién intensificado', hint: 'En el control anterior le subieron de etapa' },
  { id: 'estable', label: 'Viene con la misma etapa', hint: 'No hubo cambios desde el control anterior' },
];

const INGRESO_STEPS = [
  { key: 'inicio', title: 'Inicio', icon: PlayCircle },
  { key: 'candidatura', title: 'Candidatura', icon: UserCheck },
  { key: 'examenes', title: 'Exámenes', icon: FlaskConical },
  { key: 'ges', title: 'Ingreso y GES', icon: FileSignature },
  { key: 'tratamiento', title: 'Tratamiento', icon: HeartPulse },
  { key: 'resumen', title: 'Resumen', icon: ClipboardCheck },
];

const CONTROL_STEPS = [
  { key: 'inicio', title: 'Inicio', icon: PlayCircle },
  { key: 'control', title: 'Control y conducta', icon: Activity },
  { key: 'resumen', title: 'Resumen', icon: ClipboardCheck },
];

const emptyState = {
  moment: '',
  arrival: '',
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

// Motor de conducta: traduce momento + etapa + PA + adherencia en acciones
// concretas — subir o no la dosis, a quién derivar, cuándo citar y qué registrar.
function buildConduct(ctx) {
  const {
    moment, controlNumber, arrival, eligibilityComplete, eligible, examCount, entryCount,
    stage, hasPressure, atGoal, systolic, diastolic, morisky, lowAdherence, midAdherence,
  } = ctx;

  const pending = {
    tone: 'info',
    headline: '',
    aumentar: { answer: '—', decision: 'espera', title: 'Sin datos suficientes', stage: null, note: '' },
    proximoControl: '—',
    actividad: '—',
    derivar: [],
    registrar: [],
  };

  if (!moment) return { ...pending, headline: 'Elige el momento de atención para obtener la conducta.' };

  if (moment === 'ingreso') {
    if (!eligibilityComplete) return { ...pending, headline: 'Completa edad y confirmación del perfil de PA en Candidatura.' };

    if (!eligible) {
      return {
        tone: 'warn',
        headline: 'No es candidato al algoritmo HEARTS. Ingresa igual a PSCV o ECICEP por su HTA confirmada, con tratamiento individualizado.',
        aumentar: {
          answer: 'No aplica',
          decision: 'espera',
          title: 'La escalera HEARTS no se usa en este paciente',
          stage: null,
          note: 'El médico define el esquema individualizado en el PSCV.',
        },
        proximoControl: 'Según indicación médica del PSCV',
        actividad: 'Consulta médica de ingreso a PSCV o ECICEP',
        derivar: [
          { to: 'Médico PSCV', detail: 'define el plan farmacológico individualizado' },
          { to: 'Nutricionista y químico farmacéutico', detail: 'dentro del primer mes, según protocolo local' },
        ],
        registrar: ['Constancia GES firmada', 'Ingreso PSCV o ECICEP en Rayen', 'Motivo de exclusión HEARTS en la ficha'],
      };
    }

    const faltantes = [];
    if (examCount < EXAMS.length) faltantes.push(`exámenes ${examCount}/${EXAMS.length}`);
    if (entryCount < ENTRY_ITEMS.length) faltantes.push(`registro de ingreso ${entryCount}/${ENTRY_ITEMS.length}`);
    return {
      tone: 'ok',
      headline: faltantes.length
        ? `Candidato a HEARTS: iniciar etapa 1. Queda pendiente ${faltantes.join(' y ')}.`
        : 'Candidato a HEARTS: iniciar etapa 1 con receta separada de la receta crónica.',
      aumentar: {
        answer: 'Iniciar',
        decision: 'iniciar',
        title: 'Etapa 1 · Inicio',
        stage: STAGES[0],
        note: 'Receta HEARTS separada de la receta crónica.',
      },
      proximoControl: '2–4 semanas — control de PA con TENS capacitado',
      actividad: 'Ingreso cardiovascular + activación HEARTS en el formulario CV integral',
      derivar: [
        { to: 'Nutricionista', detail: 'dentro del primer mes' },
        { to: 'Químico farmacéutico', detail: 'dentro del primer mes' },
        { to: 'TENS PSCV', detail: 'agenda los controles de PA cada 2–4 semanas' },
      ],
      registrar: ['Constancia GES', 'Ingreso PSCV o ECICEP', 'Receta HEARTS etapa 1', 'Acuerdos de estilo de vida'],
    };
  }

  if (!hasPressure) {
    return { ...pending, headline: `Control ${controlNumber}: registra la PA estandarizada para obtener la conducta.` };
  }

  const paLabel = `${systolic}/${diastolic} mmHg`;
  const moriskyPending = morisky === null ? ['Aplicar Morisky MMAS-8 en este control'] : [];

  if (lowAdherence) {
    return {
      tone: 'danger',
      headline: `Control ${controlNumber} — PA ${paLabel} con adherencia baja (Morisky <6): corregir adherencia antes de subir la dosis.`,
      aumentar: {
        answer: 'Todavía no',
        decision: 'espera',
        title: `Mantener etapa ${stage.number} · ${stage.label}`,
        stage,
        note: 'Corregir la adherencia antes de subir la dosis.',
      },
      proximoControl: '2–4 semanas — PA con TENS',
      actividad: 'Control cardiovascular HEARTS por TENS + consulta de químico farmacéutico',
      derivar: [{ to: 'Químico farmacéutico', detail: 'evaluación de adherencia y educación farmacoterapéutica' }],
      registrar: ['PA y Morisky en la pestaña HEARTS', 'Derivación a QF', 'Citación al próximo control'],
    };
  }

  if (atGoal) {
    const logroPost = arrival === 'intensificado' ? ' La meta se logró tras la última intensificación.' : '';
    if (controlNumber >= 4) {
      return {
        tone: 'ok',
        headline: `Control ${controlNumber} — PA ${paLabel} en meta con 4 controles cumplidos: cerrar la ruta HEARTS compensado.${logroPost}`,
        aumentar: {
          answer: 'No',
          decision: 'mantener',
          title: `Mantener etapa ${stage.number} · ${stage.label}`,
          stage,
          note: 'Queda como esquema de continuidad al cerrar la ruta.',
        },
        proximoControl: 'Control habitual del PSCV (propuesta Bulnes: cierre a 8 semanas)',
        actividad: 'Control HEARTS de cierre + reingreso al calendario habitual del PSCV',
        derivar: [{ to: 'Continuidad en PSCV o ECICEP', detail: 'según calendario del programa' }],
        registrar: [...moriskyPending, 'Cierre HEARTS compensado en el formulario CV integral', 'PA de salida y receta de mantención'],
      };
    }
    return {
      tone: 'ok',
      headline: `Control ${controlNumber} — PA ${paLabel} en meta: mantener etapa ${stage.number} y completar los 4 controles.${logroPost}`,
      aumentar: {
        answer: 'No',
        decision: 'mantener',
        title: `Mantener etapa ${stage.number} · ${stage.label}`,
        stage,
        note: 'Continuar sin cambios hasta completar los 4 controles.',
      },
      proximoControl: `2–4 semanas — control ${controlNumber + 1} con TENS`,
      actividad: 'Control cardiovascular HEARTS por TENS capacitado',
      derivar: midAdherence
        ? [{ to: 'Químico farmacéutico', detail: 'adherencia intermedia (6–7): apoyo del Anexo 4' }]
        : [{ to: 'Sin derivación', detail: 'continúa con TENS' }],
      registrar: [...moriskyPending, 'PA y Morisky en la pestaña HEARTS', 'Citación al próximo control'],
    };
  }

  if (stage.number < 4) {
    const next = STAGES[stage.number];
    return {
      tone: 'warn',
      headline: `Control ${controlNumber} — PA ${paLabel} fuera de meta: intensificar a etapa ${next.number}.`,
      aumentar: {
        answer: 'Sí',
        decision: 'subir',
        title: `Subir a etapa ${next.number} · ${next.label}`,
        stage: next,
        note: 'La indica el profesional autorizado: médico, enfermera/o o químico farmacéutico.',
      },
      proximoControl: next.number === 4
        ? '2–4 semanas con TENS (propuesta Bulnes: 4–6 semanas al pasar a etapa 4)'
        : '2–4 semanas — PA con TENS',
      actividad: 'Control cardiovascular HEARTS + atención del profesional autorizado que intensifica',
      derivar: midAdherence
        ? [
          { to: 'Profesional autorizado', detail: 'médico, enfermera/o o QF indica la nueva etapa' },
          { to: 'Químico farmacéutico', detail: 'adherencia intermedia (6–7): apoyo del Anexo 4' },
        ]
        : [{ to: 'Profesional autorizado', detail: 'médico, enfermera/o o QF indica la nueva etapa' }],
      registrar: [...moriskyPending, `Nueva receta HEARTS etapa ${next.number}`, 'PA y Morisky en la pestaña HEARTS', 'Citación al próximo control'],
    };
  }

  return {
    tone: 'danger',
    headline: `Control ${controlNumber} — PA ${paLabel} fuera de meta en etapa 4: derivar a poli de descompensados.`,
    aumentar: {
      answer: 'No',
      decision: 'tope',
      title: 'La escalera HEARTS termina en la etapa 4',
      stage,
      note: 'Mantener el esquema y traspasar la decisión al médico de descompensados.',
    },
    proximoControl: '2–4 semanas — atención médica en poli de descompensados',
    actividad: 'Consulta médica en policlínico de descompensados',
    derivar: [
      { to: 'Poli de descompensados', detail: 'médico, dentro de 2–4 semanas' },
      { to: 'Nivel secundario', detail: 'si persiste fuera de meta pese a las intervenciones' },
    ],
    registrar: [...moriskyPending, 'Derivación y motivo en la ficha Rayen', 'PA y Morisky en la pestaña HEARTS'],
  };
}

// El color del panel responde a la decisión sobre el fármaco, no al tono general
// del control: subir es ámbar, mantener es verde, tope de escalera es rojo.
const DECISION_STYLES = {
  iniciar: { frame: 'border-teal-300', header: 'bg-teal-700', badge: 'bg-teal-700', icon: PlayCircle },
  subir: { frame: 'border-amber-400', header: 'bg-amber-600', badge: 'bg-amber-600', icon: ArrowUpCircle },
  mantener: { frame: 'border-emerald-300', header: 'bg-emerald-700', badge: 'bg-emerald-700', icon: MinusCircle },
  espera: { frame: 'border-slate-300', header: 'bg-slate-600', badge: 'bg-slate-600', icon: PauseCircle },
  tope: { frame: 'border-rose-300', header: 'bg-rose-700', badge: 'bg-rose-700', icon: AlertTriangle },
};

const CONDUCT_TONES = {
  ok: { card: 'border-emerald-300 bg-emerald-50', accent: 'text-emerald-800' },
  warn: { card: 'border-amber-300 bg-amber-50', accent: 'text-amber-800' },
  danger: { card: 'border-rose-300 bg-rose-50', accent: 'text-rose-800' },
  info: { card: 'border-slate-300 bg-slate-50', accent: 'text-slate-600' },
};

function MedicationList({ medicines, compact = false }) {
  return (
    <ul className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {medicines.map(medicine => {
        const style = DRUG_STYLES[medicine.klass] || DRUG_STYLES['ARA II'];
        return (
          <li key={medicine.name} className="flex items-start gap-2.5">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-1.5">
                <strong className="text-sm text-slate-900">{medicine.name}</strong>
                <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${style.chip}`}>{medicine.dose}</span>
                <span className="text-xs text-slate-500">{medicine.freq}</span>
              </span>
              {!compact && (
                <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                  {medicine.klass}{medicine.note ? ` · ${medicine.note}` : ''}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TreatmentPanel({ treatment }) {
  const style = DECISION_STYLES[treatment.decision] || DECISION_STYLES.espera;
  const Icon = style.icon;

  return (
    <div className={`overflow-hidden rounded-xl border-2 ${style.frame}`}>
      <div className={`flex flex-wrap items-center gap-2.5 px-3.5 py-2.5 ${style.header}`}>
        <Icon className="h-4 w-4 shrink-0 text-white" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-white/80">¿Aumentar tratamiento?</span>
        <span className="ml-auto rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-black uppercase tracking-wide text-white">
          {treatment.answer}
        </span>
      </div>

      <div className="bg-white px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {treatment.stage && (
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black text-white ${style.badge}`}>
              {treatment.stage.number}
            </span>
          )}
          <p className="text-sm font-bold text-slate-900">{treatment.title}</p>
        </div>

        {treatment.stage && (
          <div className="mt-2.5 rounded-lg bg-slate-50 px-3 py-2.5">
            <MedicationList medicines={treatment.stage.medicines} />
          </div>
        )}

        {treatment.note && <p className="mt-2 text-xs leading-snug text-slate-600">{treatment.note}</p>}
      </div>
    </div>
  );
}

function ConductCard({ conduct }) {
  const tone = CONDUCT_TONES[conduct.tone];
  const blocks = [
    { icon: CalendarClock, label: 'Próximo control', values: [conduct.proximoControl] },
    { icon: Stethoscope, label: 'Actividad a registrar', values: [conduct.actividad] },
    { icon: ClipboardList, label: 'Registrar', values: conduct.registrar.length ? conduct.registrar : ['—'] },
  ];

  return (
    <div className={`rounded-2xl border-2 p-4 ${tone.card}`}>
      <p className={`text-xs font-bold uppercase tracking-wider ${tone.accent}`}>Conducta según el flujo</p>
      <p className="mt-1.5 text-[15px] font-bold leading-relaxed text-slate-900">{conduct.headline}</p>

      <div className="mt-3.5">
        <TreatmentPanel treatment={conduct.aumentar} />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {blocks.map(block => {
          const Icon = block.icon;
          return (
            <div key={block.label} className="rounded-xl bg-white/85 p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <Icon className="h-3.5 w-3.5" /> {block.label}
              </p>
              <ul className="space-y-1">
                {block.values.map(value => (
                  <li key={value} className="text-sm font-medium leading-snug text-slate-800">{value}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {conduct.derivar.length > 0 && (
        <div className="mt-2 rounded-xl bg-white/85 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <Send className="h-3.5 w-3.5" /> Derivar a
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {conduct.derivar.map(item => (
              <div key={item.to} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-sm font-bold text-slate-900">{item.to}</p>
                <p className="text-xs leading-snug text-slate-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}
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

function ChoiceCard({ active, title, hint, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-3.5 text-left transition-all ${
        active ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-100' : 'border-slate-200 bg-white hover:border-teal-300'
      }`}
    >
      <p className={`text-sm font-bold ${active ? 'text-teal-900' : 'text-slate-900'}`}>{title}</p>
      <p className="mt-0.5 text-xs leading-snug text-slate-500">{hint}</p>
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

      <div className="grid gap-3 p-4 md:grid-cols-4 md:p-6">
        {STAGES.map((stage, index) => (
          <div key={stage.number} className="relative flex flex-col rounded-2xl border border-teal-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-700 text-sm font-black text-white">
                {stage.number}
              </span>
              <span className="text-sm font-bold text-slate-900">{stage.label}</span>
            </div>
            <MedicationList medicines={stage.medicines} />
            <p className="mt-auto border-t border-slate-100 pt-2.5 text-xs leading-snug text-slate-600">
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
          <strong>Control:</strong> PA con técnica estandarizada por TENS cada 2–4 semanas y Morisky MMAS-8 en cada control.
        </div>
        <div className="rounded-xl bg-indigo-50 p-3 text-indigo-900">
          <strong>Si logra meta:</strong> mantener etapa, completar al menos 4 controles y cerrar compensado al control habitual del PSCV.
        </div>
        <div className="rounded-xl bg-rose-50 p-3 text-rose-900">
          <strong>Fuera de meta tras etapa 4:</strong> médico en poli descompensados en 2–4 semanas; nivel secundario si persiste.
        </div>
        <div className="rounded-xl bg-slate-100 p-3 text-slate-800">
          <strong>Registrar siempre:</strong> PA, Morisky, etapa y receta HEARTS en el formulario cardiovascular integral.
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

  const momentMeta = MOMENTS.find(item => item.id === state.moment) || null;
  const controlNumber = momentMeta ? momentMeta.control : 0;
  const isControl = controlNumber > 0;
  const isIngreso = state.moment === 'ingreso';
  const steps = isControl ? CONTROL_STEPS : INGRESO_STEPS;
  const currentStep = steps[Math.min(activeStep, steps.length - 1)];

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

  const conduct = useMemo(() => buildConduct({
    moment: state.moment,
    controlNumber,
    arrival: state.arrival,
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
  }), [state.moment, controlNumber, state.arrival, eligibilityComplete, eligible, examCount, entryCount, stage, hasPressure, atGoal, systolic, diastolic, morisky, lowAdherence, midAdherence]);

  const summaryLines = useMemo(() => {
    const lines = [
      'RUTA HEARTS — RESUMEN DE APOYO',
      `Momento: ${momentMeta ? momentMeta.label : 'no seleccionado'}`,
    ];
    if (isControl) {
      const arrival = ARRIVALS.find(item => item.id === state.arrival);
      lines.push(`Llega: ${arrival ? arrival.label.toLowerCase() : 'no indicado'}`);
    }
    if (isIngreso) {
      lines.push(`Candidatura HEARTS: ${!eligibilityComplete ? 'pendiente' : eligible ? 'cumple criterios registrados' : 'no cumple — sigue en PSCV/ECICEP individualizado'}`);
      lines.push(`Batería inicial: ${examCount}/${EXAMS.length}`);
      lines.push(`Ingreso / GES: ${entryCount}/${ENTRY_ITEMS.length}`);
    }
    lines.push(`Etapa actual: ${stage.number} — ${stage.medicines.map(m => `${m.name} ${m.dose}`).join(' + ')}`);
    if (isControl) {
      lines.push(`PA de control: ${hasPressure ? `${systolic}/${diastolic} mmHg (${atGoal ? 'en meta del flujo' : 'fuera de meta del flujo'})` : 'no registrada'}`);
      lines.push(`Morisky MMAS-8: ${morisky === null ? 'no registrado' : `${morisky}/8${lowAdherence ? ' — baja adherencia' : midAdherence ? ' — adherencia intermedia' : ' — alta adherencia'}`}`);
    }
    const treatment = conduct.aumentar;
    const scheme = treatment.stage ? ` (${treatment.stage.medicines.map(m => `${m.name} ${m.dose}`).join(' + ')})` : '';
    lines.push(
      `Conducta: ${conduct.headline}`,
      `Aumentar tratamiento: ${treatment.answer} — ${treatment.title}${scheme}`,
      `Próximo control: ${conduct.proximoControl}`,
      `Actividad a registrar: ${conduct.actividad}`,
      `Derivar: ${conduct.derivar.length ? conduct.derivar.map(item => `${item.to} (${item.detail})`).join('; ') : '—'}`,
      `Registrar: ${conduct.registrar.length ? conduct.registrar.join('; ') : '—'}`,
    );
    return lines;
  }, [momentMeta, isControl, isIngreso, state.arrival, eligibilityComplete, eligible, examCount, entryCount, stage, hasPressure, systolic, diastolic, atGoal, morisky, lowAdherence, midAdherence, conduct]);

  const patchMap = (key, item, value) => {
    setState(current => ({ ...current, [key]: { ...current[key], [item]: value } }));
  };

  const setAllExams = value => {
    setState(current => ({ ...current, exams: value ? Object.fromEntries(EXAMS.map(exam => [exam, true])) : {} }));
  };

  const selectMoment = momentId => {
    setState(current => ({
      ...current,
      moment: momentId,
      arrival: momentId === 'ingreso' ? '' : current.arrival,
      stage: momentId === 'ingreso' ? 1 : current.stage,
    }));
    setActiveStep(0);
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

  const startComplete = Boolean(state.moment) && (isIngreso || Boolean(state.arrival));
  const stepComplete = {
    inicio: startComplete,
    candidatura: eligibilityComplete,
    examenes: examCount === EXAMS.length,
    ges: entryCount === ENTRY_ITEMS.length,
    tratamiento: state.treatmentRecorded,
    control: hasPressure && state.morisky !== '',
    resumen: false,
  };

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

      <div className="grid md:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="border-b border-slate-200 bg-slate-50 p-3 md:border-b-0 md:border-r">
          <div className="flex gap-2 overflow-x-auto md:flex-col">
            {steps.map((item, index) => {
              const Icon = item.icon;
              const done = stepComplete[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  className={`flex min-w-max items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors md:w-full ${
                    activeStep === index ? 'bg-white text-teal-800 shadow-sm ring-1 ring-teal-200' : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                    {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span>{index + 1}. {item.title}</span>
                </button>
              );
            })}
          </div>
          {isControl && (
            <p className="mt-3 hidden rounded-lg bg-white p-2.5 text-[11px] leading-snug text-slate-500 md:block">
              En control no se piden de nuevo los exámenes ni el ingreso GES: se asumen hechos al ingresar a HEARTS.
            </p>
          )}
        </nav>

        <div className="min-h-[500px] p-5 md:p-6">
          {currentStep.key === 'inicio' && (
            <div>
              <SectionHeading icon={PlayCircle} title="¿Desde dónde estás usando la ruta?" description="Con esto la herramienta te muestra solo lo que corresponde a este momento." />

              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Momento de atención</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {MOMENTS.map(item => (
                  <ChoiceCard key={item.id} active={state.moment === item.id} title={item.label} hint={item.hint} onClick={() => selectMoment(item.id)} />
                ))}
              </div>

              {isControl && (
                <>
                  <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-slate-500">¿Con qué tratamiento llega?</p>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {STAGES.map(item => (
                      <button
                        key={item.number}
                        type="button"
                        onClick={() => setState(current => ({ ...current, stage: item.number }))}
                        className={`rounded-2xl border p-4 text-left transition-all ${
                          state.stage === item.number ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-100' : 'border-slate-200 bg-white hover:border-teal-300'
                        }`}
                      >
                        <div className="mb-2.5 flex items-center gap-2.5">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-700 text-xs font-black text-white">{item.number}</span>
                          <strong className="text-sm text-slate-900">Etapa {item.number} · {item.label}</strong>
                        </div>
                        <MedicationList medicines={item.medicines} compact />
                      </button>
                    ))}
                  </div>

                  <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-slate-500">¿Cómo viene desde el control anterior?</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ARRIVALS.map(item => (
                      <ChoiceCard
                        key={item.id}
                        active={state.arrival === item.id}
                        title={item.label}
                        hint={item.hint}
                        onClick={() => setState(current => ({ ...current, arrival: item.id }))}
                      />
                    ))}
                  </div>
                </>
              )}

              {startComplete && (
                <button
                  type="button"
                  onClick={() => setActiveStep(1)}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800"
                >
                  Continuar a {steps[1].title} <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {currentStep.key === 'candidatura' && (
            <div>
              <SectionHeading icon={UserCheck} title="¿Es candidato al algoritmo HEARTS?" description="Estos criterios definen la candidatura a la escalera HEARTS, no el ingreso a PSCV." />
              <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 p-3.5 text-sm leading-relaxed text-sky-900">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                <span>
                  <strong>Ingreso a PSCV ≠ candidatura HEARTS.</strong> Toda persona con HTA confirmada ingresa a PSCV o ECICEP
                  con su constancia GES, cumpla o no estos criterios. Aquí solo se define si además puede usar la escalera
                  farmacológica estandarizada.
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
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Marcar si está presente (exclusiones)</p>
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
                  {!eligible && <p className="mt-1 text-sm">Ingresa igual a PSCV o ECICEP por su HTA (GES); el tratamiento lo individualiza el médico.</p>}
                </div>
              )}
            </div>
          )}

          {currentStep.key === 'examenes' && (
            <div>
              <SectionHeading icon={FlaskConical} title="Batería general e inicial" description="Exámenes del protocolo PSCV HCSF Bulnes 2023. Solo se piden al ingreso." />
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

          {currentStep.key === 'ges' && (
            <div>
              <SectionHeading icon={FileSignature} title="Confirmación, GES e ingreso" description="Acciones que deben quedar registradas para completar el ingreso." />
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

          {currentStep.key === 'tratamiento' && (
            <div>
              <SectionHeading icon={HeartPulse} title="Tratamiento de inicio" description="El ingreso a HEARTS parte siempre en la etapa 1; la receta va separada de la crónica." />
              <div className="overflow-hidden rounded-2xl border-2 border-teal-300 bg-teal-50">
                <div className="flex items-center gap-3 border-b border-teal-200 bg-white px-4 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-sm font-black text-white">1</span>
                  <div>
                    <p className="text-sm font-black text-slate-900">Etapa 1 · Inicio</p>
                    <p className="text-xs text-slate-500">Losartán + amlodipino en dosis de partida</p>
                  </div>
                </div>
                <div className="bg-white px-4 py-4">
                  <MedicationList medicines={STAGES[0].medicines} />
                </div>
              </div>
              <div className="mt-4">
                <ToggleRow
                  checked={state.treatmentRecorded}
                  onChange={value => setState(current => ({ ...current, treatmentRecorded: value }))}
                  label="Pauta de etapa 1 prescrita por profesional autorizado y registrada en HEARTS"
                />
              </div>
              <div className="mt-4">
                <ConductCard conduct={conduct} />
              </div>
            </div>
          )}

          {currentStep.key === 'control' && (
            <div>
              <SectionHeading icon={Activity} title={`Control ${controlNumber} — PA, adherencia y conducta`} description="Registra la PA estandarizada y la adherencia: la conducta se arma sola." />

              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Llega en</span>
                <span className="rounded-lg bg-white px-2.5 py-1 font-bold text-slate-800 ring-1 ring-slate-200">Etapa {stage.number}</span>
                <span className="text-slate-500">{stage.medicines.map(m => `${m.name} ${m.dose}`).join(' + ')}</span>
                <button type="button" onClick={() => setActiveStep(0)} className="ml-auto text-xs font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-900">
                  Cambiar
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
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

          {currentStep.key === 'resumen' && (
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setMoriskyOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
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
