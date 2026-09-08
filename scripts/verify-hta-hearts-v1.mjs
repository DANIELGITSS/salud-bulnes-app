/**
 * Verifica la coherencia del tema GES de HTA tras la actualización HEARTS:
 * todos los bloques con pestaña, tipos soportados por el renderer, mermaid sin
 * saltos crudos y la calculadora Morisky enlazada.
 *
 * Uso: node --env-file=.env scripts/verify-hta-hearts-v1.mjs
 */
import { createClient } from '@supabase/supabase-js';

const TOPIC_ID = '696ea74c245ef362de4f433a';
const RENDERED_TYPES = new Set([
  'protocol_header', 'alert', 'criteria', 'checklist', 'flowchart', 'algorithm',
  'table', 'text', 'mermaid', 'reference', 'clinical', 'image_gallery',
  'hearts_pathway', 'hearts_ladder',
]);

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const { data: topic, error } = await supabase
  .from('topics')
  .select('name,content_blocks,related_tools,has_local_protocol,protocol_code')
  .eq('id', TOPIC_ID)
  .single();
if (error) throw error;

const blocks = topic.content_blocks || [];
const problems = [];

const headers = blocks.filter((block) => block.type === 'protocol_header');
const tabbed = blocks.filter((block) => block.type !== 'protocol_header');
if (tabbed.some((block) => !block.tab)) problems.push('Hay bloques sin `tab` conviviendo con bloques con pestaña.');
for (const block of blocks) {
  if (!RENDERED_TYPES.has(block.type)) problems.push(`Tipo sin case en el renderer: ${block.type} (${block.id})`);
  if (block.type === 'mermaid' && /\\n|[^r]\n\s{0,4}[A-Z]\[/.test(block.content || '')) {
    if ((block.content || '').includes('\\n')) problems.push(`Mermaid con \\n crudo: ${block.id}`);
  }
  if (block.type === 'table') {
    const width = (block.headers || []).length;
    (block.rows || []).forEach((row, index) => {
      if (row.length !== width) problems.push(`Tabla ${block.id}: fila ${index + 1} tiene ${row.length} celdas y la cabecera ${width}`);
    });
  }
}

const ids = blocks.map((block) => block.id);
const duplicated = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicated.length) problems.push(`IDs de bloque duplicados: ${[...new Set(duplicated)].join(', ')}`);

const tools = topic.related_tools || [];
if (!tools.some((tool) => tool.tool_id === 'morisky-mmas8')) problems.push('Falta la calculadora Morisky en related_tools.');

const byTab = tabbed.reduce((acc, block) => ({ ...acc, [block.tab]: (acc[block.tab] || 0) + 1 }), {});
console.log(`Tema: ${topic.name}`);
console.log(`Código: ${topic.protocol_code} · protocolo local: ${topic.has_local_protocol}`);
console.log(`Bloques: ${blocks.length} (${headers.length} encabezado fijo)`);
console.log(Object.entries(byTab).map(([tab, count]) => `  ${tab}: ${count}`).join('\n'));
console.log(`Herramientas: ${tools.map((tool) => tool.tool_id).join(', ') || 'ninguna'}`);
console.log(problems.length ? `\nProblemas:\n${problems.map((p) => `  - ${p}`).join('\n')}` : '\nSin problemas.');
