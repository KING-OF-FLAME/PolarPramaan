import type { CalcRun } from './compute';

export function rowsCsv(run: CalcRun): string {
  const esc = (s: unknown) => {
    const v = s == null ? '' : String(s);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const head = ['row_key', 'date_utc', 'value', 'raw_value', 'flag', 'included', 'excluded_reason', 'lat', 'lon', 'units'];
  const lines = run.result.rows.map((r) => [r.rowKey, r.t, r.value, r.raw, r.flag, r.included, r.excludedReason, r.lat, r.lon, run.units].map(esc).join(','));
  const cite = `# Source: ${run.result.source.title} (${run.result.source.canonicalUrl}); retrieved ${run.result.source.retrievedAt}. Cite: ${run.result.source.citation ?? 'see source'}. Calculation ${run.id}.`;
  return [cite, head.join(','), ...lines].join('\n') + '\n';
}

/** A dependency-free script that recomputes the published statistics from the exported CSV. */
export function verifyScript(): string {
  return `// Recompute PolarPramaan calculation statistics from the exported CSV and recipe.
// Usage: node verify-calculation.mjs rows.csv recipe.json
import { readFileSync } from 'node:fs';
const [csvPath, recipePath] = process.argv.slice(2);
const recipe = JSON.parse(readFileSync(recipePath, 'utf8'));
const lines = readFileSync(csvPath, 'utf8').split('\\n').filter((l) => l && !l.startsWith('#'));
const head = lines.shift().split(',');
const idx = (k) => head.indexOf(k);
const rows = lines.map((l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')));
const used = rows.filter((r) => r[idx('included')] === 'true').map((r) => ({ t: r[idx('date_utc')], v: Number(r[idx('value')]) }));
const n = used.length;
const mean = used.reduce((a, r) => a + r.v, 0) / n;
const dy = (iso) => { const d = new Date(iso + 'T00:00:00Z'); const y = d.getUTCFullYear(); const s = Date.UTC(y, 0, 1), e = Date.UTC(y + 1, 0, 1); return y + (d - s) / (e - s); };
let slope = null;
if (n >= 3) {
  const xs = used.map((r) => dy(r.t)); const mx = xs.reduce((a, b) => a + b, 0) / n; const my = mean;
  let sxy = 0, sxx = 0; xs.forEach((x, i) => { sxy += (x - mx) * (used[i].v - my); sxx += (x - mx) ** 2; });
  slope = sxy / sxx;
}
const min = Math.min(...used.map((r) => r.v)), max = Math.max(...used.map((r) => r.v));
const s = recipe.stats;
const check = (name, mine, theirs) => console.log((theirs == null || Math.abs(mine - theirs) < 1e-9 ? 'OK  ' : 'DIFF') + ' ' + name + ': recomputed ' + mine + ' / published ' + theirs);
console.log('n =', n, '(published', recipe.n + ')');
if (s.mean != null) check('mean', mean, s.mean);
if (s.min) check('min', min, s.min.value);
if (s.max) check('max', max, s.max.value);
if (s.trend) check('trend per decade', slope * 10, s.trend.perDecade);
`;
}
