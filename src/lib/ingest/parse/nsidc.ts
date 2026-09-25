// NSIDC Sea Ice Index (G02135) Version 4 monthly CSV parser.
// Header observed in the retrieved files: "year, mo,source_dataset, region, extent,   area".
// Missing values are encoded as -9999 (e.g. Dec 1987 / Jan 1988 satellite data gap).

export interface NsidcMonthlyRow {
  year: number;
  month: number;
  sourceDataset: string | null; // e.g. NSIDC-0051 (final), NSIDC-0803 (near-real-time) or a quoted combination
  region: 'N' | 'S';
  extent: number | null; // million km^2
  area: number | null; // million km^2
  raw: string;
  rowKey: string; // YYYY-MM
}

export const NSIDC_EXPECTED_HEADER = ['year', 'mo', 'source_dataset', 'region', 'extent', 'area'];
export const NSIDC_MISSING = -9999;

/** Split one CSV line, honouring double-quoted fields (the provider quotes multi-product labels). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseNsidcMonthlyCsv(text: string): NsidcMonthlyRow[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) throw new Error('NSIDC CSV: no data rows');
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  if (header.join('|') !== NSIDC_EXPECTED_HEADER.join('|')) {
    throw new Error(`NSIDC CSV: unexpected header "${lines[0]}" (expected ${NSIDC_EXPECTED_HEADER.join(', ')})`);
  }
  const rows: NsidcMonthlyRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    if (cells.length !== 6) throw new Error(`NSIDC CSV: malformed row "${line}"`);
    const [y, m, ds, region, ext, area] = cells;
    const num = (s: string) => {
      const v = Number(s);
      if (!Number.isFinite(v)) throw new Error(`NSIDC CSV: non-numeric value "${s}" in "${line}"`);
      return v === NSIDC_MISSING ? null : v;
    };
    if (region !== 'N' && region !== 'S') throw new Error(`NSIDC CSV: unknown region "${region}"`);
    const year = Number(y), month = Number(m);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new Error(`NSIDC CSV: bad date in "${line}"`);
    rows.push({
      year,
      month,
      sourceDataset: ds === String(NSIDC_MISSING) ? null : ds,
      region,
      extent: num(ext),
      area: num(area),
      raw: line,
      rowKey: `${year}-${String(month).padStart(2, '0')}`,
    });
  }
  return rows;
}
