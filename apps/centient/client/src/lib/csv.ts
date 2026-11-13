// Reads a CSV file's text into rows of cells (RFC 4180: quoted cells may hold the separator, line breaks and
// "" for a quote). The separator is the one the first line uses most: comma, semicolon (Excel in Indonesia)
// or tab. Blank lines are dropped.
const SEPARATORS = [',', ';', '\t'];

export function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, '');
  const firstLine = body.slice(0, body.search(/\r?\n|$/));
  const count = (sep: string) => firstLine.split(sep).length;
  const sep = SEPARATORS.reduce((best, s) => (count(s) > count(best) ? s : best));

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some(Boolean)) rows.push(row);
    row = [];
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (body[i + 1] === '"') cell += body[++i];
      else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) endCell();
    else if (ch === '\n') endRow();
    else if (ch !== '\r') cell += ch;
  }
  endRow();
  return rows;
}
