/**
 * Emisor compartido de los censos hospitalarios guardados en este directorio.
 *
 * Cada censo exporta sus filas y llama a `emitIfMain` para escribir la tabla
 * HTML que consume scripts/import-hospital-census-xls.mjs.
 */
export const HEADERS = [
  'Servicio', 'Sala', 'Cama', 'Dotacion', 'Paciente', 'Rut', 'Edad', 'Comuna',
  'Diagnostico', 'Ingreso', 'Dias', 'Observaciones', 'Fecha Nacimiento', 'Domicilio', 'Genero', 'Codigo Diagn.',
];

const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toRow = (cells) => `<tr>${cells.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`;

export const toTable = (rows) => `<table>\n${toRow(HEADERS)}\n${rows.map(toRow).join('\n')}\n</table>`;

/** Escribe la tabla solo si el módulo se ejecuta directamente. */
export function emitIfMain(moduleUrl, rows) {
  const entry = process.argv[1];
  if (entry && moduleUrl.endsWith(entry.split('/').pop())) console.log(toTable(rows));
}
