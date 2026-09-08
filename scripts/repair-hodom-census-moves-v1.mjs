/**
 * Repara los registros de hospitalización domiciliaria que el import del censo
 * archivó por error al encadenar traslados (ver el fix de relocatedIds en
 * scripts/import-hospital-census-xls.mjs).
 *
 * Devuelve a cada paciente a la cama que le asigna el censo y limpia las marcas
 * de egreso, conservando su historial de evoluciones.
 *
 * Uso: node --env-file=.env scripts/repair-hodom-census-moves-v1.mjs [--apply]
 */
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const TARGETS = { '42431079': 'HD-5', '182668370': 'HD-6' };

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const rutKey = (value) => String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();

const { data: rows, error } = await supabase.from('proa_records').select('id,bed_code,servicio,evolutions');
if (error) throw error;

for (const row of rows) {
  if (!row.bed_code.startsWith('HIST-')) continue;
  const form = row.evolutions?.[0]?.form || {};
  const bed = TARGETS[rutKey(form.rut)];
  if (!bed) continue;

  const restored = { ...form };
  delete restored.proa_patient_status;
  delete restored.proa_archived_at;
  delete restored.fecha_egreso;
  delete restored.motivo_egreso;
  const evolutions = [{ ...row.evolutions[0], form: restored }, ...row.evolutions.slice(1)];

  console.log(`${form.paciente} -> ${bed}`);
  if (!APPLY) continue;
  const { error: updateError } = await supabase
    .from('proa_records')
    .update({ bed_code: bed, servicio: 'Hospitalización domiciliaria', evolutions })
    .eq('id', row.id);
  if (updateError) throw updateError;
}

console.log(APPLY ? 'Registros restaurados.' : 'Modo dry-run. Use --apply.');
