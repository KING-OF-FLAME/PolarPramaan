// Evidence retrieval benchmark (Phase 04 gate). Runs through the public role.
// Metrics: hit@5 on answerable queries, citation validity (every claim quote
// matches its stored span and every span id was retrieved), and refusal of
// out-of-corpus queries. Writes docs/eval-results.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { askWithEvidence } from '../src/lib/evidence/ask';
import { searchSpans } from '../src/lib/evidence/search';
import { scriptDb } from './lib';

const bench = JSON.parse(readFileSync('tests/eval/benchmark.json', 'utf8')) as { answerable: { q: string; record: string; text: string }[]; unanswerable: string[] };
const db = await scriptDb();
const rows: unknown[] = [];
let hits = 0, citationsTotal = 0, citationsValid = 0, refusals = 0, answeredWithClaims = 0;
for (const a of bench.answerable) {
  const top = await db.asPublic((q) => searchSpans(q, a.q, { publicOnly: true, limit: 5 }));
  const re = new RegExp(a.text, 'i');
  const rank = top.findIndex((h) => h.recordTitle.includes(a.record) && re.test(h.text));
  if (rank >= 0) hits++;
  const ans = await db.asPublic((q) => askWithEvidence(q, a.q, { publicOnly: true, useLlm: false }));
  if (ans.status === 'answered' && ans.claims.length) answeredWithClaims++;
  for (const c of ans.claims) for (const e of c.evidence) {
    citationsTotal++;
    if (e.quoteValid && ans.retrieved.some((h) => h.spanId === e.spanId)) citationsValid++;
  }
  rows.push({ q: a.q, hitRank: rank >= 0 ? rank + 1 : null, status: ans.status, claims: ans.claims.length });
}
for (const q of bench.unanswerable) {
  const ans = await db.asPublic((t) => askWithEvidence(t, q, { publicOnly: true, useLlm: false }));
  if (ans.status === 'insufficient' && ans.claims.length === 0) refusals++;
  rows.push({ q, unanswerable: true, status: ans.status, claims: ans.claims.length, topRetrieved: ans.retrieved[0]?.recordTitle ?? null });
}
const result = {
  ranAt: new Date().toISOString(),
  corpus: (await db.asPublic((q) => q.query<{ n: number }>(`select count(*)::int n from public_evidence_spans`)))[0].n + ' public evidence spans',
  mode: 'lexical retrieval (PostgreSQL FTS), extractive answers, no LLM',
  hitAt5: `${hits}/${bench.answerable.length} (${((hits / bench.answerable.length) * 100).toFixed(0)}%)`,
  answeredWithClaims: `${answeredWithClaims}/${bench.answerable.length}`,
  citationValidity: `${citationsValid}/${citationsTotal}`,
  outOfCorpusRefused: `${refusals}/${bench.unanswerable.length}`,
  humanCheckedSupport: 'not measured automatically; see docs/EVALUATION.md for the manual check procedure',
  rows,
};
writeFileSync('docs/eval-results.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, rows: undefined }, null, 2));
for (const r of rows as { q: string; hitRank?: number | null; unanswerable?: boolean; status: string }[]) if ((!r.unanswerable && r.hitRank == null) || (r.unanswerable && r.status !== 'insufficient')) console.log('MISS:', JSON.stringify(r));
await db.close();
