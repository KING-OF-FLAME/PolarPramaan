// Polar misconception checker (F6). Rule-based and deterministic: it decomposes
// a statement into region / metric / month / years / direction / units, tests
// what it can against the stored NSIDC series, and retrieves passages for the
// rest. Each label needs source-backed reasons; anything the rules cannot
// settle is "insufficient", and there is no confidence percentage.
import type { Queryable } from '../db/core';
import { computeRecipe } from '../calc/compute';
import { fmt, monthName } from '../calc/format';
import { searchSpans, type SpanHit } from '../evidence/search';

export type Assessment = 'supported' | 'contradicted' | 'mixed' | 'insufficient';

export interface Finding {
  aspect: string;
  assessment: Assessment;
  explanation: string;
  evidence: { kind: 'calculation' | 'span'; label: string; detail: string; spanId?: string; recordId?: string; rowKeys?: string[] }[];
}

export interface CheckResult {
  statement: string;
  parsed: { region: 'arctic' | 'antarctic' | null; metric: string | null; month: number | null; years: number[]; direction: 'up' | 'down' | 'record_low' | 'record_high' | 'min_season' | 'max_season' | null; units: string[] };
  overall: Assessment;
  findings: Finding[];
  rewrite: string | null;
  passages: SpanHit[];
  coverageNote: string;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function parseStatement(s: string): CheckResult['parsed'] {
  const t = s.toLowerCase();
  const region = /antarctic|south pole|southern hemisphere/.test(t) ? 'antarctic' : /arctic|north pole|northern hemisphere|greenland sea/.test(t) ? 'arctic' : null;
  let metric: string | null = null;
  if (/\bextent\b/.test(t)) metric = 'extent';
  else if (/\bconcentration\b/.test(t)) metric = 'concentration';
  else if (/\bthick(ness)?\b/.test(t)) metric = 'thickness';
  else if (/\bvolume\b/.test(t)) metric = 'volume';
  else if (/ice sheet|glacier|land ice/.test(t)) metric = 'land_ice';
  else if (/sea[- ]ice/.test(t)) metric = 'sea_ice_unspecified';
  const month = MONTHS.findIndex((m) => t.includes(m));
  const years = [...new Set((t.match(/\b(19[7-9]\d|20[0-4]\d)\b/g) || []).map(Number))].sort();
  let direction: CheckResult['parsed']['direction'] = null;
  if (/(record|lowest|all-time) low|lowest (ever|on record)|smallest/.test(t)) direction = 'record_low';
  else if (/(record|all-time) high|highest (ever|on record)|largest/.test(t)) direction = 'record_high';
  else if (/\b(minimum|melts? the most|smallest of the year)\b/.test(t)) direction = 'min_season';
  else if (/\b(maximum|peak|largest of the year)\b/.test(t)) direction = 'max_season';
  else if (/increas|grow|expand|gain|recover|more ice/.test(t)) direction = 'up';
  else if (/decreas|declin|shrink|los(s|ing)|melt|less ice|disappear/.test(t)) direction = 'down';
  const units = [...new Set((t.match(/million (sq(uare)?\.? )?(km|kilomet(er|re)s?)²?|km²|km2|%|percent|tenths|\bm\b|metres|meters/g) || []))];
  return { region, metric, month: month >= 0 ? month + 1 : null, years, direction, units };
}

async function nsidcVersion(q: Queryable, region: 'arctic' | 'antarctic') {
  const [row] = await q.query<{ source_version_id: string }>(
    `select ds.source_version_id from public_dataset_series ds where ds.series_key = $1 and ds.version_status = 'active' limit 1`,
    [`${region === 'arctic' ? 'N' : 'S'}-monthly-extent`],
  );
  return row?.source_version_id ?? null;
}

export async function checkStatement(q: Queryable, statement: string): Promise<CheckResult> {
  const s = statement.trim().slice(0, 500);
  const parsed = parseStatement(s);
  const findings: Finding[] = [];
  const passages = (await searchSpans(q, s, { publicOnly: true, limit: 8 })).filter((h) => h.coverage >= 0.5).slice(0, 5);
  let rewrite: string | null = null;

  // Rule: metric/unit confusion.
  if (parsed.metric === 'concentration' && parsed.units.some((u) => /km/.test(u))) {
    findings.push({ aspect: 'metric vs unit', assessment: 'contradicted', explanation: 'Ice concentration is a fraction of surface covered (percent or tenths). It is not an area in km². Areas in km² describe extent or area.', evidence: [] });
  }
  if (parsed.metric === 'extent' && parsed.units.some((u) => /%|percent|tenths/.test(u))) {
    findings.push({ aspect: 'metric vs unit', assessment: 'contradicted', explanation: 'Sea-ice extent is an area (million km²), not a percentage. Percentages describe concentration or relative change.', evidence: [] });
  }
  // Rule: sea ice vs sea level.
  if (/sea[- ]ice/.test(s.toLowerCase()) && /sea[- ]level/.test(s.toLowerCase()) && /(rais|increas|caus|lead)/.test(s.toLowerCase())) {
    const hits = (await searchSpans(q, 'sea ice floating sea level rise', { publicOnly: true, limit: 12 })).filter((h) => /sea[- ]level/i.test(h.text) && /(floating|float|already in the ocean|does not|doesn't|little|land ice|ice sheet)/i.test(h.text));
    findings.push(
      hits.length
        ? { aspect: 'sea ice vs sea level', assessment: 'contradicted', explanation: 'Melting sea ice is already floating. The retrieved passages link sea-level rise to land ice (ice sheets and glaciers), not to sea ice.', evidence: hits.slice(0, 2).map((h) => ({ kind: 'span' as const, label: h.recordTitle, detail: h.text, spanId: h.spanId, recordId: h.recordId })) }
        : { aspect: 'sea ice vs sea level', assessment: 'insufficient', explanation: 'The catalog has no passage that explicitly relates sea-ice melt to sea level.', evidence: [] },
    );
  }

  // Data rules need a hemisphere and a sea-ice metric that NSIDC reports.
  const dataMetric = parsed.metric === 'extent' || parsed.metric === 'sea_ice_unspecified';
  if (parsed.region && dataMetric) {
    const sv = await nsidcVersion(q, parsed.region);
    const regionName = parsed.region === 'arctic' ? 'Arctic' : 'Antarctic';
    if (sv) {
      const seriesKey = `${parsed.region === 'arctic' ? 'N' : 'S'}-monthly-extent`;
      // Seasonal cycle: which month is the climatological minimum / maximum?
      if (parsed.direction === 'min_season' || parsed.direction === 'max_season' || (parsed.month && (parsed.direction === 'record_low' || parsed.direction === 'record_high'))) {
        const means: { m: number; mean: number; n: number }[] = [];
        for (let m = 1; m <= 12; m++) {
          const r = await computeRecipe(q, { seriesKey, sourceVersionId: sv, month: m, periodStart: '1979-01-01', periodEnd: '2100-12-31', stats: ['mean'], excludeFlags: [] }, { publicOnly: true });
          if (r.result.stats.mean != null) means.push({ m, mean: r.result.stats.mean, n: r.result.n });
        }
        const minM = means.reduce((a, b) => (b.mean < a.mean ? b : a));
        const maxM = means.reduce((a, b) => (b.mean > a.mean ? b : a));
        if (parsed.month && (parsed.direction === 'min_season' || parsed.direction === 'max_season')) {
          const target = parsed.direction === 'min_season' ? minM : maxM;
          const ok = target.m === parsed.month;
          findings.push({
            aspect: 'season',
            assessment: ok ? 'supported' : 'contradicted',
            explanation: `${regionName} monthly-mean extent is smallest in ${monthName(minM.m)} (${fmt(minM.mean, 'million km²')}) and largest in ${monthName(maxM.m)} (${fmt(maxM.mean, 'million km²')}), averaged over all years in the record. The statement puts the ${parsed.direction === 'min_season' ? 'minimum' : 'maximum'} in ${monthName(parsed.month)}.`,
            evidence: [{ kind: 'calculation', label: `${regionName} monthly climatology (NSIDC G02135 v4)`, detail: means.map((x) => `${monthName(x.m).slice(0, 3)} ${fmt(x.mean, 'million km²', false)}`).join(', ') }],
          });
          if (!ok) rewrite = `${regionName} sea-ice extent usually reaches its ${parsed.direction === 'min_season' ? 'minimum in ' + monthName(minM.m) : 'maximum in ' + monthName(maxM.m)} (NSIDC Sea Ice Index v4 monthly means).`;
        }
        if (parsed.month && (parsed.direction === 'record_low' || parsed.direction === 'record_high') && parsed.years.length === 1) {
          const r = await computeRecipe(q, { seriesKey, sourceVersionId: sv, month: parsed.month, periodStart: '1978-01-01', periodEnd: '2100-12-31', stats: ['rank'], excludeFlags: [] }, { publicOnly: true });
          const list = parsed.direction === 'record_low' ? r.result.stats.lowest! : r.result.stats.highest!;
          const top = list[0];
          const claimed = `${parsed.years[0]}-${String(parsed.month).padStart(2, '0')}`;
          const ok = top?.rowKey === claimed;
          const pos = list.findIndex((x) => x.rowKey === claimed);
          findings.push({
            aspect: 'record claim',
            assessment: ok ? 'supported' : 'contradicted',
            explanation: ok
              ? `${monthName(parsed.month)} ${parsed.years[0]} is the ${parsed.direction === 'record_low' ? 'lowest' : 'highest'} ${regionName} ${monthName(parsed.month)} extent in this record (${fmt(top.value, 'million km²')}).`
              : `The ${parsed.direction === 'record_low' ? 'lowest' : 'highest'} ${regionName} ${monthName(parsed.month)} extent in this record is ${top?.rowKey.slice(0, 4)} (${fmt(top?.value, 'million km²')}). ${pos >= 0 ? `${parsed.years[0]} ranks ${pos + 1}.` : `${parsed.years[0]} is not among the five most extreme years.`}`,
            evidence: [{ kind: 'calculation', label: `${regionName} ${monthName(parsed.month)} extent ranking`, detail: list.map((x) => `${x.rowKey.slice(0, 4)}: ${fmt(x.value, 'million km²', false)}`).join('; '), rowKeys: list.map((x) => x.rowKey) }],
          });
          if (!ok && top) rewrite = `The ${parsed.direction === 'record_low' ? 'lowest' : 'highest'} ${regionName} ${monthName(parsed.month)} sea-ice extent in the NSIDC v4 record was in ${top.rowKey.slice(0, 4)} (${fmt(top.value, 'million km²')}).`;
        }
      }
      // Long-term direction.
      if (parsed.direction === 'up' || parsed.direction === 'down') {
        const m = parsed.month ?? (parsed.region === 'arctic' ? 9 : 2);
        const full = await computeRecipe(q, { seriesKey, sourceVersionId: sv, month: m, periodStart: '1979-01-01', periodEnd: '2100-12-31', stats: ['trend', 'mean'], excludeFlags: [] }, { publicOnly: true });
        const recentStart = `${new Date().getUTCFullYear() - 10}-01-01`;
        const recent = await computeRecipe(q, { seriesKey, sourceVersionId: sv, month: m, periodStart: recentStart, periodEnd: '2100-12-31', stats: ['mean'], excludeFlags: [] }, { publicOnly: true });
        const early = await computeRecipe(q, { seriesKey, sourceVersionId: sv, month: m, periodStart: '1979-01-01', periodEnd: '1988-12-31', stats: ['mean'], excludeFlags: [] }, { publicOnly: true });
        const tr = full.result.stats.trend;
        const sign = tr ? Math.sign(tr.perDecade) : 0;
        const claimed = parsed.direction === 'up' ? 1 : -1;
        const recentVsEarly = (recent.result.stats.mean ?? 0) - (early.result.stats.mean ?? 0);
        // Earlier sub-period fit (all but the last decade): if it points the other way, the record changed direction.
        const earlierEnd = `${new Date().getUTCFullYear() - 11}-12-31`;
        const earlier = await computeRecipe(q, { seriesKey, sourceVersionId: sv, month: m, periodStart: '1979-01-01', periodEnd: earlierEnd, stats: ['trend'], excludeFlags: [] }, { publicOnly: true });
        const etr = earlier.result.stats.trend;
        const reversed = !!(etr && tr && Math.sign(etr.perDecade) !== Math.sign(tr.perDecade));
        // Long-term fit and recent behaviour can disagree (notably in the Antarctic); that is labelled "mixed" rather than forced.
        const consistent = Math.sign(recentVsEarly) === sign && !reversed;
        let assessment: Assessment;
        if (!tr) assessment = 'insufficient';
        else if (!consistent || Math.abs(tr.perDecade) < 0.05) assessment = 'mixed';
        else assessment = sign === claimed ? 'supported' : 'contradicted';
        findings.push({
          aspect: 'long-term direction',
          assessment,
          explanation: tr
            ? `For ${monthName(m)} (${parsed.month ? 'as stated' : 'the usual seasonal ' + (parsed.region === 'arctic' ? 'minimum' : 'minimum') + ' month, since no month was given'}), a least-squares line over ${tr.n} years changes by ${tr.perDecade >= 0 ? '+' : '−'}${fmt(Math.abs(tr.perDecade), 'million km²')} per decade. The mean of the last decade is ${fmt(recent.result.stats.mean, 'million km²')}, against ${fmt(early.result.stats.mean, 'million km²')} for 1979–1988.` +
              (etr ? ` Up to ${earlierEnd.slice(0, 4)} alone, the fitted change was ${etr.perDecade >= 0 ? '+' : '−'}${fmt(Math.abs(etr.perDecade), 'million km²')} per decade.` : '') +
              (assessment === 'mixed' ? ' The earlier period, the full record and the recent decade do not all point the same way (or the change is very small), so neither "increasing" nor "decreasing" describes the whole record.' : '')
            : 'Not enough data to compute a trend.',
          evidence: [{ kind: 'calculation', label: `${regionName} ${monthName(m)} extent, NSIDC G02135 v4`, detail: `trend over ${full.result.n} values; recent mean n=${recent.result.n}; 1979–1988 mean n=${early.result.n}` }],
        });
        if (assessment === 'contradicted' || assessment === 'mixed') {
          rewrite = `${regionName} ${monthName(m)} sea-ice extent in the satellite record (NSIDC v4) has a fitted change of ${tr!.perDecade >= 0 ? '+' : '−'}${fmt(Math.abs(tr!.perDecade), 'million km²')} per decade since 1979. The last decade averaged ${fmt(recent.result.stats.mean, 'million km²')}.`;
        }
        if (parsed.years.length === 1 && !parsed.month && !/\bsince\b|\bfrom\b/i.test(s)) {
          findings.push({ aspect: 'weather vs climate', assessment: 'mixed', explanation: 'A single year shows natural variability; one year alone does not establish or overturn a long-term trend.', evidence: [] });
        }
      }
    }
  } else if (parsed.metric === 'thickness' || parsed.metric === 'volume') {
    findings.push({ aspect: 'metric coverage', assessment: 'insufficient', explanation: `This catalog has no pan-${parsed.region ?? 'polar'} sea-ice ${parsed.metric} dataset. Extent data cannot confirm or refute a ${parsed.metric} claim.`, evidence: [] });
  } else if (parsed.metric === 'land_ice') {
    findings.push({ aspect: 'metric coverage', assessment: 'insufficient', explanation: 'Land ice (ice sheets and glaciers) is a different quantity from sea ice. The catalog\'s numerical datasets cover sea ice only.', evidence: [] });
  }

  const order: Assessment[] = ['contradicted', 'mixed', 'supported', 'insufficient'];
  let overall: Assessment = 'insufficient';
  const decisive = findings.filter((f) => f.assessment !== 'insufficient');
  if (decisive.length) {
    const kinds = new Set(decisive.map((f) => f.assessment));
    overall = kinds.has('contradicted') && kinds.has('supported') ? 'mixed' : order.find((o) => kinds.has(o))!;
  }
  if (overall === 'insufficient' && !findings.length) {
    findings.push({ aspect: 'coverage', assessment: 'insufficient', explanation: 'The rule set could not test this statement against the stored data. Read the retrieved passages below and judge for yourself; no verdict is given.', evidence: [] });
  }
  return {
    statement: s,
    parsed,
    overall,
    findings,
    rewrite,
    passages,
    coverageNote: 'Rules cover: hemisphere and season of the sea-ice minimum and maximum, record-year claims for a given month, long-term direction of monthly extent, extent vs concentration units, and sea ice vs sea level. Everything else returns "insufficient".',
  };
}
