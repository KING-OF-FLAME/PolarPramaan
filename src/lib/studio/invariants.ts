// Fact-preservation checks (F7). A version passes only if every number in its
// text is one its claims allow, every claim's required numbers are present, and
// region/unit terms survive translation or editing.
import type { Block, Lang } from './templates';
import { UNIT, extractNumbers } from './templates';

export interface ClaimFacts {
  key: string;
  text: string; // canonical text in the version's language
  region: string | null;
  unit: string | null;
  numbers: string[]; // required numbers
}

export interface BlockIssue {
  blockIndex: number;
  severity: 'error' | 'warning';
  message: string;
}

export interface InvariantReport {
  ok: boolean;
  checkedAt: string;
  issues: BlockIssue[];
  claims: { key: string; required: string[]; found: string[]; missing: string[]; regionOk: boolean; unitOk: boolean }[];
}

const REGION_TERMS: Record<Lang, Record<string, string[]>> = {
  en: { arctic: ['Arctic'], antarctic: ['Antarctic'], southern_ocean: ['Southern Ocean'] },
  hi: { arctic: ['आर्कटिक'], antarctic: ['अंटार्कटिक'], southern_ocean: ['दक्षिणी महासागर'] },
};
const WRONG_REGION: Record<string, string[]> = { arctic: ['Antarctic', 'अंटार्कटिक'], antarctic: [] };

const norm = (n: string) => {
  const v = Number(n.replace(',', '.'));
  return Number.isFinite(v) ? String(v) : n;
};

export function checkInvariants(blocks: Block[], claims: ClaimFacts[], lang: Lang, allowedByBlock: string[][] = []): InvariantReport {
  const byKey = new Map(claims.map((c) => [c.key, c]));
  const issues: BlockIssue[] = [];
  const claimReport: InvariantReport['claims'] = [];
  const seen = new Set<string>();
  blocks.forEach((b, i) => {
    const text = `${b.title ?? ''} ${b.text}`;
    const found = extractNumbers(text).map(norm);
    const keys = b.claimKeys.filter((k) => byKey.has(k));
    const allowed = new Set<string>([...(allowedByBlock[i] ?? []).map(norm)]);
    for (const k of keys) for (const n of extractNumbers(byKey.get(k)!.text)) allowed.add(norm(n));
    const unexpected = [...new Set(found.filter((n) => !allowed.has(n)))];
    if (unexpected.length) {
      issues.push({ blockIndex: i, severity: 'error', message: `Number(s) ${unexpected.join(', ')} are not supported by any cited claim or calculation in this block.` });
    }
    // Each claim's required numbers must appear once in the first block that cites it.
    for (const k of keys) {
      if (seen.has(k)) continue;
      const c = byKey.get(k)!;
      const req = c.numbers.map(norm);
      const missing = req.filter((n) => !found.includes(n));
      // Region and unit terms are required only where the canonical claim text uses them.
      const regionTerms = (c.region ? REGION_TERMS[lang][c.region] ?? [] : []).filter((t) => c.text.includes(t));
      const regionOk = regionTerms.length === 0 || regionTerms.some((t) => text.includes(t)) || b.type === 'caveats' || b.type === 'sources';
      const wrong = c.region ? (WRONG_REGION[c.region] ?? []).filter((t) => text.includes(t)) : [];
      const unitCandidate = c.unit ? UNIT[lang][c.unit] ?? c.unit : null;
      const unitTerm = unitCandidate && c.text.includes(unitCandidate) ? unitCandidate : null;
      const unitOk = !unitTerm || req.length === 0 || text.includes(unitTerm) || b.type === 'caveats' || b.type === 'sources';
      if (b.type !== 'caveats' && b.type !== 'sources') {
        seen.add(k);
        if (missing.length) issues.push({ blockIndex: i, severity: 'error', message: `Claim ${k}: required number(s) ${missing.join(', ')} missing or changed.` });
        if (!regionOk) issues.push({ blockIndex: i, severity: 'error', message: `Claim ${k}: region term (${regionTerms.join('/')}) is missing.` });
        if (wrong.length) issues.push({ blockIndex: i, severity: 'error', message: `Claim ${k}: text names the wrong hemisphere (${wrong.join(', ')}).` });
        if (!unitOk) issues.push({ blockIndex: i, severity: 'error', message: `Claim ${k}: unit "${unitTerm}" is missing or changed.` });
        claimReport.push({ key: k, required: req, found: found.filter((n) => req.includes(n)), missing, regionOk: regionOk && !wrong.length, unitOk });
      }
    }
  });
  return { ok: !issues.some((x) => x.severity === 'error'), checkedAt: new Date().toISOString(), issues, claims: claimReport };
}

export interface FactDiffRow {
  key: string;
  a: { numbers: string[]; region: boolean; unit: boolean } | null;
  b: { numbers: string[]; region: boolean; unit: boolean } | null;
  status: 'preserved' | 'changed' | 'missing_in_b' | 'added_in_b';
  note: string;
}

/** Compare two versions (e.g. English vs Hindi, or v1 vs v2) claim by claim. */
export function factDiff(
  a: { blocks: Block[]; lang: Lang; claims: ClaimFacts[] },
  b: { blocks: Block[]; lang: Lang; claims: ClaimFacts[] },
): FactDiffRow[] {
  const facts = (v: typeof a) => {
    const m = new Map<string, { numbers: string[]; region: boolean; unit: boolean }>();
    const ck = new Map(v.claims.map((c) => [c.key, c]));
    for (const blk of v.blocks) {
      if (blk.type === 'caveats' || blk.type === 'sources') continue;
      const text = `${blk.title ?? ''} ${blk.text}`;
      for (const k of blk.claimKeys) {
        if (m.has(k)) continue;
        const c = ck.get(k);
        const nums = extractNumbers(text).map(norm);
        const regionTerms = (c?.region ? REGION_TERMS[v.lang][c.region] ?? [] : []).filter((t) => c!.text.includes(t));
        const unitCand = c?.unit ? UNIT[v.lang][c.unit] ?? c.unit : null;
        const unitTerm = unitCand && c!.text.includes(unitCand) ? unitCand : null;
        m.set(k, { numbers: [...new Set(nums)].sort(), region: regionTerms.length === 0 || regionTerms.some((t) => text.includes(t)), unit: !unitTerm || text.includes(unitTerm) });
      }
    }
    return m;
  };
  const fa = facts(a), fb = facts(b);
  const keys = [...new Set([...fa.keys(), ...fb.keys()])].sort();
  return keys.map((k) => {
    const x = fa.get(k) ?? null, y = fb.get(k) ?? null;
    if (x && !y) return { key: k, a: x, b: null, status: 'missing_in_b', note: 'Claim present in A but not in B.' };
    if (!x && y) return { key: k, a: null, b: y, status: 'added_in_b', note: 'Claim present in B only.' };
    const same = x!.numbers.join('|') === y!.numbers.join('|') && x!.region === y!.region && x!.unit === y!.unit;
    const diffs: string[] = [];
    if (x!.numbers.join('|') !== y!.numbers.join('|')) diffs.push(`numbers ${x!.numbers.join(', ')} → ${y!.numbers.join(', ')}`);
    if (x!.region !== y!.region) diffs.push('region term');
    if (x!.unit !== y!.unit) diffs.push('unit term');
    return { key: k, a: x, b: y, status: same ? 'preserved' : 'changed', note: same ? 'Numbers, region and unit preserved.' : `Changed: ${diffs.join('; ')}.` };
  });
}
