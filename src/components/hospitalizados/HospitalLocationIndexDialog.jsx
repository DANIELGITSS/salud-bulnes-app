import { useEffect, useMemo, useState } from 'react';
import { BedDouble } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { loadNrsHospitalLocations } from '@/lib/hospitalNrsRegistry';

const control = 'mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-500';

// Formato RUT chileno: 12345678K → 12.345.678-K.
function formatRut(raw) {
  const clean = String(raw || '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (!clean) return '';
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return body ? `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}` : dv;
}

export default function HospitalLocationIndexDialog({
  open,
  title,
  description,
  actionLabel = 'Guardar e imprimir',
  onClose,
  onSave,
  onCompleted,
}) {
  const [locations, setLocations] = useState([]);
  const [service, setService] = useState('');
  const [bedCode, setBedCode] = useState('');
  const [name, setName] = useState('');
  const [rut, setRut] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setService(''); setBedCode(''); setName(''); setRut(''); setMessage(''); setDone(false); setLoading(true);
    loadNrsHospitalLocations()
      .then(items => { if (active) setLocations(items); })
      .catch(() => { if (active) setMessage('No fue posible cargar las camas. Intenta nuevamente.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open]);

  const services = useMemo(() => [...new Map(locations.map(location => [location.service, location.serviceLabel])).entries()], [locations]);
  const beds = useMemo(() => locations.filter(location => location.service === service), [locations, service]);
  const ready = Boolean(service && bedCode && name.trim() && rut.trim() && !saving);

  const submit = async () => {
    setSaving(true); setMessage('');
    try {
      await onSave({ service, bedCode, patientName: name.trim(), patientRut: rut.trim() });
      // El mensaje es siempre el mismo: no debe dejar entrever si la cama ya
      // tenía un paciente cargado ni quién era.
      setMessage('Resultado guardado. Quedará disponible para el médico en la ficha de la cama.');
      setDone(true);
      const location = locations.find(item => item.code === bedCode);
      onCompleted?.({
        name: name.trim(),
        rut: rut.trim(),
        servicio: location?.serviceLabel || service,
        cama: [location?.unitLabel, location?.bedLabel].filter(Boolean).join(' · ') || bedCode,
      });
    } catch (error) {
      setMessage(error?.message || 'No fue posible guardar el resultado.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl">
        <header className="flex items-start gap-3 border-b border-emerald-200 bg-emerald-50 p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800"><BedDouble className="h-5 w-5" /></span>
          <div>
            <h3 className="font-black text-slate-950">{title}</h3>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
        </header>

        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-bold text-slate-700">Servicio</Label>
              <select value={service} onChange={event => { setService(event.target.value); setBedCode(''); setMessage(''); }} disabled={loading || saving || done} className={control}>
                <option value="">{loading ? 'Cargando…' : 'Seleccionar servicio…'}</option>
                {services.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs font-bold text-slate-700">Cama</Label>
              <select value={bedCode} onChange={event => { setBedCode(event.target.value); setMessage(''); }} disabled={!service || loading || saving || done} className={control}>
                <option value="">{service ? 'Seleccionar cama…' : 'Primero selecciona servicio'}</option>
                {beds.map(location => <option key={location.code} value={location.code}>{[location.unitLabel, `Cama ${location.bedLabel}`].filter(Boolean).join(' · ')}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-bold text-slate-700">Nombre del paciente</Label>
              <input value={name} onChange={event => { setName(event.target.value); setMessage(''); }} disabled={saving || done} className={control} placeholder="Nombre y apellidos" autoComplete="off" />
            </div>
            <div>
              <Label className="text-xs font-bold text-slate-700">RUT</Label>
              <input value={rut} onChange={event => { setRut(formatRut(event.target.value)); setMessage(''); }} disabled={saving || done} className={control} placeholder="12.345.678-9" autoComplete="off" />
            </div>
          </div>

          {message && (
            <div className={`rounded-lg border p-3 text-sm font-semibold ${done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
              {message}
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>{done ? 'Cerrar' : 'Cancelar'}</Button>
          {!done && (
            <Button type="button" onClick={submit} disabled={!ready} className="bg-emerald-700 hover:bg-emerald-800">
              {saving ? 'Guardando…' : actionLabel}
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
