// PANGAEA "textfile" (tab-separated) parser. The file starts with a /* ... */
// metadata block followed by a header row and data rows.

export interface PangaeaHeader {
  citation?: string;
  abstract?: string;
  furtherDetails?: string;
  coverage?: string;
  comment?: string;
  license?: string;
  size?: string;
  parameters: string[];
  lines: { key: string; text: string; lineNo: number }[];
}

export interface PangaeaTable {
  header: PangaeaHeader;
  columns: string[];
  rows: { lineNo: number; raw: string; cells: string[] }[];
}

export function parsePangaeaTab(text: string): PangaeaTable {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (!lines[0].startsWith('/*')) throw new Error('PANGAEA tab: missing metadata block');
  const end = lines.findIndex((l) => l.trim() === '*/');
  if (end < 0) throw new Error('PANGAEA tab: unterminated metadata block');
  const header: PangaeaHeader = { parameters: [], lines: [] };
  let key = '';
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    const m = line.match(/^([A-Za-z][A-Za-z ()]*):\t(.*)$/);
    let value: string;
    if (m) {
      key = m[1].trim();
      value = m[2];
    } else {
      value = line.replace(/^\t/, '');
    }
    header.lines.push({ key, text: value, lineNo: i + 1 });
    const k = key.toLowerCase();
    if (k === 'citation') header.citation = value;
    else if (k === 'abstract') header.abstract = value;
    else if (k === 'further details') header.furtherDetails = value;
    else if (k === 'coverage') header.coverage = (header.coverage ? header.coverage + ' ' : '') + value;
    else if (k === 'comment') header.comment = value;
    else if (k === 'license') header.license = value;
    else if (k === 'size') header.size = value;
    else if (k === 'parameter(s)') header.parameters.push(value);
  }
  const columns = lines[end + 1].split('\t');
  const rows = [];
  for (let i = end + 2; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = lines[i].split('\t');
    if (cells.length !== columns.length) throw new Error(`PANGAEA tab: row ${i + 1} has ${cells.length} cells, expected ${columns.length}`);
    rows.push({ lineNo: i + 1, raw: lines[i], cells });
  }
  return { header, columns, rows };
}

/** Extract the unit declared in a PANGAEA column label, e.g. "Ice conc [tenths] (total)" -> "tenths". */
export function declaredUnit(column: string): string | null {
  const m = column.match(/\[([^\]]+)\]/);
  return m ? m[1] : null;
}
