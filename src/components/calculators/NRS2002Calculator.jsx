import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calculator, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import CalculatorWrapper from '../calculator/CalculatorWrapper';
import HospitalLocationIndexDialog from '@/components/hospitalizados/HospitalLocationIndexDialog';
import { nrsEvaluation, savePendingClinicalResult } from '@/lib/hospitalNrsRegistry';

// Justificaciones de muy alto riesgo por indicación médica (protocolo local HCSFB).
// Si el clínico marca al menos una, el paciente se categoriza como muy alto riesgo
// con plazo 24–48 h y el resto del NRS-2002 deja de aplicar.
const MEDICAL_HIGH_RISK_REASONS = [
  'Cirugía mayor reciente o programada (cabeza/cuello, esofágica, gástrica, pancreática, hepatobiliar)',
  'Politraumatizado o quemado grave (>20% SCT)',
  'Sepsis grave o shock séptico',
  'Pancreatitis aguda grave',
  'Insuficiencia orgánica aguda descompensada (hepática, renal o respiratoria)',
  'Cáncer en curso de quimio/radioterapia con compromiso de la ingesta',
  'ACV agudo con disfagia documentada',
  'Ayuno o ingesta nula > 5 días',
  'IMC < 18,5 con descompensación clínica aguda',
  'Soporte nutricional especializado en curso (nutrición parenteral o enteral)',
  'Otra indicación médica explícita del clínico tratante',
];

export default function NRS2002Calculator({ onApplyResult }) {
  // Paso 0: muy alto riesgo por indicación médica (corta el protocolo si aplica).
  const [medicalHighRisk, setMedicalHighRisk] = useState(null); // null | true | false
  const [medicalReasons, setMedicalReasons] = useState([]);
  const [nutritionalException, setNutritionalException] = useState(null); // null | 'si' | 'no'
  const [registryPrompt, setRegistryPrompt] = useState(null);
  const requestHospitalIndex = payload => setRegistryPrompt(payload);

  // Mini calculadora de IMC: aparece en dos lugares (Q1 del tamizaje y en la
  // evaluación formal). `imcCalcTarget` marca quién la abrió para que el botón
  // "Usar resultado" sepa a dónde aplicar.
  const [imcCalcTarget, setImcCalcTarget] = useState(null); // null | 'q1' | 'estado'
  const [imcWeight, setImcWeight] = useState(''); // kg
  const [imcHeight, setImcHeight] = useState(''); // cm

  // Apoyos para el Estado Nutricional: % de baja de peso (con tiempo) e ingesta.
  // Ambos permiten "Aplicar" el resultado al estado nutricional (como el IMC).
  const [showWeightHelper, setShowWeightHelper] = useState(false);
  const [showIntakeHelp, setShowIntakeHelp] = useState(false);
  const [pesoHabitual, setPesoHabitual] = useState(''); // kg
  const [pesoActual, setPesoActual] = useState('');     // kg
  const [weightMonths, setWeightMonths] = useState(''); // '' | '1' | '2' | '3'
  const [intakeSel, setIntakeSel] = useState(null);     // null | 0 | 1 | 2 | 3
  const pesoLossPct = (() => {
    const hab = Number(String(pesoHabitual).replace(',', '.'));
    const act = Number(String(pesoActual).replace(',', '.'));
    if (!Number.isFinite(hab) || !Number.isFinite(act) || hab <= 0 || act <= 0) return null;
    return ((hab - act) / hab) * 100;
  })();
  // Puntaje de estado nutricional sugerido por la baja de peso + tiempo.
  const weightStatus = (() => {
    if (pesoLossPct === null) return null;
    if (pesoLossPct <= 5) return 0;            // ≤5%: no puntúa por peso
    if (!weightMonths) return null;            // >5% pero falta el tiempo
    if (pesoLossPct > 15) return 3;             // >15% en ≤3 meses: grave
    if (weightMonths === '1') return 3;         // >5% en 1 mes: grave
    if (weightMonths === '2') return 2;         // >5% en 2 meses: moderada
    return 1;                                   // >5% y ≤15% en 3 meses: leve
  })();
  const STATUS_LABEL = ['Normal (0 pts)', 'Desnutrición leve (1 pt)', 'Desnutrición moderada (2 pts)', 'Desnutrición grave (3 pts)'];
  const imcValue = (() => {
    const w = parseFloat(String(imcWeight).replace(',', '.'));
    const hCm = parseFloat(String(imcHeight).replace(',', '.'));
    if (!w || !hCm || w <= 0 || hCm <= 0) return null;
    const hM = hCm > 3 ? hCm / 100 : hCm; // tolera ingreso en metros
    return +(w / (hM * hM)).toFixed(1);
  })();
  // Sugerencia de categoría de Estado Nutricional según IMC (cuando se calcula
  // desde la evaluación formal). El usuario igual puede confirmar/cambiar.
  const suggestedNutritionalCategory = (() => {
    if (imcValue == null) return null;
    if (imcValue < 18.5)  return { value: 3, label: 'Desnutrición Grave (3 pts)' };
    if (imcValue < 20.5)  return { value: 2, label: 'Desnutrición Moderada (2 pts)' };
    return { value: 0, label: 'Normal (0 pts) — combinar con pérdida de peso e ingesta' };
  })();
  const applyImcResult = () => {
    if (imcValue == null) return;
    if (imcCalcTarget === 'q1') {
      // Q1 del tamizaje + propagar la categoría de Estado Nutricional sugerida
      // al paso 2 (evaluación formal) para no obligar a recalcular después.
      setScreeningAnswers(prev => ({ ...prev, lowIMC: imcValue < 20.5 }));
      if (suggestedNutritionalCategory) {
        setFullScore(prev => ({ ...prev, nutritionalStatus: suggestedNutritionalCategory.value }));
      }
    } else if (imcCalcTarget === 'estado' && suggestedNutritionalCategory) {
      setFullScore(prev => ({ ...prev, nutritionalStatus: suggestedNutritionalCategory.value }));
    }
    setImcCalcTarget(null);
  };

  // Panel reutilizable de mini-calculadora IMC.
  const renderImcPanel = (target) => {
    if (imcCalcTarget !== target) return null;
    return (
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end bg-white border border-blue-200 rounded-lg p-3">
        <div>
          <Label className="text-[11px] text-slate-600">Peso (kg)</Label>
          <input
            type="text"
            inputMode="decimal"
            value={imcWeight}
            onChange={e => setImcWeight(e.target.value)}
            placeholder="Ej: 68"
            className="mt-0.5 w-full h-8 rounded-md border border-slate-200 px-2 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>
        <div>
          <Label className="text-[11px] text-slate-600">Talla (cm)</Label>
          <input
            type="text"
            inputMode="decimal"
            value={imcHeight}
            onChange={e => setImcHeight(e.target.value)}
            placeholder="Ej: 170"
            className="mt-0.5 w-full h-8 rounded-md border border-slate-200 px-2 text-sm focus:border-blue-400 focus:outline-none"
          />
        </div>
        <div className={`px-2 py-1.5 rounded-md text-center min-w-[90px] ${
          imcValue == null ? 'bg-slate-100 text-slate-400' :
          imcValue < 18.5 ? 'bg-red-100 text-red-800 border border-red-300' :
          imcValue < 20.5 ? 'bg-amber-100 text-amber-800 border border-amber-300' :
          'bg-emerald-100 text-emerald-800 border border-emerald-300'
        }`}>
          <div className="text-[9px] uppercase tracking-wide opacity-70">IMC</div>
          <div className="text-base font-bold leading-tight">{imcValue ?? '—'}</div>
          <div className="text-[9px] opacity-80">
            {imcValue == null ? '' : imcValue < 18.5 ? '< 18,5' : imcValue < 20.5 ? '< 20,5' : '≥ 20,5'}
          </div>
        </div>
        <Button
          size="sm"
          onClick={applyImcResult}
          disabled={imcValue == null}
          className="h-9"
          title={target === 'q1' ? 'Aplica el resultado a la pregunta 1' : 'Aplica la categoría sugerida al Estado Nutricional'}
        >Usar resultado</Button>
        {suggestedNutritionalCategory && (
          <p className="sm:col-span-4 text-[11px] text-slate-600 italic">
            {target === 'q1'
              ? <>Al aplicar también se prefija el Estado Nutricional del paso 2 como <strong>{suggestedNutritionalCategory.label}</strong>. Validá considerando pérdida de peso e ingesta.</>
              : <>Sugerencia para Estado Nutricional: <strong>{suggestedNutritionalCategory.label}</strong>. Validá considerando pérdida de peso e ingesta antes de aplicar.</>
            }
          </p>
        )}
      </div>
    );
  };

  const [screeningAnswers, setScreeningAnswers] = useState({
    lowIMC: null,
    weightLoss: null,
    reducedIntake: null,
    severeIllness: null
  });
  
  const [fullScore, setFullScore] = useState({
    nutritionalStatus: 0,
    diseaseSeverity: 0,
    age: 0
  });
  
  const [showFullAssessment, setShowFullAssessment] = useState(false);

  const screeningComplete = Object.values(screeningAnswers).every(v => v !== null);
  const needsFullAssessment = Object.values(screeningAnswers).some(v => v === true);
  const screeningSummary = {
    'IMC < 20,5 kg/m²': screeningAnswers.lowIMC === null ? 'No contestado' : screeningAnswers.lowIMC ? 'Sí' : 'No',
    'Pérdida de peso últimos 3 meses': screeningAnswers.weightLoss === null ? 'No contestado' : screeningAnswers.weightLoss ? 'Sí' : 'No',
    'Disminución de ingesta última semana': screeningAnswers.reducedIntake === null ? 'No contestado' : screeningAnswers.reducedIntake ? 'Sí' : 'No',
    'Paciente gravemente enfermo': screeningAnswers.severeIllness === null ? 'No contestado' : screeningAnswers.severeIllness ? 'Sí' : 'No'
  };

  const calculateTotalScore = () => {
    return fullScore.nutritionalStatus + fullScore.diseaseSeverity + fullScore.age;
  };

  const getInterpretation = (total) => {
    if (total >= 3) {
      return {
        level: 'Alto Riesgo Nutricional',
        color: 'text-red-700 bg-red-50 border-red-200',
        icon: AlertCircle,
        action: 'Derivación a Nutrición prioritaria',
        timing: 'Plazo: 48-72 horas hábiles',
        details: [
          'Evaluación nutricional completa',
          'Definición de intervención o soporte nutricional',
          'Monitoreo estrecho de ingesta'
        ]
      };
    } else if (total > 0) {
      return {
        level: 'Riesgo Nutricional Bajo',
        color: 'text-amber-700 bg-amber-50 border-amber-200',
        icon: Info,
        action: 'Requiere evaluación nutricional precoz',
        timing: 'Plazo: 5-7 días hábiles',
        details: [
          'Mantener vigilancia clínica',
          'Reevaluar ante deterioro o cambios en la ingesta',
          'Evaluación según criterio y demanda del equipo de nutrición'
        ]
      };
    } else {
      return {
        level: 'Sin Riesgo Nutricional',
        color: 'text-green-700 bg-green-50 border-green-200',
        icon: CheckCircle2,
        action: 'No requiere evaluación formal precoz',
        timing: 'Mantener vigilancia',
        details: [
          'Mantener vigilancia clínica',
          'Reevaluar ante deterioro o cambios en la ingesta',
          'Evaluación a criterio del equipo de nutrición'
        ]
      };
    }
  };

  const resetCalculator = () => {
    setMedicalHighRisk(null);
    setMedicalReasons([]);
    setNutritionalException(null);
    setScreeningAnswers({
      lowIMC: null,
      weightLoss: null,
      reducedIntake: null,
      severeIllness: null
    });
    setFullScore({
      nutritionalStatus: 0,
      diseaseSeverity: 0,
      age: 0
    });
    setShowFullAssessment(false);
    setImcWeight('');
    setImcHeight('');
    setImcCalcTarget(null);
    setShowWeightHelper(false);
    setShowIntakeHelp(false);
    setPesoHabitual('');
    setPesoActual('');
    setWeightMonths('');
    setIntakeSel(null);
    setRegistryPrompt(null);
    setLocationMessage('');
  };

  // Datos antropométricos para el impreso — sólo aparecen si el clínico
  // ingresó peso y talla en la mini-calc IMC.
  const anthroForPrint = (() => {
    const w = parseFloat(String(imcWeight).replace(',', '.'));
    const hCm = parseFloat(String(imcHeight).replace(',', '.'));
    if (!w || !hCm || w <= 0 || hCm <= 0) return null;
    const hM = hCm > 3 ? hCm / 100 : hCm;
    return {
      'Peso de ingreso': `${w} kg`,
      'Talla de ingreso': hCm > 3 ? `${hCm} cm` : `${hCm} m`,
      'IMC calculado': `${(w / (hM * hM)).toFixed(1)} kg/m²`,
    };
  })();

  const toggleReason = (reason) => {
    setMedicalReasons(prev => prev.includes(reason)
      ? prev.filter(r => r !== reason)
      : [...prev, reason]
    );
  };

  const totalScore = calculateTotalScore();
  const interpretation = showFullAssessment ? getInterpretation(totalScore) : null;
  const isExceptionCutoff = nutritionalException === 'no';
  const isMedicalHighRiskCutoff = nutritionalException === 'si' && medicalHighRisk === true;
  const shouldShowMedicalHighRisk = nutritionalException === 'si';
  const shouldShowNrsScreening = shouldShowMedicalHighRisk && medicalHighRisk !== true;
  const printOnly = isExceptionCutoff || isMedicalHighRiskCutoff;

  const resultData = (() => {
    if (isExceptionCutoff) {
      return {
        score: '—',
        label: 'No corresponde aplicar tamizaje',
        interpretation: 'Excepción registrada: no corresponde aplicar NRS-2002 en este paciente.',
        recommendations: [
          'Imprimir constancia del resultado de excepción',
          'Mantener registro en ficha clínica según protocolo local',
          'Si cambia la condición clínica o deja de aplicar la excepción, reevaluar necesidad de tamizaje nutricional',
        ],
      };
    }

    // Caso prioritario: muy alto riesgo por indicación médica → termina el protocolo.
    if (isMedicalHighRiskCutoff) {
      return {
        score: '★',
        label: 'Muy alto riesgo por indicación médica',
        interpretation: 'Muy Alto Riesgo Nutricional (por indicación médica) - Derivación a Nutrición prioritaria. Plazo: 24-48 horas hábiles.',
        recommendations: [
          'Evaluación nutricional completa dentro de 24–48 horas hábiles',
          'Definición de intervención o soporte nutricional especializado',
          'Monitoreo estrecho de ingesta y tolerancia',
          ...(medicalReasons.length > 0
            ? medicalReasons.map(r => `Justificación: ${r}`)
            : ['Justificación: muy alto riesgo por indicación médica consignado por clínico tratante']),
        ],
      };
    }

    if (screeningComplete && !needsFullAssessment) {
      return {
        score: 0,
        label: 'Tamizaje inicial negativo',
        interpretation: 'Sin riesgo nutricional actual. Mantener vigilancia clínica y reevaluar ante cambios.',
        recommendations: [
          'Mantener vigilancia clínica',
          'Reevaluar ante deterioro o cambios en la ingesta',
          'Solicitar evaluación nutricional según criterio clínico'
        ]
      };
    }

    if (interpretation) {
      return {
        score: totalScore,
        label: `Puntaje NRS-2002 (${fullScore.nutritionalStatus} + ${fullScore.diseaseSeverity} + ${fullScore.age})`,
        interpretation: `${interpretation.level} - ${interpretation.action}. ${interpretation.timing}`,
        recommendations: interpretation.details
      };
    }

    return null;
  })();

  const inputsData = (() => {
    if (isExceptionCutoff) {
      return {
        'Evaluación nutricional': 'No corresponde (excepción)',
        'Resultado': 'Tamizaje no aplicado',
      };
    }

    if (isMedicalHighRiskCutoff) {
      return {
        'Evaluación nutricional': 'Sí corresponde evaluar',
        'Muy alto riesgo por indicación médica': 'Sí',
        'Justificaciones': medicalReasons.length > 0 ? medicalReasons.join(' · ') : 'Consignar en ficha clínica',
        ...(anthroForPrint || {}),
      };
    }

    if (screeningComplete && !needsFullAssessment) {
      return {
        'Evaluación nutricional': 'Sí corresponde evaluar',
        'Muy alto riesgo por indicación médica': 'No',
        ...screeningSummary,
        'Resultado tamizaje': 'Normal',
        ...(anthroForPrint || {}),
      };
    }

    if (showFullAssessment) {
      return {
        'Evaluación nutricional': 'Sí corresponde evaluar',
        'Muy alto riesgo por indicación médica': 'No',
        ...screeningSummary,
        'Resultado tamizaje': 'Alterado',
        'Estado nutricional': `${fullScore.nutritionalStatus} puntos`,
        'Severidad enfermedad': `${fullScore.diseaseSeverity} puntos`,
        'Edad': fullScore.age === 1 ? '≥ 70 años' : '< 70 años',
        ...(anthroForPrint || {}),
      };
    }

    return null;
  })();

  return (<>
    <CalculatorWrapper
      title="NRS-2002"
      description="Nutritional Risk Screening - Tamizaje Nutricional"
      icon={Calculator}
      gradientFrom="green"
      gradientTo="emerald"
      inputs={inputsData}
      result={resultData}
      onCalculate={() => resultData}
      onReset={resetCalculator}
      printOnly={printOnly}
      requestRecordLocation
      onRecordResult={requestHospitalIndex}
      embeddedPatientContext={Boolean(onApplyResult)}
      defaultMode="registro"
    >

      <div className="space-y-6">

        {/* Excepción de evaluación nutricional */}
        <div className="rounded-xl p-5 border-2 border-slate-200 bg-white">
          <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
            <span className="bg-slate-700 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">0</span>
            Excepción de evaluación nutricional
          </h4>
          <p className="text-xs text-slate-600 mb-3">
            ¿Corresponde evaluación nutricional para este paciente? Si <strong>Sí</strong>, se aplica el tamizaje NRS-2002 a continuación. Si es una <strong>excepción</strong>, no corresponde aplicarlo.
          </p>
          <div className="flex gap-2">
            <Button
              variant={nutritionalException === 'si' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setNutritionalException('si')}
              className={nutritionalException === 'si' ? 'bg-slate-700 hover:bg-slate-800' : ''}
            >Sí, aplicar tamizaje</Button>
            <Button
              variant={nutritionalException === 'no' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setNutritionalException('no');
                setMedicalHighRisk(null);
                setMedicalReasons([]);
                setShowFullAssessment(false);
              }}
            >No corresponde (excepción)</Button>
          </div>
          {nutritionalException === 'no' && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Tamizaje detenido por excepción.</p>
              <p className="mt-1">No se mostrarán las etapas siguientes. Completa nombre y RUT arriba para imprimir la constancia.</p>
            </div>
          )}
        </div>

        {/* Etapa 1: Muy alto riesgo por indicación médica (corta el protocolo) */}
        {shouldShowMedicalHighRisk && (
        <div className={`rounded-xl p-5 border-2 ${medicalHighRisk === true ? 'bg-red-50 border-red-300' : 'bg-white border-slate-200'}`}>
          <h4 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
            <span className="bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">0</span>
            Muy alto riesgo por indicación médica
            <span className="text-[10px] uppercase tracking-wide bg-red-100 text-red-800 px-1.5 py-0.5 rounded border border-red-300">Protocolo local · plazo 24-48 h</span>
          </h4>
          <p className="text-xs text-slate-600 mb-3">
            Si el clínico determina que el paciente tiene <strong>muy alto riesgo nutricional por indicación médica</strong>,
            se deriva a Nutrición en 24-48 horas hábiles y el resto del NRS-2002 no se aplica.
          </p>
          <div className="flex gap-2 mb-3">
            <Button
              variant={medicalHighRisk === true ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setMedicalHighRisk(true);
                setShowFullAssessment(false);
              }}
              className={medicalHighRisk === true ? 'bg-red-600 hover:bg-red-700' : ''}
            >Sí, muy alto riesgo por indicación médica</Button>
            <Button
              variant={medicalHighRisk === false ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setMedicalHighRisk(false); setMedicalReasons([]); }}
            >No, aplicar tamizaje NRS-2002</Button>
          </div>

          {medicalHighRisk === true && (
            <div className="bg-white rounded-lg border border-red-200 p-3">
              <p className="text-sm font-semibold text-slate-800 mb-2">Justificación (marcá al menos una):</p>
              <div className="space-y-1.5">
                {MEDICAL_HIGH_RISK_REASONS.map(reason => (
                  <label key={reason} className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer hover:bg-red-50/40 rounded px-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={medicalReasons.includes(reason)}
                      onChange={() => toggleReason(reason)}
                      className="mt-0.5 accent-red-600"
                    />
                    <span>{reason}</span>
                  </label>
                ))}
              </div>
              {medicalReasons.length === 0 && (
                <p className="text-[11px] text-red-700 mt-2 italic">
                  Puedes imprimir de inmediato. Si corresponde, marca una justificación para que aparezca en el impreso.
                </p>
              )}
            </div>
          )}
        </div>
        )}

      {/* Si hay excepción o alto riesgo médico, no se muestra el resto del tamizaje */}
      {shouldShowNrsScreening && (<>
        <div className="bg-white rounded-xl p-5 border border-slate-200">
          <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
            Tamizaje Inicial (4 preguntas)
          </h4>
          
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <Label className="text-sm font-semibold mb-2 block">1. ¿IMC &lt; 20,5 kg/m²?</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={screeningAnswers.lowIMC === true ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setScreeningAnswers({...screeningAnswers, lowIMC: true})}
                >
                  Sí
                </Button>
                <Button
                  variant={screeningAnswers.lowIMC === false ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setScreeningAnswers({...screeningAnswers, lowIMC: false})}
                >
                  No
                </Button>
                <button
                  type="button"
                  onClick={() => setImcCalcTarget(t => t === 'q1' ? null : 'q1')}
                  className="ml-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700 hover:text-blue-900 hover:bg-blue-100 border border-blue-300 rounded px-2 py-1"
                  title="Mini calculadora de IMC con peso y talla"
                >
                  <Calculator className="h-3 w-3" />
                  Calcular IMC
                </button>
              </div>

              {renderImcPanel('q1')}
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <Label className="text-sm font-semibold mb-2 block">2. ¿Ha perdido peso en los últimos 3 meses?</Label>
              <div className="flex gap-2">
                <Button
                  variant={screeningAnswers.weightLoss === true ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setScreeningAnswers({...screeningAnswers, weightLoss: true})}
                >
                  Sí
                </Button>
                <Button
                  variant={screeningAnswers.weightLoss === false ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setScreeningAnswers({...screeningAnswers, weightLoss: false})}
                >
                  No
                </Button>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <Label className="text-sm font-semibold mb-2 block">3. ¿Ha disminuido su ingesta alimentaria en la última semana?</Label>
              <div className="flex gap-2">
                <Button
                  variant={screeningAnswers.reducedIntake === true ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setScreeningAnswers({...screeningAnswers, reducedIntake: true})}
                >
                  Sí
                </Button>
                <Button
                  variant={screeningAnswers.reducedIntake === false ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setScreeningAnswers({...screeningAnswers, reducedIntake: false})}
                >
                  No
                </Button>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <Label className="text-sm font-semibold mb-2 block">4. ¿Está el paciente gravemente enfermo?</Label>
              <div className="flex gap-2">
                <Button
                  variant={screeningAnswers.severeIllness === true ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setScreeningAnswers({...screeningAnswers, severeIllness: true})}
                >
                  Sí
                </Button>
                <Button
                  variant={screeningAnswers.severeIllness === false ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setScreeningAnswers({...screeningAnswers, severeIllness: false})}
                >
                  No
                </Button>
              </div>
            </div>
          </div>

          {screeningComplete && !needsFullAssessment && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-900">Sin riesgo nutricional actual</p>
                  <p className="text-sm text-green-700 mt-1">
                    Todas las respuestas son negativas. Mantener vigilancia clínica y reevaluar ante cambios.
                  </p>
                </div>
              </div>
            </div>
          )}

          {screeningComplete && needsFullAssessment && !showFullAssessment && (
            <div className="mt-4">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-900">Tamizaje Alterado</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Al menos una respuesta es positiva. Debe completarse la Etapa 2 del NRS-2002.
                    </p>
                  </div>
                </div>
              </div>
              <Button onClick={() => setShowFullAssessment(true)} className="w-full">
                Continuar a Evaluación Formal →
              </Button>
            </div>
          )}
        </div>

        {/* Etapa 2: Evaluación Formal */}
        {showFullAssessment && (
          <div className="bg-white rounded-xl p-5 border border-slate-200">
            <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
              Evaluación Formal Completa
            </h4>

            <div className="space-y-6">
              {/* Estado Nutricional */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <Label className="font-semibold">Estado Nutricional</Label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setShowWeightHelper(v => !v)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 border border-emerald-300 rounded px-2 py-1"
                      title="Calcular el % de baja de peso con peso habitual y actual"
                    >
                      <Calculator className="h-3 w-3" />
                      % baja de peso
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowIntakeHelp(v => !v)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700 hover:text-amber-900 hover:bg-amber-100 border border-amber-300 rounded px-2 py-1"
                      title="Ejemplos para estimar la ingesta de la última semana"
                    >
                      <Info className="h-3 w-3" />
                      Ayuda ingesta
                    </button>
                    <button
                      type="button"
                      onClick={() => setImcCalcTarget(t => t === 'estado' ? null : 'estado')}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700 hover:text-blue-900 hover:bg-blue-100 border border-blue-300 rounded px-2 py-1"
                      title="Mini calculadora de IMC — sugiere categoría según resultado"
                    >
                      <Calculator className="h-3 w-3" />
                      Calcular IMC
                    </button>
                  </div>
                </div>

                {showWeightHelper && (
                  <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="mb-2 text-xs font-semibold text-emerald-900">Baja de peso → estado nutricional</p>
                    <div className="mb-2 grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px] text-slate-600">Peso habitual (kg)</Label>
                        <input type="number" min="0" step="0.1" value={pesoHabitual} onChange={e => setPesoHabitual(e.target.value)} className="h-8 w-full rounded-md border border-slate-300 px-2 text-sm" placeholder="Ej: 70" />
                      </div>
                      <div>
                        <Label className="text-[11px] text-slate-600">Peso actual (kg)</Label>
                        <input type="number" min="0" step="0.1" value={pesoActual} onChange={e => setPesoActual(e.target.value)} className="h-8 w-full rounded-md border border-slate-300 px-2 text-sm" placeholder="Ej: 64" />
                      </div>
                    </div>
                    <Label className="text-[11px] text-slate-600">¿En cuánto tiempo bajó?</Label>
                    <div className="mb-2 mt-1 flex flex-wrap gap-1.5">
                      {[['1', '1 mes'], ['2', '2 meses'], ['3', '3 meses']].map(([v, l]) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setWeightMonths(v)}
                          className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${weightMonths === v ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                        >{l}</button>
                      ))}
                    </div>
                    {pesoLossPct !== null && (
                      <p className="text-sm font-bold text-emerald-900">
                        Baja de peso: {pesoLossPct.toFixed(1)}%
                        {pesoLossPct < 0 ? ' (subió de peso)' : pesoLossPct <= 5 ? ' — ≤5%, no puntúa por peso' : !weightMonths ? ' — >5%: elige el tiempo' : ` → ${STATUS_LABEL[weightStatus]}`}
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={weightStatus === null}
                      onClick={() => setFullScore(prev => ({ ...prev, nutritionalStatus: weightStatus }))}
                      className="mt-2 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aplicar al estado nutricional
                    </button>
                    <p className="mt-2 text-[11px] text-slate-500">Al aplicar, se reemplaza el Estado Nutricional por el puntaje calculado por baja de peso. Cómo preguntar: «¿Cuánto pesaba y cuánto pesa ahora? ¿En cuánto tiempo bajó?»</p>
                  </div>
                )}

                {showIntakeHelp && (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="mb-1 text-xs font-semibold text-amber-900">Ingesta de la última semana → estado nutricional</p>
                    <p className="mb-2 text-[11px] text-slate-600">Cómo preguntar: «En la última semana, ¿cuánto ha comido respecto a lo habitual? ¿Ha saltado comidas o ha estado días sin comer?»</p>
                    <div className="space-y-1.5">
                      {[
                        [0, '>75% — ingesta normal', 'Come casi como siempre.'],
                        [1, '50-75% (leve, 1 pt)', 'Come algo menos; salta ocasionalmente una comida.'],
                        [2, '25-60% (moderada, 2 pts)', 'Come ~la mitad; salta comidas casi a diario o 1-2 días comiendo muy poco.'],
                        [3, '0-25% (grave, 3 pts)', 'Casi no come; solo líquidos / «picotea» o ≥3-4 días casi sin comer.'],
                      ].map(([val, title, desc]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setIntakeSel(val)}
                          className={`w-full rounded-md border px-2.5 py-1.5 text-left ${intakeSel === val ? 'border-amber-500 bg-amber-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                        >
                          <span className="text-xs font-semibold text-slate-800">{title}</span>
                          <span className="block text-[11px] text-slate-500">{desc}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={intakeSel === null}
                      onClick={() => setFullScore(prev => ({ ...prev, nutritionalStatus: intakeSel }))}
                      className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aplicar al estado nutricional
                    </button>
                    <p className="mt-2 text-[11px] text-slate-500">Al aplicar, se reemplaza el Estado Nutricional por el puntaje seleccionado por ingesta.</p>
                  </div>
                )}

                {renderImcPanel('estado')}
                <div className="space-y-2 mt-3">
                  <button
                    onClick={() => setFullScore({...fullScore, nutritionalStatus: 0})}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                      fullScore.nutritionalStatus === 0 ? 'bg-blue-50 border-blue-500' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-sm"><strong>Normal:</strong> Estado nutricional normal</span>
                      <Badge variant="outline">0 pts</Badge>
                    </div>
                  </button>

                  <button
                    onClick={() => setFullScore({...fullScore, nutritionalStatus: 1})}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                      fullScore.nutritionalStatus === 1 ? 'bg-blue-50 border-blue-500' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold">Desnutrición Leve</span>
                      <Badge variant="outline">1 pt</Badge>
                    </div>
                    <p className="text-xs text-slate-600">Pérdida de peso &gt;5% y ≤15% en 3 meses o ingesta 50-75% en última semana</p>
                  </button>

                  <button
                    onClick={() => setFullScore({...fullScore, nutritionalStatus: 2})}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                      fullScore.nutritionalStatus === 2 ? 'bg-blue-50 border-blue-500' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold">Desnutrición Moderada</span>
                      <Badge variant="outline">2 pts</Badge>
                    </div>
                    <p className="text-xs text-slate-600">Pérdida de peso &gt;5% en 2 meses, IMC 18,5-20,5 o ingesta 25-60% en última semana</p>
                  </button>

                  <button
                    onClick={() => setFullScore({...fullScore, nutritionalStatus: 3})}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                      fullScore.nutritionalStatus === 3 ? 'bg-blue-50 border-blue-500' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold">Desnutrición Grave</span>
                      <Badge variant="outline">3 pts</Badge>
                    </div>
                    <p className="text-xs text-slate-600">Pérdida de peso &gt;5% en 1 mes, &gt;15% en hasta 3 meses, IMC &lt;18,5 o ingesta 0-25% en última semana</p>
                  </button>
                </div>
              </div>

              {/* Severidad de Enfermedad */}
              <div>
                <Label className="font-semibold mb-3 block">Severidad de la Enfermedad</Label>
                <div className="space-y-2">
                  <button
                    onClick={() => setFullScore({...fullScore, diseaseSeverity: 0})}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                      fullScore.diseaseSeverity === 0 ? 'bg-purple-50 border-purple-500' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-sm"><strong>Ausente:</strong> Requerimientos nutricionales normales</span>
                      <Badge variant="outline">0 pts</Badge>
                    </div>
                  </button>

                  <button
                    onClick={() => setFullScore({...fullScore, diseaseSeverity: 1})}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                      fullScore.diseaseSeverity === 1 ? 'bg-purple-50 border-purple-500' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold">Leve</span>
                      <Badge variant="outline">1 pt</Badge>
                    </div>
                    <p className="text-xs text-slate-600">Fractura de cadera, pacientes crónicos con complicaciones, EPOC, hemodiálisis, diabetes</p>
                  </button>

                  <button
                    onClick={() => setFullScore({...fullScore, diseaseSeverity: 2})}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                      fullScore.diseaseSeverity === 2 ? 'bg-purple-50 border-purple-500' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold">Moderada</span>
                      <Badge variant="outline">2 pts</Badge>
                    </div>
                    <p className="text-xs text-slate-600">Cirugía mayor abdominal, AVC, neumonía severa, tumores hematológicos</p>
                  </button>

                  <button
                    onClick={() => setFullScore({...fullScore, diseaseSeverity: 3})}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                      fullScore.diseaseSeverity === 3 ? 'bg-purple-50 border-purple-500' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold">Grave</span>
                      <Badge variant="outline">3 pts</Badge>
                    </div>
                    <p className="text-xs text-slate-600">Traumatismo craneoencefálico, trasplante medular, pacientes en cuidados intensivos (APACHE-10)</p>
                  </button>
                </div>
              </div>

              {/* Edad */}
              <div>
                <Label className="font-semibold mb-3 block">Ajuste por Edad</Label>
                <div className="space-y-2">
                  <button
                    onClick={() => setFullScore({...fullScore, age: 0})}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                      fullScore.age === 0 ? 'bg-green-50 border-green-500' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-sm">&lt; 70 años</span>
                      <Badge variant="outline">0 pts</Badge>
                    </div>
                  </button>

                  <button
                    onClick={() => setFullScore({...fullScore, age: 1})}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                      fullScore.age === 1 ? 'bg-green-50 border-green-500' : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-sm">≥ 70 años</span>
                      <Badge variant="outline">+1 pt</Badge>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Resultado */}
            {interpretation && (
              <div className="mt-6">
                <div className="bg-slate-900 text-white rounded-xl p-5 mb-4">
                  <div className="text-center">
                    <p className="text-sm opacity-80 mb-1">Puntaje Total NRS-2002</p>
                    <p className="text-5xl font-bold">{calculateTotalScore()}</p>
                    <p className="text-xs opacity-70 mt-2">
                      ({fullScore.nutritionalStatus} nutricional + {fullScore.diseaseSeverity} severidad + {fullScore.age} edad)
                    </p>
                  </div>
                </div>

                {(() => {
                  const interpretation = getInterpretation(calculateTotalScore());
                  const Icon = interpretation.icon;
                  return (
                    <div className={`border-2 rounded-xl p-5 ${interpretation.color}`}>
                      <div className="flex items-start gap-3 mb-4">
                        <Icon className="h-6 w-6 mt-0.5" />
                        <div className="flex-1">
                          <h5 className="font-bold text-lg mb-1">{interpretation.level}</h5>
                          <p className="font-semibold">{interpretation.action}</p>
                          <p className="text-sm mt-1">{interpretation.timing}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {interpretation.details.map((detail, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className="text-sm">•</span>
                            <span className="text-sm">{detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {(screeningComplete || showFullAssessment) && (
          <Button variant="outline" onClick={resetCalculator} className="w-full">
            Reiniciar Evaluación
          </Button>
        )}
      </>)}

        {/* Botón global para reiniciar también cuando se cortó el protocolo por alto riesgo médico */}
        {medicalHighRisk === true && medicalReasons.length > 0 && (
          <Button variant="outline" onClick={resetCalculator} className="w-full">
            Reiniciar Evaluación
          </Button>
        )}

        {/* Integración con formularios externos (p. ej. evaluación nutricional de Vista Hospitalizados) */}
        {onApplyResult && resultData && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3">
            <p className="text-sm font-bold text-emerald-900">Resultado: {resultData.score} · {resultData.label}</p>
            <Button type="button" onClick={() => onApplyResult(resultData)} className="bg-emerald-700 hover:bg-emerald-800">
              Usar este resultado
            </Button>
          </div>
        )}
      </div>
    </CalculatorWrapper>
    <HospitalLocationIndexDialog
      open={Boolean(registryPrompt)}
      title="Guardar tamizaje NRS-2002"
      description="Indica la cama y el paciente al que corresponde este resultado."
      onClose={() => setRegistryPrompt(null)}
      onSave={(location) => savePendingClinicalResult({ ...location, tipo: 'nrs2002', payload: nrsEvaluation(registryPrompt?.result, registryPrompt?.inputs) })}
      onCompleted={(context) => registryPrompt?.print?.(context)}
    />
  </>
  );
}
