import { Component, useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import {
  LinkIcon, Calculator,
  Eye, Stethoscope, FlaskConical, Scissors,
  AlertTriangle, ChevronDown, Check, FileText, Calendar, Building2, MapPin,
  GitBranch, ClipboardList, BookOpen, Phone, ArrowRight, Info, ExternalLink,
} from 'lucide-react';
import { isHiddenCalculatorId, isHiddenCalculatorName } from '@/components/utils/hiddenContent';
import MermaidDiagram from './MermaidDiagram';
import LightCriteriaCalculator from '@/components/calculators/LightCriteriaCalculator';
import OpioidConversionCalculator from '@/components/calculators/OpioidConversionCalculator';
import HyperglycemicCrisisCalculator from '@/components/calculators/HyperglycemicCrisisCalculator';
import HypoglycemiaTreatmentCalculator from '@/components/calculators/HypoglycemiaTreatmentCalculator';
import HypokalemiaCorrectionCalculator from '@/components/calculators/HypokalemiaCorrectionCalculator';
import HyperkalemiaManagementCalculator from '@/components/calculators/HyperkalemiaManagementCalculator';
import HyponatremiaCorrectionCalculator from '@/components/calculators/HyponatremiaCorrectionCalculator';
import HypernatremiaCorrectionCalculator from '@/components/calculators/HypernatremiaCorrectionCalculator';
import NatremiaEtiologyAssistant from '@/components/calculators/NatremiaEtiologyAssistant';
import FibromyalgiaACRCalculator from '@/components/calculators/FibromyalgiaACRCalculator';
import FIQRCalculator from '@/components/calculators/FIQRCalculator';
import PSFSCalculator from '@/components/calculators/PSFSCalculator';
import ProceduralSedoanalgesiaCalculator from '@/components/calculators/ProceduralSedoanalgesiaCalculator';
import HeartsPathway, { HeartsTreatmentLadder } from './HeartsPathway';

// Renders text with inline clickable links for patterns defined in block.links.
// block.links value can be:
//   string                       → topicId (tooltip = pattern)
//   { topicId, label }           → topicId with custom tooltip label
function rememberCurrentTopicReturnPoint() {
  const url = new URL(window.location.href);
  const tab = url.searchParams.get('tab');
  if (!tab) return;
  try {
    sessionStorage.setItem(`topic-return:${url.pathname}${url.search}`, JSON.stringify({
      tab,
      scrollY: window.scrollY,
    }));
  } catch {
    // Best-effort return memory.
  }
}

function renderWithLinks(text, links) {
  if (!links || !text || Object.keys(links).length === 0) return text;
  let segments = [text];
  for (const [pattern, entry] of Object.entries(links)) {
    const topicId = typeof entry === 'string' ? entry : entry.topicId;
    const label   = typeof entry === 'string' ? pattern : (entry.label || pattern);
    const next = [];
    for (const seg of segments) {
      if (typeof seg !== 'string') { next.push(seg); continue; }
      const parts = seg.split(pattern);
      if (parts.length === 1) { next.push(seg); continue; }
      parts.forEach((part, i) => {
        if (part) next.push(part);
        if (i < parts.length - 1) next.push({ pattern, topicId, label });
      });
    }
    segments = next;
  }
  return segments.map((seg, i) => {
    if (typeof seg === 'string') return seg;
    return (
      <span key={i} className="group relative inline-block">
        <Link
          to={createPageUrl(`TopicDetail?id=${seg.topicId}`)}
          onClick={e => {
            e.stopPropagation();
            rememberCurrentTopicReturnPoint();
          }}
          className="font-semibold text-blue-600 underline decoration-dotted underline-offset-2 transition-colors hover:text-blue-800"
        >
          {seg.pattern}
        </Link>
        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
          {seg.label}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </span>
      </span>
    );
  });
}

const FLOW_COLORS = {
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   circle: 'bg-blue-600',   badge: 'bg-blue-100 text-blue-700',   bar: 'from-blue-500 to-indigo-500' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', circle: 'bg-purple-600', badge: 'bg-purple-100 text-purple-700', bar: 'from-purple-500 to-indigo-500' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  circle: 'bg-green-600',  badge: 'bg-green-100 text-green-700',  bar: 'from-green-500 to-emerald-500' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', circle: 'bg-orange-600', badge: 'bg-orange-100 text-orange-700', bar: 'from-orange-500 to-amber-500' },
  red:    { bg: 'bg-red-50',    border: 'border-red-200',    circle: 'bg-red-600',    badge: 'bg-red-100 text-red-700',    bar: 'from-rose-500 to-red-500' },
};

function TopicBlockRenderError({ title }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <p className="font-semibold">No se pudo mostrar este bloque.</p>
          {title && <p className="mt-1 text-xs text-amber-800">{title}</p>}
        </div>
      </div>
    </div>
  );
}

class TopicBlockErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Topic block render error:', error);
  }

  render() {
    if (this.state.hasError) {
      return <TopicBlockRenderError title={this.props.blockTitle} />;
    }

    return this.props.children;
  }
}

const CLINICAL_SECTIONS_META = [
  { key: 0, icon: Eye,          color: 'amber',  bg: 'bg-amber-50',   border: 'border-amber-100',  label_color: 'text-amber-800',  icon_bg: 'bg-amber-100',  icon_color: 'text-amber-700' },
  { key: 1, icon: Stethoscope,  color: 'blue',   bg: 'bg-blue-50',    border: 'border-blue-100',   label_color: 'text-blue-800',   icon_bg: 'bg-blue-100',   icon_color: 'text-blue-700'  },
  { key: 2, icon: FlaskConical, color: 'emerald',bg: 'bg-emerald-50', border: 'border-emerald-100',label_color: 'text-emerald-800',icon_bg: 'bg-emerald-100',icon_color: 'text-emerald-700'},
  { key: 3, icon: Scissors,     color: 'violet', bg: 'bg-violet-50',  border: 'border-violet-100', label_color: 'text-violet-800', icon_bg: 'bg-violet-100', icon_color: 'text-violet-700'},
];

const markdownComponents = {
  h3: ({ children }) => (
    <h3 className="text-base font-bold text-slate-800 mt-5 mb-2 first:mt-0 border-b border-slate-100 pb-1">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold text-slate-700 mt-3 mb-1">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-sm leading-relaxed text-slate-700 mb-2">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900">{children}</strong>
  ),
  ul: ({ children }) => (
    <ul className="space-y-1 mb-3">{children}</ul>
  ),
  li: ({ children }) => (
    <li className="flex items-start gap-2 text-sm text-slate-700">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
      <span className="leading-relaxed">{children}</span>
    </li>
  ),
};

function ClinicalBlock({ block }) {
  const [open, setOpen] = useState(false);
  const sections = block.sections || [];
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3 text-left transition-colors hover:bg-slate-100"
      >
        <Stethoscope className="h-3.5 w-3.5 text-slate-400" />
        <h3 className="flex-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
          {block.title || 'Orientación Clínica'}
        </h3>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="divide-y divide-slate-100">
          {sections.map((section, idx) => {
            const meta = CLINICAL_SECTIONS_META[idx] || CLINICAL_SECTIONS_META[0];
            const Icon = meta.icon;
            const bullets = section.content
              ? section.content.split('. ').filter(Boolean).map(s => s.endsWith('.') ? s : `${s}.`)
              : [];
            return (
              <div key={idx} className="px-4 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${meta.icon_bg}`}>
                    <Icon className={`h-3.5 w-3.5 ${meta.icon_color}`} />
                  </div>
                  <span className={`text-xs font-bold uppercase tracking-[0.12em] ${meta.label_color}`}>
                    {section.label}
                  </span>
                </div>
                <ul className="space-y-1.5 pl-1">
                  {bullets.map((bullet, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <div className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                      <span className="text-sm leading-relaxed text-slate-700">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const CHECKLIST_SECTION_META = [
  { accent: 'bg-blue-500',    labelColor: 'text-blue-700',    headBg: 'bg-blue-50',    headBorder: 'border-blue-100'    },
  { accent: 'bg-violet-500',  labelColor: 'text-violet-700',  headBg: 'bg-violet-50',  headBorder: 'border-violet-100'  },
  { accent: 'bg-emerald-500', labelColor: 'text-emerald-700', headBg: 'bg-emerald-50', headBorder: 'border-emerald-100' },
  { accent: 'bg-amber-500',   labelColor: 'text-amber-700',   headBg: 'bg-amber-50',   headBorder: 'border-amber-100'   },
  { accent: 'bg-rose-500',    labelColor: 'text-rose-700',    headBg: 'bg-rose-50',    headBorder: 'border-rose-100'    },
  { accent: 'bg-cyan-600',    labelColor: 'text-cyan-700',    headBg: 'bg-cyan-50',    headBorder: 'border-cyan-100'    },
];

const SAMPLE_TAGS = [
  { pattern: /tapa lila/i, label: 'Tapa lila', className: 'border-violet-200 bg-violet-100 text-violet-800' },
  { pattern: /tapa amarilla/i, label: 'Tapa amarilla', className: 'border-yellow-200 bg-yellow-100 text-yellow-800' },
  { pattern: /frasco est[ée]ril/i, label: 'Frasco estéril', className: 'border-slate-200 bg-slate-100 text-slate-700' },
  { pattern: /hemocultivo/i, label: 'Hemocultivo', className: 'border-red-200 bg-red-100 text-red-800' },
];

function getSampleTags(text) {
  return SAMPLE_TAGS.filter(tag => tag.pattern.test(text || ''));
}

function SampleTags({ text }) {
  const tags = getSampleTags(text);
  if (tags.length === 0) return null;
  return (
    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
      {tags.map(tag => (
        <span
          key={tag.label}
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tag.className}`}
        >
          {tag.label}
        </span>
      ))}
    </span>
  );
}

const formatDoseNumber = (value) => {
  if (!Number.isFinite(value)) return '';
  if (value >= 100) return Math.round(value).toString();
  if (value >= 10) return value.toFixed(1).replace(/\.0$/, '');
  return value.toFixed(2).replace(/0$/, '').replace(/\.0$/, '');
};

function DoseCalculatorBlock({ block }) {
  const [weight, setWeight] = useState('');
  const kg = parseFloat(weight);
  const validWeight = Number.isFinite(kg) && kg > 0;
  const medications = block.medications || [];

  const calculate = (med) => {
    if (!validWeight) return null;
    const raw = kg * med.dose_per_kg;
    const capped = med.max_dose ? Math.min(raw, med.max_dose) : raw;
    const volume = med.concentration ? capped / med.concentration : null;
    return { raw, capped, volume, cappedByMax: med.max_dose && raw > med.max_dose };
  };

  return (
    <div key={block.id} className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-emerald-700 to-teal-700 px-5 py-4 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold">{block.title || 'Calculadora de dosis por peso'}</h3>
            {block.description && <p className="mt-0.5 text-sm text-emerald-100">{block.description}</p>}
          </div>
          <Calculator className="h-5 w-5 text-emerald-100" />
        </div>
      </div>

      <div className="space-y-4 p-5">
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Peso del paciente (kg)</span>
          <input
            type="number"
            min="0.5"
            max="120"
            step="0.1"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            placeholder="Ej: 18.5"
            className="mt-1 flex h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-lg font-semibold text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </label>

        {!validWeight && (
          <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Ingresa el peso para calcular automáticamente dosis y volumen aproximado cuando hay concentración definida.
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {medications.map((med) => {
            const result = calculate(med);
            return (
              <div key={med.name} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{med.name}</h4>
                    <p className="text-xs text-slate-500">{med.indication}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                    {med.route}
                  </span>
                </div>

                <p className="text-xs font-medium text-slate-600">
                  Base: {med.dose_label}
                </p>

                {result ? (
                  <div className="mt-3 space-y-2">
                    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Dosis calculada</p>
                      <p className="text-lg font-bold text-slate-900">
                        {formatDoseNumber(result.capped)} {med.unit}
                        {result.cappedByMax && <span className="ml-2 text-xs font-semibold text-amber-700">(máx.)</span>}
                      </p>
                    </div>
                    {result.volume !== null && (
                      <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">Volumen aprox.</p>
                        <p className="text-base font-bold text-slate-900">
                          {formatDoseNumber(result.volume)} mL
                          <span className="ml-2 text-xs font-medium text-slate-500">({med.concentration_label})</span>
                        </p>
                      </div>
                    )}
                    {med.note && <p className="text-xs leading-relaxed text-slate-500">{med.note}</p>}
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-400 ring-1 ring-slate-200">
                    Pendiente de peso.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {block.footer && (
          <p className="text-xs leading-relaxed text-slate-500">{block.footer}</p>
        )}
      </div>
    </div>
  );
}

function ImageGalleryBlock({ block }) {
  const images = block.images || [];
  const [active, setActive] = useState(null);
  const [preview, setPreview] = useState(null);

  if (images.length === 1) {
    const img = images[0];
    return (
      <>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {block.title && (
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-3.5">
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-600">{block.title}</h3>
              {block.description && <p className="mt-0.5 text-xs text-slate-500">{block.description}</p>}
            </div>
          )}
          <div className="p-4">
            <button
              type="button"
              onClick={() => setPreview(img)}
              className="group block w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left transition hover:border-blue-200 hover:shadow-md"
            >
              <img
                src={img.url}
                alt={img.alt || img.caption || ''}
                className="max-h-[520px] w-full object-contain transition group-hover:scale-[1.01]"
                loading="lazy"
              />
              {img.caption && (
                <p className="border-t border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700">{img.caption}</p>
              )}
              {img.description && (
                <p className="px-4 pb-3 text-xs leading-relaxed text-slate-500">{img.description}</p>
              )}
            </button>
            <button
              type="button"
              onClick={() => setPreview(img)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              Ver flujograma ampliado
              <Eye className="h-3.5 w-3.5" />
            </button>
            {block.source && (
              <p className="mt-3 text-[11px] leading-relaxed text-slate-400">Fuente: {block.source}</p>
            )}
          </div>
        </div>

        {preview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm md:p-6">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="absolute inset-0 cursor-zoom-out"
              aria-label="Cerrar flujograma ampliado"
            />
            <div className="relative z-10 flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{preview.caption || block.title || 'Flujograma'}</p>
                  {preview.description && <p className="truncate text-xs text-slate-500">{preview.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3">
                <img
                  src={preview.url}
                  alt={preview.alt || preview.caption || ''}
                  className="mx-auto max-w-none rounded-lg bg-white shadow-sm"
                />
              </div>
            </div>
          </div>
          )}
      </>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {block.title && (
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3.5">
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-600">{block.title}</h3>
          {block.description && <p className="mt-0.5 text-xs text-slate-500">{block.description}</p>}
        </div>
      )}
      <div className="p-4">
        <div className={`grid gap-3 ${images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActive(active === i ? null : i)}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left transition hover:border-slate-400 hover:shadow-md"
            >
              <img
                src={img.url}
                alt={img.alt || img.caption || ''}
                className="h-40 w-full object-cover object-top transition group-hover:scale-105"
                loading="lazy"
              />
              {img.caption && (
                <div className="border-t border-slate-100 px-2.5 py-2">
                  <p className="text-xs font-medium leading-snug text-slate-700">{img.caption}</p>
                  {img.label && (
                    <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">{img.label}</span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>

        {active !== null && images[active] && (
          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <img
              src={images[active].url}
              alt={images[active].alt || images[active].caption || ''}
              className="max-h-96 w-full object-contain"
            />
            {images[active].caption && (
              <p className="border-t border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700">{images[active].caption}</p>
            )}
            {images[active].description && (
              <p className="px-4 pb-3 text-xs leading-relaxed text-slate-500">{images[active].description}</p>
            )}
          </div>
        )}

        {block.source && (
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">Fuente: {block.source}</p>
        )}
      </div>
    </div>
  );
}

// Renderiza **negritas** dentro de una celda/texto simple sin parser markdown completo.
function renderRichText(text) {
  if (typeof text !== 'string' || text.indexOf('**') === -1) return text;
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>
      : part
  );
}

function TableBlock({ block }) {
  const headers = block.headers || [];
  const rows = block.rows || [];
  const colorMap = {
    blue: 'border-blue-200 bg-blue-50',
    green: 'border-emerald-200 bg-emerald-50',
    amber: 'border-amber-200 bg-amber-50',
    red: 'border-red-200 bg-red-50',
    purple: 'border-violet-200 bg-violet-50',
  };
  const headerBg = colorMap[block.color] || 'border-slate-200 bg-slate-50';
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {block.title && (
        <div className={`border-b ${headerBg} px-5 py-3.5`}>
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-700">
            {block.title}
          </h3>
          {block.description && (
            <p className="mt-0.5 text-xs text-slate-500">{block.description}</p>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-slate-50">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-4 py-2.5 align-top text-slate-700">
                    {renderRichText(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.source && (
        <p className="border-t border-slate-100 px-5 py-2 text-[11px] text-slate-400">
          Fuente: {block.source}
        </p>
      )}
    </div>
  );
}

function ScoreCalculatorBlock({ block }) {
  const items = block.items || [];
  const thresholds = block.thresholds || [];
  const [checked, setChecked] = useState({});

  const score = items.reduce((sum, _, i) => sum + (checked[i] ? 1 : 0), 0);
  const toggle = (i) => setChecked(prev => ({ ...prev, [i]: !prev[i] }));
  const reset  = () => setChecked({});

  const level = thresholds.find(t => score >= t.min && score <= t.max);
  const colorMap = {
    green: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-600', score: 'text-emerald-700' },
    amber: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   badge: 'bg-amber-500',   score: 'text-amber-700'   },
    red:   { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-800',     badge: 'bg-red-600',     score: 'text-red-700'     },
  };
  const c = level ? (colorMap[level.color] || colorMap.green) : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-violet-700 to-indigo-700 px-5 py-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold">{block.title || 'Calculadora de puntaje'}</h3>
            {block.description && <p className="mt-0.5 text-sm text-violet-200">{block.description}</p>}
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-xl font-bold">
            {score}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => toggle(i)}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                checked[i]
                  ? 'border-violet-300 bg-violet-50 shadow-sm'
                  : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
              }`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold transition-colors ${
                checked[i] ? 'border-violet-500 bg-violet-600 text-white' : 'border-slate-300 bg-white text-transparent'
              }`}>
                ✓
              </span>
              <span className={`text-sm leading-snug ${checked[i] ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {level && (
          <div className={`rounded-xl border-2 ${c.border} ${c.bg} px-4 py-3`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={`text-xs font-bold uppercase tracking-wider ${c.score}`}>Puntaje {score} — {level.label}</p>
                <p className={`mt-0.5 text-sm font-medium ${c.text}`}>{level.action}</p>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold text-white ${c.badge}`}>{score}/10</span>
            </div>
          </div>
        )}

        {score === 0 && !level && (
          <p className="text-sm text-slate-400 text-center">Marca los ítems presentes para calcular el riesgo.</p>
        )}

        {score > 0 && (
          <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors">
            Reiniciar
          </button>
        )}
      </div>
    </div>
  );
}

function ChecklistBlock({ block }) {
  const sections = block.sections || [];
  const allItems = sections.flatMap((s, si) => (s.items || []).map((_, ii) => `${si}-${ii}`));
  const [checked, setChecked] = useState({});

  const toggle = (key) => setChecked(prev => ({ ...prev, [key]: !prev[key] }));

  const total = allItems.length;
  const done = Object.values(checked).filter(Boolean).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-800 px-5 py-3.5">
        <h3 className="flex-1 text-sm font-bold uppercase tracking-[0.12em] text-white">
          {block.title || 'Requisitos de la Derivación (SIC)'}
        </h3>
        <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-white">
          {done}/{total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100">
        <div
          className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Sections */}
      <div className="divide-y divide-slate-100">
        {sections.map((section, si) => {
          const meta = CHECKLIST_SECTION_META[si % CHECKLIST_SECTION_META.length];
          const sItems = section.items || [];
          return (
            <div key={si}>
              {/* Section label */}
              <div className={`flex items-center gap-2.5 px-4 py-2 ${meta.headBg} border-b ${meta.headBorder}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${meta.accent}`} />
                <span className={`text-[11px] font-bold uppercase tracking-[0.12em] ${meta.labelColor}`}>
                  {section.label}
                </span>
              </div>
              {/* Items */}
              <ul>
                {sItems.map((item, ii) => {
                  const key = `${si}-${ii}`;
                  const isChecked = !!checked[key];
                  return (
                    <li
                      key={ii}
                      onClick={() => toggle(key)}
                      className={`flex cursor-pointer items-start gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50 ${
                        ii < sItems.length - 1 ? 'border-b border-slate-50' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                        isChecked
                          ? `${meta.accent} border-transparent`
                          : 'border-slate-300 bg-white'
                      }`}>
                        {isChecked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                      </span>
                      {/* Text */}
                      <span className={`text-sm leading-relaxed transition-colors ${
                        isChecked ? 'text-slate-400 line-through' : 'text-slate-700'
                      }`}>
                        {item}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ResponsiveTopicLayout({ blocks = [], layoutMode = 'auto', relatedTopics, relatedTools }) {
  const safeRelatedTopics = relatedTopics || [];
  const safeRelatedTools = relatedTools || [];
  const visibleRelatedTopics = safeRelatedTopics.filter(ref => ref?.topic_id && ref?.label);
  const visibleRelatedTools = safeRelatedTools.filter(ref =>
    !isHiddenCalculatorId(ref.tool_id) && !isHiddenCalculatorName(ref.label)
  );

  const renderBlock = (block) => {
    const colorConfig = FLOW_COLORS[block.color] || FLOW_COLORS.blue;

    switch (block.type) {

      case 'clinical':
        return <ClinicalBlock key={block.id} block={block} />;

      case 'dose_calculator':
        return <DoseCalculatorBlock key={block.id} block={block} />;

      case 'score_calculator':
        return <ScoreCalculatorBlock key={block.id} block={block} />;

      case 'light_criteria_calculator':
        return <LightCriteriaCalculator key={block.id} />;

      case 'opioid_conversion_calculator':
        return <OpioidConversionCalculator key={block.id} />;

      case 'hyperglycemic_crisis_calculator':
        return <HyperglycemicCrisisCalculator key={block.id} />;

      case 'hypoglycemia_treatment_calculator':
        return <HypoglycemiaTreatmentCalculator key={block.id} />;

      case 'hypokalemia_correction_calculator':
        return <HypokalemiaCorrectionCalculator key={block.id} />;

      case 'hyperkalemia_management_calculator':
        return <HyperkalemiaManagementCalculator key={block.id} />;

      case 'hyponatremia_correction_calculator':
        return <HyponatremiaCorrectionCalculator key={block.id} />;

      case 'hypernatremia_correction_calculator':
        return <HypernatremiaCorrectionCalculator key={block.id} />;

      case 'natremia_etiology_assistant':
        return <NatremiaEtiologyAssistant key={block.id} />;

      case 'fibromyalgia_acr_calculator':
        return <FibromyalgiaACRCalculator key={block.id} />;

      case 'fiqr_calculator':
        return <FIQRCalculator key={block.id} />;

      case 'psfs_calculator':
        return <PSFSCalculator key={block.id} />;

      case 'procedural_sedoanalgesia_calculator':
        return <ProceduralSedoanalgesiaCalculator key={block.id} />;

      case 'hearts_pathway':
        return <HeartsPathway key={block.id} />;

      case 'hearts_ladder':
        return <HeartsTreatmentLadder key={block.id} />;

      case 'image_gallery':
        return <ImageGalleryBlock key={block.id} block={block} />;

      case 'table':
        return <TableBlock key={block.id} block={block} />;

      case 'text':
        return (
          <div key={block.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {block.title && (
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-3.5">
                <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-600">
                  {block.title}
                </h3>
              </div>
            )}
            <div className="px-5 py-4">
              <ReactMarkdown components={markdownComponents}>
                {block.content}
              </ReactMarkdown>
            </div>
          </div>
        );

      case 'flowchart':
      case 'algorithm':
        return (
          <div key={block.id} className={`relative overflow-hidden rounded-2xl border-2 ${colorConfig.bg} ${colorConfig.border} shadow-sm`}>
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${colorConfig.bar}`} />
            <div className="p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  {block.title && (
                    <h3 className="text-base font-bold text-slate-900">{block.title}</h3>
                  )}
                  {block.description && (
                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">{block.description}</p>
                  )}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colorConfig.badge}`}>
                  {block.type === 'algorithm' ? 'Algoritmo' : 'Flujo'}
                </span>
              </div>
              {block.details?.length > 0 && (
                <div className="space-y-2.5">
                  {(() => {
                    // Group array items: ~ or → entries attach to the previous step as sub-items
                    const groups = [];
                    for (const detail of block.details) {
                      const trimmed = detail.trim();
                      if (trimmed === '') { groups.push({ type: 'spacer' }); continue; }
                      if (/^[━═─]{3}/.test(trimmed)) { groups.push({ type: 'separator', text: trimmed }); continue; }
                      if (trimmed.startsWith('~') || trimmed.startsWith('→')) {
                        const sub = trimmed.startsWith('~') ? trimmed.slice(1).trim() : trimmed;
                        if (groups.length > 0 && groups[groups.length - 1].type === 'step') {
                          groups[groups.length - 1].subItems.push(sub);
                        } else {
                          groups.push({ type: 'step', text: '', subItems: [sub] });
                        }
                        continue;
                      }
                      // Inline ~ via \n still supported
                      const lines = trimmed.split('\n');
                      const mainText = lines.filter(l => !l.startsWith('~')).join(' ').trim();
                      const inlineSubs = lines.filter(l => l.startsWith('~')).map(l => l.slice(1).trim());
                      groups.push({ type: 'step', text: mainText, subItems: inlineSubs });
                    }
                    let stepNum = 0;
                    return groups.map((group, idx) => {
                      if (group.type === 'spacer') return <div key={idx} className="h-1" />;
                      if (group.type === 'separator') {
                        stepNum = 0;
                        const labelText = group.text.replace(/^[━═─\s]+|[━═─\s]+$/g, '').trim();
                        return (
                          <div key={idx} className={`rounded-lg px-3 py-1.5 ${colorConfig.badge}`}>
                            <span className="text-xs font-bold uppercase tracking-wider">{labelText}</span>
                          </div>
                        );
                      }
                      stepNum += 1;
                      const { text: mainText, subItems } = group;
                      return (
                        <div key={idx} className="relative rounded-xl border border-white/70 bg-white/85 p-3.5 pl-14 shadow-sm">
                          <div className={`absolute left-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white ${colorConfig.circle}`}>
                            {stepNum}
                          </div>
                          <p className="text-sm leading-relaxed text-slate-800">
                            {block.links
                              ? renderWithLinks(mainText, block.links)
                              : mainText.includes('→')
                                ? (
                                  <>
                                    <strong className="font-semibold">{mainText.split('→')[0].trim()}</strong>
                                    {' → ' + mainText.split('→').slice(1).join('→').trim()}
                                  </>
                                )
                                : mainText}
                          </p>
                          {subItems.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {subItems.map((item, i) => (
                                <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-1.5 ${colorConfig.bg} border ${colorConfig.border}`}>
                                  <span className="mt-0.5 shrink-0 text-xs font-bold text-slate-400">—</span>
                                  <span className="text-xs leading-relaxed text-slate-700">
                                    {block.links
                                      ? renderWithLinks(item, block.links)
                                      : item.includes(':')
                                        ? (
                                          <>
                                            <strong className="font-semibold text-slate-800">{item.split(':')[0]}</strong>
                                            {':' + item.split(':').slice(1).join(':')}
                                          </>
                                        )
                                        : item}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </div>
        );

      case 'reference': {
        if (!block.reference_id || !block.reference_label) return null;
        const isCalculator = block.reference_type === 'calculator';
        const isPage = block.reference_type === 'page';
        if (isCalculator && (
          isHiddenCalculatorId(block.reference_id) ||
          isHiddenCalculatorName(block.reference_label)
        )) return null;
        const linkUrl = isCalculator
          ? createPageUrl(`AllCalculators?calc=${block.reference_id}`)
          : isPage
            ? createPageUrl(block.reference_id)
            : createPageUrl(`TopicDetail?id=${block.reference_id}`);
        return (
          <Link
            key={block.id}
            to={linkUrl}
            onClick={rememberReturnPoint}
            className={isPage ? 'block pt-3' : 'block'}
          >
            <div className={`rounded-2xl border-2 p-5 transition-all hover:shadow-md ${
              isCalculator
                ? 'bg-purple-50 border-purple-200 hover:border-purple-300'
                : isPage
                  ? 'bg-teal-50 border-teal-200 hover:border-teal-300'
                  : 'bg-blue-50 border-blue-200 hover:border-blue-300'
            }`}>
              <div className="mb-2 flex items-center gap-3">
                {isCalculator
                  ? <Calculator className="h-4 w-4 text-purple-600" />
                  : isPage
                    ? <FileText className="h-4 w-4 text-teal-700" />
                    : <LinkIcon className="h-4 w-4 text-blue-600" />
                }
                <h4 className="font-bold text-slate-900">{block.title || 'Referencia'}</h4>
              </div>
              <p className="mb-3 text-sm text-slate-700">{block.reference_label}</p>
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="h-3 w-3" />
                {isCalculator ? 'Abrir calculadora' : isPage ? 'Abrir solicitud' : 'Ver protocolo'}
              </Button>
            </div>
          </Link>
        );
      }

      case 'mermaid':
        return (
          <div key={block.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {block.title && (
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-3.5">
                <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-600">
                  {block.title}
                </h3>
                {block.description && (
                  <p className="mt-0.5 text-xs text-slate-500">{block.description}</p>
                )}
              </div>
            )}
            <div className="p-4">
              <MermaidDiagram chart={block.content || block.diagram || block.chart || ''} />
            </div>
          </div>
        );

      case 'alert': {
        const ALERT_PALETTES = {
          amber:  { box: 'border-amber-200 bg-amber-50',     icon: 'text-amber-700',   title: 'text-amber-900',   text: 'text-amber-800',   Icon: AlertTriangle },
          red:    { box: 'border-red-200 bg-red-50',         icon: 'text-red-700',     title: 'text-red-900',     text: 'text-red-800',     Icon: AlertTriangle },
          green:  { box: 'border-emerald-200 bg-emerald-50', icon: 'text-emerald-700', title: 'text-emerald-900', text: 'text-emerald-800', Icon: ArrowRight },
          blue:   { box: 'border-blue-200 bg-blue-50',       icon: 'text-blue-700',    title: 'text-blue-900',    text: 'text-blue-800',    Icon: Info },
          purple: { box: 'border-violet-200 bg-violet-50',   icon: 'text-violet-700',  title: 'text-violet-900',  text: 'text-violet-800',  Icon: ArrowRight },
        };
        const ap = ALERT_PALETTES[block.color] || ALERT_PALETTES.amber;
        const AlertIcon = ap.Icon;
        return (
          <div key={block.id} className={`rounded-2xl border p-4 ${ap.box}`}>
            {block.title && (
              <div className="mb-2 flex items-center gap-2">
                <AlertIcon className={`h-4 w-4 shrink-0 ${ap.icon}`} />
                <h4 className={`text-sm font-bold ${ap.title}`}>{block.title}</h4>
              </div>
            )}
            {block.content && (
              <p className={`text-sm leading-relaxed ${ap.text}`}>{block.content}</p>
            )}
          </div>
        );
      }

      case 'criteria': {
        const CRITERIA_PALETTES = {
          blue:   { header: 'bg-blue-600',   badge: 'bg-blue-100 text-blue-800',   dot: 'bg-blue-500',   label: 'text-blue-700',    card: 'border-blue-100 bg-blue-50' },
          red:    { header: 'bg-red-600',    badge: 'bg-red-100 text-red-800',    dot: 'bg-red-500',    label: 'text-red-700',     card: 'border-red-100 bg-red-50' },
          green:  { header: 'bg-emerald-600',badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500', label: 'text-emerald-700', card: 'border-emerald-100 bg-emerald-50' },
          amber:  { header: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-800',  dot: 'bg-amber-500',  label: 'text-amber-700',   card: 'border-amber-100 bg-amber-50' },
          purple: { header: 'bg-violet-600', badge: 'bg-violet-100 text-violet-800', dot: 'bg-violet-500', label: 'text-violet-700',  card: 'border-violet-100 bg-violet-50' },
        };
        const cp = CRITERIA_PALETTES[block.color] || CRITERIA_PALETTES.blue;
        const items = block.items || [];
        const isSectionLabel = (s) => typeof s === 'string' && /^[━═─]{3}/.test(s.trim());
        const isEmptyItem    = (s) => !s || s.trim() === '';
        const realCount = items.filter(item => !isSectionLabel(item) && !isEmptyItem(item)).length;
        return (
          <div key={block.id} className={`overflow-hidden rounded-2xl border shadow-sm ${cp.card}`}>
            <div className={`flex items-center gap-3 px-5 py-3.5 ${cp.header}`}>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-white">
                {block.title || 'Criterios de Derivación'}
              </h3>
              <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold ${cp.badge}`}>
                {realCount}
              </span>
            </div>
            <ul className="divide-y divide-white/60 p-2">
              {items.map((item, i) => {
                if (isEmptyItem(item)) return null;
                if (isSectionLabel(item)) {
                  const labelText = item.trim().replace(/^[━═─\s]+|[━═─\s]+$/g, '').trim();
                  return (
                    <div key={i} className="px-4 pb-1 pt-3">
                      <span className={`text-xs font-bold uppercase tracking-wider ${cp.label}`}>{labelText}</span>
                    </div>
                  );
                }
                const displayText = item.replace(/^[•·]\s*/, '');
                const isPhoneItem = /^[📞📱☎]/.test(item.trim());
                if (isPhoneItem) {
                  const numMatch = displayText.match(/\d[\d\s\-\.]{3,}\d/);
                  const label = displayText.replace(/^[📞📱☎]\s*/, '').trim();
                  return (
                    <li key={i} className="px-4 py-2">
                      <a
                        href={numMatch ? `tel:${numMatch[0].replace(/[\s\-\.]/g, '')}` : undefined}
                        className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                      >
                        <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        {label}
                      </a>
                    </li>
                  );
                }
                // Sub-items: lines beginning with `~ ` after a newline are rendered
                // as indented secondary text below the main item.
                const lines = displayText.split('\n');
                const mainText  = lines.filter(l => !l.trim().startsWith('~')).join(' ').trim();
                const subItems  = lines.filter(l => l.trim().startsWith('~')).map(l => l.trim().slice(1).trim());
                return (
                  <li key={i} className="rounded-xl px-4 py-2.5 transition-colors hover:bg-white/60">
                    <div className="flex items-start gap-3">
                      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${cp.dot}`} />
                      <span className="text-sm leading-relaxed text-slate-800">
                        {renderWithLinks(mainText, block.links)}
                        <SampleTags text={mainText} />
                      </span>
                    </div>
                    {subItems.length > 0 && (
                      <ul className="mt-1.5 space-y-1 pl-7">
                        {subItems.map((sub, si) => (
                          <li key={si} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1 w-2 shrink-0 rounded-full bg-slate-300" />
                            <span className="text-xs leading-relaxed text-slate-600">
                              {renderWithLinks(sub, block.links)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      }

      case 'checklist':
        return <ChecklistBlock key={block.id} block={block} />;

      case 'protocol_header': {
        return (
          <div key={block.id} className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-indigo-700 to-indigo-800 px-5 py-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/90">
                  {block.ordinario || 'ORDINARIO 2G N°017'}
                </span>
              </div>
              <h3 className="text-base font-bold leading-snug text-white">
                {block.title || 'Pauta de Cotejo Patologías GES 2026'}
              </h3>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="flex flex-wrap gap-x-5 gap-y-2 px-5 py-3">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Building2 className="h-4 w-4 shrink-0 text-indigo-400" />
                  <span>{block.institution || 'Servicio de Salud Ñuble'}</span>
                </div>
                {block.department && (
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <FileText className="h-4 w-4 shrink-0 text-indigo-400" />
                    <span>{block.department}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Calendar className="h-4 w-4 shrink-0 text-indigo-400" />
                  <span>{block.date || 'Febrero 2026'}</span>
                </div>
              </div>
              {block.age_destinations?.length > 0 ? (
                <div className="border-t border-indigo-100">
                  <div className="divide-y divide-indigo-100">
                    {block.age_destinations.map((row, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-x-5 gap-y-1 bg-indigo-50/60 px-5 py-2">
                        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700 shrink-0">
                          {row.age_range}
                        </span>
                        <div className="flex items-center gap-1.5 text-sm font-medium text-indigo-800">
                          <Stethoscope className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                          <span>{row.specialty}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm font-medium text-indigo-800">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                          <span>{row.destination}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (block.specialty || block.destination) ? (
                <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-indigo-100 bg-indigo-50/60 px-5 py-2.5">
                  {block.specialty && (
                    <div className="flex items-center gap-2 text-sm font-medium text-indigo-800">
                      <Stethoscope className="h-4 w-4 shrink-0 text-indigo-500" />
                      <span>{block.specialty}</span>
                    </div>
                  )}
                  {block.destination && (
                    <div className="flex items-center gap-2 text-sm font-medium text-indigo-800">
                      <MapPin className="h-4 w-4 shrink-0 text-indigo-500" />
                      <span>{block.destination}</span>
                    </div>
                  )}
                </div>
              ) : null}
              {block.summary && (
                <div className="bg-indigo-50 px-5 py-3">
                  <p className="text-sm leading-relaxed text-indigo-900">{block.summary}</p>
                </div>
              )}
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  const renderSafeBlock = (block) => {
    try {
      const rendered = renderBlock(block);
      if (!rendered) return null;

      return (
        <TopicBlockErrorBoundary
          key={block?.id || `${block?.type || 'block'}-${block?.title || 'untitled'}`}
          blockTitle={block?.title}
        >
          {rendered}
        </TopicBlockErrorBoundary>
      );
    } catch (error) {
      console.error('Topic block render error:', error);
      return (
        <TopicBlockRenderError
          key={block?.id || `${block?.type || 'block'}-${block?.title || 'untitled'}`}
          title={block?.title}
        />
      );
    }
  };

  const safeBlocks = blocks || [];
  const tabValues = [...new Set(safeBlocks.map(b => b.tab).filter(Boolean))];
  const hasTabs = tabValues.length > 0;
  const initialTab = (() => {
    if (!hasTabs) return null;
    const requested = new URLSearchParams(window.location.search).get('tab');
    return tabValues.includes(requested) ? requested : tabValues[0];
  })();
  const [activeTab, setActiveTab] = useState(initialTab);
  const tabBarRef = useRef(null);

  // Offsets dinámicos para las barras sticky: medimos la altura real del header
  // de la página (que varía por pantalla) y la de la barra de pestañas, en vez
  // de hardcodear px. Así las pestañas se anclan justo bajo el header sin
  // quedar tapadas, y la sub-barra justo bajo la barra de pestañas.
  const [headerH, setHeaderH] = useState(140);
  const [tabBarH, setTabBarH] = useState(60);
  useEffect(() => {
    const measure = () => {
      const header = document.querySelector('[data-sticky-header]');
      if (header) setHeaderH(Math.round(header.getBoundingClientRect().height));
      if (tabBarRef.current) setTabBarH(Math.round(tabBarRef.current.getBoundingClientRect().height));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [activeTab, hasTabs]);

  // Sub-tabs (un nivel de anidación dentro de la pestaña activa)
  const blocksInActiveTab = hasTabs ? safeBlocks.filter(b => b.tab === activeTab) : [];
  const subtabValues = [...new Set(blocksInActiveTab.map(b => b.subtab).filter(Boolean))];
  const hasSubtabs = subtabValues.length > 0;
  const [activeSubtab, setActiveSubtab] = useState(null);
  // Reset subtab al primero al cambiar de tab
  useEffect(() => {
    if (hasSubtabs) setActiveSubtab(subtabValues[0]);
    else setActiveSubtab(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, hasSubtabs, subtabValues.join('|')]);

  useEffect(() => {
    if (!hasTabs || !activeTab) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('tab') !== activeTab) {
      url.searchParams.set('tab', activeTab);
      window.history.replaceState(window.history.state, '', url);
    }
  }, [activeTab, hasTabs]);

  useEffect(() => {
    if (!hasTabs || !activeTab) return;
    const key = `topic-return:${window.location.pathname}${window.location.search}`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (!saved || saved.tab !== activeTab) return;
      sessionStorage.removeItem(key);
      window.setTimeout(() => window.scrollTo({ top: saved.scrollY || 0, behavior: 'auto' }), 80);
    } catch {
      sessionStorage.removeItem(key);
    }
  }, [activeTab, hasTabs]);

  const preserveScrollDuring = (update) => {
    const previousScrollY = window.scrollY;
    const previousTabTop = tabBarRef.current?.getBoundingClientRect().top;
    update();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const nextTabTop = tabBarRef.current?.getBoundingClientRect().top;
        if (Number.isFinite(previousTabTop) && Number.isFinite(nextTabTop)) {
          window.scrollBy({ top: nextTabTop - previousTabTop, behavior: 'auto' });
          return;
        }
        window.scrollTo({ top: previousScrollY, behavior: 'auto' });
      });
    });
  };

  const updateActiveTab = (tab) => {
    if (tab === activeTab) return;
    preserveScrollDuring(() => setActiveTab(tab));
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState(window.history.state, '', url);
  };

  const rememberReturnPoint = () => {
    if (!hasTabs || !activeTab) return;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', activeTab);
    window.history.replaceState(window.history.state, '', url);
    const key = `topic-return:${url.pathname}${url.search}`;
    sessionStorage.setItem(key, JSON.stringify({
      tab: activeTab,
      subtab: activeSubtab,
      scrollY: window.scrollY,
    }));
  };

  // Auto-tab: when topic has mermaid blocks alongside other content (GES or local protocols)
  const hasProtocolHeader = safeBlocks.some(b => b.type === 'protocol_header');
  const hasMermaid = safeBlocks.some(b => b.type === 'mermaid');

  // Local protocol 3-tab mode: topic has local_protocol blocks + checklist (GES topics with HCSFB protocol)
  const hasLocalProtocolBlocks = safeBlocks.some(b => b.local_protocol === true);
  const hasChecklistBlocks = safeBlocks.some(b => b.type === 'checklist');
  const isLocalProtocolMode = hasLocalProtocolBlocks && hasChecklistBlocks && !hasTabs;
  const [localTab, setLocalTab] = useState('local');

  const isGESMode = hasMermaid && !hasTabs && !isLocalProtocolMode && safeBlocks.some(b => b.type !== 'mermaid');
  const [gesTab, setGesTab] = useState('protocolo');

  const TAB_LABELS = {
    // Electrolitos
    hiper: 'Hiperkalemia',
    hipo: 'Hipokalemia',
    // Cardiología policlínico (derivación)
    arritmia: 'Arritmia',
    'dolor-toracico': 'Dolor Torácico',
    ic: 'Insuf. Cardíaca',
    disnea: 'Disnea',
    palpitaciones: 'Palpitaciones',
    sincope: 'Síncope',
    soplos: 'Soplos',
    ecg: 'Alt. ECG',
    fa: 'Fibrilación A.',
    valvulopatias: 'Valvulopatías',
    // GES Cardiología
    'cardiopatias-congenitas': 'Cardiopatías Cong.',
    iam: 'IAM',
    hta: 'HTA',
    marcapaso: 'Marcapaso',
    'valvulopatia-aortica': 'Valvulopatía Aórt.',
    'valvulopatia-mitral': 'Valvulopatía Mitral',
    // GES Nefrología
    'erc-4-5': 'ERC Etapa 4-5',
    'erc-terminal': 'ERC Terminal',
    // GES Oncología Sólida
    cervicouterino: 'Cáncer Cervicouterino',
    mama: 'Cáncer de Mama',
    gastrico: 'Cáncer Gástrico',
    colorrectal: 'Cáncer Colorrectal',
    pulmon: 'Cáncer de Pulmón',
    prostata: 'Cáncer de Próstata',
    ovario: 'Cáncer de Ovario',
    vesical: 'Cáncer Vesical',
    renal: 'Cáncer Renal',
    tiroides: 'Cáncer de Tiroides',
    // GES Oncología Hematológica
    linfoma: 'Linfoma',
    leucemia: 'Leucemia',
    mieloma: 'Mieloma Múltiple',
    hemofilia: 'Hemofilia',
    'cancer-pediatrico': 'Cáncer Pediátrico',
    paliativos: 'Cuidados Paliativos',
    osteosarcoma: 'Osteosarcoma',
    // GES Endocrinología
    dm1: 'Diabetes Tipo 1',
    dm2: 'Diabetes Tipo 2',
    'pie-diabetico': 'Pie Diabético',
    hipotiroidismo: 'Hipotiroidismo',
    'retinopatia-diabetica': 'Retinopatía Diab.',
    // GES Neurología
    acv: 'ACV',
    'epilepsia-infantil': 'Epilepsia Infantil',
    'epilepsia-adulto': 'Epilepsia Adulto',
    parkinson: 'Parkinson',
    'esclerosis-multiple': 'Esclerosis Múltiple',
    alzheimer: 'Alzheimer',
    'tumores-snc': 'Tumores SNC',
    // GES Salud Mental
    esquizofrenia: 'Esquizofrenia',
    depresion: 'Depresión',
    bipolar: 'T. Bipolar',
    'alcohol-drogas': 'Alcohol y Drogas',
    // GES Respiratorio
    epoc: 'EPOC',
    'asma-pediatrico': 'Asma Pediátrico',
    'asma-adulto': 'Asma Adulto',
    'fibrosis-quistica': 'Fibrosis Quística',
    'covid-rehab': 'Rehab. Post-COVID',
    // GES Traumatología
    escoliosis: 'Escoliosis',
    'endoprotesis-cadera': 'Endoprótesis Cadera',
    artrosis: 'Artrosis',
    'hnp-lumbar': 'HNP Lumbar',
    colecistectomia: 'Colecistectomía',
    'fisura-labiopalatina': 'Fisura Labiopalatina',
    'displasia-cadera': 'Displasia Cadera',
    'osteosarcoma-tmt': 'Osteosarcoma',
    // GES Oftalmología y ORL
    cataratas: 'Cataratas',
    'vicios-refraccion': 'Vicios de Refracción',
    estrabismo: 'Estrabismo',
    'desprendimiento-retina': 'Desprendimiento Retina',
    'hipoacusia-adulto': 'Hipoacusia Adulto',
    'hipoacusia-pediatrico': 'Hipoacusia Pediátrico',
    // GES Reumatología
    'artritis-reumatoidea': 'Artritis Reumatoidea',
    'artritis-juvenil': 'Artritis Juvenil',
    lupus: 'Lupus',
    // GES Gastroenterología
    helicobacter: 'H. pylori',
    'hepatitis-b': 'Hepatitis B',
    'hepatitis-c': 'Hepatitis C',
    cirrosis: 'Cirrosis',
    'cancer-gastrico': 'Cáncer Gástrico',
    'cancer-colorrectal': 'Cáncer Colorrectal',
    // GES Ginecología
    'parto-prematuro': 'Parto Prematuro',
    // Protocolos Urgencias
    rcpp_protocolo: 'Protocolo',
    rcpp_equipo: 'Equipo',
    rcpp_farmacos: 'Fármacos',
    rcpp_flujogramas: 'Flujogramas',
    rcpp_postparo: 'Post-PCR',
    rcpa_protocolo: 'Protocolo',
    rcpa_equipo: 'Equipo',
    rcpa_farmacos: 'Fármacos',
    rcpa_flujogramas: 'Flujogramas',
    rcpa_postparo: 'Post-PCR',
    dem_protocolo: 'Protocolo',
    dem_equipo: 'Equipo',
    dem_farmacos: 'Fármacos',
    dem_flujogramas: 'Flujogramas',
    dem_post_dx: 'Post-Dx',
    dem_cotejo: 'Pauta de Cotejo',
    hipo_protocolo: 'Protocolo',
    hipo_farmacos: 'Fármacos',
    hipo_derivacion: 'Derivación',
    hipo_flujogramas: 'Flujogramas',
    hipo_cotejo: 'Pauta de Cotejo',
    // HCSFB 162 — Pérdida Reproductiva
    pr_protocolo: 'Protocolo',
    pr_definiciones: 'Definiciones',
    pr_farmacos: 'Fármacos',
    pr_flujogramas: 'Flujogramas',
    pr_post: 'Post-evento',
    pr_protocolo_triage: 'Triage',
    pr_protocolo_aborto: 'Tipos de aborto',
    pr_protocolo_otras: 'Otras pérdidas',
    kb_hipo: 'Hipokalemia',
    kb_hiper: 'Hiperkalemia',
    kb_hipo_diagnostico: 'Diagnóstico',
    kb_hipo_calculadora: 'Calculadora',
    kb_hipo_reposicion: 'Reposición',
    kb_hipo_urgente: 'Urgente',
    kb_hipo_arsenal: 'Arsenal y seguimiento',
    kb_hipo_flujo: 'Flujo',
    kb_hiper_diagnostico: 'Diagnóstico',
    kb_hiper_calculadora: 'Calculadora',
    kb_hiper_urgente: 'Urgente',
    kb_hiper_farmacos: 'Fármacos',
    kb_hiper_eliminacion: 'Eliminación',
    kb_hiper_flujo: 'Flujo',
    triage_protocolo: 'Protocolo',
    triage_equipo: 'Equipo',
    triage_categorias: 'Niveles ESI',
    triage_casos: 'Casos especiales',
    triage_flujogramas: 'Flujogramas',
    aisl_protocolo: 'Protocolo',
    aisl_tipos: 'Tipos de aislamiento',
    aisl_tabla: 'Tabla por agente',
    aisl_flujogramas: 'Flujogramas',
    vigea_protocolo: 'Protocolo',
    vigea_definiciones: 'Definiciones',
    vigea_reporte: 'Reporte',
    solex_protocolo: 'Protocolo',
    solex_requisitos: 'Requisitos',
    solex_preparacion: 'Preparación',
    solex_flujogramas: 'Flujogramas',
    deriv_protocolo: 'Protocolo',
    deriv_equipo: 'Equipo',
    deriv_procedimiento: 'Procedimiento',
    deriv_flujogramas: 'Flujogramas',
    dominga_protocolo: 'Protocolo',
    dominga_equipo: 'Equipo',
    dominga_acompan: 'Acompañamiento',
    dominga_documentos: 'Documentos y permisos',
    dominga_seguimiento: 'Seguimiento',
    trato_protocolo: 'Protocolo',
    trato_estandares: 'Estándares',
    trato_telefono: 'Telefónico',
    trato_flujogramas: 'Flujogramas',
    preferente_protocolo: 'Protocolo',
    preferente_sujetos: 'Sujetos',
    preferente_areas: 'Áreas',
    preferente_flujogramas: 'Flujogramas',
    ingreso_protocolo: 'Protocolo',
    ingreso_equipo: 'Equipo',
    ingreso_proceso: 'Proceso',
    ingreso_traslado: 'Traslado',
    ingreso_flujogramas: 'Flujogramas',
    agit_protocolo: 'Protocolo',
    agit_evaluacion: 'Evaluación RASS',
    agit_farmacos: 'Fármacos',
    agit_flujogramas: 'Flujogramas',
    apt_protocolo: 'Protocolo y equipo',
    apt_moviles: 'Móviles',
    apt_procedimiento: 'Procedimiento',
    apt_documentacion: 'Documentación',
    intsuic_protocolo: 'Protocolo',
    intsuic_derivacion: 'Derivación',
    intsuic_flujogramas: 'Flujogramas',
    dac_protocolo: 'Protocolo',
    dac_tratamiento: 'Tratamiento',
    dac_flujogramas: 'Flujogramas',
    trombo_protocolo: 'Protocolo',
    trombo_farmacos: 'Fármacos',
    trombo_contrain: 'Contraindicaciones',
    trombo_monitoreo: 'Monitoreo',
    trombo_flujogramas: 'Flujogramas',
    tec_adulto_clinica: 'Clínica',
    tec_adulto_protocolo: 'Protocolo',
    tec_adulto_neuroproteccion: 'Neuroprotección',
    tec_adulto_farmacos: 'Fármacos',
    tec_adulto_derivacion: 'Derivación',
    tec_adulto_flujogramas: 'Flujogramas',
    'agresion-sexual': 'Agresión Sexual',
    taco_protocolo: 'Protocolo',
    taco_equipo: 'Equipo',
    taco_farmacos: 'Fármacos',
    taco_flujogramas: 'Flujogramas',
    tele_protocolo: 'Protocolo',
    tele_patologias: 'Patologías GES',
    tele_flujogramas: 'Flujogramas',
    fimo_protocolo: 'Evaluación',
    fimo_tratamiento: 'Tratamiento',
    fimo_derivacion: 'Derivación',
    fimo_flujograma: 'Flujograma',
    fimo_educacion: 'Educación',
    fimo_dx: 'Diagnóstico',
    fimo_asintomatica: 'Asintomática',
    fimo_sintomatica: 'Sintomática',
    fimo_urgencias: 'Urgencias',
    fimo_corticoide: 'Corticoide tópico',
    fimo_balanitis: 'Balanitis',
    fimo_cirugia: 'Cirugía',
    fimo_ref: 'Referencia',
    fimo_contra: 'Contrarreferencia',
    fimo_registro: 'Registro',
    fimo_familia: 'Familia',
    fimo_aplicacion: 'Aplicación',
    fimo_alarmas: 'Alarmas',
    hta_local: 'Protocolo local',
    hta_local_ingreso: 'Ingreso PSCV',
    hta_local_elegibilidad: 'Elegibilidad',
    hta_local_examenes: 'Exámenes iniciales',
    hta_local_seguimiento: 'Seguimiento',
    hta_escalera: 'Escalera HEARTS',
    hta_ruta: 'Ruta interactiva',
    hta_flujo: 'Flujograma',
    hta_cotejo: 'Pauta de cotejo',
    hta_referencias: 'Referencias',
  };

  // Protocol header blocks are pinned above the tab switcher (visible across all tabs)
  const pinnedHeaderBlocks = safeBlocks.filter(b => b.type === 'protocol_header');

  const visibleBlocks = hasTabs
    ? safeBlocks.filter(b => b.type !== 'protocol_header' && (!b.tab || b.tab === activeTab))
    : safeBlocks.filter(b => b.type !== 'protocol_header');

  // Si la pestaña activa tiene subtabs:
  //   - bloques con subtab → solo si coincide con activeSubtab
  //   - bloques sin subtab → siempre visibles (rol "introducción común")
  const visibleAfterSubtab = hasSubtabs
    ? visibleBlocks.filter(b => !b.subtab || b.subtab === activeSubtab)
    : visibleBlocks;

  const mainBlocks = visibleAfterSubtab.filter(b => !b.layout_position || b.layout_position === 'main' || b.layout_position === 'full');
  const sidebarBlocks = visibleAfterSubtab.filter(b => b.layout_position === 'sidebar');
  const commonMainBlocks = hasSubtabs ? mainBlocks.filter(b => !b.subtab) : [];
  const subMainBlocks    = hasSubtabs ? mainBlocks.filter(b => b.subtab) : mainBlocks;

  // GES mode: split blocks into groups
  // criteria (Criterios de Inclusión GES) is hidden in GES mode
  // protocol_header is pinned above tabs (rendered separately)
  // Order: flowchart/algorithm → other content (text, alert…) → checklist
  const gesProtocolBlocks = (() => {
    const filtered   = safeBlocks.filter(b =>
      b.type !== 'mermaid' && b.type !== 'criteria' && b.type !== 'protocol_header'
    );
    const flows      = filtered.filter(b => b.type === 'flowchart' || b.type === 'algorithm');
    const checklists = filtered.filter(b => b.type === 'checklist');
    const middle     = filtered.filter(b =>
      b.type !== 'flowchart' && b.type !== 'algorithm' && b.type !== 'checklist'
    );
    return [...flows, ...middle, ...checklists];
  })();
  const gesMermaidBlocks = safeBlocks.filter(b => b.type === 'mermaid');

  return (
    <div className="space-y-5">

      {/* ── Pinned protocol header (above all tabs) ── */}
      {pinnedHeaderBlocks.length > 0 && (
        <div className="space-y-5">
          {pinnedHeaderBlocks.map(renderSafeBlock).filter(Boolean)}
        </div>
      )}

      {/* ── Local Protocol 3-tab mode (GES topic + protocolo local HCSFB) ── */}
      {isLocalProtocolMode && (
        <>
          <div ref={tabBarRef} style={{ top: headerH }} className="sticky z-30 scroll-mt-32 bg-white pb-2">
            <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-1.5 shadow-sm">
              <button
                onClick={() => preserveScrollDuring(() => setLocalTab('local'))}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                  localTab === 'local'
                    ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-100'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <BookOpen className="h-4 w-4" />
                Protocolo Local
              </button>
              <button
                onClick={() => preserveScrollDuring(() => setLocalTab('checklist'))}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                  localTab === 'checklist'
                    ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <ClipboardList className="h-4 w-4" />
                Pauta de Cotejo
              </button>
              {hasMermaid && (
                <button
                  onClick={() => preserveScrollDuring(() => setLocalTab('algoritmo'))}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                    localTab === 'algoritmo'
                      ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <GitBranch className="h-4 w-4" />
                  Algoritmo
                </button>
              )}
            </div>
          </div>

          <div className="space-y-5">
            {localTab === 'local' &&
              safeBlocks
                .filter(b => b.local_protocol === true)
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map(renderSafeBlock)
                .filter(Boolean)
            }
            {localTab === 'checklist' &&
              safeBlocks.filter(b => b.type === 'checklist').map(renderSafeBlock).filter(Boolean)
            }
            {localTab === 'algoritmo' &&
              safeBlocks.filter(b => b.type === 'mermaid').map(renderSafeBlock).filter(Boolean)
            }
          </div>
        </>
      )}

      {/* ── GES Protocol auto-tabs ── */}
      {isGESMode && (
        <>
          <div ref={tabBarRef} style={{ top: headerH }} className="sticky z-30 scroll-mt-32 bg-white pb-2">
            <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-1.5 shadow-sm">
              <button
                onClick={() => preserveScrollDuring(() => setGesTab('protocolo'))}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                  gesTab === 'protocolo'
                    ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-100'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <ClipboardList className="h-4 w-4" />
                Criterios y Derivación
              </button>
              <button
                onClick={() => preserveScrollDuring(() => setGesTab('algoritmo'))}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                  gesTab === 'algoritmo'
                    ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <GitBranch className="h-4 w-4" />
                Algoritmo
              </button>
            </div>
          </div>

          <div className="space-y-5">
            {gesTab === 'protocolo'
              ? gesProtocolBlocks.map(renderSafeBlock).filter(Boolean)
              : gesMermaidBlocks.map(renderSafeBlock).filter(Boolean)
            }
          </div>
        </>
      )}

      {/* ── Normal tab switcher ── */}
      {!isGESMode && hasTabs && (
        <div ref={tabBarRef} style={{ top: headerH }} className="sticky z-30 scroll-mt-32 bg-white pb-2">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-1.5 shadow-sm">
            <div className="flex gap-1.5 min-w-max">
              {tabValues.map(tab => (
                <button
                  key={tab}
                  onClick={() => updateActiveTab(tab)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap ${
                    activeTab === tab
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {TAB_LABELS[tab] || tab}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Normal blocks (non-GES, non-local-protocol mode) ── */}
      {!isGESMode && !isLocalProtocolMode && (
        <>
          {hasSubtabs ? (
            <>
              {commonMainBlocks.length > 0 && (
                <div className="space-y-5">
                  {commonMainBlocks.map(renderSafeBlock).filter(Boolean)}
                </div>
              )}
              {/* Sub-tab bar — sticky apilada justo debajo de la barra principal */}
              <div style={{ top: headerH + tabBarH }} className="sticky z-20 -mt-2 border-b border-slate-200 bg-white pt-1 pb-1">
                <div className="flex flex-wrap gap-1.5 pb-2">
                  {subtabValues.map(st => (
                    <button
                      key={st}
                      onClick={() => preserveScrollDuring(() => setActiveSubtab(st))}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        activeSubtab === st
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {TAB_LABELS[st] || st}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-5">
                {subMainBlocks.map(renderSafeBlock).filter(Boolean)}
              </div>
            </>
          ) : (
            <div className="space-y-5">
              {mainBlocks.map(renderSafeBlock).filter(Boolean)}
            </div>
          )}
          {sidebarBlocks.length > 0 && (
            <div className={sidebarBlocks.length > 1 ? 'grid gap-5 sm:grid-cols-2' : ''}>
              {sidebarBlocks.map(renderSafeBlock).filter(Boolean)}
            </div>
          )}
        </>
      )}

      {(visibleRelatedTopics.length > 0 || visibleRelatedTools.length > 0) && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.12em] text-slate-500">Contenido relacionado</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {visibleRelatedTopics.map((ref, idx) => (
              <Link key={idx} to={createPageUrl(`TopicDetail?id=${ref.topic_id}`)} onClick={rememberReturnPoint}>
                <div className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-blue-300 hover:shadow-sm">
                  <div className="mb-1.5 flex items-center gap-2">
                    <LinkIcon className="h-3.5 w-3.5 text-blue-600" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                      {ref.type === 'flujo_local' ? 'Flujo local relacionado' : 'Protocolo relacionado'}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-800">{ref.label}</p>
                </div>
              </Link>
            ))}
            {visibleRelatedTools.map((ref, idx) => (
              <Link key={idx} to={createPageUrl(`AllCalculators?calc=${ref.tool_id}`)} onClick={rememberReturnPoint}>
                <div className="rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-purple-300 hover:shadow-sm">
                  <div className="mb-1.5 flex items-center gap-2">
                    <Calculator className="h-3.5 w-3.5 text-purple-600" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-purple-700">Calculadora</span>
                  </div>
                  <p className="text-sm font-medium text-slate-800">{ref.label}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
