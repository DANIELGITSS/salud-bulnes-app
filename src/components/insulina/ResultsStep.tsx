import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PatientData, PatientGroup } from '@/types/protocol';
import { getDoseRecommendations, getClassificationDetails, getBasalGuidance } from '@/utils/insulina/protocolLogic';
import { AlertCircle, AlertTriangle, BedDouble, CheckCircle2, FileText, Printer, Syringe } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

import { Alert, AlertDescription } from '@/components/ui/alert';

interface ResultsStepProps {
  data: PatientData;
  grupo: PatientGroup;
  onBack: () => void;
  onReset: () => void;
  usoCondicionado?: boolean;
  onIndexResult?: (result: Record<string, unknown>) => void;
  indexLabel?: string;
  recordContext?: { name: string; rut: string; servicio: string; cama: string } | null;
}

const groupInfo = {
  sensible: {
    title: 'Grupo Insulino-Sensible',
    color: 'bg-green-500',
    textColor: 'text-green-600',
    description: 'Paciente con alta sensibilidad a la insulina. Mayor riesgo de hipoglicemia.',
  },
  intermedio: {
    title: 'Grupo Intermedio',
    color: 'bg-amber-500',
    textColor: 'text-amber-600',
    description: 'Paciente con sensibilidad normal a la insulina. Perfil metabólico estable.',
  },
  resistente: {
    title: 'Grupo Insulino-Resistente',
    color: 'bg-red-600',
    textColor: 'text-red-600',
    description: 'Paciente con resistencia a la insulina. Requiere dosis más altas.',
  },
};

export function ResultsStep({ data, grupo, onBack, onReset, usoCondicionado, onIndexResult, indexLabel = 'Guardar e imprimir', recordContext = null }: ResultsStepProps) {
  const [corticoideOverride, setCorticoideOverride] = useState<'resistente' | 'sensible' | null>(null);

  const mostrarAlertaCorticoide = grupo === 'sensible' && data.corticoidesSistemicos;
  const grupoEfectivo: PatientGroup =
    mostrarAlertaCorticoide && corticoideOverride === 'resistente' ? 'resistente' : grupo;

  const info = groupInfo[grupoEfectivo];
  const recommendations = getDoseRecommendations(grupoEfectivo, data.peso, data.usoPrevioNPH);
  const classificationDetails = getClassificationDetails(data);
  const basal = getBasalGuidance(data, grupoEfectivo);
  const basalTone = basal.estado === 'sobrebasalizado'
    ? { card: 'border-red-300 bg-red-50', title: 'text-red-900', chip: 'bg-red-600' }
    : basal.estado === 'con_basal'
      ? { card: 'border-amber-300 bg-amber-50', title: 'text-amber-900', chip: 'bg-amber-600' }
      : { card: 'border-blue-300 bg-blue-50', title: 'text-blue-900', chip: 'bg-blue-600' };

  // Generar fecha y hora actual
  const now = new Date();
  const fechaEmision = now.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const horaEmision = now.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {recordContext && (
        <div className="print:hidden rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Protocolo guardado en</p>
          <p className="mt-0.5 font-bold">{[recordContext.cama && `Cama ${recordContext.cama}`, recordContext.servicio].filter(Boolean).join(' · ')}</p>
          <p className="text-emerald-800">{recordContext.name}{recordContext.rut ? ` · ${recordContext.rut}` : ''}</p>
        </div>
      )}

      {/* Botón de impresión - solo visible en pantalla */}
      <div className="print:hidden flex flex-wrap justify-end gap-2">
        {onIndexResult && <Button onClick={() => onIndexResult({ grupo: grupoEfectivo, clasificacion: info.title, pesoKg: data.peso, glicemiaIngreso: data.glicemiaIngreso, recomendaciones: recommendations, conductaBasal: basal, usoCondicionado: Boolean(usoCondicionado), datos: data })} variant="outline" className="gap-2 border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100">
          <BedDouble className="w-4 h-4" />
          {indexLabel}
        </Button>}
        <Button onClick={handlePrint} variant="outline" className="gap-2">
          <Printer className="w-4 h-4" />
          Imprimir Esquema
        </Button>
      </div>

      {/* Vista de impresión compacta */}
      <div className="hidden print:block print-section">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold mb-1">Hospital Comunitario de Salud Familiar de Bulnes</h1>
          <h2 className="text-lg font-semibold">Protocolo de Corrección Insulínica</h2>
        </div>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p><strong>Nombre paciente:</strong> {recordContext?.name || '___________________________'}</p>
              <p><strong>RUT:</strong> {recordContext?.rut || '___________________________'}</p>
            </div>
            <div className="space-y-1">
              <p><strong>N° cama / Servicio:</strong> {recordContext ? [recordContext.cama, recordContext.servicio].filter(Boolean).join(' · ') : '___________________________'}</p>
              <p><strong>Fecha de emisión:</strong> {fechaEmision} - {horaEmision} h</p>
            </div>
          </div>

          <div className="border-2 border-gray-800 p-3 rounded">
            <p className="text-center font-bold text-base mb-2">
              Clasificación: {info.title}
              {mostrarAlertaCorticoide && corticoideOverride === 'resistente' && (
                <span className="block text-xs font-normal mt-0.5">
                  (Escala ajustada por uso de corticoides sistémicos)
                </span>
              )}
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <p><strong>Peso:</strong> {data.peso} kg</p>
              <p><strong>Glicemia:</strong> {data.glicemiaIngreso} mg/dL</p>
              <p><strong>HbA1c:</strong> {data.hba1c}%</p>
            </div>
          </div>

          <div>
            <h3 className="font-bold mb-2 text-base">Esquema de Corrección con Insulina Cristalina</h3>
            <table className="w-full border-collapse border border-gray-800 text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-800 p-2 text-left">Glicemia (mg/dL)</th>
                  {(grupo === 'intermedio' || grupo === 'resistente') && (
                    <th className="border border-gray-800 p-2 text-left">U/kg</th>
                  )}
                  <th className="border border-gray-800 p-2 text-left">Dosis (U)</th>
                  <th className="border border-gray-800 p-2 text-left">Observación</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((rec, index) => (
                  <tr key={index}>
                    <td className="border border-gray-800 p-2">{rec.glucoseRange}</td>
                    {(grupo === 'intermedio' || grupo === 'resistente') && (
                      <td className="border border-gray-800 p-2">{rec.ukgRange}</td>
                    )}
                    <td className="border border-gray-800 p-2 font-bold">
                      {rec.dose === 0 ? 'No corregir' : `${rec.dose} UI`}
                    </td>
                    <td className="border border-gray-800 p-2 text-xs">{rec.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-2 border-gray-800 p-3 text-xs">
            <p className="font-bold mb-1">Insulina basal — {basal.titulo}</p>
            <p className="mb-2">{basal.resumen}</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="font-semibold">{basal.estado === 'sin_basal' ? '¿Cuándo iniciarla?' : '¿Cuándo subirla?'}</p>
                <ul className="list-disc list-inside space-y-0.5">{basal.cuando.map((item, index) => <li key={index}>{item}</li>)}</ul>
              </div>
              <div>
                <p className="font-semibold">Dosis y titulación</p>
                <ul className="list-disc list-inside space-y-0.5">{basal.titulacion.map((item, index) => <li key={index}>{item}</li>)}</ul>
              </div>
            </div>
            {basal.alertas.length > 0 && (
              <ul className="list-disc list-inside space-y-0.5 mt-2 border-t border-gray-400 pt-2">
                {basal.alertas.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            )}
          </div>

          <div className="border border-gray-400 p-3 bg-gray-50 text-xs">
            <p className="font-semibold mb-1">⚠️ IMPORTANTE:</p>
            <p className="mb-2">
              Esta es una herramienta de apoyo digital. El esquema debe ser validado y ajustado 
              según criterio médico considerando la condición clínica específica del paciente.
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>Comunicar si glicemia persistente &gt; 350 mg/dL</li>
              <li>Comunicar si correcciones &gt; 0.2 U/kg</li>
              <li>Vigilar hipoglicemias sintomáticas</li>
            </ul>
          </div>


          <div className="mt-6 pt-4 border-t-2 border-gray-400">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-xs mb-1"><strong>Médico Tratante:</strong></p>
                <p className="text-xs">Nombre: ___________________________</p>
                <div className="mt-8 border-t border-gray-800 pt-1">
                  <p className="text-xs text-center">Firma y Timbre</p>
                </div>
              </div>
              <div>
                <p className="text-xs mb-1"><strong>Fecha de indicación:</strong></p>
                <p className="text-xs">___/___/______  Hora: ___:___</p>
              </div>
            </div>
          </div>

          {usoCondicionado && (
            <div className="mt-4 p-2 border border-gray-400 rounded text-center">
              <p className="text-xs font-semibold">⚠ Uso condicionado</p>
              <p className="text-[10px] text-gray-600">El paciente presenta criterios de exclusión. El uso de este protocolo queda bajo criterio médico del tratante.</p>
            </div>
          )}

          {data.glicemiaIngreso > 350 && (
            <div className="mt-4 p-2 border border-gray-800 rounded">
              <p className="text-xs font-semibold">⚠ Hiperglicemia significativa (&gt;350 mg/dL)</p>
              <p className="text-[10px] text-gray-600">En caso de hiperglicemia persistente, reevaluar criterios de exclusión y/o considerar inicio de esquema basal o basal-bolo según cuadro clínico.</p>
            </div>
          )}

          <div className="text-center text-xs text-gray-600 mt-4 space-y-0.5">
            <p>Protocolo desarrollado por Dr. Fernando Alvarado Caro - Servicio de Medicina</p>
            <p className="text-gray-400">Colaborador técnico-digital: Daniel Vargas Quinteros, Ingeniero en Informática (estudiante)</p>
          </div>
        </div>
      </div>

      {/* Vista normal en pantalla */}
      <div className="print:hidden space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <FileText className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-3xl font-bold text-foreground mb-2">Resultado de Clasificación</h2>
        <p className="text-muted-foreground">Esquema correccional personalizado</p>
      </div>

      <Card className="p-6 border-2">
        <div className="text-center mb-4">
          <Badge className={`${info.color} text-white text-lg px-4 py-2`}>
            {info.title}
          </Badge>
          <p className="text-muted-foreground mt-3">{info.description}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 mt-6 text-center">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Peso</p>
            <p className="text-2xl font-bold">{data.peso} kg</p>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Glicemia Ingreso</p>
            <p className="text-2xl font-bold">{data.glicemiaIngreso} mg/dL</p>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">HbA1c</p>
            <p className="text-2xl font-bold">{data.hba1c}%</p>
          </div>
        </div>
      </Card>

      {mostrarAlertaCorticoide && (
        <Card className="p-5 border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 dark:text-amber-100">
                Uso de corticoides en paciente insulinosensible
              </p>
              <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                Este paciente está clasificado como <strong>insulinosensible</strong> pero tiene <strong>uso actual de corticoides sistémicos</strong>, lo que puede alterar transitoriamente su sensibilidad a la insulina. Seleccione la conducta a seguir:
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant={corticoideOverride === 'resistente' ? 'destructive' : 'outline'}
              className="flex-1"
              onClick={() => setCorticoideOverride('resistente')}
            >
              Escalar a Insulino-Resistente
            </Button>
            <Button
              variant={corticoideOverride === 'sensible' || corticoideOverride === null ? 'outline' : 'outline'}
              className={`flex-1 ${(corticoideOverride === 'sensible' || corticoideOverride === null) ? 'border-2 border-primary' : ''}`}
              onClick={() => setCorticoideOverride('sensible')}
            >
              Mantener Sensible (con advertencia)
            </Button>
          </div>
          {corticoideOverride === 'resistente' && (
            <p className="text-sm text-destructive font-medium mt-3">
              El esquema se ha recalculado con dosis de grupo insulino-resistente por efecto de corticoides.
            </p>
          )}
          {corticoideOverride === 'sensible' && (
            <p className="text-sm text-amber-700 dark:text-amber-300 font-medium mt-3">
              Se mantiene esquema sensible. Monitorear estrechamente por posible aumento en requerimientos por corticoides.
            </p>
          )}
        </Card>
      )}

      {classificationDetails.sensible.cumple && classificationDetails.resistente.cumple && (
        <Alert className="bg-orange-50 border-orange-300 dark:bg-orange-950/30 dark:border-orange-700">
          <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          <AlertDescription className="text-sm text-orange-900 dark:text-orange-100">
            <strong>Criterios contradictorios detectados:</strong> El paciente cumple simultáneamente criterios de sensibilidad y resistencia. Se ha priorizado la clasificación como <strong>Insulino-Sensible</strong> para reducir el riesgo de hipoglicemia, pero evalúe clínicamente los factores de resistencia antes de aplicar el esquema.
          </AlertDescription>
        </Alert>
      )}

      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-success" />
          Esquema de Corrección con Insulina Cristalina
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-border">
                <th className="text-left py-3 px-4 font-semibold">Glicemia Capilar</th>
                {(grupo === 'intermedio' || grupo === 'resistente') && (
                  <th className="text-left py-3 px-4 font-semibold">U/kg</th>
                )}
                <th className="text-left py-3 px-4 font-semibold">Dosis (U)</th>
                <th className="text-left py-3 px-4 font-semibold">Comentario</th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map((rec, index) => (
                <tr key={index} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="py-3 px-4 font-medium">{rec.glucoseRange} mg/dL</td>
                  {(grupo === 'intermedio' || grupo === 'resistente') && (
                    <td className="py-3 px-4 text-sm text-muted-foreground">{rec.ukgRange}</td>
                  )}
                  <td className="py-3 px-4">
                    <Badge variant="outline" className="text-base font-bold">
                      {rec.dose === 0 ? 'No corregir' : `${rec.dose} UI`}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">{rec.comment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={`p-6 border-2 ${basalTone.card}`}>
        <div className="flex items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white ${basalTone.chip}`}>
            <Syringe className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Insulina basal</p>
            <h3 className={`text-lg font-bold ${basalTone.title}`}>{basal.titulo}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{basal.resumen}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-white/70 p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {basal.estado === 'sin_basal' ? '¿Cuándo iniciarla?' : '¿Cuándo subirla?'}
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {basal.cuando.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </div>
          <div className="rounded-xl bg-white/70 p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Dosis y titulación</p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {basal.titulacion.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </div>
        </div>

        {basal.alertas.length > 0 && (
          <div className="mt-3 rounded-xl border border-dashed border-current/30 bg-white/50 p-3">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {basal.alertas.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </div>
        )}
      </Card>

      <Card className="p-6 bg-muted/50">
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-primary" />
          Criterios de Clasificación
        </h3>
        
        <div className="space-y-4">
          {classificationDetails.sensible.cumple && (
            <div>
              <h4 className="font-medium text-success mb-2">Criterios de Sensibilidad (Cumple)</h4>
              {classificationDetails.sensible.criteriosMayores.length > 0 && (
                <div className="ml-4 mb-2">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Criterios Mayores:</p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {classificationDetails.sensible.criteriosMayores.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {classificationDetails.sensible.criteriosMenores.length > 0 && (
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Criterios Menores:</p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {classificationDetails.sensible.criteriosMenores.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          
          {classificationDetails.resistente.cumple && (
            <div>
              <h4 className="font-medium text-destructive mb-2">Criterios de Resistencia (Cumple)</h4>
              {classificationDetails.resistente.criteriosMayores.length > 0 && (
                <div className="ml-4 mb-2">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Criterios Mayores:</p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {classificationDetails.resistente.criteriosMayores.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {classificationDetails.resistente.criteriosMenores.length > 0 && (
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Criterios Menores:</p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    {classificationDetails.resistente.criteriosMenores.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!classificationDetails.sensible.cumple && !classificationDetails.resistente.cumple && (
            <p className="text-sm text-muted-foreground">
              El paciente no cumple criterios específicos de sensibilidad ni resistencia, por lo que se clasifica en el grupo intermedio.
            </p>
          )}

          {classificationDetails.nefropatiaSinVFG && (
            <div className="mt-2 p-3 rounded-lg bg-purple-50 border border-purple-200 dark:bg-purple-950/20 dark:border-purple-800">
              <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                Nefropatía crónica registrada sin VFG disponible
              </p>
              <p className="text-xs text-purple-800 dark:text-purple-200 mt-1">
                El paciente presenta nefropatía crónica (ERC ≥ etapa 3) pero no se ha registrado VFG. Si VFG {'<'} 30 ml/min, reclasificar como <strong>Sensible</strong>. Si VFG 30-60 ml/min, la clasificación actual (Intermedio) es correcta.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4 bg-warning/10 border-warning">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div className="space-y-2 text-sm">
            <p className="font-medium">Recordatorios Importantes:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Comunicar si glicemia persistente &gt; 350 mg/dL</li>
              <li>Comunicar si correcciones &gt; 0.2 U/kg</li>
              <li>Vigilar hipoglicemias sintomáticas</li>
              <li>Reevaluar dosis basal en hiperglicemias persistentes</li>
            </ul>
          </div>
        </div>
      </Card>

      {data.usoPrevioNPH > 0.3 && (
        <Card className="p-6 bg-destructive/10 border-2 border-destructive">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-destructive">
            <AlertCircle className="w-6 h-6" />
            Alerta: Riesgo de Sobrebasalización
          </h3>
          
          <div className="space-y-3 text-sm">
            <p className="text-foreground">
              <strong>Dosis basal actual: {data.usoPrevioNPH} U/kg/día</strong>
            </p>
            
            <p className="text-foreground">
              La insulina basal cubre la producción hepática de glucosa en ayunas. <strong>No debe usarse para corregir hiperglicemias posprandiales</strong> ni reemplazar insulinas prandiales.
            </p>

            <div>
              <p className="font-semibold mb-1 text-foreground">⚠️ Signos de alerta:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2 text-xs">
                <li>Hipoglicemias nocturnas con hiperglicemias diurnas</li>
                <li>Glicemias en ayunas normales/bajas pero hiperglicemia postprandial persistente</li>
                <li>Correcciones frecuentes durante el día sin mejoría del control global</li>
              </ul>
            </div>

            <div className="mt-3 p-3 bg-background/50 rounded border border-destructive/20">
              <p className="text-xs font-medium text-foreground mb-1">🎯 Recomendación:</p>
              <p className="text-xs text-muted-foreground">
                Antes de aumentar la basal, verifique patrón glicémico completo (ayunas-preprandiales-posprandiales) e ingesta actual. Considere ajustar distribución o agregar insulina prandial según esquema hospitalario.
              </p>
            </div>
          </div>
        </Card>
      )}

      {usoCondicionado && (
        <Alert className="bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-sm text-amber-900 dark:text-amber-100">
            <strong>Uso condicionado:</strong> El paciente presenta criterios de exclusión para este protocolo. Su uso queda bajo criterio médico del tratante.
          </AlertDescription>
        </Alert>
      )}

      {data.glicemiaIngreso > 350 && (
        <Alert className="bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-700">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
          <AlertDescription className="text-sm text-red-900 dark:text-red-100">
            <strong>⚠ Hiperglicemia significativa (&gt;350 mg/dL):</strong> En caso de hiperglicemia persistente, reevaluar criterios de exclusión y/o considerar inicio de esquema basal o basal-bolo según cuadro clínico del paciente.
          </AlertDescription>
        </Alert>
      )}

        <div className="flex justify-between pt-4">
          <Button onClick={onBack} variant="outline" size="lg">
            Anterior
          </Button>
          <Button onClick={onReset} size="lg">
            Nueva Evaluación
          </Button>
        </div>
      </div>
    </div>
  );
}
