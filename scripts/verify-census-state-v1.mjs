/**
 * Verifica que el registro hospitalario activo refleje exactamente el censo
 * reconstruido: misma cama, mismo RUT, sin duplicados ni camas huérfanas.
 *
 * Uso: node --env-file=.env scripts/verify-census-state-v1.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { ROWS } from './data/censo-2026-09-08.mjs';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const rutKey = (value) => String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();

const expected = new Map(ROWS.map((row) => [rutKey(row[5]), { name: row[4], service: row[0] }]));

const { data, error } = await supabase.from('proa_records').select('bed_code,servicio,evolutions');
if (error) throw error;

const active = data.filter((row) => !row.bed_code.startsWith('HIST-') && !row.bed_code.startsWith('TEST'));
const seen = new Map();
const problems = [];

for (const row of active) {
  const form = row.evolutions?.[0]?.form || {};
  const key = rutKey(form.rut);
  if (seen.has(key)) problems.push(`RUT duplicado ${form.rut}: ${seen.get(key)} y ${row.bed_code}`);
  seen.set(key, row.bed_code);
  if (!expected.has(key)) problems.push(`Activo fuera del censo: ${row.bed_code} ${form.paciente}`);
}

for (const [key, info] of expected) {
  if (!seen.has(key)) problems.push(`Falta en el registro: ${info.name} (${info.service})`);
}

const byService = active.reduce((acc, row) => ({ ...acc, [row.servicio]: (acc[row.servicio] || 0) + 1 }), {});
console.log(`Activos: ${active.length} (censo: ${expected.size})`);
console.log(Object.entries(byService).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
console.log(problems.length ? `\nProblemas:\n${problems.map((p) => `  - ${p}`).join('\n')}` : '\nSin discrepancias.');
