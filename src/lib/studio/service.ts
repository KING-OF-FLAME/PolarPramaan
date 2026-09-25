// Draft Studio persistence: creates bilingual artifact drafts whose every claim
// is linked to calculation runs or evidence spans, enforces rights server-side,
// and versions every edit immutably.
import { createHash } from 'node:crypto';
import type { Queryable } from '../db/core';
import type { Actor } from '../auth/roles';
import { audit } from '../auth/store';
import { loadCalculation, type CalcRun } from '../calc/compute';
import { assertUses, type Operation } from '../rights/check';
import { buildClaims, composeBlocks, titleFor, extractNumbers, type ArtifactKind, type Audience, type Block, type ClaimDraft, type Lang } from './templates';
import { checkInvariants, type ClaimFacts, type InvariantReport } from './invariants';
import { quoteIsValid } from '../evidence/ask';

export interface CreateDraftInput {
  kind: ArtifactKind;
  audience: Audience;
  calcRunIds: string[];
  spanIds: string[];
  mediaRecordIds: string[];
  languages: Lang[];
}

export interface VersionBody {
  blocks: Block[];
  allowedNumbers: string[][]; // per block: numbers present in the generated template text (not tied to claims)
  media: { recordId: string; title: string; credit: string | null; license: string | null; thumbnailUrl: string | null }[];
  calcRunIds: string[];
}

export class StudioError extends Error {}

const hashBody = (b: unknown) => createHash('sha256').update(JSON.stringify(b)).digest('hex');

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\x00-\x7f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'story';
}

async function activeVersionFor(q: Queryable, recordId: string): Promise<string | null> {
  const [v] = await q.query<{ id: string }>(`select id from source_versions where record_id = $1 and status = 'active' order by created_at desc limit 1`, [recordId]);
  return v?.id ?? null;
}

export async function createDraft(q: Queryable, actor: Actor, input: CreateDraftInput): Promise<{ artifactIds: string[]; versionIds: string[] }> {
  if (!input.calcRunIds.length && !input.spanIds.length) throw new StudioError('Select at least one calculation or evidence passage.');
  if (input.calcRunIds.length > 3 || input.spanIds.length > 5 || input.mediaRecordIds.length > 3) throw new StudioError('Too many inputs for one draft.');
  const langs = [...new Set(input.languages)].filter((l): l is Lang => l === 'en' || l === 'hi');
  if (!langs.includes('en')) langs.unshift('en');

  // Load inputs with the privileged connection, then enforce rights explicitly.
  const runs: CalcRun[] = [];
  for (const id of input.calcRunIds) {
    const r = await loadCalculation(q, id, false);
    if (!r) throw new StudioError(`Calculation ${id} not found.`);
    if (r.result.source.versionStatus !== 'active') throw new StudioError(`Calculation ${id} uses a source version that is ${r.result.source.versionStatus}.`);
    runs.push(r);
  }
  const spans = input.spanIds.length
    ? await q.query<{ id: string; text: string; record_id: string; title: string; status: string; source_version_id: string }>(
        `select e.id, e.text, v.record_id, r.title, v.status, e.source_version_id from evidence_spans e join source_versions v on v.id = e.source_version_id
           join records r on r.id = v.record_id where e.id = any($1::uuid[])`,
        [input.spanIds],
      )
    : [];
  if (spans.length !== input.spanIds.length) throw new StudioError('One or more evidence passages were not found.');
  if (spans.some((s) => s.status !== 'active')) throw new StudioError('An evidence passage belongs to a source version that is no longer active.');
  const media = input.mediaRecordIds.length
    ? await q.query<{ id: string; title: string; credit: string | null; thumbnail_url: string | null; license: string | null }>(
        `select r.id, r.title, r.credit, r.thumbnail_url, cr.license from records r left join current_rights cr on cr.record_id = r.id where r.id = any($1::uuid[])`,
        [input.mediaRecordIds],
      )
    : [];
  const uses: { recordId: string; op: Operation }[] = [
    ...runs.map((r) => ({ recordId: r.result.source.recordId, op: 'transform' as Operation })),
    ...spans.map((s) => ({ recordId: s.record_id, op: 'quote' as Operation })),
    ...input.mediaRecordIds.flatMap((id) => [{ recordId: id, op: 'republish_media' as Operation }, { recordId: id, op: 'transform' as Operation }]),
  ];
  await assertUses(q, uses); // throws RightsViolation, which is shown to the user with reasons and alternatives

  const gen = {
    kind: input.kind,
    audience: input.audience,
    runs,
    quotes: spans.map((s) => ({ spanId: s.id, quote: s.text.length > 400 ? s.text.slice(0, 400).replace(/\s+\S*$/, '') : s.text, sourceTitle: s.title })),
    media: media.map((m) => ({ recordId: m.id, title: m.title, credit: m.credit, license: m.license })),
  };
  const claims = buildClaims(gen);
  const sourceLinks: { svId: string; role: 'evidence' | 'dataset' | 'media' }[] = [
    ...runs.map((r) => ({ svId: r.result.source.sourceVersionId, role: 'dataset' as const })),
    ...spans.map((s) => ({ svId: s.source_version_id, role: 'evidence' as const })),
  ];
  for (const m of media) {
    const sv = await activeVersionFor(q, m.id);
    if (sv) sourceLinks.push({ svId: sv, role: 'media' });
  }

  const artifactIds: string[] = [];
  const versionIds: string[] = [];
  let parent: string | null = null;
  const claimIdsByLang = new Map<Lang, Map<string, string>>();
  for (const lang of langs) {
    const title = titleFor(gen, lang);
    const blocks = composeBlocks(gen, claims, lang);
    const body: VersionBody = {
      blocks,
      allowedNumbers: blocks.map((b) => (b.claimKeys.length ? [] : extractNumbers(`${b.title ?? ''} ${b.text}`))),
      media: media.map((m) => ({ recordId: m.id, title: m.title, credit: m.credit, license: m.license, thumbnailUrl: m.thumbnail_url })),
      calcRunIds: runs.map((r) => r.id),
    };
    const slugBase = slugify(titleFor(gen, 'en'));
    const [art]: { id: string }[] = await q.query<{ id: string }>(
      `insert into artifacts (kind, slug, title, language, audience, variant_of, created_by)
       values ($1, $2 || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6), $3, $4, $5, $6, $7) returning id`,
      [input.kind, `${slugBase}-${input.audience}-${lang}`.slice(0, 80), title, lang, input.audience, parent, actor.id],
    );
    parent = parent ?? art.id;
    const ids = new Map<string, string>();
    for (const c of claims) ids.set(c.key, await insertClaim(q, c, lang, spans));
    claimIdsByLang.set(lang, ids);
    const facts = claimFacts(claims, lang);
    const report = checkInvariants(blocks, facts, lang, body.allowedNumbers);
    const [ver] = await q.query<{ id: string }>(
      `insert into artifact_versions (artifact_id, version_no, title, body, body_hash, state, language_review, generation_method, invariant_report, created_by)
       values ($1, 1, $2, $3::jsonb, $4, 'draft', $5, 'template-deterministic', $6::jsonb, $7) returning id`,
      [art.id, title, JSON.stringify(body), hashBody(body), lang === 'hi' ? 'machine_unreviewed' : 'not_required', JSON.stringify(report), actor.id],
    );
    let pos = 0;
    for (const c of claims) {
      if (!blocks.some((b) => b.claimKeys.includes(c.key))) continue;
      await q.query(`insert into artifact_version_claims (artifact_version_id, claim_id, position) values ($1, $2, $3)`, [ver.id, ids.get(c.key), pos++]);
    }
    for (const s of dedupe(sourceLinks)) {
      await q.query(`insert into artifact_version_sources (artifact_version_id, source_version_id, role) values ($1, $2, $3) on conflict do nothing`, [ver.id, s.svId, s.role]);
    }
    artifactIds.push(art.id);
    versionIds.push(ver.id);
  }
  await audit(q, actor.id, 'draft.create', 'artifact', artifactIds[0], { kind: input.kind, audience: input.audience, languages: langs, versions: versionIds });
  return { artifactIds, versionIds };
}

function dedupe<T extends { svId: string; role: string }>(xs: T[]): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(x.svId + x.role) ? false : (seen.add(x.svId + x.role), true)));
}

async function insertClaim(q: Queryable, c: ClaimDraft, lang: Lang, spans: { id: string; text: string }[]): Promise<string> {
  const [row] = await q.query<{ id: string }>(
    `insert into claims (claim_key, text, language, region, period_start, period_end, metric, unit, assessment, assessment_origin, caveats, machine_check)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'supported','machine',$9,$10::jsonb) returning id`,
    [c.key, c.text[lang], lang, c.region, c.periodStart, c.periodEnd, c.metric, c.unit, c.caveats[lang], JSON.stringify({ numbers: c.numbers, method: c.calcRunIds.length ? 'deterministic calculation' : 'verbatim quotation' })],
  );
  for (const r of c.calcRunIds) await q.query(`insert into claim_calculations (claim_id, calculation_run_id) values ($1, $2)`, [row.id, r]);
  for (const e of c.evidence) {
    const span = spans.find((s) => s.id === e.spanId);
    await q.query(`insert into claim_evidence (claim_id, evidence_span_id, quote, quote_valid) values ($1, $2, $3, $4)`, [row.id, e.spanId, e.quote, span ? quoteIsValid(e.quote, span.text) : false]);
  }
  return row.id;
}

function claimFacts(claims: ClaimDraft[], lang: Lang): ClaimFacts[] {
  return claims.map((c) => ({ key: c.key, text: c.text[lang], region: c.region, unit: c.unit, numbers: c.numbers }));
}

export async function versionClaimFacts(q: Queryable, versionId: string): Promise<ClaimFacts[]> {
  const rows = await q.query<{ claim_key: string; text: string; region: string | null; unit: string | null; machine_check: { numbers?: string[] } | null }>(
    `select c.claim_key, c.text, c.region, c.unit, c.machine_check from artifact_version_claims avc join claims c on c.id = avc.claim_id
      where avc.artifact_version_id = $1 order by avc.position`,
    [versionId],
  );
  return rows.map((r) => ({ key: r.claim_key, text: r.text, region: r.region, unit: r.unit, numbers: r.machine_check?.numbers ?? [] }));
}

export interface VersionRow {
  id: string;
  artifact_id: string;
  version_no: number;
  title: string;
  body: VersionBody;
  state: string;
  language_review: string;
  generation_method: string;
  invariant_report: InvariantReport | null;
  created_by: string;
  created_at: Date;
  kind: string;
  slug: string;
  language: Lang;
  audience: Audience;
  variant_of: string | null;
  author_name: string;
}

export async function getVersion(q: Queryable, versionId: string): Promise<VersionRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(versionId)) return null;
  const [v] = await q.query<VersionRow>(
    `select av.*, a.kind, a.slug, a.language, a.audience, a.variant_of, u.display_name as author_name
       from artifact_versions av join artifacts a on a.id = av.artifact_id join users u on u.id = av.created_by where av.id = $1`,
    [versionId],
  );
  return v ?? null;
}

/**
 * Save edited block texts as a NEW immutable version. Any earlier approval is
 * invalidated because approvals attach to a specific version.
 */
export async function editVersion(q: Queryable, actor: Actor, versionId: string, texts: string[], titleText?: string): Promise<{ versionId: string; report: InvariantReport }> {
  const v = await getVersion(q, versionId);
  if (!v) throw new StudioError('Version not found.');
  const [latest] = await q.query<{ id: string; version_no: number }>(`select id, version_no from artifact_versions where artifact_id = $1 order by version_no desc limit 1`, [v.artifact_id]);
  if (latest.id !== v.id) throw new StudioError('Only the latest version can be edited.');
  if (v.state === 'in_review') throw new StudioError('This version is in review. Ask the reviewer to request changes first.');
  if (v.state === 'withdrawn') throw new StudioError('This version has been withdrawn.');
  if (texts.length !== v.body.blocks.length) throw new StudioError('Edited block count does not match.');
  const blocks = v.body.blocks.map((b, i) => ({ ...b, text: String(texts[i] ?? '').slice(0, 4000) }));
  const body: VersionBody = { ...v.body, blocks };
  const facts = await versionClaimFacts(q, v.id);
  const report = checkInvariants(blocks, facts, v.language, v.body.allowedNumbers);
  const title = (titleText ?? v.title).slice(0, 200);
  const [nv] = await q.query<{ id: string }>(
    `insert into artifact_versions (artifact_id, version_no, title, body, body_hash, state, language_review, generation_method, invariant_report, created_by)
     values ($1, $2, $3, $4::jsonb, $5, 'draft', $6, 'manual-edit', $7::jsonb, $8) returning id`,
    [v.artifact_id, latest.version_no + 1, title, JSON.stringify(body), hashBody(body), v.language === 'hi' ? 'machine_unreviewed' : 'not_required', JSON.stringify(report), actor.id],
  );
  await q.query(`insert into artifact_version_claims (artifact_version_id, claim_id, position) select $2, claim_id, position from artifact_version_claims where artifact_version_id = $1`, [v.id, nv.id]);
  await q.query(`insert into artifact_version_sources (artifact_version_id, source_version_id, role) select $2, source_version_id, role from artifact_version_sources where artifact_version_id = $1`, [v.id, nv.id]);
  if (['draft', 'changes_requested', 'approved', 'correction_review'].includes(v.state)) {
    await q.query(`update artifact_versions set state = 'superseded' where id = $1`, [v.id]);
    await q.query(`update publications set status = 'cancelled', status_reason = 'Superseded by an edited version', updated_at = now() where artifact_version_id = $1 and status = 'scheduled'`, [v.id]);
  }
  await audit(q, actor.id, 'draft.edit', 'artifact_version', nv.id, { from: v.id, invariantsOk: report.ok });
  return { versionId: nv.id, report };
}
