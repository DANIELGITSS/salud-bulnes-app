import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, AlertCircle, CheckCircle2, Info } from 'lucide-react';

// El impreso se cuelga directamente del body: así la regla de impresión puede
// descolgar el resto de la app (incluidos diálogos abiertos) sin ocultarse a sí
// mismo por estar anidado dentro de ella.
function usePrintHost() {
  const [host] = useState(() => {
    if (typeof document === 'undefined') return null;
    const element = document.createElement('div');
    element.setAttribute('data-print-root', '');
    return element;
  });
  useEffect(() => {
    if (!host) return undefined;
    document.body.appendChild(host);
    return () => { document.body.removeChild(host); };
  }, [host]);
  return host;
}

// Extrae el "Plazo: ..." del texto de interpretación para destacarlo como
// banner. Maneja variantes: "Plazo: 48-72 horas hábiles", "Plazo: 5-7 días",
// "Mantener vigilancia", etc.
function extractPlazo(interpretation) {
  if (!interpretation) return null;
  const m = interpretation.match(/Plazo:\s*([^.]+?)(?:\.|$)/i);
  if (m) return m[1].trim();
  if (/mantener vigilancia/i.test(interpretation)) return 'Mantener vigilancia';
  return null;
}

// Tono del riesgo en función de palabras clave en la interpretación.
function getRiskTone(interpretation) {
  if (!interpretation) return { tone: 'blue', Icon: Info };
  const i = interpretation.toLowerCase();
  if (/alto riesgo|prioritari|inmediat/.test(i))   return { tone: 'red',     Icon: AlertCircle };
  if (/riesgo nutricional bajo|precoz|moderad/.test(i)) return { tone: 'amber', Icon: Clock };
  if (/sin riesgo|no requiere|negativ/.test(i))    return { tone: 'emerald', Icon: CheckCircle2 };
  return { tone: 'blue', Icon: Info };
}

const TONE_CLASSES = {
  red:     { card: 'border-red-400 bg-red-50',     text: 'text-red-800',     accent: 'bg-red-600 text-white',     score: 'text-red-700' },
  amber:   { card: 'border-amber-400 bg-amber-50', text: 'text-amber-900',   accent: 'bg-amber-600 text-white',   score: 'text-amber-700' },
  emerald: { card: 'border-emerald-400 bg-emerald-50', text: 'text-emerald-900', accent: 'bg-emerald-600 text-white', score: 'text-emerald-700' },
  blue:    { card: 'border-blue-400 bg-blue-50',   text: 'text-blue-900',    accent: 'bg-blue-600 text-white',    score: 'text-blue-700' },
};

export default function PrintableResult({ title, inputs, result, patientInfo, generatedAt }) {
  const host = usePrintHost();
  const printDate = new Date(generatedAt || Date.now()).toLocaleString('es-CL', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // Normaliza `inputs`: acepta objeto { label: value } o array [{ label, value }].
  const inputEntries = Array.isArray(inputs)
    ? inputs.filter(Boolean).map((it) => [it.label, it.value])
    : (inputs ? Object.entries(inputs) : []);

  const plazo = extractPlazo(result?.interpretation);
  const { tone, Icon } = getRiskTone(result?.interpretation);
  const T = TONE_CLASSES[tone];

  // El score puede ser un número corto ("12") o una frase ("No cumple criterios ACR 2016").
  // Escala el tamaño según el largo para no romper el layout de impresión.
  const scoreStr = result?.score === undefined || result?.score === null ? '' : String(result.score);
  const scoreClass = scoreStr.length <= 4 ? 'text-5xl' : scoreStr.length <= 10 ? 'text-2xl' : 'text-base';
  const scoreIsLong = scoreStr.length > 10;

  // Quita el "Plazo: ..." del texto principal cuando lo extraemos al banner.
  const cleanInterpretation = result?.interpretation
    ? result.interpretation.replace(/Plazo:\s*[^.]+\.?/i, '').trim()
    : '';

  if (!host) return null;

  return createPortal(
    <>
      <style>{`
        @page { size: A4 portrait; margin: 10mm 12mm; }
        @media print {
          /* Reset del padding global del body para no duplicar márgenes con @page */
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          /* Se descuelga el resto de la app en vez de sólo ocultarla: con
             visibility seguía ocupando espacio y salían hojas en blanco (o con
             los diálogos abiertos) después del resultado. */
          body > *:not([data-print-root]) { display: none !important; }
          [data-print-root] { display: block !important; }
          #printable-result {
            position: static;
            width: 100%;
            padding: 0;
            font-size: 10.5pt;
          }
          /* Evita que el contenido sea forzado a una 2da página por sombras
             u otros containers de pantalla. */
          .pr-print-page { box-shadow: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
        }
      `}</style>

      <div id="printable-result" className="bg-white px-6 py-5 max-w-4xl mx-auto pr-print-page" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
        {/* Header compacto */}
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-1.5 mb-3">
          <div className="flex items-start gap-2">
            <img
              src="/logo-hospital.png"
              alt="Hospital de Bulnes"
              className="h-10 w-auto object-contain"
            />
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">{title}</h1>
              <p className="text-[10.5pt] text-slate-600">Hospital de Bulnes · Servicio de Salud Ñuble</p>
            </div>
          </div>
          <p className="text-[9pt] text-slate-500">{printDate}</p>
        </div>

        {/* Paciente — bloque inline con campos clínicos */}
        {patientInfo && (patientInfo.name || patientInfo.rut || patientInfo.record || patientInfo.servicio || patientInfo.cama) && (
          <div className="grid grid-cols-12 gap-x-3 gap-y-0.5 text-[10pt] mb-3 border border-slate-300 rounded px-2 py-1.5">
            <div className="col-span-6"><span className="text-slate-500">Paciente: </span><span className="font-semibold">{patientInfo.name || '—'}</span></div>
            <div className="col-span-3"><span className="text-slate-500">RUT: </span><span className="font-semibold">{patientInfo.rut || '—'}</span></div>
            <div className="col-span-3"><span className="text-slate-500">N° Ficha: </span><span className="font-semibold">{patientInfo.record || '—'}</span></div>
            {(patientInfo.servicio || patientInfo.cama) && (
              <>
                <div className="col-span-6"><span className="text-slate-500">Servicio: </span><span className="font-semibold">{patientInfo.servicio || '—'}</span></div>
                <div className="col-span-6"><span className="text-slate-500">Cama: </span><span className="font-semibold">{patientInfo.cama || '—'}</span></div>
              </>
            )}
          </div>
        )}

        {/* Parámetros — dos columnas densas */}
        {inputEntries.length > 0 && (
          <div className="mb-3">
            <h2 className="text-[10.5pt] font-bold text-slate-900 mb-1 uppercase tracking-wide">Parámetros evaluados</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10pt]">
              {inputEntries.map(([k, v], idx) => (
                <div key={`${k}-${idx}`} className="flex justify-between border-b border-dotted border-slate-300 py-0.5">
                  <span className="text-slate-700">{k}:</span>
                  <span className="font-semibold text-slate-900">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bloque Resultado — score + Plazo destacado */}
        <div className={`mb-3 border-2 rounded-lg p-3 ${T.card}`}>
          <div className="flex items-stretch gap-4">
            {/* Score grande */}
            {result?.score !== undefined && (
              <div className={`flex flex-col items-center justify-center border-r-2 border-slate-300 pr-4 ${scoreIsLong ? 'min-w-[120px] max-w-[170px]' : 'min-w-[80px]'}`}>
                <div className={`${scoreClass} font-extrabold leading-tight text-center ${T.score}`}>{result.score}</div>
                {result.label && <p className="text-[9pt] text-slate-600 mt-1 text-center max-w-[150px] leading-tight">{result.label}</p>}
              </div>
            )}
            {/* Texto + plazo */}
            <div className="flex-1 min-w-0">
              <div className={`flex items-center gap-1.5 text-[12pt] font-bold ${T.text} mb-1.5`}>
                <Icon className="h-4 w-4" />
                <span>{cleanInterpretation || result?.interpretation || 'Resultado'}</span>
              </div>

              {/* Plazo destacado — banner pleno */}
              {plazo && (
                <div className={`inline-flex items-center gap-2 ${T.accent} rounded-md px-3 py-1.5 font-bold text-[12pt] shadow-sm`}>
                  <Clock className="h-4 w-4" />
                  <span className="uppercase tracking-wide text-[8.5pt] font-semibold opacity-90">Plazo evaluación nutricional:</span>
                  <span className="text-[13pt]">{plazo}</span>
                </div>
              )}
            </div>
          </div>

          {/* Recomendaciones */}
          {result?.recommendations?.length > 0 && (
            <div className="mt-3 pt-2 border-t border-slate-300/60">
              <p className="text-[9.5pt] font-bold text-slate-800 mb-0.5 uppercase tracking-wide">Recomendaciones</p>
              <ul className="text-[10pt] text-slate-800 space-y-0.5">
                {result.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-1.5"><span className="text-slate-500 mt-0.5">▸</span><span>{rec}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Firma — compacta, dos columnas en una sola fila */}
        <div className="mt-8 grid grid-cols-2 gap-6 text-[9.5pt]">
          <div>
            <div className="border-b border-slate-700 h-10" />
            <p className="text-slate-600 mt-1">Nombre y firma del profesional</p>
          </div>
          <div>
            <div className="border-b border-slate-700 h-10" />
            <p className="text-slate-600 mt-1">Unidad / Cargo</p>
          </div>
        </div>

        {/* Footer mínimo */}
        <p className="text-[8pt] text-slate-400 text-center mt-4 italic">
          Documento generado automáticamente por la app de Guía Clínica HCSFB · {printDate}
        </p>
      </div>
    </>,
    host,
  );
}
