/**
 * Verifica que el registro hospitalario activo refleje el censo indicado:
 * mismo RUT en cada cama, sin duplicados ni activos inesperados.
 *
 * Si el censo no incluye hospitalización domiciliaria, las camas HD- se
 * reportan aparte como "fuera del censo" en vez de contarse como problema.
 *
 * Uso: node --env-file=.env scripts/verify-census-state-v1.mjs [censo.mjs]
 */
import { createClient } from '@supabase/supabase-js';

const censusFile = process.argv[2] || './data/censo-2026-09-09.mjs';
const { ROWS } = await import(censusFile.startsWith('.') ? censusFile : `./data/${censusFile}`);

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const rutKey = (value) => String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();

const expected = new Map(ROWS.map((row) => [rutKey(row[5]), { name: row[4], service: row[0] }]));
const censusHasHodom = ROWS.some((row) => row[0] === 'HODOM');

const { data, error } = await supabase.from('proa_records').select('bed_code,servicio,evolutions');
if (error) throw error;

const active = data.filter((row) => !row.bed_code.startsWith('HIST-') && !row.bed_code.startsWith('TEST'));
const seen = new Map();
const problems = [];
const outsideCensus = [];

for (const row of active) {
  const form = row.evolutions?.[0]?.form || {};
  const key = rutKey(form.rut);
  if (seen.has(key)) problems.push(`RUT duplicado ${form.rut}: ${seen.get(key)} y ${row.bed_code}`);
  seen.set(key, row.bed_code);
  if (expected.has(key)) continue;
  if (!censusHasHodom && row.bed_code.startsWith('HD-')) outsideCensus.push(`${row.bed_code} ${form.paciente}`);
  else problems.push(`Activo fuera del censo: ${row.bed_code} ${form.paciente}`);
}

for (const [key, info] of expected) {
  if (!seen.has(key)) problems.push(`Falta en el registro: ${info.name} (${info.service})`);
}

const byService = active.reduce((acc, row) => ({ ...acc, [row.servicio]: (acc[row.servicio] || 0) + 1 }), {});
console.log(`Censo: ${censusFile} — ${expected.size} pacientes${censusHasHodom ? '' : ' (sin hospitalización domiciliaria)'}`);
console.log(`Activos en el registro: ${active.length}`);
console.log(Object.entries(byService).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
if (outsideCensus.length) console.log(`\nFuera del censo, conservados a propósito (${outsideCensus.length}):\n${outsideCensus.map((r) => `  - ${r}`).join('\n')}`);
console.log(problems.length ? `\nProblemas:\n${problems.map((p) => `  - ${p}`).join('\n')}` : '\nSin discrepancias.');
