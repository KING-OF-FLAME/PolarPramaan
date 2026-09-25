// Executes a calculation recipe against stored observations and persists a
// calculation run. No LLM is involved: chart values, statistics and any number
// quoted in generated text all come from here.
import { createHash } from 'node:crypto';
import type { Queryable } from '../db/core';
import { CODE_VERSION, RecipeSchema, canonicalJson, type Recipe } from './recipe';
import { mean, ols } from './stats';

export interface CalcRow {
  rowKey: string;
  t: string; // ISO date
  value: number | null;
  raw: string;
  flag: string | null;
  lat: number | null;
  lon: number | null;
  included: boolean;
  excludedReason: string | null;
}

export interface CalcResult {
  series: { seriesKey: string; variable: string; region: string; units: string; frequency: string; description: string | null };
  source: { recordId: string; title: string; sourceVersionId: string; versionStatus: string; retrievedAt: string; citation: string | null; canonicalUrl: string };
  rows: CalcRow[];
  n: number;
  nExcluded: number;
  stats: {
    mean?: number | null;
    min?: { value: number; rowKey: string } | null;
    max?: { value: number; rowKey: string } | null;
    first?: { value: number; rowKey: string } | null;
    last?: { value: number; rowKey: string } | null;
    change?: number | null;
    trend?: { perDecade: number; n: number; r2: number; yearsSpanned: number } | null;
    trendUnavailableReason?: string | null;
    baseline?: { start: string; end: string; mean: number | null; n: number } | null;
    lastAnomaly?: number | null;
    lowest?: { value: number; rowKey: string }[];
    highest?: { value: number; rowKey: string }[];
  };
  qualityNotes: string[];
}

export interface CalcRun {
  id: string;
  recipe: Recipe;
  recipeHash: string;
  codeVersion: string;
  result: CalcResult;
  units: string;
  createdAt: string;
}

export class CalcError extends Error {}

function decimalYear(iso: string): number {
  const d = new Date(iso);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const end = Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  return d.getUTCFullYear() + (d.getTime() - start) / (end - start);
}

/** Compute without persisting. `q` should be a public-role connection for anonymous callers. */
export async function computeRecipe(q: Queryable, input: unknown, opts: { publicOnly: boolean }): Promise<{ recipe: Recipe; result: CalcResult; inputRowKeys: string[] }> {
  const recipe = RecipeSchema.parse(input);
  const seriesTable = opts.publicOnly ? 'public_dataset_series' : 'dataset_series';
  const obsTable = opts.publicOnly ? 'public_observations' : 'observations';
  const [series] = await q.query<{ id: string; series_key: string; variable: string; region: string; units: string; frequency: string; description: string | null }>(
    `select id, series_key, variable, region, units, frequency, description from ${seriesTable} where source_version_id = $1 and series_key = $2`,
    [recipe.sourceVersionId, recipe.seriesKey],
  );
  if (!series) throw new CalcError('Series not found or not available for calculations.');
  const [src] = await q.query<{ record_id: string; title: string; status: string; retrieved_at: Date; attribution: string | null; canonical_url: string }>(
    opts.publicOnly
      ? `select v.record_id, r.title, v.status, v.retrieved_at, r.attribution, r.canonical_url
           from public_source_versions v join public_records r on r.id = v.record_id where v.id = $1`
      : `select v.record_id, r.title, v.status, v.retrieved_at, cr.attribution, r.canonical_url
           from source_versions v join records r on r.id = v.record_id left join current_rights cr on cr.record_id = r.id where v.id = $1`,
    [recipe.sourceVersionId],
  );
  if (!src) throw new CalcError('Source version not available.');
  // Record the effective period: clamp open-ended requests to the series' actual coverage.
  const [cov] = await q.query<{ t0: string | null; t1: string | null }>(
    `select to_char(min(obs_time) at time zone 'UTC', 'YYYY-MM-DD') t0, to_char(max(obs_time) at time zone 'UTC', 'YYYY-MM-DD') t1 from ${obsTable} where series_id = $1`,
    [series.id],
  );
  if (cov?.t0 && recipe.periodStart < cov.t0) recipe.periodStart = cov.t0;
  if (cov?.t1 && recipe.periodEnd > cov.t1) recipe.periodEnd = cov.t1;
  if (recipe.periodStart > recipe.periodEnd) throw new CalcError('The selected period is outside the data coverage.');
  const obs = await q.query<{ row_key: string; t: string; value: number | null; raw_value: string; flag: string | null; lat: number | null; lon: number | null }>(
    `select row_key, to_char(obs_time at time zone 'UTC', 'YYYY-MM-DD') as t, value, raw_value, flag, lat, lon
       from ${obsTable}
      where series_id = $1 and obs_time >= $2::date and obs_time < ($3::date + 1)
        and ($4::int is null or extract(month from obs_time at time zone 'UTC') = $4)
      order by obs_time, row_key`,
    [series.id, recipe.periodStart, recipe.periodEnd, recipe.month],
  );
  const rows: CalcRow[] = obs.map((o) => {
    const value = o.value == null ? null : Number(o.value);
    let excludedReason: string | null = null;
    if (value == null) excludedReason = 'missing value (provider flag)';
    else if (recipe.latRange && (o.lat == null || Number(o.lat) < recipe.latRange.min || Number(o.lat) > recipe.latRange.max)) excludedReason = 'outside latitude band';
    else if (o.flag && recipe.excludeFlags.includes(o.flag)) excludedReason = `flag ${o.flag} excluded by recipe`;
    return { rowKey: o.row_key, t: o.t, value, raw: o.raw_value, flag: o.flag, lat: o.lat == null ? null : Number(o.lat), lon: o.lon == null ? null : Number(o.lon), included: excludedReason == null, excludedReason };
  });
  const used = rows.filter((r) => r.included) as (CalcRow & { value: number })[];
  const values = used.map((r) => r.value);
  const stats: CalcResult['stats'] = {};
  const want = new Set(recipe.stats);
  const minRow = used.reduce<(typeof used)[0] | null>((m, r) => (m == null || r.value < m.value ? r : m), null);
  const maxRow = used.reduce<(typeof used)[0] | null>((m, r) => (m == null || r.value > m.value ? r : m), null);
  if (want.has('mean')) stats.mean = mean(values);
  if (want.has('min')) stats.min = minRow ? { value: minRow.value, rowKey: minRow.rowKey } : null;
  if (want.has('max')) stats.max = maxRow ? { value: maxRow.value, rowKey: maxRow.rowKey } : null;
  if (want.has('first_last')) {
    const f = used[0], l = used[used.length - 1];
    stats.first = f ? { value: f.value, rowKey: f.rowKey } : null;
    stats.last = l ? { value: l.value, rowKey: l.rowKey } : null;
    stats.change = f && l ? l.value - f.value : null;
  }
  if (want.has('rank')) {
    const sorted = [...used].sort((a, b) => a.value - b.value || a.rowKey.localeCompare(b.rowKey));
    stats.lowest = sorted.slice(0, 5).map((r) => ({ value: r.value, rowKey: r.rowKey }));
    stats.highest = sorted.slice(-5).reverse().map((r) => ({ value: r.value, rowKey: r.rowKey }));
  }
  const qualityNotes: string[] = [];
  if (want.has('trend')) {
    const yearsSpanned = used.length ? decimalYear(used[used.length - 1].t) - decimalYear(used[0].t) : 0;
    if (series.frequency !== 'monthly') {
      stats.trend = null;
      stats.trendUnavailableReason = 'Trends are only computed for monthly satellite series. This dataset is a short set of individual observations, so a trend line would be misleading.';
    } else if (used.length < 20 || yearsSpanned < 19) {
      stats.trend = null;
      stats.trendUnavailableReason = 'A trend needs at least 20 values spanning 19 or more years. Choose a longer period.';
    } else {
      const fit = ols(used.map((r) => ({ x: decimalYear(r.t), y: r.value })));
      stats.trend = fit ? { perDecade: fit.slope * 10, n: fit.n, r2: fit.r2, yearsSpanned } : null;
      qualityNotes.push('The trend is a descriptive least-squares line through the selected values. It does not attribute causes and does not predict future values.');
    }
  }
  if (want.has('baseline_anomaly') && recipe.baseline) {
    const b = used.filter((r) => r.t >= recipe.baseline!.start && r.t <= recipe.baseline!.end);
    const bm = mean(b.map((r) => r.value));
    stats.baseline = { start: recipe.baseline.start, end: recipe.baseline.end, mean: bm, n: b.length };
    const l = used[used.length - 1];
    stats.lastAnomaly = bm != null && l ? l.value - bm : null;
    if (b.length === 0) qualityNotes.push('No values fall inside the baseline period.');
  }
  const excluded = rows.filter((r) => !r.included);
  if (excluded.length) qualityNotes.push(`${excluded.length} row(s) excluded: ${[...new Set(excluded.map((r) => r.excludedReason))].join('; ')}.`);
  const nrt = used.filter((r) => r.flag === 'NSIDC-0803').length;
  if (nrt) qualityNotes.push(`${nrt} included value(s) come from NSIDC's near-real-time product (NSIDC-0803) and may be revised when final data are released.`);
  const odd = used.filter((r) => r.flag === 'outside_declared_unit_range').length;
  if (odd) qualityNotes.push(`${odd} value(s) exceed the provider's declared unit range (${series.units}). They are shown as recorded, not converted.`);
  return {
    recipe,
    inputRowKeys: used.map((r) => r.rowKey),
    result: {
      series: { seriesKey: series.series_key, variable: series.variable, region: series.region, units: series.units, frequency: series.frequency, description: series.description },
      source: { recordId: src.record_id, title: src.title, sourceVersionId: recipe.sourceVersionId, versionStatus: src.status, retrievedAt: new Date(src.retrieved_at).toISOString(), citation: src.attribution, canonicalUrl: src.canonical_url },
      rows,
      n: used.length,
      nExcluded: excluded.length,
      stats,
      qualityNotes,
    },
  };
}

export function recipeHash(recipe: Recipe): string {
  return createHash('sha256').update(`${CODE_VERSION}\n${canonicalJson(recipe)}`).digest('hex');
}

/** Compute and persist (or reuse an identical earlier run). Runs with the privileged connection. */
export async function saveCalculation(q: Queryable, input: unknown, actorId: string | null): Promise<CalcRun> {
  const { recipe, result, inputRowKeys } = await computeRecipe(q, input, { publicOnly: false });
  const hash = recipeHash(recipe);
  const [existing] = await q.query<{ id: string; result: CalcResult; created_at: Date }>(
    `select id, result, created_at from calculation_runs where recipe_hash = $1 and code_version = $2 order by created_at limit 1`,
    [hash, CODE_VERSION],
  );
  if (existing && canonicalJson(existing.result) === canonicalJson(result)) {
    return { id: existing.id, recipe, recipeHash: hash, codeVersion: CODE_VERSION, result, units: result.series.units, createdAt: new Date(existing.created_at).toISOString() };
  }
  const [row] = await q.query<{ id: string; created_at: Date }>(
    `insert into calculation_runs (recipe, recipe_hash, code_version, input_source_version_ids, input_row_keys, result, units, created_by)
     values ($1::jsonb, $2, $3, $4, $5, $6::jsonb, $7, $8) returning id, created_at`,
    [JSON.stringify(recipe), hash, CODE_VERSION, [recipe.sourceVersionId], inputRowKeys.map((k) => `${recipe.seriesKey}/${k}`), JSON.stringify(result), result.series.units, actorId],
  );
  return { id: row.id, recipe, recipeHash: hash, codeVersion: CODE_VERSION, result, units: result.series.units, createdAt: new Date(row.created_at).toISOString() };
}

export async function loadCalculation(q: Queryable, id: string, publicOnly: boolean): Promise<CalcRun | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await q.query<{ id: string; recipe: Recipe; recipe_hash: string; code_version: string; result: CalcResult; units: string; created_at: Date }>(
    `select id, recipe, recipe_hash, code_version, result, units, created_at from ${publicOnly ? 'public_calculation_runs' : 'calculation_runs'} where id = $1`,
    [id],
  );
  return r ? { id: r.id, recipe: r.recipe, recipeHash: r.recipe_hash, codeVersion: r.code_version, result: r.result, units: r.units, createdAt: new Date(r.created_at).toISOString() } : null;
}
