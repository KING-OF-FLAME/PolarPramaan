// Correction impact propagation (F3). Walks the dependency graph
// source version -> evidence span / calculation run -> claim -> artifact
// version -> publication and applies the consequences in one transaction:
// drafts need revalidation, scheduled publications pause, live pages get a
// public notice, externally posted copies become manual follow-up tasks, and
// offline packs become stale. Unrelated outputs are untouched.
import type { Queryable } from '../db/core';
import type { Actor } from '../auth/roles';
import { hasRole } from '../auth/roles';
import { audit } from '../auth/store';
import { classifyDatasetChange } from './diff';

export class CorrectionError extends Error {}

export interface AffectedVersion {
  versionId: string;
  artifactId: string;
  title: string;
  state: string;
  via: string[];
}

/**
 * Artifact versions that depend on a source version. For dataset row
 * corrections, pass `rowKeys` ("series_key/row_key") so only calculations that
 * used those rows count as affected.
 */
export async function dependentsOf(q: Queryable, sourceVersionId: string, rowKeys?: string[]): Promise<AffectedVersion[]> {
  const rows = await q.query<{ version_id: string; artifact_id: string; title: string; state: string; via: string }>(
    `with direct as (
        select avs.artifact_version_id as vid, 'cites source version (' || avs.role || ')' as via
          from artifact_version_sources avs where avs.source_version_id = $1 and $2::text[] is null
      ), spans as (
        select avc.artifact_version_id as vid, 'claim quotes evidence span ' || left(e.id::text, 8) as via
          from evidence_spans e join claim_evidence ce on ce.evidence_span_id = e.id join artifact_version_claims avc on avc.claim_id = ce.claim_id
         where e.source_version_id = $1 and ($2::text[] is null)
      ), calcs as (
        select avc.artifact_version_id as vid, 'claim uses calculation ' || left(c.id::text, 8) as via
          from calculation_runs c join claim_calculations cc on cc.calculation_run_id = c.id join artifact_version_claims avc on avc.claim_id = cc.claim_id
         where $1 = any(c.input_source_version_ids) and ($2::text[] is null or c.input_row_keys && $2::text[])
      ), allv as (select * from direct union all select * from spans union all select * from calcs)
     select av.id as version_id, av.artifact_id, av.title, av.state, allv.via
       from allv join artifact_versions av on av.id = allv.vid
      where av.state not in ('superseded', 'withdrawn')`,
    [sourceVersionId, rowKeys ?? null],
  );
  const map = new Map<string, AffectedVersion>();
  for (const r of rows) {
    const cur = map.get(r.version_id) ?? { versionId: r.version_id, artifactId: r.artifact_id, title: r.title, state: r.state, via: [] };
    if (!cur.via.includes(r.via)) cur.via.push(r.via);
    map.set(r.version_id, cur);
  }
  return [...map.values()];
}

async function applyImpacts(q: Queryable, eventId: string, affected: AffectedVersion[], noticeText: string) {
  let counts = { drafts: 0, paused: 0, notices: 0, external: 0 };
  for (const a of affected) {
    const via = a.via.join('; ');
    if (['draft', 'in_review', 'changes_requested', 'approved'].includes(a.state)) {
      await q.query(`update artifact_versions set state = 'correction_review' where id = $1`, [a.versionId]);
      await q.query(`insert into correction_impacts (event_id, artifact_version_id, impact, via) values ($1,$2,'draft_revalidate',$3) on conflict do nothing`, [eventId, a.versionId, via]);
      counts.drafts++;
    }
    const pubs = await q.query<{ id: string; channel: string; status: string; external_url: string | null }>(
      `select id, channel, status, external_url from publications where artifact_version_id = $1 for update`,
      [a.versionId],
    );
    for (const p of pubs) {
      if (p.status === 'scheduled' || p.status === 'publishing') {
        await q.query(`update publications set status = 'paused', status_reason = $2, updated_at = now() where id = $1`, [p.id, `Paused by correction: ${noticeText}`]);
        await q.query(`update outbox set status = 'cancelled', last_error = 'paused by correction' where publication_id = $1 and status = 'pending'`, [p.id]);
        await q.query(`insert into correction_impacts (event_id, artifact_version_id, publication_id, impact, via) values ($1,$2,$3,'publication_paused',$4) on conflict do nothing`, [eventId, a.versionId, p.id, via]);
        counts.paused++;
      } else if (p.status === 'published' && p.channel === 'website') {
        await q.query(`update publications set correction_notice = $2, updated_at = now() where id = $1`, [p.id, noticeText]);
        await q.query(`update artifact_versions set state = 'correction_review' where id = $1 and state = 'published'`, [a.versionId]);
        await q.query(`insert into correction_impacts (event_id, artifact_version_id, publication_id, impact, via) values ($1,$2,$3,'public_notice',$4) on conflict do nothing`, [eventId, a.versionId, p.id, via]);
        counts.notices++;
      } else if (p.status === 'published') {
        // External platforms: we cannot edit the post; record a truthful manual task.
        await q.query(`insert into correction_impacts (event_id, artifact_version_id, publication_id, impact, via) values ($1,$2,$3,'external_task',$4) on conflict do nothing`, [
          eventId, a.versionId, p.id, `${via}. Manual follow-up needed on ${p.channel}${p.external_url ? ` (${p.external_url})` : ''}: automatic correction is not available.`,
        ]);
        counts.external++;
      }
    }
  }
  return counts;
}

async function markPacksStale(q: Queryable, sourceVersionId: string): Promise<string[]> {
  const rows = await q.query<{ slug: string }>(
    `update offline_packs set status = 'stale' where status = 'active' and manifest->'sourceVersionIds' ? $1 returning slug`,
    [sourceVersionId],
  );
  return rows.map((r) => r.slug);
}

/** Curator withdrawal of a source version: a local editorial action, recorded as such. */
export async function withdrawSourceVersion(q: Queryable, actor: Actor, sourceVersionId: string, reason: string) {
  if (!hasRole(actor, 'admin')) throw new CorrectionError('Only an admin (curator) can withdraw a source.');
  const why = reason.trim();
  if (why.length < 10) throw new CorrectionError('Give a reason of at least 10 characters.');
  const [sv] = await q.query<{ id: string; status: string; record_id: string; title: string }>(
    `select v.id, v.status, v.record_id, r.title from source_versions v join records r on r.id = v.record_id where v.id = $1 for update of v`,
    [sourceVersionId],
  );
  if (!sv) throw new CorrectionError('Source version not found.');
  if (sv.status === 'withdrawn') throw new CorrectionError('Already withdrawn.');
  await q.query(`update source_versions set status = 'withdrawn', status_reason = $2, status_changed_at = now() where id = $1`, [sv.id, why]);
  const [ev] = await q.query<{ id: string }>(
    `insert into correction_events (source_version_id, kind, reason, actor_id, detail) values ($1, 'withdrawal', $2, $3, $4::jsonb) returning id`,
    [sv.id, why, actor.id, JSON.stringify({ note: 'Local editorial withdrawal in this catalog. It is not a retraction by the original provider.' })],
  );
  const affected = await dependentsOf(q, sv.id);
  const date = new Date().toISOString().slice(0, 10);
  const notice = `Under correction review since ${date}: the source "${sv.title}" was withdrawn from this catalog by a curator (${why}). This is a local editorial action, not a retraction by the original provider.`;
  const counts = await applyImpacts(q, ev.id, affected, notice);
  const packs = await markPacksStale(q, sv.id);
  await q.query(`update correction_events set detail = detail || $2::jsonb where id = $1`, [ev.id, JSON.stringify({ affectedVersions: affected.length, ...counts, stalePacks: packs })]);
  await audit(q, actor.id, 'source.withdraw', 'source_version', sv.id, { reason: why, eventId: ev.id, ...counts, stalePacks: packs });
  return { eventId: ev.id, affected, counts, stalePacks: packs };
}

/**
 * Curator accepts a new upstream version that is waiting in review. Appended rows do not
 * invalidate earlier stories. Changed rows only affect outputs whose calculations used those rows.
 */
export async function acceptNewVersion(q: Queryable, actor: Actor, newVersionId: string) {
  if (!hasRole(actor, 'admin')) throw new CorrectionError('Only an admin (curator) can accept a new source version.');
  const [nv] = await q.query<{ id: string; status: string; supersedes_id: string | null; title: string }>(
    `select v.id, v.status, v.supersedes_id, r.title from source_versions v join records r on r.id = v.record_id where v.id = $1 for update of v`,
    [newVersionId],
  );
  if (!nv || nv.status !== 'under_review' || !nv.supersedes_id) throw new CorrectionError('No pending upstream version to accept.');
  const change = await classifyDatasetChange(q, nv.supersedes_id, nv.id);
  await q.query(`update source_versions set status = 'superseded', status_reason = $2, status_changed_at = now() where id = $1`, [nv.supersedes_id, `Superseded by a newer upstream version (${change.kind}).`]);
  await q.query(`update source_versions set status = 'active', status_reason = null, status_changed_at = now() where id = $1`, [nv.id]);
  const kind = change.kind === 'append_only' || change.kind === 'identical' ? 'append_only' : change.kind === 'row_correction' ? 'row_correction' : 'supersession';
  const [ev] = await q.query<{ id: string }>(
    `insert into correction_events (source_version_id, kind, reason, actor_id, detail) values ($1, $2, $3, $4, $5::jsonb) returning id`,
    [nv.supersedes_id, kind, change.summary, actor.id, JSON.stringify(change)],
  );
  let affected: AffectedVersion[] = [];
  if (kind === 'row_correction') affected = await dependentsOf(q, nv.supersedes_id, change.changedRowKeys);
  else if (kind === 'supersession') affected = await dependentsOf(q, nv.supersedes_id);
  const notice = `Under correction review: the provider published a new version of "${nv.title}" (${change.summary}).`;
  const counts = kind === 'append_only' ? { drafts: 0, paused: 0, notices: 0, external: 0 } : await applyImpacts(q, ev.id, affected, notice);
  const packs = kind === 'append_only' ? [] : await markPacksStale(q, nv.supersedes_id);
  await audit(q, actor.id, 'source.accept_version', 'source_version', nv.id, { kind, affected: affected.length });
  return { eventId: ev.id, kind, change, affected, counts, stalePacks: packs };
}

export async function resolveImpact(q: Queryable, actor: Actor, impactId: string, resolution: 'revised' | 'dismissed' | 'external_confirmed') {
  if (!hasRole(actor, 'reviewer')) throw new CorrectionError('Reviewer role required.');
  await q.query(`update correction_impacts set resolution = $2, resolved_at = now() where id = $1 and resolution = 'open'`, [impactId, resolution]);
  await audit(q, actor.id, 'correction.resolve', 'correction_impact', impactId, { resolution });
}
