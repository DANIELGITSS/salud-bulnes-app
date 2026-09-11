import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DemographicStep } from '@/components/insulina/DemographicStep';
import { ClinicalStep } from '@/components/insulina/ClinicalStep';
import { MetabolicStep } from '@/components/insulina/MetabolicStep';
import { ResultsStep } from '@/components/insulina/ResultsStep';
import { ExclusionModal } from '@/components/insulina/ExclusionModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PatientData } from '@/types/protocol';
import { classifyPatient } from '@/utils/insulina/protocolLogic';
import { Activity, FileText, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { getMultiPrefill } from '@/lib/multiTemplatePrefill';
import HospitalLocationIndexDialog from '@/components/hospitalizados/HospitalLocationIndexDialog';
import { buildInsulinEntry, saveInsulinProtocolToHospitalLocation, savePendingClinicalResult } from '@/lib/hospitalNrsRegistry';

const ProtocoloInsulina = () => {
  const navigate = useNavigate();
  const [showProtocolDialog, setShowProtocolDialog] = useState(false);
  const [showExclusion, setShowExclusion] = useState(
    () => localStorage.getItem('exclusion-modal-dismissed') !== 'true'
  );
  const [activeTab, setActiveTab] = useState('1');
  const [usoCondicionado, setUsoCondicionado] = useState(false);
  const [indexResult, setIndexResult] = useState<Record<string, unknown> | null>(null);
  const [sourceContext, setSourceContext] = useState<Record<string, unknown> | null>(null);
  const [indexMessage, setIndexMessage] = useState('');
  // Cama y paciente confirmados al guardar, para estamparlos en el resultado impreso.
  const [recordContext, setRecordContext] = useState<{ name: string; rut: string; servicio: string; cama: string } | null>(null);
  const [patientData, setPatientData] = useState<PatientData>({
    edad: 0,
    peso: 0,
    imc: 0,
    sexo: '',
    corticoidesSistemicos: false,
    infeccionActiva: false,
    postoperatorioMayor: false,
    sop: false,
    hepatopatia: false,
    nefropatia: false,
    glicemiaIngreso: 0,
    hba1c: 0,
    trigliceridos: 0,
    creatinina: 0,
    vfg: 0,
    usoPrevioNPH: 0,
  });

  // Si se abre desde Vista Hospitalizados, reutiliza los datos clínicos
  // compatibles sin copiar identificadores al resultado del protocolo.
  useEffect(() => {
    const prefill = getMultiPrefill();
    if (!prefill || prefill.source !== 'vista_general') return;
    setSourceContext(prefill);
    const exams = Array.isArray(prefill.proa_examenes) ? prefill.proa_examenes : [];
    const sortedExams = exams.slice().sort((a, b) => String(b?.fecha || '').localeCompare(String(a?.fecha || '')));
    // Toma el valor más reciente disponible del campo, aunque no esté en la última fila.
    const latestValue = (...keys: string[]): number => {
      for (const row of sortedExams) {
        for (const key of keys) {
          const raw = (row as Record<string, unknown>)?.[key];
          if (String(raw ?? '').trim()) return Number(String(raw).replace(',', '.'));
        }
      }
      return NaN;
    };
    const summaryCreatinine = String(prefill.ultimo_laboratorio || '').match(/(?:creatinina|crea)[.:\s]*([\d,.]+)/i)?.[1] || '';
    const rowCreatinine = latestValue('crea', 'creatinina');
    const creatinine = Number.isFinite(rowCreatinine) ? rowCreatinine : Number(String(summaryCreatinine).replace(',', '.'));
    const age = Number(prefill.edad);
    const clinicalSex = String(prefill.sexo || '').toUpperCase() === 'M'
      ? 'masculino'
      : String(prefill.sexo || '').toUpperCase() === 'F' ? 'femenino' : '';
    const usable = (value: number) => Number.isFinite(value) && value > 0;
    const vfg = latestValue('vfg');
    const glycemia = latestValue('glucosa', 'glicemia');
    const triglycerides = latestValue('trigliceridos');
    setPatientData((current) => ({
      ...current,
      edad: usable(age) ? age : current.edad,
      sexo: clinicalSex || current.sexo,
      creatinina: usable(creatinine) ? creatinine : current.creatinina,
      vfg: usable(vfg) ? vfg : current.vfg,
      glicemiaIngreso: usable(glycemia) ? glycemia : current.glicemiaIngreso,
      trigliceridos: usable(triglycerides) ? triglycerides : current.trigliceridos,
    }));
  }, []);

  const updatePatientData = (field: keyof PatientData, value: number | boolean | string) => {
    setPatientData((prev) => ({ ...prev, [field]: value }));
  };

  const handleReset = () => {
    setPatientData({
      edad: 0, peso: 0, imc: 0, sexo: '',
      corticoidesSistemicos: false, infeccionActiva: false,
      postoperatorioMayor: false, sop: false,
      hepatopatia: false, nefropatia: false,
      glicemiaIngreso: 0, hba1c: 0, trigliceridos: 0,
      creatinina: 0, vfg: 0, usoPrevioNPH: 0,
    });
    setActiveTab('1');
    setShowExclusion(localStorage.getItem('exclusion-modal-dismissed') !== 'true');
  };

  const grupo = classifyPatient(patientData);
  const tab1Complete = patientData.edad > 0 && patientData.sexo !== '' && patientData.peso > 0;
  const tab3Complete = patientData.glicemiaIngreso > 0;
  const handleIndexResult = async (result: Record<string, unknown>) => {
    if (!sourceContext?.source_bed) { setIndexResult(result); return; }
    const patientName = String(sourceContext.patient_name || '');
    const initials = patientName.split(/\s+/).filter(Boolean).map(word => word[0]).join('').toUpperCase();
    setIndexMessage('Guardando protocolo en la ficha abierta…');
    try {
      const outcome = await saveInsulinProtocolToHospitalLocation({ service: String(sourceContext.source_service || sourceContext.servicio || ''), bedCode: String(sourceContext.source_bed), associationMode: 'current', initials, age: String(sourceContext.edad || patientData.edad), result });
      setIndexMessage(outcome.synced ? 'Protocolo asociado correctamente a la ficha abierta.' : 'Protocolo conservado en este equipo; la sincronización central quedó pendiente.');
    } catch (error) { setIndexMessage(error instanceof Error ? error.message : 'No fue posible asociar el protocolo.'); }
  };

  return (
    <>
      <ExclusionModal
        open={showExclusion}
        onContinue={(hasExclusions) => { setUsoCondicionado(hasExclusions); setShowExclusion(false); }}
      />
      <div className="min-h-screen theme-blue" style={{
        '--background': '0 0% 100%',
        '--foreground': '215 25% 27%',
        '--card': '0 0% 100%',
        '--card-foreground': '215 25% 27%',
        '--popover': '0 0% 100%',
        '--popover-foreground': '215 25% 27%',
        '--secondary': '210 40% 96.1%',
        '--secondary-foreground': '215 25% 27%',
        '--muted': '210 40% 96.1%',
        '--muted-foreground': '215 20% 50%',
        '--accent': '195 80% 50%',
        '--accent-foreground': '0 0% 100%',
        '--destructive': '0 84.2% 60.2%',
        '--destructive-foreground': '0 0% 100%',
        '--border': '214 31.8% 91.4%',
        '--input': '214 31.8% 91.4%',
        '--radius': '0.75rem',
        background: 'hsl(0 0% 100%)',
        color: 'hsl(215 25% 27%)',
      } as React.CSSProperties}>
        <header className="bg-card border-b border-border shadow-sm print:hidden">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-3">
              <ArrowLeft className="w-4 h-4 mr-2" />Volver
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
                <Activity className="w-7 h-7 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                  Protocolo de Corrección Insulínica
                </h1>
                <p className="text-sm text-muted-foreground">
                  Hospital Comunitario de Salud Familiar de Bulnes
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <Card className="p-6 sm:p-8 shadow-xl">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4 mb-8 print:hidden">
                <TabsTrigger value="1">1. Demografía</TabsTrigger>
                <TabsTrigger value="2" disabled={!tab1Complete}>2. Clínica</TabsTrigger>
                <TabsTrigger value="3" disabled={!tab1Complete}>3. Metabolismo</TabsTrigger>
                <TabsTrigger value="4" disabled={!tab1Complete || !tab3Complete}>4. Resultado</TabsTrigger>
              </TabsList>

              <TabsContent value="1">
                <DemographicStep data={patientData} onUpdate={updatePatientData} onNext={() => setActiveTab('2')} />
              </TabsContent>
              <TabsContent value="2">
                <ClinicalStep data={patientData} sexo={patientData.sexo} onUpdate={updatePatientData} onNext={() => setActiveTab('3')} onBack={() => setActiveTab('1')} />
              </TabsContent>
              <TabsContent value="3">
                <MetabolicStep data={patientData} peso={patientData.peso} edad={patientData.edad} sexo={patientData.sexo} onUpdate={updatePatientData} onNext={() => setActiveTab('4')} onBack={() => setActiveTab('2')} />
              </TabsContent>
              <TabsContent value="4">
                {indexMessage && <div className={`mb-4 rounded-lg border p-3 text-sm font-semibold print:hidden ${/correctamente/i.test(indexMessage) ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : /pendiente|Guardando/i.test(indexMessage) ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-700'}`}>{indexMessage}</div>}
                <ResultsStep data={patientData} grupo={grupo} onBack={() => setActiveTab('3')} onReset={handleReset} usoCondicionado={usoCondicionado} onIndexResult={handleIndexResult} indexLabel={sourceContext ? 'Guardar en ficha del paciente' : 'Guardar e imprimir'} recordContext={recordContext} />
              </TabsContent>
            </Tabs>
          </Card>

          <footer className="mt-8 text-center text-sm text-muted-foreground space-y-1 print:hidden">
            <p>Protocolo desarrollado por Dr. Fernando Alvarado Caro</p>
            <p>Servicio de Medicina - Hospital de Bulnes | Septiembre 2025</p>
            <p className="text-xs mt-3">Última revisión: marzo 2026</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Colaborador técnico-digital: Daniel Vargas Quinteros, Ingeniero en Informática (estudiante)
            </p>
            <button
              onClick={() => setShowProtocolDialog(true)}
              className="text-xs text-primary hover:underline cursor-pointer mt-1 inline-flex items-center gap-1"
            >
              <FileText className="w-3 h-3" />
              Revisar protocolo asociado
            </button>

            <Dialog open={showProtocolDialog} onOpenChange={setShowProtocolDialog}>
              <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col p-0">
                <DialogHeader className="px-6 pt-6 pb-2">
                  <DialogTitle>Protocolo de Corrección Insulínica</DialogTitle>
                </DialogHeader>
                <div className="flex-1 min-h-0 px-6 pb-6">
                  <iframe
                    src="/protocolo.pdf"
                    className="w-full h-full rounded-md border border-border"
                    title="Protocolo de Corrección Insulínica"
                  />
                </div>
              </DialogContent>
            </Dialog>
          </footer>
        </main>
        <HospitalLocationIndexDialog
          open={Boolean(indexResult)}
          title="Guardar protocolo insulínico"
          description="Indica la cama y el paciente al que corresponde este protocolo."
          onClose={() => setIndexResult(null)}
          onSave={(location) => savePendingClinicalResult({ ...location, tipo: 'insulina', payload: buildInsulinEntry(indexResult as Record<string, unknown>) })}
          onCompleted={(context) => { setRecordContext(context); setIndexResult(null); window.setTimeout(() => window.print(), 150); }}
        />
      </div>
    </>
  );
};

export default ProtocoloInsulina;
