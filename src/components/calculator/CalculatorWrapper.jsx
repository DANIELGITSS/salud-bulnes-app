import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calculator, Printer, RotateCcw, User } from 'lucide-react';
import PrintableResult from './PrintableResult';
import { SERVICIOS, CAMAS } from '@/lib/hospitalSuggestions';

// Formato RUT chileno: 12345678K → 12.345.678-K.
// Acepta dígitos y "k"/"K". El último carácter es el dígito verificador.
function formatRut(raw) {
  if (!raw) return '';
  const clean = String(raw).replace(/[^0-9kK]/g, '').toUpperCase();
  if (!clean) return '';
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!body) return dv;
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
}

export default function CalculatorWrapper({ 
  title, 
  description,
  icon: Icon = Calculator,
  gradientFrom = 'blue',
  gradientTo = 'purple',
  children,
  inputs,
  onCalculate,
  result,
  onReset,
  showPatientInfo = true,
  printOnly = false,
  requestRecordLocation = false,
  onRecordResult = null,
  embeddedPatientContext = false,
  defaultMode = 'consultivo',
}) {
  const [patientInfo, setPatientInfo] = useState({
    name: '',
    rut: '',
    record: '',
    servicio: '',
    cama: '',
  });
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [printTimestamp, setPrintTimestamp] = useState(null);
  const [printError, setPrintError] = useState('');
  // Modo de uso: 'consultivo' (sin datos de paciente) o 'registro' (nombre/RUT obligatorios).
  const [mode, setMode] = useState(defaultMode);
  // Identidad y cama capturadas al guardar, para estamparlas en el impreso.
  const [recordContext, setRecordContext] = useState(null);

  const recordsClinicalResult = showPatientInfo && !embeddedPatientContext && mode === 'registro';
  const needsPatient = recordsClinicalResult && !requestRecordLocation;
  const patientValid = !needsPatient || (patientInfo.name.trim() !== '' && patientInfo.rut.trim() !== '');
  // En registro clínico contra una cama, la identidad se pide en el selector de
  // cama, así que guardar e imprimir son un solo paso.
  const savesToBed = recordsClinicalResult && requestRecordLocation && Boolean(onRecordResult);

  const handlePrint = (context = null) => {
    if (needsPatient && !patientValid) {
      setPrintError('Para registro clínico es obligatorio anotar nombre y RUT del paciente.');
      return;
    }
    if (context) setRecordContext(context);
    setPrintError('');
    setPrintTimestamp(new Date().toISOString());
    setIsPrintMode(true);
    setTimeout(() => {
      window.print();
      setIsPrintMode(false);
    }, 100);
  };

  const saveToHistory = (calculation) => {
    const history = JSON.parse(localStorage.getItem(`calc_history_${title}`) || '[]');
    history.unshift({
      ...calculation,
      timestamp: new Date().toISOString(),
      patientInfo: needsPatient ? patientInfo : null
    });
    localStorage.setItem(`calc_history_${title}`, JSON.stringify(history.slice(0, 10)));
  };

  const handleCalculateWithHistory = () => {
    if (needsPatient && !patientValid) {
      setPrintError('Para registro clínico es obligatorio anotar nombre y RUT del paciente.');
      return;
    }
    setPrintError('');
    const calcResult = onCalculate();
    if (calcResult) {
      saveToHistory({ inputs, result: calcResult });
      // Con selector de cama el guardado lo dispara "Guardar e imprimir", no el cálculo.
      if (recordsClinicalResult && onRecordResult && !savesToBed) onRecordResult({ inputs, result: calcResult, patientInfo: needsPatient ? patientInfo : null });
    }
  };

  if (isPrintMode && result) {
    return (
      <PrintableResult
        title={title}
        inputs={inputs}
        result={result}
        patientInfo={recordContext || (needsPatient ? patientInfo : null)}
        generatedAt={printTimestamp}
      />
    );
  }

  return (
    <Card className={`p-6 bg-gradient-to-br from-${gradientFrom}-50 to-${gradientTo}-50 border-2 border-${gradientFrom}-200`}>
      <div className="flex items-center gap-3 mb-6">
        <div className={`p-3 bg-${gradientFrom}-600 rounded-xl`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-900">{title}</h3>
          {description && <p className="text-sm text-slate-600">{description}</p>}
        </div>
      </div>

      {/* Modo de uso: consultivo (sin datos) o registro clínico (paciente obligatorio) */}
      {showPatientInfo && !embeddedPatientContext && (
        <div className="mb-5">
          <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 text-xs font-semibold shadow-sm">
            <button
              type="button"
              onClick={() => { setMode('consultivo'); setPrintError(''); }}
              className={`rounded-full px-3.5 py-1.5 transition-colors ${mode === 'consultivo' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Consultivo
            </button>
            <button
              type="button"
              onClick={() => setMode('registro')}
              className={`rounded-full px-3.5 py-1.5 transition-colors ${mode === 'registro' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Registro clínico
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {mode === 'registro'
              ? requestRecordLocation ? 'Registro clínico: al guardar e imprimir se pedirá la cama y los datos del paciente, sin mostrar quién está hospitalizado.' : 'Registro clínico: nombre y RUT obligatorios; el resultado se puede imprimir para la ficha.'
              : 'Consultivo: uso rápido sin datos del paciente.'}
          </p>
        </div>
      )}

      {/* Datos del paciente — solo en modo registro clínico */}
      {needsPatient && (
        <div className="mb-6">
          <div className="flex items-center gap-2 text-sm text-slate-700 mb-2 font-semibold">
            <User className="h-4 w-4" />
            Información del paciente
            <span className="text-[10px] uppercase tracking-wide text-rose-600 font-bold ml-1">Nombre y RUT obligatorios para imprimir</span>
          </div>
          <div className="grid md:grid-cols-3 gap-3 p-4 bg-white rounded-lg border border-slate-200">
            <div>
              <Label className="text-xs">Nombre Paciente <span className="text-rose-600">*</span></Label>
              <Input
                value={patientInfo.name}
                onChange={(e) => setPatientInfo({...patientInfo, name: e.target.value})}
                placeholder="Obligatorio"
                className={`mt-1 ${!patientInfo.name.trim() ? 'border-rose-300 focus:border-rose-500' : ''}`}
              />
            </div>
            <div>
              <Label className="text-xs">RUT <span className="text-rose-600">*</span></Label>
              <Input
                value={patientInfo.rut}
                onChange={(e) => setPatientInfo({...patientInfo, rut: formatRut(e.target.value)})}
                placeholder="12.345.678-9"
                maxLength={12}
                inputMode="text"
                className={`mt-1 ${!patientInfo.rut.trim() ? 'border-rose-300 focus:border-rose-500' : ''}`}
              />
            </div>
            <div>
              <Label className="text-xs">Nº Ficha</Label>
              <Input
                value={patientInfo.record}
                onChange={(e) => setPatientInfo({...patientInfo, record: e.target.value})}
                placeholder="Opcional"
                className="mt-1"
              />
            </div>
            {!requestRecordLocation && <>
              <div>
                <Label className="text-xs">Servicio</Label>
                <input
                  value={patientInfo.servicio}
                  onChange={(e) => setPatientInfo({...patientInfo, servicio: e.target.value})}
                  list="calc-servicio-suggestions"
                  placeholder="MQ1, MQ2, Pediatría, Urgencia…"
                  className="mt-1 w-full h-9 rounded-md border border-slate-200 px-3 text-sm focus:border-blue-400 focus:outline-none"
                />
                <datalist id="calc-servicio-suggestions">
                  {SERVICIOS.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
              <div>
                <Label className="text-xs">Cama</Label>
                <input
                  value={patientInfo.cama}
                  onChange={(e) => setPatientInfo({...patientInfo, cama: e.target.value})}
                  list="calc-cama-suggestions"
                  placeholder="1-1, 2-3, Aisl 5-1..."
                  className="mt-1 w-full h-9 rounded-md border border-slate-200 px-3 text-sm focus:border-blue-400 focus:outline-none"
                />
                <datalist id="calc-cama-suggestions">
                  {CAMAS.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
            </>}
          </div>
          {printError && (
            <div className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1.5">
              {printError}
            </div>
          )}
        </div>
      )}

      {/* Calculator Content */}
      {children}

      {recordContext && (
        <div className="mt-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Resultado guardado en</p>
          <p className="mt-0.5 font-bold">
            {[recordContext.servicio, recordContext.cama && `Cama ${recordContext.cama}`].filter(Boolean).join(' · ') || 'Ubicación no consignada'}
          </p>
          <p className="text-emerald-800">{recordContext.name}{recordContext.rut ? ` · ${recordContext.rut}` : ''}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 mt-6">
        {!(printOnly && result) && (
          <Button onClick={handleCalculateWithHistory} disabled={!patientValid} title={!patientValid ? 'Anota nombre y RUT para guardar el resultado clínico' : 'Calcular'} className="flex-1">
            <Calculator className="h-4 w-4 mr-2" />
            Calcular
          </Button>
        )}
        {result && (
          <>
            {savesToBed ? (
              // Un solo botón: abre el selector de cama y, al guardar, imprime.
              <Button
                type="button"
                onClick={() => onRecordResult({ inputs, result, patientInfo: needsPatient ? patientInfo : null, print: handlePrint })}
                title="Guardar el resultado en la cama del paciente e imprimirlo"
                className="flex-1 bg-emerald-700 hover:bg-emerald-800"
              >
                <Printer className="h-4 w-4 mr-2" />
                Guardar e imprimir
              </Button>
            ) : (
              <>
                {printOnly && recordsClinicalResult && onRecordResult && (
                  <Button type="button" onClick={() => onRecordResult({ inputs, result, patientInfo: needsPatient ? patientInfo : null })} disabled={!patientValid} title={!patientValid ? 'Anota nombre y RUT para guardar el resultado clínico' : 'Guardar en registro hospitalario'} className="flex-1 bg-emerald-700 hover:bg-emerald-800">
                    Guardar en registro
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => handlePrint()}
                  disabled={!patientValid}
                  title={!patientValid ? 'Para imprimir hay que anotar nombre y RUT del paciente' : 'Imprimir resultado'}
                  className={`${printOnly ? 'flex-1' : ''} ${!patientValid ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </Button>
              </>
            )}
            <Button variant="outline" onClick={onReset}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
