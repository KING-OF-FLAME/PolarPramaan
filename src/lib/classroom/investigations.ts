// Classroom investigations (F8): team-written questions whose answers are
// computed from real observations. Predict-then-reveal uses withheld historical
// observations (retrospective learning), never a forecast. No curriculum
// alignment is claimed.
import type { Queryable } from '../db/core';
import { saveCalculation, type CalcRun } from '../calc/compute';
import { fmt, monthName } from '../calc/format';

export interface Investigation {
  slug: string;
  title: string;
  summary: string;
  level: string;
  question: string;
  options: { id: string; label: string }[];
  steps: string[];
}

export const INVESTIGATIONS: Investigation[] = [
  {
    slug: 'arctic-september-minimum',
    title: 'Arctic summer sea ice: predict, then reveal',
    summary: 'Look at September Arctic sea-ice extent from 1979 to 2006, predict what the following years show, then reveal the real observations.',
    level: 'Middle/secondary school (suggested)',
    question: 'Compared with 1979–2006, was the average September Arctic sea-ice extent in the following years higher, about the same, or lower?',
    options: [{ id: 'higher', label: 'Higher' }, { id: 'same', label: 'About the same (within 0.25 million km²)' }, { id: 'lower', label: 'Lower' }],
    steps: ['Study the chart of 1979–2006.', 'Choose your prediction and write one sentence explaining why.', 'Reveal the withheld years and compare averages.', 'Discuss: why is September chosen for the Arctic?'],
  },
  {
    slug: 'antarctic-february-story',
    title: 'Antarctic sea ice: a more complicated story',
    summary: 'Antarctic summer (February) sea ice did not follow the Arctic pattern. Examine 1979–2015, predict, then reveal 2016 onwards.',
    level: 'Secondary school (suggested)',
    question: 'After 2015, did the February Antarctic sea-ice extent mostly stay within the range seen from 1979 to 2015, or fall below it?',
    options: [{ id: 'within', label: 'Mostly within the earlier range' }, { id: 'below', label: 'Several years below the earlier range' }, { id: 'above', label: 'Several years above the earlier range' }],
    steps: ['Find the lowest February value between 1979 and 2015.', 'Predict the post-2015 years.', 'Reveal and count how many later years fall below the earlier minimum.', 'Discuss why one hemisphere can behave differently from the other.'],
  },
  {
    slug: 'ship-observations-ice-edge',
    title: 'Reading ship observations at the ice edge',
    summary: 'Use real ASPeCt observations from the SA Agulhas II (December 2016) to compare ice concentration north and south of 65°S.',
    level: 'Senior secondary / undergraduate (suggested)',
    question: 'Was the recorded total ice concentration higher south of 65°S than north of it?',
    options: [{ id: 'south', label: 'Higher south of 65°S' }, { id: 'north', label: 'Higher north of 65°S' }, { id: 'same', label: 'No clear difference' }],
    steps: ['Read the column labels and units carefully (note the unit caveat).', 'Predict where the ship met more ice.', 'Reveal the averages for each latitude band.', 'Discuss what a ship track can and cannot tell us about the whole ice pack.'],
  },
];

async function sv(q: Queryable, seriesKey: string): Promise<string | null> {
  const [r] = await q.query<{ source_version_id: string }>(`select source_version_id from public_dataset_series where series_key = $1 and version_status = 'active' limit 1`, [seriesKey]);
  return r?.source_version_id ?? null;
}

export interface InvestigationData {
  investigation: Investigation;
  known: CalcRun;
  withheld: CalcRun;
  answer: { correct: string; explanation: string; calcIds: string[] };
  extra?: CalcRun[];
}

/**
 * Compute (and persist, so answer keys can cite stable calculation ids) the two
 * halves of an investigation. `pub` reads through the public role; `priv` saves runs.
 */
export async function investigationData(pub: Queryable, priv: Queryable, slug: string): Promise<InvestigationData | null> {
  const inv = INVESTIGATIONS.find((i) => i.slug === slug);
  if (!inv) return null;
  if (slug === 'arctic-september-minimum') {
    const id = await sv(pub, 'N-monthly-extent');
    if (!id) return null;
    const known = await saveCalculation(priv, { seriesKey: 'N-monthly-extent', sourceVersionId: id, month: 9, periodStart: '1979-01-01', periodEnd: '2006-12-31', stats: ['mean', 'min', 'max', 'trend'] }, null);
    const withheld = await saveCalculation(priv, { seriesKey: 'N-monthly-extent', sourceVersionId: id, month: 9, periodStart: '2007-01-01', periodEnd: '2100-12-31', stats: ['mean', 'min', 'max', 'first_last'] }, null);
    const d = (withheld.result.stats.mean ?? 0) - (known.result.stats.mean ?? 0);
    const correct = Math.abs(d) <= 0.25 ? 'same' : d > 0 ? 'higher' : 'lower';
    const last = withheld.result.stats.last?.rowKey.slice(0, 4);
    return {
      investigation: inv, known, withheld,
      answer: {
        correct,
        explanation: `The 1979–2006 September average was ${fmt(known.result.stats.mean, 'million km²')} (${known.result.n} years). The 2007–${last} average was ${fmt(withheld.result.stats.mean, 'million km²')} (${withheld.result.n} years), a difference of ${d >= 0 ? '+' : '−'}${fmt(Math.abs(d), 'million km²')}. The lowest September in the whole record is ${withheld.result.stats.min?.rowKey.slice(0, 4)} (${fmt(withheld.result.stats.min?.value, 'million km²')}).`,
        calcIds: [known.id, withheld.id],
      },
    };
  }
  if (slug === 'antarctic-february-story') {
    const id = await sv(pub, 'S-monthly-extent');
    if (!id) return null;
    const known = await saveCalculation(priv, { seriesKey: 'S-monthly-extent', sourceVersionId: id, month: 2, periodStart: '1979-01-01', periodEnd: '2015-12-31', stats: ['mean', 'min', 'max', 'trend'] }, null);
    const withheld = await saveCalculation(priv, { seriesKey: 'S-monthly-extent', sourceVersionId: id, month: 2, periodStart: '2016-01-01', periodEnd: '2100-12-31', stats: ['mean', 'min', 'max', 'rank'] }, null);
    const earlierMin = known.result.stats.min!.value;
    const earlierMax = known.result.stats.max!.value;
    const rows = withheld.result.rows.filter((r) => r.included && r.value != null);
    const below = rows.filter((r) => r.value! < earlierMin);
    const above = rows.filter((r) => r.value! > earlierMax);
    const correct = below.length >= 2 ? 'below' : above.length >= 2 ? 'above' : 'within';
    return {
      investigation: inv, known, withheld,
      answer: {
        correct,
        explanation: `From 1979 to 2015 the lowest February extent was ${fmt(earlierMin, 'million km²')} (${known.result.stats.min!.rowKey.slice(0, 4)}), and the fitted change was ${known.result.stats.trend ? `${known.result.stats.trend.perDecade >= 0 ? '+' : '−'}${fmt(Math.abs(known.result.stats.trend.perDecade), 'million km²')} per decade` : 'not computable'}. Since 2016, ${below.length} of ${rows.length} February values fell below that earlier minimum (${below.map((r) => r.rowKey.slice(0, 4)).join(', ') || 'none'}).`,
        calcIds: [known.id, withheld.id],
      },
    };
  }
  if (slug === 'ship-observations-ice-edge') {
    const id = await sv(pub, 'PANGAEA.885208-ice_concentration_total');
    if (!id) return null;
    const base = { seriesKey: 'PANGAEA.885208-ice_concentration_total', sourceVersionId: id, periodStart: '2016-12-07', periodEnd: '2016-12-10', stats: ['mean', 'min', 'max'] };
    const known = await saveCalculation(priv, { ...base, latRange: { min: -65, max: -50 } }, null);
    const withheld = await saveCalculation(priv, { ...base, latRange: { min: -75, max: -65.0001 } }, null);
    const north = known.result.stats.mean ?? 0, south = withheld.result.stats.mean ?? 0;
    const correct = Math.abs(south - north) < 5 ? 'same' : south > north ? 'south' : 'north';
    return {
      investigation: inv, known, withheld,
      answer: {
        correct,
        explanation: `North of 65°S the mean recorded total ice concentration was ${fmt(north, 'tenths', false)} (${known.result.n} observations); south of 65°S it was ${fmt(south, 'tenths', false)} (${withheld.result.n} observations). Values are as recorded under the provider's declared unit "tenths", although they run to 100. Treat them as relative values, and note the unit inconsistency in any report.`,
        calcIds: [known.id, withheld.id],
      },
    };
  }
  return null;
}

export const monthLabel = monthName;
