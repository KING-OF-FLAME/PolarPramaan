// Turns snapshot bytes into evidence spans and numeric series. Deterministic:
// the same bytes always produce the same spans, rows and keys.
import type { Extraction } from './curation';
import { readSnapshot, readSnapshotJson, readSnapshotText } from './snapshot';
import { parseNsidcMonthlyCsv, NSIDC_EXPECTED_HEADER } from './parse/nsidc';
import { declaredUnit, parsePangaeaTab } from './parse/pangaea';
import { groupCues, parseCaptions } from './parse/captions';
import { htmlToBlocks } from './parse/html';
import { wikipediaExtractToBlocks } from './parse/wikipedia';
import { chunkBlocks } from './parse/chunk';
import { chunkPdfPages, pdfPages } from './parse/pdf';

export interface SpanInput {
  kind: 'text' | 'pdf_page' | 'table_row' | 'caption_cue' | 'metadata';
  text: string;
  method: string;
  page?: number | null;
  charStart?: number | null;
  charEnd?: number | null;
  heading?: string | null;
  rowKey?: string | null;
  columnNames?: string[] | null;
  tStartMs?: number | null;
  tEndMs?: number | null;
}

export interface ObservationInput {
  obsTime: string; // ISO timestamp
  value: number | null;
  rawValue: string;
  flag: string | null;
  rowKey: string;
  lat?: number | null;
  lon?: number | null;
  extra?: Record<string, unknown> | null;
}

export interface SeriesInput {
  seriesKey: string;
  variable: string;
  region: string;
  units: string;
  frequency: 'monthly' | 'daily' | 'per_observation';
  description: string;
  observations: ObservationInput[];
}

export interface ExtractionResult {
  spans: SpanInput[];
  series: SeriesInput[];
  warnings: string[];
}

export async function runExtraction(ex: Extraction): Promise<ExtractionResult> {
  switch (ex.type) {
    case 'nsidc-monthly':
      return nsidc(ex.hemisphere, ex.files);
    case 'pangaea-tab':
      return pangaea(ex.file);
    case 'captions': {
      const cues = groupCues(parseCaptions(readSnapshotText(ex.file)), 30_000);
      return {
        spans: cues.map((c) => ({ kind: 'caption_cue', text: c.text, method: 'caption-cues-30s', tStartMs: c.startMs, tEndMs: c.endMs })),
        series: [],
        warnings: /\.srt$/.test(ex.file) ? ['Captions appear auto-generated (rolling); repeated lines were merged.'] : [],
      };
    }
    case 'html': {
      const { chunks } = chunkBlocks(htmlToBlocks(readSnapshotText(ex.file)));
      return { spans: chunks.map((c) => ({ kind: 'text', text: c.text, method: 'html-block', heading: c.heading, charStart: c.charStart, charEnd: c.charEnd })), series: [], warnings: [] };
    }
    case 'wikipedia': {
      const j = readSnapshotJson<{ query: { pages: Record<string, { extract?: string }> } }>(ex.file);
      const extract = Object.values(j.query.pages)[0]?.extract || '';
      const { chunks } = chunkBlocks(wikipediaExtractToBlocks(extract));
      return { spans: chunks.map((c) => ({ kind: 'text', text: c.text, method: 'wikipedia-extract', heading: c.heading, charStart: c.charStart, charEnd: c.charEnd })), series: [], warnings: [] };
    }
    case 'pdf': {
      const pages = await pdfPages(new Uint8Array(readSnapshot(ex.file)));
      const chunks = chunkPdfPages(pages);
      const warnings = chunks.length === 0 ? ['No text layer found; OCR is not configured, so this PDF has no text evidence.'] : [];
      return { spans: chunks.map((c) => ({ kind: 'pdf_page', text: c.text, method: 'pdfjs-text', page: c.page, charStart: c.charStart, charEnd: c.charEnd })), series: [], warnings };
    }
    case 'metadata':
      return { spans: ex.texts.filter((t) => t.text.trim()).map((t) => ({ kind: 'metadata', text: t.text.trim(), method: 'provider-metadata', heading: t.label })), series: [], warnings: [] };
  }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function nsidc(h: 'N' | 'S', files: string[]): ExtractionResult {
  const spans: SpanInput[] = [];
  const extent: ObservationInput[] = [];
  const area: ObservationInput[] = [];
  const warnings: string[] = [];
  for (const f of files) {
    const rows = parseNsidcMonthlyCsv(readSnapshotText(f));
    for (const r of rows) {
      if (r.region !== h) throw new Error(`${f}: region ${r.region} in ${h} file`);
      const obsTime = `${r.rowKey}-01T00:00:00Z`;
      const flag = r.sourceDataset ?? 'missing';
      extent.push({ obsTime, value: r.extent, rawValue: String(r.extent ?? -9999), flag: r.extent == null ? 'missing' : flag, rowKey: r.rowKey });
      area.push({ obsTime, value: r.area, rawValue: String(r.area ?? -9999), flag: r.area == null ? 'missing' : flag, rowKey: r.rowKey });
      spans.push({
        kind: 'table_row',
        text: r.raw,
        method: 'nsidc-csv-row',
        heading: `${h === 'N' ? 'Arctic' : 'Antarctic'} monthly sea-ice extent and area, ${MONTHS[r.month - 1]} ${r.year}`,
        rowKey: `${f.split('/').pop()}#${r.rowKey}`,
        columnNames: NSIDC_EXPECTED_HEADER,
      });
    }
  }
  extent.sort((a, b) => a.obsTime.localeCompare(b.obsTime));
  area.sort((a, b) => a.obsTime.localeCompare(b.obsTime));
  const missing = extent.filter((o) => o.value == null).map((o) => o.rowKey);
  if (missing.length) warnings.push(`Provider marks ${missing.length} monthly extent value(s) missing (-9999): ${missing.join(', ')}.`);
  const nrt = extent.filter((o) => o.flag === 'NSIDC-0803').map((o) => o.rowKey);
  if (nrt.length) warnings.push(`${nrt.length} month(s) come from the near-real-time input product NSIDC-0803 rather than the final NSIDC-0051 record.`);
  const region = h === 'N' ? 'arctic' : 'antarctic';
  return {
    spans,
    series: [
      { seriesKey: `${h}-monthly-extent`, variable: 'sea_ice_extent', region, units: 'million km²', frequency: 'monthly', description: `Monthly mean sea-ice extent (area with ≥15% ice concentration), ${region === 'arctic' ? 'Northern' : 'Southern'} Hemisphere.`, observations: extent },
      { seriesKey: `${h}-monthly-area`, variable: 'sea_ice_area', region, units: 'million km²', frequency: 'monthly', description: `Monthly mean sea-ice area (concentration-weighted), ${region === 'arctic' ? 'Northern' : 'Southern'} Hemisphere.`, observations: area },
    ],
    warnings,
  };
}

// PANGAEA.885208 measurement columns. Code-valued columns (ice type, floe size,
// topography, snow type) are categorical and never treated as measurements.
const PANGAEA_VARS: { col: string; variable: string; description: string }[] = [
  { col: 'Ice conc [tenths] (total)', variable: 'ice_concentration_total', description: 'Total ice concentration as recorded (declared unit: tenths).' },
  { col: 'EsEs [m] (primary sea ice)', variable: 'sea_ice_thickness_primary', description: 'Primary sea-ice thickness (visual ASPeCt estimate).' },
  { col: 'Snow thick [m] (primary sea ice)', variable: 'snow_thickness_primary', description: 'Snow thickness on primary sea ice.' },
  { col: 'Temp [°C]', variable: 'water_temperature', description: 'Water temperature.' },
  { col: 'TTT [°C]', variable: 'air_temperature', description: 'Air temperature.' },
  { col: 'ff [m/s]', variable: 'wind_speed', description: 'Wind speed.' },
];

function pangaea(file: string): ExtractionResult {
  const t = parsePangaeaTab(readSnapshotText(file));
  const spans: SpanInput[] = [];
  const warnings: string[] = [];
  for (const [label, text] of [
    ['Citation', t.header.citation], ['Abstract', t.header.abstract], ['Further details', t.header.furtherDetails],
    ['Comment (erratum)', t.header.comment], ['License', t.header.license], ['Size', t.header.size],
  ] as const) {
    if (text) spans.push({ kind: 'text', text, method: 'pangaea-header', heading: label });
  }
  const idx = (name: string) => t.columns.indexOf(name);
  const iEvent = idx('Event'), iLat = idx('Latitude'), iLon = idx('Longitude'), iDate = idx('Date/Time');
  if ([iEvent, iLat, iLon, iDate].some((i) => i < 0)) throw new Error('PANGAEA: expected Event/Latitude/Longitude/Date/Time columns');
  for (const r of t.rows) {
    spans.push({ kind: 'table_row', text: r.raw, method: 'pangaea-tsv-row', rowKey: r.cells[iEvent], columnNames: t.columns, heading: `Observation ${r.cells[iEvent]} (${r.cells[iDate]})` });
  }
  const series: SeriesInput[] = [];
  for (const v of PANGAEA_VARS) {
    const ci = idx(v.col);
    if (ci < 0) {
      warnings.push(`Column "${v.col}" not present; ${v.variable} skipped.`);
      continue;
    }
    const units = declaredUnit(v.col) || 'unitless';
    let outOfRange = 0;
    const observations: ObservationInput[] = t.rows.map((r) => {
      const raw = r.cells[ci].trim();
      const value = raw === '' ? null : Number(raw);
      if (value != null && !Number.isFinite(value)) throw new Error(`PANGAEA: non-numeric "${raw}" in ${v.col}`);
      let flag: string | null = value == null ? 'missing' : null;
      if (units === 'tenths' && value != null && (value < 0 || value > 10)) {
        flag = 'outside_declared_unit_range';
        outOfRange++;
      }
      return {
        obsTime: `${r.cells[iDate].slice(0, 10)}T00:00:00Z`,
        value,
        rawValue: raw,
        flag,
        rowKey: r.cells[iEvent],
        lat: Number(r.cells[iLat]),
        lon: Number(r.cells[iLon]),
        extra: { station: r.cells[idx('Station')] || null, comment: r.cells[t.columns.length - 1] || null },
      };
    });
    if (outOfRange) {
      warnings.push(
        `${v.col}: ${outOfRange} value(s) exceed the declared 0–10 range for "tenths" (values run to 100). They are kept as recorded and flagged. They are not converted, because the provider has not documented a conversion.`,
      );
    }
    series.push({ seriesKey: `PANGAEA.885208-${v.variable}`, variable: v.variable, region: 'southern_ocean', units, frequency: 'per_observation', description: v.description, observations });
  }
  return { spans, series, warnings };
}
