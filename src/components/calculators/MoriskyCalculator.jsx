import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Check, X } from 'lucide-react';

const YES_NO_QUESTIONS = [
  { id: 'q1', text: '¿Se olvida alguna vez de tomar sus medicamentos?' },
  { id: 'q2', text: 'En las últimas 2 semanas, ¿hubo algún día en que no tomó sus medicamentos?' },
  { id: 'q3', text: '¿Ha dejado de tomarlos o reducido la dosis sin avisar a su médico, porque se sentía peor al tomarlos?' },
  { id: 'q4', text: 'Cuando viaja o sale de casa, ¿olvida a veces llevar sus medicamentos?' },
  { id: 'q5', text: '¿Tomó ayer sus medicamentos?', reversed: true },
  { id: 'q6', text: 'Cuando siente que su enfermedad está controlada, ¿deja a veces de tomar sus medicamentos?' },
  { id: 'q7', text: '¿Se siente molesto/a o presionado/a por tener que seguir su tratamiento todos los días?' },
];

const FREQUENCY_QUESTION = '¿Con qué frecuencia tiene dificultad para recordar tomar todos sus medicamentos?';

const FREQUENCY_OPTIONS = [
  { value: 1, label: 'Nunca' },
  { value: 0.75, label: 'Casi nunca' },
  { value: 0.5, label: 'A veces' },
  { value: 0.25, label: 'Frecuentemente' },
  { value: 0, label: 'Siempre' },
];

export function getMoriskyResult(score) {
  if (score >= 8) return {
    level: 'Adherencia alta',
    bg: 'bg-emerald-50 border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-800',
    text: 'text-emerald-900',
    action: 'Reforzar el logro y mantener el plan actual.',
    recs: [
      'Continuar controles según el flujo vigente (HEARTS o PSCV habitual).',
      'Si está fuera de meta pese a buena adherencia, corresponde intensificar tratamiento.',
    ],
  };
  if (score >= 6) return {
    level: 'Adherencia intermedia',
    bg: 'bg-amber-50 border-amber-200',
    badge: 'bg-amber-100 text-amber-800',
    text: 'text-amber-900',
    action: 'Apoyo de químico farmacéutico recomendado para identificar barreras.',
    recs: [
      'Anexo 4 del Ordinario SSÑ 2026: evaluación por QF y herramientas prácticas de automanejo.',
      'Reforzar educación en cada control y reevaluar Morisky en el siguiente.',
    ],
  };
  return {
    level: 'Adherencia baja',
    bg: 'bg-red-50 border-red-200',
    badge: 'bg-red-100 text-red-800',
    text: 'text-red-900',
    action: 'Derivar a químico farmacéutico para evaluación de adherencia.',
    recs: [
      'No intensificar el tratamiento hasta corregir la adherencia.',
      'Educación farmacoterapéutica, simplificación de pauta y apoyo al automanejo.',
      'Reevaluar Morisky y PA en el próximo control (2–4 semanas).',
    ],
  };
}

function formatScore(score) {
  return Number.isInteger(score) ? String(score) : score.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function MoriskyAssessment({ onApply, onClose }) {
  const [answers, setAnswers] = useState({});

  const answeredYesNo = YES_NO_QUESTIONS.filter(q => answers[q.id] !== undefined).length;
  const complete = answeredYesNo === YES_NO_QUESTIONS.length && answers.q8 !== undefined;
  const score = complete
    ? Math.round(
        (YES_NO_QUESTIONS.reduce((sum, q) => sum + ((answers[q.id] === true) === Boolean(q.reversed) ? 1 : 0), 0) + answers.q8) * 100,
      ) / 100
    : null;
  const result = score === null ? null : getMoriskyResult(score);

  const setAnswer = (id, value) => setAnswers(prev => ({ ...prev, [id]: value }));
  const reset = () => setAnswers({});

  return (
    <div>
      <div className="bg-gradient-to-r from-teal-700 to-cyan-700 px-6 py-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Morisky MMAS-8 — Adherencia a tratamiento</h2>
            <p className="mt-0.5 text-sm text-teal-100">8 preguntas al paciente. Puntaje 0–8: ≥8 alta, 6–7 intermedia, &lt;6 baja.</p>
          </div>
          {onClose ? (
            <button type="button" onClick={onClose} className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xl font-bold">
              {score === null ? '—' : formatScore(score)}
            </span>
          )}
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {YES_NO_QUESTIONS.map((question, index) => (
          <div key={question.id} className="flex items-center justify-between gap-3 px-6 py-3">
            <p className="text-sm text-slate-700">
              <span className="mr-1.5 font-bold text-slate-400">{index + 1}.</span>
              {question.text}
            </p>
            <div className="flex shrink-0 gap-1.5">
              {[true, false].map(value => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setAnswer(question.id, value)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                    answers[question.id] === value
                      ? 'border-teal-600 bg-teal-600 text-white'
                      : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                  }`}
                >
                  {value ? 'Sí' : 'No'}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="px-6 py-3">
          <p className="mb-2 text-sm text-slate-700">
            <span className="mr-1.5 font-bold text-slate-400">8.</span>
            {FREQUENCY_QUESTION}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FREQUENCY_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setAnswer('q8', option.value)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                  answers.q8 === option.value
                    ? 'border-teal-600 bg-teal-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Respondidas {answeredYesNo + (answers.q8 !== undefined ? 1 : 0)}/8
          </span>
          <span className="text-2xl font-bold text-slate-900">
            {score === null ? '—' : formatScore(score)} <span className="text-base font-normal text-slate-400">/ 8</span>
          </span>
        </div>

        {result && (
          <div className={`rounded-xl border-2 px-4 py-3 ${result.bg}`}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className={`text-xs font-bold uppercase tracking-wider ${result.text}`}>{result.level}</span>
              <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${result.badge}`}>{formatScore(score)}/8</span>
            </div>
            <p className={`mb-2 text-sm font-medium ${result.text}`}>{result.action}</p>
            <ul className={`list-disc space-y-1 pl-5 text-sm ${result.text}`}>
              {result.recs.map(rec => <li key={rec}>{rec}</li>)}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {onApply && (
            <button
              type="button"
              onClick={() => onApply(score)}
              disabled={score === null}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check className="h-4 w-4" /> Usar puntaje {score === null ? '' : `${formatScore(score)}/8`}
            </button>
          )}
          {(answeredYesNo > 0 || answers.q8 !== undefined) && (
            <button type="button" onClick={reset} className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700">
              Reiniciar
            </button>
          )}
        </div>

        <p className="mt-2 border-t border-slate-200 pt-2 text-[11px] leading-relaxed text-slate-500">
          Morisky DE, Ang A, Krousel-Wood M, Ward HJ. <i>Predictive validity of a medication adherence measure (MMAS-8)</i>. J Clin Hypertens 2008. Instrumento exigido por el Ordinario 5/N°151 SSÑ 2026 en cada control HEARTS. No reemplaza el juicio clínico.
        </p>
      </div>
    </div>
  );
}

export default function MoriskyCalculator() {
  return (
    <Card className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
      <MoriskyAssessment />
    </Card>
  );
}
