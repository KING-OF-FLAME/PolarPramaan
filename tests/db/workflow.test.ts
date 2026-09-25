// End-to-end domain test on an in-memory Postgres (PGlite) loaded with a subset
// of the REAL snapshot (NSIDC, PANGAEA, Wikipedia, Commons, NCPOR metadata).
// Covers F1 retrieval gating, F2 reproducibility, F4 rights, F7 invariants,
// F10 review/publication/idempotency, F3 correction propagation and access control.
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '@/lib/db/core';
import { curatedCatalog } from '@/lib/ingest/curation';
import { applyItem, ensureSources } from '@/lib/ingest/apply';
import { createInvite, acceptInvite, login, actorForToken } from '@/lib/auth/store';
import type { Actor } from '@/lib/auth/roles';
import { saveCalculation, computeRecipe } from '@/lib/calc/compute';
import { createDraft, editVersion, getVersion, versionClaimFacts } from '@/lib/studio/service';
import { factDiff } from '@/lib/studio/invariants';
import { RightsViolation, suggestAlternatives } from '@/lib/rights/check';
import { submitForReview, reviewVersion, schedulePublication, processOutbox, PublishError, recordManualExternalPost } from '@/lib/publish/service';
import { withdrawSourceVersion, dependentsOf } from '@/lib/corrections/service';
import { askWithEvidence } from '@/lib/evidence/ask';
import { searchSpans } from '@/lib/evidence/search';
import { buildMuseumPack, packChangesSince, MUSEUM_SLUG } from '@/lib/offline/packs';
import { classifyDatasetChange } from '@/lib/corrections/diff';

let db: Db;
const actors: Record<string, Actor> = {};

async function makeUser(email: string, role: 'contributor' | 'reviewer' | 'admin', name: string) {
  const token = await createInvite(db, email, role, null);
  const res = await db.tx((q) => acceptInvite(q, token, name, 'correct horse battery staple'));
  if ('error' in res) throw new Error(res.error);
  const s = await login(db, email, 'correct horse battery staple', 'vitest');
  const a = await actorForToken(db, s!.token);
  actors[role === 'contributor' ? 'author' : email.split('@')[0]] = a!;
  return a!;
}

async function svFor(seriesKey: string) {
  const [r] = await db.query<{ source_version_id: string }>(`select source_version_id from dataset_series where series_key = $1`, [seriesKey]);
  return r.source_version_id;
}

beforeAll(async () => {
  db = await createDb('pglite-memory', undefined, { migrate: true });
  await ensureSources(db);
  const items = curatedCatalog().filter((i) => ['nsidc', 'pangaea', 'wikipedia', 'wikimedia-commons', 'ncpor'].includes(i.sourceId));
  for (const it of items) await db.tx((q) => applyItem(q, it, 'test'));
  await makeUser('admin@example.org', 'admin', 'Admin Curator');
  await makeUser('author@example.org', 'contributor', 'Author One');
  await makeUser('reviewer@example.org', 'reviewer', 'Reviewer One');
}, 600_000);

afterAll(async () => db?.close());

describe('import', () => {
  it('re-running the import creates no duplicates', async () => {
    const before = await db.query<{ n: number }>(`select count(*)::int n from records`);
    const items = curatedCatalog().filter((i) => i.sourceId === 'nsidc' || i.sourceId === 'pangaea');
    for (const it of items) {
      const r = await db.tx((q) => applyItem(q, it, 'test'));
      expect(r.created).toBe(false);
      expect(r.newVersion).toBe(false);
    }
    const after = await db.query<{ n: number }>(`select count(*)::int n from records`);
    expect(after[0].n).toBe(before[0].n);
  });

  it('NCPOR records are link-only with no stored text beyond metadata', async () => {
    const rows = await db.query<{ status: string; n: number }>(
      `select cr.status, (select count(*)::int from evidence_spans e join source_versions v on v.id = e.source_version_id where v.record_id = r.id and e.kind <> 'metadata') n
         from records r join current_rights cr on cr.record_id = r.id where r.source_id = 'ncpor'`,
    );
    expect(rows.length).toBeGreaterThan(5);
    for (const r of rows) {
      expect(r.status).toBe('link_only');
      expect(r.n).toBe(0);
    }
  });
});

describe('access control', () => {
  it('pp_public cannot read base tables but can read public views', async () => {
    await expect(db.asPublic((q) => q.query('select * from records limit 1'))).rejects.toThrow(/permission denied/);
    await expect(db.asPublic((q) => q.query('select * from users limit 1'))).rejects.toThrow(/permission denied/);
    const r = await db.asPublic((q) => q.query<{ n: number }>('select count(*)::int n from public_records'));
    expect(r[0].n).toBeGreaterThan(20);
  });

  it('public role is read-only', async () => {
    await expect(db.asPublic((q) => q.query(`insert into usage_events (kind, target_id) values ('record_view','x')`))).rejects.toThrow();
  });

  it('internal records and their spans disappear from public search', async () => {
    const [w] = await db.query<{ id: string }>(`select id from records where title like 'Maitri (research station)%'`);
    const before = await db.asPublic((q) => searchSpans(q, 'Maitri research station Schirmacher', { publicOnly: true, limit: 20 }));
    expect(before.some((h) => h.recordId === w.id)).toBe(true);
    await db.query(`update records set visibility = 'internal' where id = $1`, [w.id]);
    const after = await db.asPublic((q) => searchSpans(q, 'Maitri research station Schirmacher', { publicOnly: true, limit: 20 }));
    expect(after.some((h) => h.recordId === w.id)).toBe(false);
    const count = await db.asPublic((q) => q.query<{ n: number }>(`select count(*)::int n from public_evidence_spans where record_id = $1`, [w.id]));
    expect(count[0].n).toBe(0);
    await db.query(`update records set visibility = 'public' where id = $1`, [w.id]);
  });

  it('login rejects wrong passwords and unknown users', async () => {
    expect(await login(db, 'author@example.org', 'wrong password here', null)).toBeNull();
    expect(await login(db, 'nobody@example.org', 'correct horse battery staple', null)).toBeNull();
  });

  it('invites are single use', async () => {
    const t = await createInvite(db, 'once@example.org', 'contributor', null);
    const a = await db.tx((q) => acceptInvite(q, t, 'Once', 'correct horse battery staple'));
    expect('userId' in a).toBe(true);
    const b = await db.tx((q) => acceptInvite(q, t, 'Twice', 'correct horse battery staple'));
    expect('error' in b).toBe(true);
  });
});

describe('F2 calculations reproduce independently', () => {
  it('mean, extremes and trend match SQL computed directly from observations', async () => {
    const sv = await svFor('N-monthly-extent');
    const run = await saveCalculation(db, { seriesKey: 'N-monthly-extent', sourceVersionId: sv, month: 9, periodStart: '1979-01-01', periodEnd: '2024-12-31', stats: ['mean', 'min', 'max', 'trend'] }, null);
    const [sql] = await db.query<{ avg: number; min: number; max: number; slope: number; n: number }>(
      `with o as (
         select value, obs_time,
                extract(year from obs_time) + (extract(epoch from obs_time) - extract(epoch from date_trunc('year', obs_time)))
                  / (extract(epoch from date_trunc('year', obs_time) + interval '1 year') - extract(epoch from date_trunc('year', obs_time))) as x
           from observations o join dataset_series ds on ds.id = o.series_id
          where ds.series_key = 'N-monthly-extent' and extract(month from obs_time) = 9 and obs_time < '2025-01-01' and value is not null)
       select avg(value)::float8 avg, min(value)::float8 min, max(value)::float8 max, regr_slope(value, x)::float8 slope, count(*)::int n from o`,
    );
    expect(run.result.n).toBe(sql.n);
    expect(run.result.stats.mean).toBeCloseTo(sql.avg, 10);
    expect(run.result.stats.min!.value).toBeCloseTo(sql.min, 10);
    expect(run.result.stats.max!.value).toBeCloseTo(sql.max, 10);
    expect(run.result.stats.trend!.perDecade).toBeCloseTo(sql.slope * 10, 8);
    // Identical recipe reuses the same calculation id.
    const again = await saveCalculation(db, run.recipe, null);
    expect(again.id).toBe(run.id);
  });

  it('missing (-9999) months are excluded, not zero-filled', async () => {
    const sv = await svFor('N-monthly-extent');
    const r = await computeRecipe(db, { seriesKey: 'N-monthly-extent', sourceVersionId: sv, month: 12, periodStart: '1987-01-01', periodEnd: '1988-12-31', stats: ['mean'] }, { publicOnly: false });
    const dec87 = r.result.rows.find((x) => x.rowKey === '1987-12')!;
    expect(dec87.value).toBeNull();
    expect(dec87.included).toBe(false);
    expect(r.result.n).toBe(1);
  });

  it('trends are refused for short per-observation data', async () => {
    const sv = await svFor('PANGAEA.885208-ice_concentration_total');
    const r = await computeRecipe(db, { seriesKey: 'PANGAEA.885208-ice_concentration_total', sourceVersionId: sv, periodStart: '2016-12-01', periodEnd: '2016-12-31', stats: ['mean', 'trend'] }, { publicOnly: false });
    expect(r.result.stats.trend).toBeNull();
    expect(r.result.stats.trendUnavailableReason).toMatch(/misleading/);
    expect(r.result.qualityNotes.join(' ')).toMatch(/declared unit range/);
  });
});

describe('F1 evidence', () => {
  it('answers from real spans with valid quotes and refuses out-of-corpus questions', async () => {
    const ok = await db.asPublic((q) => askWithEvidence(q, 'Arctic sea ice extent September 2012', { publicOnly: true, useLlm: false }));
    expect(ok.status).toBe('answered');
    expect(ok.claims.every((c) => c.evidence.every((e) => e.quoteValid))).toBe(true);
    expect(ok.claims.some((c) => c.text.includes('3.57'))).toBe(true);
    const no = await db.asPublic((q) => askWithEvidence(q, 'What is the population of Mumbai?', { publicOnly: true, useLlm: false }));
    expect(no.status).toBe('insufficient');
    expect(no.claims).toHaveLength(0);
  });
});

describe('F4 → F7 → F10 → F3 hero loop', () => {
  let calcId: string;
  let spanId: string;
  let enVersion: string;
  let hiVersion: string;
  let pubId: string;

  it('rights: a people-identifiable photo is blocked server-side with permitted alternatives', async () => {
    const [minister] = await db.query<{ id: string }>(`select id from records where title like 'The Minister for Science%' limit 1`);
    const sv = await svFor('N-monthly-extent');
    const run = await saveCalculation(db, { seriesKey: 'N-monthly-extent', sourceVersionId: sv, month: 9, periodStart: '1979-01-01', periodEnd: '2024-12-31', stats: ['mean', 'min', 'trend'] }, actors.author.id);
    calcId = run.id;
    await expect(db.tx((q) => createDraft(q, actors.author, { kind: 'carousel', audience: 'press', calcRunIds: [calcId], spanIds: [], mediaRecordIds: [minister.id], languages: ['en'] }))).rejects.toBeInstanceOf(RightsViolation);
    const alts = await suggestAlternatives(db, minister.id);
    expect(alts.length).toBeGreaterThan(0);
    for (const a of alts) expect(a.placeName).toMatch(/^Maitri/);
  });

  it('rights: link-only NCPOR text cannot be quoted', async () => {
    const [span] = await db.query<{ id: string }>(`select e.id from evidence_spans e join source_versions v on v.id = e.source_version_id join records r on r.id = v.record_id where r.source_id = 'ncpor' limit 1`);
    await expect(db.tx((q) => createDraft(q, actors.author, { kind: 'article', audience: 'school', calcRunIds: [], spanIds: [span.id], mediaRecordIds: [], languages: ['en'] }))).rejects.toBeInstanceOf(RightsViolation);
  });

  it('creates traceable English and Hindi drafts whose facts match', async () => {
    const [span] = await db.query<{ id: string }>(`select e.id from evidence_spans e join source_versions v on v.id = e.source_version_id join records r on r.id = v.record_id where r.title like 'Arctic sea ice decline%' and e.text ilike '%September%' order by e.ordinal limit 1`);
    spanId = span.id;
    const res = await db.tx((q) => createDraft(q, actors.author, { kind: 'article', audience: 'school', calcRunIds: [calcId], spanIds: [spanId], mediaRecordIds: [], languages: ['en', 'hi'] }));
    [enVersion, hiVersion] = res.versionIds;
    const en = (await getVersion(db, enVersion))!;
    const hi = (await getVersion(db, hiVersion))!;
    expect(en.invariant_report!.ok).toBe(true);
    expect(hi.invariant_report!.ok).toBe(true);
    expect(hi.language_review).toBe('machine_unreviewed');
    const diff = factDiff(
      { blocks: en.body.blocks, lang: 'en', claims: await versionClaimFacts(db, enVersion) },
      { blocks: hi.body.blocks, lang: 'hi', claims: await versionClaimFacts(db, hiVersion) },
    );
    expect(diff.length).toBeGreaterThan(2);
    expect(diff.every((d) => d.status === 'preserved')).toBe(true);
    const claims = await db.query<{ n: number }>(`select count(*)::int n from artifact_version_claims avc join claim_calculations cc on cc.claim_id = avc.claim_id where avc.artifact_version_id = $1`, [enVersion]);
    expect(claims[0].n).toBeGreaterThan(0);
  });

  it('a deliberate number change is flagged and blocks review', async () => {
    const res = await db.tx((q) => createDraft(q, actors.author, { kind: 'caption', audience: 'press', calcRunIds: [calcId], spanIds: [], mediaRecordIds: [], languages: ['en'] }));
    const v = (await getVersion(db, res.versionIds[0]))!;
    const texts = v.body.blocks.map((b) => b.text);
    const i = v.body.blocks.findIndex((b) => b.claimKeys.length && /\d\.\d\d/.test(b.text));
    texts[i] = texts[i].replace(/(\d)\.(\d\d)/, (_m, a, b) => `${a}.${(Number(b) + 11) % 100}`.padEnd(4, '0'));
    const edited = await db.tx((q) => editVersion(q, actors.author, v.id, texts));
    expect(edited.report.ok).toBe(false);
    await expect(db.tx((q) => submitForReview(q, actors.author, edited.versionId))).rejects.toBeInstanceOf(PublishError);
    // The earlier version was superseded (approval cannot carry over).
    expect((await getVersion(db, v.id))!.state).toBe('superseded');
  });

  it('review gates: no self-approval; Hindi needs a language review', async () => {
    await db.tx((q) => submitForReview(q, actors.author, enVersion));
    await db.tx((q) => submitForReview(q, actors.author, hiVersion));
    await expect(db.tx((q) => reviewVersion(q, actors.author, enVersion, 'scientific', 'approve', ''))).rejects.toThrow(/Reviewer role/);
    await db.tx((q) => reviewVersion(q, actors.reviewer, enVersion, 'scientific', 'approve', 'Numbers checked against recipe.'));
    expect((await getVersion(db, enVersion))!.state).toBe('approved');
    await db.tx((q) => reviewVersion(q, actors.reviewer, hiVersion, 'scientific', 'approve', ''));
    expect((await getVersion(db, hiVersion))!.state).toBe('in_review');
    await expect(db.tx((q) => schedulePublication(q, actors.reviewer, hiVersion, null))).rejects.toThrow(/not approved|language review/);
    await db.tx((q) => reviewVersion(q, actors.reviewer, hiVersion, 'language', 'approve', 'Hindi reviewed.'));
    expect((await getVersion(db, hiVersion))!.state).toBe('approved');
  });

  it('publishes once; repeated delivery does not duplicate', async () => {
    const s1 = await db.tx((q) => schedulePublication(q, actors.reviewer, enVersion, null));
    pubId = s1.publicationId;
    const o1 = await processOutbox((fn) => db.tx(fn));
    expect(o1.find((o) => o.publicationId === pubId)?.result).toBe('published');
    const s2 = await db.tx((q) => schedulePublication(q, actors.reviewer, enVersion, null));
    expect(s2.reused).toBe(true);
    await db.query(`update outbox set status = 'pending' where publication_id = $1`, [pubId]); // simulate redelivery
    const o2 = await processOutbox((fn) => db.tx(fn));
    expect(o2.find((o) => o.publicationId === pubId)?.result).toBe('noop');
    const n = await db.query<{ n: number }>(`select count(*)::int n from publications where artifact_version_id = $1 and channel = 'website'`, [enVersion]);
    expect(n[0].n).toBe(1);
    const pub = await db.asPublic((q) => q.query<{ id: string; body: unknown }>(`select id, body from public_artifact_versions where id = $1`, [enVersion]));
    expect(pub).toHaveLength(1);
    const ev = await db.asPublic((q) => q.query<{ quote_valid: boolean; span_text: string | null }>(`select quote_valid, span_text from public_claim_evidence ce join public_claims c on c.id = ce.claim_id where c.artifact_version_id = $1`, [enVersion]));
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.every((e) => e.quote_valid && e.span_text)).toBe(true);
    await db.tx((q) => recordManualExternalPost(q, actors.reviewer, enVersion, 'instagram', 'https://www.instagram.com/p/example-post-id/'));
  });

  it('withdrawal propagates only to dependents and blocks the pending publish race', async () => {
    // Scheduled (future) Hindi publication that depends on the same NSIDC version.
    const future = new Date(Date.now() + 3600_000);
    const hiPub = await db.tx((q) => schedulePublication(q, actors.reviewer, hiVersion, future));
    // An unrelated approved story from PANGAEA, also scheduled.
    const psv = await svFor('PANGAEA.885208-ice_concentration_total');
    const prun = await saveCalculation(db, { seriesKey: 'PANGAEA.885208-ice_concentration_total', sourceVersionId: psv, periodStart: '2016-12-07', periodEnd: '2016-12-10', stats: ['mean', 'max'] }, actors.author.id);
    const other = await db.tx((q) => createDraft(q, actors.author, { kind: 'caption', audience: 'research', calcRunIds: [prun.id], spanIds: [], mediaRecordIds: [], languages: ['en'] }));
    const ov = other.versionIds[0];
    await db.tx((q) => submitForReview(q, actors.author, ov));
    await db.tx((q) => reviewVersion(q, actors.reviewer, ov, 'scientific', 'approve', ''));
    const otherPub = await db.tx((q) => schedulePublication(q, actors.reviewer, ov, future));

    const nsidcN = await svFor('N-monthly-extent');
    const deps = await dependentsOf(db, nsidcN);
    expect(deps.map((d) => d.versionId)).toEqual(expect.arrayContaining([enVersion, hiVersion]));
    expect(deps.map((d) => d.versionId)).not.toContain(ov);

    const res = await db.tx((q) => withdrawSourceVersion(q, actors.admin, nsidcN, 'Curator demonstration of local withdrawal'));
    expect(res.counts.notices).toBe(1);
    expect(res.counts.paused).toBe(1);
    expect(res.counts.external).toBe(1);

    const [p1] = await db.query<{ status: string; correction_notice: string | null }>(`select status, correction_notice from publications where id = $1`, [pubId]);
    expect(p1.status).toBe('published');
    expect(p1.correction_notice).toMatch(/local editorial action/);
    const [p2] = await db.query<{ status: string }>(`select status from publications where id = $1`, [hiPub.publicationId]);
    expect(p2.status).toBe('paused');
    const [p3] = await db.query<{ status: string }>(`select status from publications where id = $1`, [otherPub.publicationId]);
    expect(p3.status).toBe('scheduled');

    // Make everything due: the unrelated story publishes; the paused one stays paused.
    await db.query(`update outbox set run_after = now() - interval '1 minute' where status = 'pending'`);
    const outcomes = await processOutbox((fn) => db.tx(fn));
    expect(outcomes.find((o) => o.publicationId === otherPub.publicationId)?.result).toBe('published');
    const [p2b] = await db.query<{ status: string }>(`select status from publications where id = $1`, [hiPub.publicationId]);
    expect(p2b.status).toBe('paused');

    // Rescheduling the affected version fails closed.
    await expect(db.tx((q) => schedulePublication(q, actors.reviewer, hiVersion, null))).rejects.toThrow(/withdrawn|not approved/);
  });

  it('a race between approval and processing fails closed', async () => {
    const psv = await svFor('PANGAEA.885208-air_temperature');
    const run = await saveCalculation(db, { seriesKey: 'PANGAEA.885208-air_temperature', sourceVersionId: psv, periodStart: '2016-12-07', periodEnd: '2016-12-10', stats: ['mean'] }, actors.author.id);
    const d = await db.tx((q) => createDraft(q, actors.author, { kind: 'caption', audience: 'research', calcRunIds: [run.id], spanIds: [], mediaRecordIds: [], languages: ['en'] }));
    const v = d.versionIds[0];
    await db.tx((q) => submitForReview(q, actors.author, v));
    await db.tx((q) => reviewVersion(q, actors.reviewer, v, 'scientific', 'approve', ''));
    const p = await db.tx((q) => schedulePublication(q, actors.reviewer, v, new Date(Date.now() + 60_000)));
    // Rights change after approval (e.g. curator restricts the dataset) without a correction event.
    const [rec] = await db.query<{ record_id: string }>(`select record_id from source_versions where id = $1`, [psv]);
    await db.query(`insert into rights_decisions (record_id, status, metadata_public, rationale, decided_by) values ($1, 'restricted', true, 'test: restricted after approval', 'test')`, [rec.record_id]);
    await db.query(`update outbox set run_after = now() - interval '1 minute' where publication_id = $1`, [p.publicationId]);
    const out = await processOutbox((fn) => db.tx(fn));
    expect(out.find((o) => o.publicationId === p.publicationId)?.result).toBe('paused');
  });

  it('corrected content requires a new version and a new review', async () => {
    const edited = await db.tx(async (q) => {
      const v = (await getVersion(q, hiVersion))!;
      return editVersion(q, actors.author, hiVersion, v.body.blocks.map((b) => b.text));
    });
    expect((await getVersion(db, edited.versionId))!.state).toBe('draft');
    await expect(db.tx((q) => submitForReview(q, actors.author, edited.versionId))).rejects.toThrow(/withdrawn/);
  });
});

describe('F3 dataset diffs (isolated synthetic fixture)', () => {
  it('distinguishes appended rows from corrected rows', async () => {
    // Explicit test fixture: two synthetic versions of a synthetic series (never loaded in production).
    const [rec] = await db.query<{ id: string }>(`insert into records (content_kind, title, source_id, external_id, canonical_url) values ('dataset', 'TEST FIXTURE', 'upload', 'fixture-1', 'https://example.org/fixture') returning id`);
    const mk = async (hash: string, rows: [string, string][]) => {
      const [v] = await db.query<{ id: string }>(`insert into source_versions (record_id, content_hash) values ($1, $2) returning id`, [rec.id, hash]);
      const [s] = await db.query<{ id: string }>(`insert into dataset_series (source_version_id, series_key, variable, region, units, frequency) values ($1, 'fx', 'x', 'arctic', 'm', 'monthly') returning id`, [v.id]);
      for (const [k, val] of rows) await db.query(`insert into observations (series_id, obs_time, value, raw_value, row_key) values ($1, $2, $3, $4, $5)`, [s.id, `${k}-01T00:00:00Z`, Number(val), val, k]);
      return v.id;
    };
    const a = await mk('a', [['2020-01', '1'], ['2020-02', '2']]);
    const b = await mk('b', [['2020-01', '1'], ['2020-02', '2'], ['2020-03', '3']]);
    const c = await mk('c', [['2020-01', '1'], ['2020-02', '2.5']]);
    expect((await classifyDatasetChange(db, a, b)).kind).toBe('append_only');
    const corr = await classifyDatasetChange(db, a, c);
    expect(corr.kind).toBe('row_correction');
    expect(corr.changedRowKeys).toEqual(['fx/2020-02']);
  });
});

describe('F9 offline pack', () => {
  it('excludes restricted/people items and reports withdrawn sources after save', async () => {
    const m = await buildMuseumPack(db);
    expect(m.items.length).toBeGreaterThan(3);
    expect(m.items.some((i) => /Minister/.test(i.title))).toBe(false);
    expect(m.excluded.some((e) => /identifiable people/.test(e.reason))).toBe(true);
    expect(m.excluded.some((e) => /link-only/.test(e.reason))).toBe(true);
    const target = m.items.find((i) => i.imagePath)!;
    await db.tx((q) => withdrawSourceVersion(q, actors.admin, target.sourceVersionId, 'Test withdrawal for offline pack check'));
    const ch = await db.asPublic((q) => packChangesSince(q, MUSEUM_SLUG, m.packVersion, m.sourceVersionIds));
    expect(ch.corrections.some((c) => c.sourceVersionId === target.sourceVersionId && c.status === 'withdrawn')).toBe(true);
    expect(ch.packStatus).toBe('stale');
  });
});
