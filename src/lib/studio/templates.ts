// Deterministic bilingual text templates. Numbers come only from calculation
// results; quoted evidence stays verbatim in its original language. The Hindi
// wording is team-drafted and marked "machine_unreviewed" until a competent
// language reviewer approves it.
import type { CalcRun } from '../calc/compute';
import { fmt, fmtSigned, monthName, rowKeyLabel, decimalsFor } from '../calc/format';

export type Lang = 'en' | 'hi';
export type Audience = 'school' | 'press' | 'research';
export type ArtifactKind = 'article' | 'carousel' | 'caption' | 'storyboard';

export interface ClaimDraft {
  key: string;
  text: Record<Lang, string>;
  region: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  metric: string | null;
  unit: string | null;
  numbers: string[]; // canonical formatted numbers the text must contain
  calcRunIds: string[];
  evidence: { spanId: string; quote: string }[];
  caveats: Record<Lang, string[]>;
}

export interface Block {
  type: 'heading' | 'paragraph' | 'quote' | 'figure' | 'media' | 'caveats' | 'sources' | 'slide' | 'scene' | 'caption';
  text: string;
  claimKeys: string[];
  calcRunId?: string;
  mediaRecordId?: string;
  visual?: string; // storyboard scene visual description
  durationSec?: number;
  title?: string;
}

const REGION: Record<Lang, Record<string, string>> = {
  en: { arctic: 'Arctic', antarctic: 'Antarctic', southern_ocean: 'Southern Ocean' },
  hi: { arctic: 'आर्कटिक', antarctic: 'अंटार्कटिक', southern_ocean: 'दक्षिणी महासागर' },
};
const METRIC: Record<Lang, Record<string, string>> = {
  en: {
    sea_ice_extent: 'sea-ice extent', sea_ice_area: 'sea-ice area', ice_concentration_total: 'total ice concentration',
    sea_ice_thickness_primary: 'sea-ice thickness', snow_thickness_primary: 'snow thickness', air_temperature: 'air temperature',
    water_temperature: 'water temperature', wind_speed: 'wind speed',
  },
  hi: {
    sea_ice_extent: 'समुद्री बर्फ का विस्तार', sea_ice_area: 'समुद्री बर्फ का क्षेत्रफल', ice_concentration_total: 'कुल बर्फ सांद्रता',
    sea_ice_thickness_primary: 'समुद्री बर्फ की मोटाई', snow_thickness_primary: 'बर्फ़ (हिम) परत की मोटाई', air_temperature: 'वायु तापमान',
    water_temperature: 'जल तापमान', wind_speed: 'पवन गति',
  },
};
export const UNIT: Record<Lang, Record<string, string>> = {
  en: { 'million km²': 'million km²', tenths: 'tenths', m: 'm', '°C': '°C', 'm/s': 'm/s' },
  hi: { 'million km²': 'मिलियन वर्ग किलोमीटर', tenths: 'दशांश (tenths)', m: 'मीटर', '°C': '°C', 'm/s': 'मीटर/सेकंड' },
};

const u = (units: string, lang: Lang) => UNIT[lang][units] ?? units;
const num = (v: number | null | undefined, units: string) => fmt(v, units, false);
const yearOf = (rowKey: string) => rowKey.slice(0, 4);

/** Build claims from one calculation run (every number traceable to the run id). */
export function claimsFromCalc(run: CalcRun, prefix: string): ClaimDraft[] {
  const r = run.result;
  const s = r.stats;
  const units = r.series.units;
  const region = r.series.region;
  const metric = r.series.variable;
  const reg = (l: Lang) => REGION[l][region] ?? region;
  const met = (l: Lang) => METRIC[l][metric] ?? metric;
  const month = run.recipe.month;
  const period = `${run.recipe.periodStart.slice(0, 4)}–${run.recipe.periodEnd.slice(0, 4)}`;
  const whenEn = month ? `in ${monthName(month)}` : 'across the observations';
  const whenHi = month ? `${monthName(month, 'hi')} में` : 'सभी प्रेक्षणों में';
  const base = { region, periodStart: run.recipe.periodStart, periodEnd: run.recipe.periodEnd, metric, unit: units, calcRunIds: [run.id], evidence: [] };
  const commonCaveats: Record<Lang, string[]> = { en: [], hi: [] };
  if (r.qualityNotes.some((n) => n.includes('NSIDC-0803'))) {
    commonCaveats.en.push('Recent months come from a near-real-time product and may be revised.');
    commonCaveats.hi.push('हाल के महीनों के आँकड़े निकट-वास्तविक-समय उत्पाद से हैं और संशोधित हो सकते हैं।');
  }
  if (r.qualityNotes.some((n) => n.includes('declared unit range'))) {
    commonCaveats.en.push(`Some values exceed the provider's declared unit range (${units}); they are reported as recorded.`);
    commonCaveats.hi.push(`कुछ मान प्रदाता द्वारा घोषित इकाई सीमा (${units}) से अधिक हैं; उन्हें दर्ज रूप में ही दिखाया गया है।`);
  }
  const out: ClaimDraft[] = [];
  if (s.mean != null && s.mean !== undefined) {
    const m = num(s.mean, units);
    out.push({
      ...base, key: `${prefix}-mean`, numbers: [m, String(r.n)],
      text: {
        en: `${reg('en')} ${met('en')} ${whenEn} averaged ${m} ${u(units, 'en')} over ${period} (${r.n} values).`,
        hi: `${period} के दौरान ${whenHi} ${reg('hi')} ${met('hi')} का औसत ${m} ${u(units, 'hi')} रहा (${r.n} मान)।`,
      },
      caveats: commonCaveats,
    });
  }
  if (s.min) {
    const v = num(s.min.value, units);
    const when = r.series.frequency === 'monthly' ? yearOf(s.min.rowKey) : s.min.rowKey;
    out.push({
      ...base, key: `${prefix}-min`, numbers: [v, when],
      text: {
        en: `The lowest value in this period was ${v} ${u(units, 'en')} (${r.series.frequency === 'monthly' ? rowKeyLabel(s.min.rowKey) : when}).`,
        hi: `इस अवधि का न्यूनतम मान ${v} ${u(units, 'hi')} था (${r.series.frequency === 'monthly' ? rowKeyLabel(s.min.rowKey, 'hi') : when})।`,
      },
      caveats: { en: [], hi: [] },
    });
  }
  if (s.max) {
    const v = num(s.max.value, units);
    const when = r.series.frequency === 'monthly' ? yearOf(s.max.rowKey) : s.max.rowKey;
    out.push({
      ...base, key: `${prefix}-max`, numbers: [v, when],
      text: {
        en: `The highest value was ${v} ${u(units, 'en')} (${r.series.frequency === 'monthly' ? rowKeyLabel(s.max.rowKey) : when}).`,
        hi: `अधिकतम मान ${v} ${u(units, 'hi')} था (${r.series.frequency === 'monthly' ? rowKeyLabel(s.max.rowKey, 'hi') : when})।`,
      },
      caveats: { en: [], hi: [] },
    });
  }
  if (s.trend) {
    const t = fmtSigned(s.trend.perDecade, units).replace(` ${units}`, '');
    out.push({
      ...base, key: `${prefix}-trend`, numbers: [t.replace(/^[+−]/, '')],
      text: {
        en: `A straight-line (least-squares) fit through these ${s.trend.n} values changes by ${t} ${u(units, 'en')} per decade.`,
        hi: `इन ${s.trend.n} मानों पर न्यूनतम-वर्ग सीधी रेखा प्रति दशक ${t} ${u(units, 'hi')} का परिवर्तन दिखाती है।`,
      },
      caveats: {
        en: ['A fitted line describes the past values only. It does not explain causes or predict the future.'],
        hi: ['यह रेखा केवल पिछले मानों का वर्णन करती है; यह कारण नहीं बताती और भविष्य का अनुमान नहीं है।'],
      },
    });
    out[out.length - 1].numbers.push(String(s.trend.n));
  }
  if (s.first && s.last) {
    const a = num(s.first.value, units), b = num(s.last.value, units);
    out.push({
      ...base, key: `${prefix}-firstlast`, numbers: [a, b, yearOf(s.first.rowKey), yearOf(s.last.rowKey)],
      text: {
        en: `The first value in the period (${yearOf(s.first.rowKey)}) was ${a} ${u(units, 'en')}; the latest (${yearOf(s.last.rowKey)}) was ${b} ${u(units, 'en')}.`,
        hi: `अवधि का पहला मान (${yearOf(s.first.rowKey)}) ${a} ${u(units, 'hi')} और नवीनतम (${yearOf(s.last.rowKey)}) ${b} ${u(units, 'hi')} था।`,
      },
      caveats: { en: ['Comparing two single years can exaggerate or hide change, because individual years vary.'], hi: ['केवल दो वर्षों की तुलना परिवर्तन को बढ़ा-चढ़ाकर या छिपाकर दिखा सकती है क्योंकि हर वर्ष अलग होता है।'] },
    });
  }
  if (s.baseline && s.baseline.mean != null && s.lastAnomaly != null) {
    const bm = num(s.baseline.mean, units), an = fmtSigned(s.lastAnomaly, units).replace(` ${units}`, '');
    const bp = `${s.baseline.start.slice(0, 4)}–${s.baseline.end.slice(0, 4)}`;
    out.push({
      ...base, key: `${prefix}-anomaly`, numbers: [bm, an.replace(/^[+−]/, '')],
      text: {
        en: `Compared with the ${bp} average (${bm} ${u(units, 'en')}), the latest value differs by ${an} ${u(units, 'en')}.`,
        hi: `${bp} के औसत (${bm} ${u(units, 'hi')}) की तुलना में नवीनतम मान में ${an} ${u(units, 'hi')} का अंतर है।`,
      },
      caveats: { en: [], hi: [] },
    });
  }
  // Required numbers are compared as the checker sees them (e.g. event labels split into digit groups).
  for (const c of out) c.numbers = [...new Set(c.numbers.flatMap((n) => extractNumbers(n)))];
  return out;
}

export function claimFromQuote(key: string, quote: string, sourceTitle: string, spanId: string): ClaimDraft {
  return {
    key, region: null, periodStart: null, periodEnd: null, metric: null, unit: null, numbers: extractNumbers(quote), calcRunIds: [],
    evidence: [{ spanId, quote }],
    text: { en: `“${quote}” — ${sourceTitle}`, hi: `स्रोत से उद्धरण (मूल अंग्रेज़ी में): “${quote}” — ${sourceTitle}` },
    caveats: { en: [], hi: ['उद्धरण का अनुवाद नहीं किया गया है ताकि मूल शब्द सुरक्षित रहें।'] },
  };
}

export function extractNumbers(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.'));
}

const EXPLAIN: Record<Lang, Record<string, string>> = {
  en: {
    sea_ice_extent: 'Sea-ice extent is the total area of ocean where at least 15% of the surface is covered by ice. It is not the same as sea-ice area or ice thickness.',
    sea_ice_area: 'Sea-ice area counts only the ice-covered part of each grid cell, so it is always smaller than or equal to extent.',
  },
  hi: {
    sea_ice_extent: 'समुद्री बर्फ का विस्तार महासागर का वह कुल क्षेत्र है जहाँ सतह का कम से कम 15% भाग बर्फ से ढका हो। यह समुद्री बर्फ के क्षेत्रफल या मोटाई के समान नहीं है।',
    sea_ice_area: 'समुद्री बर्फ का क्षेत्रफल हर ग्रिड सेल के केवल बर्फ वाले भाग को गिनता है, इसलिए यह विस्तार से कम या बराबर होता है।',
  },
};

export interface GenerateInput {
  kind: ArtifactKind;
  audience: Audience;
  runs: CalcRun[];
  quotes: { spanId: string; quote: string; sourceTitle: string }[];
  media: { recordId: string; title: string; credit: string | null; license: string | null }[];
}

export function buildClaims(input: GenerateInput): ClaimDraft[] {
  const claims = input.runs.flatMap((r, i) => claimsFromCalc(r, `calc${i + 1}`));
  input.quotes.forEach((q, i) => claims.push(claimFromQuote(`quote${i + 1}`, q.quote, q.sourceTitle, q.spanId)));
  return claims;
}

function pick(claims: ClaimDraft[], audience: Audience): ClaimDraft[] {
  if (audience === 'research') return claims;
  const wanted = audience === 'school' ? ['-mean', '-min', '-trend'] : ['-min', '-mean', '-trend', '-anomaly', '-firstlast'];
  const calc = claims.filter((c) => c.calcRunIds.length && wanted.some((w) => c.key.endsWith(w)));
  const quotes = claims.filter((c) => c.evidence.length).slice(0, audience === 'school' ? 1 : 2);
  return [...calc, ...quotes];
}

export function titleFor(input: GenerateInput, lang: Lang): string {
  const r = input.runs[0];
  if (!r) return lang === 'en' ? 'What the sources say' : 'स्रोत क्या कहते हैं';
  const reg = REGION[lang][r.result.series.region] ?? r.result.series.region;
  const met = METRIC[lang][r.result.series.variable] ?? r.result.series.variable;
  const month = r.recipe.month ? monthName(r.recipe.month, lang) : null;
  const period = `${r.recipe.periodStart.slice(0, 4)}–${r.recipe.periodEnd.slice(0, 4)}`;
  if (lang === 'en') {
    const lead = input.audience === 'school' ? 'Investigating' : input.audience === 'press' ? 'Data brief:' : 'Summary:';
    return `${lead} ${reg} ${met}${month ? ` in ${month}` : ''}, ${period}`;
  }
  const lead = input.audience === 'school' ? 'जाँच:' : input.audience === 'press' ? 'डेटा सार:' : 'सारांश:';
  return `${lead} ${month ? `${month} में ` : ''}${reg} ${met}, ${period}`;
}

/** Compose blocks for one language/audience/kind from a shared claim set. */
export function composeBlocks(input: GenerateInput, claims: ClaimDraft[], lang: Lang): Block[] {
  const chosen = pick(claims, input.audience);
  const run = input.runs[0];
  const blocks: Block[] = [];
  const caveatTexts = [...new Set(chosen.flatMap((c) => c.caveats[lang]))];
  const allKeys = chosen.map((c) => c.key);
  const explain = run ? EXPLAIN[lang][run.result.series.variable] : undefined;
  const srcLine = (lang === 'en' ? 'Sources: ' : 'स्रोत: ') + [...new Set([...input.runs.map((r) => r.result.source.title), ...input.quotes.map((q) => q.sourceTitle)])].join('; ');

  if (input.kind === 'article') {
    blocks.push({ type: 'heading', text: titleFor(input, lang), claimKeys: [] });
    for (const c of chosen.filter((c) => c.calcRunIds.length)) blocks.push({ type: 'paragraph', text: c.text[lang], claimKeys: [c.key] });
    if (run) blocks.push({ type: 'figure', text: lang === 'en' ? 'Chart and data table computed from the source rows' : 'स्रोत पंक्तियों से गणना किया गया चार्ट और डेटा तालिका', claimKeys: [], calcRunId: run.id });
    if (explain && input.audience !== 'research') blocks.push({ type: 'paragraph', text: explain, claimKeys: [] });
    for (const c of chosen.filter((c) => c.evidence.length)) blocks.push({ type: 'quote', text: c.text[lang], claimKeys: [c.key] });
    for (const m of input.media) blocks.push({ type: 'media', text: `${m.title} — ${m.credit ?? ''}${m.license ? ` (${m.license})` : ''}`, claimKeys: [], mediaRecordId: m.recordId });
    if (caveatTexts.length) blocks.push({ type: 'caveats', text: caveatTexts.join(' '), claimKeys: allKeys });
    blocks.push({ type: 'sources', text: srcLine, claimKeys: [] });
  } else if (input.kind === 'carousel') {
    blocks.push({ type: 'slide', title: titleFor(input, lang), text: explain ?? '', claimKeys: [] });
    if (run) blocks.push({ type: 'slide', title: lang === 'en' ? 'The data' : 'आँकड़े', text: chosen.find((c) => c.key.endsWith('-mean'))?.text[lang] ?? '', claimKeys: chosen.filter((c) => c.key.endsWith('-mean')).map((c) => c.key), calcRunId: run.id });
    for (const c of chosen.filter((c) => c.calcRunIds.length && !c.key.endsWith('-mean')).slice(0, 3)) blocks.push({ type: 'slide', title: lang === 'en' ? 'Key number' : 'मुख्य आँकड़ा', text: c.text[lang], claimKeys: [c.key] });
    for (const m of input.media.slice(0, 1)) blocks.push({ type: 'slide', title: m.title, text: `${lang === 'en' ? 'Photo' : 'चित्र'}: ${m.credit ?? ''}${m.license ? ` (${m.license})` : ''}`, claimKeys: [], mediaRecordId: m.recordId });
    blocks.push({ type: 'slide', title: lang === 'en' ? 'Check the evidence' : 'प्रमाण देखें', text: [caveatTexts.join(' '), srcLine].filter(Boolean).join(' '), claimKeys: allKeys });
  } else if (input.kind === 'caption') {
    const main = chosen.filter((c) => c.calcRunIds.length).slice(0, 2);
    blocks.push({ type: 'caption', text: main.map((c) => c.text[lang]).join(' '), claimKeys: main.map((c) => c.key) });
    if (caveatTexts.length) blocks.push({ type: 'caveats', text: caveatTexts[0], claimKeys: main.map((c) => c.key) });
    blocks.push({ type: 'sources', text: srcLine, claimKeys: [] });
  } else {
    // storyboard: a plan for a short video, not a rendered video
    let i = 1;
    blocks.push({ type: 'scene', title: `${lang === 'en' ? 'Scene' : 'दृश्य'} ${i++}`, visual: lang === 'en' ? 'Title card over a credited catalog image' : 'श्रेय सहित कैटलॉग चित्र पर शीर्षक', text: titleFor(input, lang), claimKeys: [], durationSec: 5, mediaRecordId: input.media[0]?.recordId });
    if (run) blocks.push({ type: 'scene', title: `${lang === 'en' ? 'Scene' : 'दृश्य'} ${i++}`, visual: lang === 'en' ? 'Animated line chart drawn from the calculation rows' : 'गणना पंक्तियों से बना एनिमेटेड रेखा चार्ट', text: chosen.find((c) => c.key.endsWith('-mean'))?.text[lang] ?? '', claimKeys: chosen.filter((c) => c.key.endsWith('-mean')).map((c) => c.key), durationSec: 10, calcRunId: run.id });
    for (const c of chosen.filter((c) => !c.key.endsWith('-mean')).slice(0, 3)) {
      blocks.push({ type: 'scene', title: `${lang === 'en' ? 'Scene' : 'दृश्य'} ${i++}`, visual: c.evidence.length ? (lang === 'en' ? 'On-screen quotation with source name' : 'स्रोत नाम सहित स्क्रीन पर उद्धरण') : (lang === 'en' ? 'Highlight the matching point on the chart' : 'चार्ट पर संबंधित बिंदु को उजागर करें'), text: c.text[lang], claimKeys: [c.key], durationSec: 8 });
    }
    blocks.push({ type: 'scene', title: `${lang === 'en' ? 'Scene' : 'दृश्य'} ${i++}`, visual: lang === 'en' ? 'Caveats and sources; QR code to the evidence receipt' : 'सावधानियाँ और स्रोत; प्रमाण रसीद का QR कोड', text: [caveatTexts.join(' '), srcLine].filter(Boolean).join(' '), claimKeys: allKeys, durationSec: 8 });
  }
  return blocks;
}

export { decimalsFor };
