// Editorial state machine, review gates, idempotent website publication via a
// durable outbox, and truthful external-channel records (F10).
import type { Queryable } from '../db/core';
import type { Actor } from '../auth/roles';
import { hasRole } from '../auth/roles';
import { audit } from '../auth/store';
import { allowSelfReview, externalSocialAllowed } from '../env';
import { checkUses, type Operation } from '../rights/check';
import { getVersion } from '../studio/service';

export class PublishError extends Error {}

export async function submitForReview(q: Queryable, actor: Actor, versionId: string) {
  const v = await getVersion(q, versionId);
  if (!v) throw new PublishError('Version not found.');
  if (!['draft', 'changes_requested'].includes(v.state)) throw new PublishError(`A ${v.state} version cannot be submitted.`);
  if (v.created_by !== actor.id && !hasRole(actor, 'reviewer')) throw new PublishError('Only the author or a reviewer can submit this draft.');
  if (!v.invariant_report?.ok) throw new PublishError('Machine checks failed. Fix the flagged numbers, units or region terms first.');
  const problems = await sourceProblems(q, versionId);
  if (problems.length) throw new PublishError(problems.join(' '));
  await q.query(`update artifact_versions set state = 'in_review' where id = $1`, [versionId]);
  await audit(q, actor.id, 'review.submit', 'artifact_version', versionId, null);
}

export async function reviewVersion(q: Queryable, actor: Actor, versionId: string, kind: 'scientific' | 'language', decision: 'approve' | 'request_changes', notes: string) {
  if (!hasRole(actor, 'reviewer')) throw new PublishError('Reviewer role required.');
  const v = await getVersion(q, versionId);
  if (!v) throw new PublishError('Version not found.');
  if (v.state !== 'in_review') throw new PublishError(`Only versions in review can be reviewed (this one is ${v.state}).`);
  if (kind === 'language' && v.language === 'en') throw new PublishError('English versions do not need a separate language review.');
  const independent = v.created_by !== actor.id;
  if (!independent && !allowSelfReview()) throw new PublishError('Authors cannot approve their own drafts. Ask a different reviewer.');
  const srcIds = (await q.query<{ source_version_id: string }>(`select source_version_id from artifact_version_sources where artifact_version_id = $1 order by 1`, [versionId])).map((r) => r.source_version_id);
  await q.query(
    `insert into reviews (artifact_version_id, reviewer_id, kind, decision, notes, independent, reviewed_source_version_ids) values ($1,$2,$3,$4,$5,$6,$7)`,
    [versionId, actor.id, kind, decision, notes.slice(0, 4000) || null, independent, srcIds],
  );
  if (decision === 'request_changes') {
    await q.query(`update artifact_versions set state = 'changes_requested' where id = $1`, [versionId]);
  } else {
    if (kind === 'language') await q.query(`update artifact_versions set language_review = 'human_reviewed' where id = $1`, [versionId]);
    const status = await approvalStatus(q, versionId);
    if (status.complete) await q.query(`update artifact_versions set state = 'approved' where id = $1`, [versionId]);
  }
  await audit(q, actor.id, `review.${decision}`, 'artifact_version', versionId, { kind, independent });
}

export async function approvalStatus(q: Queryable, versionId: string) {
  const v = await getVersion(q, versionId);
  const reviews = await q.query<{ kind: string; decision: string; created_at: Date; independent: boolean }>(
    `select kind, decision, created_at, independent from reviews where artifact_version_id = $1 order by created_at`,
    [versionId],
  );
  const last = (k: string) => [...reviews].reverse().find((r) => r.kind === k);
  const sci = last('scientific');
  const lang = last('language');
  const needLang = v?.language === 'hi';
  return {
    scientific: sci?.decision === 'approve',
    language: !needLang || lang?.decision === 'approve',
    needLang,
    independent: reviews.filter((r) => r.decision === 'approve').every((r) => r.independent),
    complete: sci?.decision === 'approve' && (!needLang || lang?.decision === 'approve'),
  };
}

/** Evidence availability and rights, re-checked at submit time and again right before publication. */
export async function sourceProblems(q: Queryable, versionId: string): Promise<string[]> {
  const problems: string[] = [];
  const srcs = await q.query<{ source_version_id: string; role: string; status: string; record_id: string; title: string }>(
    `select avs.source_version_id, avs.role, v.status, v.record_id, r.title
       from artifact_version_sources avs join source_versions v on v.id = avs.source_version_id join records r on r.id = v.record_id
      where avs.artifact_version_id = $1`,
    [versionId],
  );
  for (const s of srcs) if (s.status !== 'active') problems.push(`Source "${s.title}" is ${s.status}.`);
  const spanVersions = await q.query<{ status: string; title: string }>(
    `select distinct v.status, r.title from artifact_version_claims avc join claim_evidence ce on ce.claim_id = avc.claim_id
       join evidence_spans e on e.id = ce.evidence_span_id join source_versions v on v.id = e.source_version_id join records r on r.id = v.record_id
      where avc.artifact_version_id = $1 and v.status <> 'active'`,
    [versionId],
  );
  for (const s of spanVersions) problems.push(`Evidence from "${s.title}" is ${s.status}.`);
  const calcInputs = await q.query<{ status: string; title: string }>(
    `select distinct v.status, r.title from artifact_version_claims avc join claim_calculations cc on cc.claim_id = avc.claim_id
       join calculation_runs c on c.id = cc.calculation_run_id join source_versions v on v.id = any(c.input_source_version_ids)
       join records r on r.id = v.record_id where avc.artifact_version_id = $1 and v.status <> 'active'`,
    [versionId],
  );
  for (const s of calcInputs) problems.push(`A calculation input ("${s.title}") is ${s.status}.`);
  const uses = srcs.flatMap((s) =>
    s.role === 'media'
      ? [{ recordId: s.record_id, op: 'republish_media' as Operation }, { recordId: s.record_id, op: 'transform' as Operation }]
      : [{ recordId: s.record_id, op: (s.role === 'dataset' ? 'transform' : 'quote') as Operation }],
  );
  for (const v of await checkUses(q, uses)) if (!v.allowed) problems.push(`${v.title}: ${v.reason}`);
  const open = await q.query<{ n: number }>(`select count(*)::int n from correction_impacts where artifact_version_id = $1 and resolution = 'open'`, [versionId]);
  if (open[0].n > 0) problems.push('Open correction impacts must be resolved first.');
  return [...new Set(problems)];
}

export async function prePublishProblems(q: Queryable, versionId: string): Promise<string[]> {
  const v = await getVersion(q, versionId);
  if (!v) return ['Version not found.'];
  const problems: string[] = [];
  if (v.state !== 'approved' && v.state !== 'published') problems.push(`Version is ${v.state}, not approved.`);
  if (!v.invariant_report?.ok) problems.push('Machine fact checks are not passing.');
  const st = await approvalStatus(q, versionId);
  if (!st.scientific) problems.push('No current scientific approval.');
  if (!st.language) problems.push('Hindi version lacks a human language review.');
  // Approval must cover exactly the current source set.
  const [rv] = await q.query<{ reviewed: string[] }>(
    `select reviewed_source_version_ids as reviewed from reviews where artifact_version_id = $1 and kind = 'scientific' and decision = 'approve' order by created_at desc limit 1`,
    [versionId],
  );
  const cur = (await q.query<{ id: string }>(`select source_version_id as id from artifact_version_sources where artifact_version_id = $1 order by 1`, [versionId])).map((r) => r.id);
  if (rv && [...rv.reviewed].sort().join() !== [...cur].sort().join()) problems.push('Sources changed after approval.');
  problems.push(...(await sourceProblems(q, versionId)));
  return problems;
}

export async function schedulePublication(q: Queryable, actor: Actor, versionId: string, scheduledAt: Date | null): Promise<{ publicationId: string; reused: boolean }> {
  if (!hasRole(actor, 'reviewer')) throw new PublishError('Reviewer or admin role required to schedule publication.');
  const problems = await prePublishProblems(q, versionId);
  if (problems.length) throw new PublishError(problems.join(' '));
  const when = scheduledAt && scheduledAt.getTime() > Date.now() ? scheduledAt : new Date();
  const key = `website:${versionId}`;
  const [existing] = await q.query<{ id: string; status: string }>(`select id, status from publications where idempotency_key = $1`, [key]);
  let pubId: string;
  if (existing) {
    if (['scheduled', 'publishing', 'published'].includes(existing.status)) return { publicationId: existing.id, reused: true };
    await q.query(`update publications set status = 'scheduled', scheduled_at = $2, status_reason = null, updated_at = now() where id = $1`, [existing.id, when]);
    pubId = existing.id;
  } else {
    [{ id: pubId }] = await q.query<{ id: string }>(
      `insert into publications (artifact_version_id, channel, status, scheduled_at, idempotency_key, created_by) values ($1, 'website', 'scheduled', $2, $3, $4) returning id`,
      [versionId, when, key, actor.id],
    );
  }
  await q.query(
    `insert into outbox (publication_id, kind, run_after) values ($1, 'publish_website', $2)
     on conflict (publication_id, kind) do update set status = 'pending', run_after = excluded.run_after, attempts = 0, last_error = null`,
    [pubId, when],
  );
  await audit(q, actor.id, 'publication.schedule', 'publication', pubId, { versionId, scheduledAt: when.toISOString() });
  return { publicationId: pubId, reused: false };
}

export async function cancelScheduled(q: Queryable, actor: Actor, publicationId: string) {
  if (!hasRole(actor, 'reviewer')) throw new PublishError('Reviewer role required.');
  await q.query(`update publications set status = 'cancelled', status_reason = 'Cancelled by ' || $2, updated_at = now() where id = $1 and status in ('scheduled', 'paused')`, [publicationId, actor.displayName]);
  await q.query(`update outbox set status = 'cancelled' where publication_id = $1 and status = 'pending'`, [publicationId]);
  await audit(q, actor.id, 'publication.cancel', 'publication', publicationId, null);
}

export interface OutboxOutcome {
  publicationId: string;
  result: 'published' | 'paused' | 'noop';
  problems?: string[];
}

/**
 * Process due outbox rows. Each row runs in its own transaction via `runTx`.
 * Safe to call repeatedly or concurrently: a publication that is no longer
 * 'scheduled' is skipped, and the unique index allows one live website post per version.
 */
export async function processOutbox(runTx: <T>(fn: (q: Queryable) => Promise<T>) => Promise<T>, limit = 10): Promise<OutboxOutcome[]> {
  const outcomes: OutboxOutcome[] = [];
  for (let i = 0; i < limit; i++) {
    const out = await runTx(async (q) => {
      const [row] = await q.query<{ id: number; publication_id: string }>(
        `select id, publication_id from outbox where status = 'pending' and run_after <= now() order by run_after, id limit 1 for update skip locked`,
      );
      if (!row) return null;
      await q.query(`update outbox set attempts = attempts + 1 where id = $1`, [row.id]);
      const [pub] = await q.query<{ id: string; status: string; artifact_version_id: string }>(`select id, status, artifact_version_id from publications where id = $1 for update`, [row.publication_id]);
      if (!pub || pub.status !== 'scheduled') {
        await q.query(`update outbox set status = 'done' where id = $1`, [row.id]);
        return { publicationId: row.publication_id, result: 'noop' as const };
      }
      const problems = await prePublishProblems(q, pub.artifact_version_id);
      if (problems.length) {
        await q.query(`update publications set status = 'paused', status_reason = $2, updated_at = now() where id = $1`, [pub.id, `Pre-publication check failed: ${problems.join(' ')}`]);
        await q.query(`update outbox set status = 'failed', last_error = $2 where id = $1`, [row.id, problems.join(' ').slice(0, 2000)]);
        await audit(q, null, 'publication.paused', 'publication', pub.id, { problems });
        return { publicationId: pub.id, result: 'paused' as const, problems };
      }
      await q.query(`update publications set status = 'published', published_at = now(), status_reason = null, updated_at = now() where id = $1`, [pub.id]);
      await q.query(`update artifact_versions set state = 'published' where id = $1`, [pub.artifact_version_id]);
      await q.query(`update outbox set status = 'done' where id = $1`, [row.id]);
      await audit(q, null, 'publication.published', 'publication', pub.id, { versionId: pub.artifact_version_id });
      return { publicationId: pub.id, result: 'published' as const };
    });
    if (!out) break;
    outcomes.push(out);
  }
  return outcomes;
}

// ----------------------------------------------------------------- external channels
export const EXTERNAL_CHANNELS = ['instagram', 'facebook', 'x', 'youtube'] as const;
export type ExternalChannel = (typeof EXTERNAL_CHANNELS)[number];

/** No platform adapter is implemented or credentialed in this release. */
export function channelStatus(channel: ExternalChannel): { connected: false; reason: string } {
  return {
    connected: false,
    reason: externalSocialAllowed()
      ? `No ${channel} API adapter or credentials are configured. Posting from here is disabled.`
      : `External posting is disabled (ALLOW_EXTERNAL_SOCIAL_PUBLISH is not "true") and no ${channel} credentials are configured.`,
  };
}

/**
 * Record that an editor manually posted an exported package to an external
 * channel. Stored as editor-reported (not platform-verified), so a later
 * correction can create a truthful follow-up task for that URL.
 */
export async function recordManualExternalPost(q: Queryable, actor: Actor, versionId: string, channel: ExternalChannel, url: string) {
  if (!hasRole(actor, 'reviewer')) throw new PublishError('Reviewer role required.');
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new PublishError('Enter the full https URL of the post.');
  }
  if (u.protocol !== 'https:') throw new PublishError('Enter the full https URL of the post.');
  const v = await getVersion(q, versionId);
  if (!v || v.state !== 'published') throw new PublishError('Only website-published versions can be recorded as posted elsewhere.');
  const [row] = await q.query<{ id: string }>(
    `insert into publications (artifact_version_id, channel, status, published_at, idempotency_key, external_url, status_reason, created_by)
     values ($1, $2, 'published', now(), $3, $4, 'Posted manually by an editor; not verified through a platform API.', $5)
     on conflict (idempotency_key) do update set external_url = excluded.external_url, updated_at = now() returning id`,
    [versionId, channel, `${channel}:${versionId}:${u.toString()}`, u.toString(), actor.id],
  );
  await audit(q, actor.id, 'publication.manual_external', 'publication', row.id, { channel, url: u.toString() });
  return row.id;
}
