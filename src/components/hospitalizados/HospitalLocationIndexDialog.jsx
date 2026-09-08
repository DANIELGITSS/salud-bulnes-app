import { useEffect, useMemo, useState } from 'react';
import { BedDouble, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { loadNrsHospitalLocations } from '@/lib/hospitalNrsRegistry';

const control = 'mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-500';

export default function HospitalLocationIndexDialog({ open, title, description, actionLabel = 'Asociar resultado', onClose, onSave }) {
  const [locations, setLocations] = useState([]);
  const [service, setService] = useState('');
  const [bedCode, setBedCode] = useState('');
  const [associationMode, setAssociationMode] = useState('current');
  const [initials, setInitials] = useState('');
  const [age, setAge] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setService(''); setBedCode(''); setAssociationMode('current'); setInitials(''); setAge(''); setMessage(''); setLoading(true);
    loadNrsHospitalLocations().then(items => { if (active) setLocations(items); }).catch(() => { if (active) setMessage('No fue posible cargar las camas. Intenta nuevamente.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open]);

  const services = useMemo(() => [...new Map(locations.map(location => [location.service, location.serviceLabel])).entries()], [locations]);
  const beds = useMemo(() => locations.filter(location => location.service === service), [locations, service]);
  const completed = /correctamente|conservado/i.test(message);
  const submit = async () => {
    setSaving(true); setMessage('');
    try {
      const outcome = await onSave({ service, bedCode, associationMode, initials, age });
      setMessage(outcome?.synced ? 'Registro asociado correctamente.' : 'Registro conservado en este equipo; la sincronización central quedó pendiente.');
    } catch (error) {
      setMessage(error?.message || 'No fue posible asociar el registro.');
    } finally { setSaving(false); }
  };

  if (!open) return null;
  return <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
    <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-2xl">
      <header className="flex items-start gap-3 border-b border-emerald-200 bg-emerald-50 p-5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800"><BedDouble className="h-5 w-5" /></span><div><h3 className="font-black text-slate-950">{title}</h3><p className="mt-1 text-sm text-slate-600">{description}</p></div></header>
      <div className="space-y-4 p-5">
        <div className="flex gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>No se muestran nombres, RUT, diagnósticos ni estado de salud. Las iniciales y la edad sólo se comparan internamente para evitar asociar el resultado a otra persona.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label className="text-xs font-bold text-slate-700">Servicio</Label><select value={service} onChange={event => { setService(event.target.value); setBedCode(''); setMessage(''); }} disabled={loading || saving} className={control}><option value="">{loading ? 'Cargando…' : 'Seleccionar servicio…'}</option>{services.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div><Label className="text-xs font-bold text-slate-700">Cama</Label><select value={bedCode} onChange={event => { setBedCode(event.target.value); setMessage(''); }} disabled={!service || loading || saving} className={control}><option value="">{service ? 'Seleccionar cama…' : 'Primero selecciona servicio'}</option>{beds.map(location => <option key={location.code} value={location.code}>{[location.unitLabel, `Cama ${location.bedLabel}`].filter(Boolean).join(' · ')}</option>)}</select></div>
        </div>
        <div><Label className="text-xs font-bold text-slate-700">¿A quién corresponde?</Label><div className="mt-1 grid grid-cols-2 gap-2"><button type="button" onClick={() => { setAssociationMode('current'); setMessage(''); }} className={`rounded-lg border px-3 py-2 text-sm font-bold ${associationMode === 'current' ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-600'}`}>Paciente vigente</button><button type="button" onClick={() => { setAssociationMode('new'); setMessage(''); }} className={`rounded-lg border px-3 py-2 text-sm font-bold ${associationMode === 'new' ? 'border-indigo-400 bg-indigo-50 text-indigo-900' : 'border-slate-200 text-slate-600'}`}>Nuevo usuario</button></div>{associationMode === 'new' && <p className="mt-1 text-[11px] text-indigo-700">El registro vigente de esa cama se conserva como histórico y se crea una ficha mínima nueva.</p>}</div>
        <div className="grid gap-3 sm:grid-cols-2"><div><Label className="text-xs font-bold text-slate-700">Iniciales del paciente</Label><input value={initials} onChange={event => { setInitials(event.target.value.toUpperCase().replace(/[^A-ZÁÉÍÓÚÜÑ\s]/g, '').slice(0, 12)); setMessage(''); }} className={control} placeholder="Ej.: MEAA" autoComplete="off" /></div><div><Label className="text-xs font-bold text-slate-700">Edad</Label><input type="number" min="0" max="120" value={age} onChange={event => { setAge(event.target.value); setMessage(''); }} className={control} placeholder="Años" /></div></div>
        {message && <div className={`rounded-lg border p-3 text-sm font-semibold ${/correctamente/i.test(message) ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : /conservado/i.test(message) ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-700'}`}>{message}</div>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4"><Button type="button" variant="outline" onClick={onClose} disabled={saving}>{completed ? 'Cerrar' : 'Cancelar'}</Button>{!completed && <Button type="button" onClick={submit} disabled={!service || !bedCode || !initials.trim() || !age || saving} className="bg-emerald-700 hover:bg-emerald-800">{saving ? 'Guardando…' : actionLabel}</Button>}</footer>
    </div>
  </div>;
}
