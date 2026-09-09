/**
 * Inspecciona registros activos por cama o por RUT, para depurar imports.
 *
 * Uso: node --env-file=.env scripts/inspect-bed-v1.mjs <texto a buscar>
 */
import { createClient } from '@supabase/supabase-js';

const needle = (process.argv[2] || '').toLowerCase();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const { data, error } = await supabase.from('proa_records').select('id,bed_code,servicio,updated_at,evolutions');
if (error) throw error;

const matches = data.filter((row) => {
  const form = row.evolutions?.[0]?.form || {};
  return [row.bed_code, row.servicio, form.paciente, form.rut, form.cama]
    .some((value) => String(value || '').toLowerCase().includes(needle));
});

console.log(`Coincidencias: ${matches.length} (de ${data.length} filas)`);
for (const row of matches) {
  const form = row.evolutions?.[0]?.form || {};
  console.log([
    row.bed_code,
    row.servicio,
    form.paciente,
    form.rut,
    `cama_form=${form.cama}`,
    `estado=${form.proa_patient_status || 'activo'}`,
    `evoluciones=${row.evolutions?.length || 0}`,
  ].join(' | '));
}
