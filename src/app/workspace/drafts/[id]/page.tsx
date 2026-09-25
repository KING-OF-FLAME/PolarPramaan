import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { pageActor } from '@/lib/web/guard';
import { isUuid } from '@/lib/web/data';
import { getVersion, versionClaimFacts } from '@/lib/studio/service';
import { factDiff } from '@/lib/studio/invariants';
import { approvalStatus, channelStatus, EXTERNAL_CHANNELS, prePublishProblems } from '@/lib/publish/service';
import { hasRole } from '@/lib/auth/roles';
import { allowSelfReview } from '@/lib/env';
import { commentAction, editDraftAction, manualPostAction, reviewAction, scheduleAction, submitAction } from '../../actions';
import { Badge, Notice, PageHeader, fmtDate } from '@/components/ui';
import { StoryBody } from '@/components/StoryBody';

export const dynamic = 'force-dynamic';

export default async function DraftPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string; compare?: string }> }) {
  const actor = await pageActor('contributor');
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const v = await getVersion(db, id);
  if (!v) notFound();
  const facts = await versionClaimFacts(db, id);
  const history = await db.query<{ id: string; version_no: number; state: string; generation_method: string; created_at: Date }>(
    `select id, version_no, state, generation_method, created_at from artifact_versions where artifact_id = $1 order by version_no desc`,
    [v.artifact_id],
  );
  // Sibling-language variant (latest version) for the fact-difference panel.
  const [sib] = await db.query<{ id: string; language: string }>(
    `select av.id, a.language from artifacts a join lateral (select id from artifact_versions where artifact_id = a.id order by version_no desc limit 1) av on true
      where a.id <> $1 and (a.id = $2 or a.variant_of = $2 or a.variant_of = $1) limit 1`,
    [v.artifact_id, v.variant_of ?? v.artifact_id],
  );
  const prev = history.find((h) => h.version_no === v.version_no - 1);
  const compareId = sp.compare === 'previous' && prev ? prev.id : sib?.id;
  let diff = null;
  let cmp = null;
  if (compareId) {
    cmp = await getVersion(db, compareId);
    if (cmp) diff = factDiff({ blocks: v.body.blocks, lang: v.language, claims: facts }, { blocks: cmp.body.blocks, lang: cmp.language, claims: await versionClaimFacts(db, cmp.id) });
  }
  const reviews = await db.query<{ kind: string; decision: string; notes: string | null; independent: boolean; created_at: Date; name: string }>(
    `select r.kind, r.decision, r.notes, r.independent, r.created_at, u.display_name name from reviews r join users u on u.id = r.reviewer_id where r.artifact_version_id = $1 order by r.created_at`,
    [id],
  );
  const comments = await db.query<{ body: string; created_at: Date; name: string }>(`select c.body, c.created_at, u.display_name name from review_comments c join users u on u.id = c.author_id where c.artifact_version_id = $1 order by c.created_at`, [id]);
  const pubs = await db.query<{ id: string; channel: string; status: string; scheduled_at: Date | null; published_at: Date | null; status_reason: string | null; external_url: string | null; correction_notice: string | null }>(
    `select id, channel, status, scheduled_at, published_at, status_reason, external_url, correction_notice from publications where artifact_version_id = $1 order by created_at`,
    [id],
  );
  const impacts = await db.query<{ impact: string; via: string; resolution: string }>(`select impact, via, resolution from correction_impacts where artifact_version_id = $1`, [id]);
  const approval = await approvalStatus(db, id);
  const problems = v.state === 'approved' ? await prePublishProblems(db, id) : [];
  const isLatest = history[0]?.id === id;
  const isReviewer = hasRole(actor, 'reviewer');
  const canReviewThis = isReviewer && (v.created_by !== actor.id || allowSelfReview());
  const website = pubs.find((p) => p.channel === 'website');

  return (
    <div>
      <PageHeader title={v.title}>
        <div className="flex gap-2 flex-wrap mt-2">
          <Badge tone={v.state === 'published' ? 'ok' : v.state === 'correction_review' ? 'warn' : 'accent'}>{v.state}</Badge>
          <Badge>version {v.version_no}</Badge>
          <Badge>{v.kind}</Badge>
          <Badge>{v.audience}</Badge>
          <Badge>{v.language === 'hi' ? 'हिन्दी' : 'English'}</Badge>
          {v.language === 'hi' && <Badge tone={v.language_review === 'human_reviewed' ? 'ok' : 'warn'}>language: {v.language_review.replace('_', ' ')}</Badge>}
          <Badge tone={v.invariant_report?.ok ? 'ok' : 'error'}>machine checks {v.invariant_report?.ok ? 'pass' : 'fail'}</Badge>
          <span className="text-sm muted">
            by {v.author_name} · {v.generation_method} · {fmtDate(v.created_at, true)}
          </span>
        </div>
      </PageHeader>
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}
      {!isLatest && (
        <Notice tone="warn">
          This is not the latest version. <Link href={`/workspace/drafts/${history[0].id}`}>Open version {history[0].version_no}</Link>.
        </Notice>
      )}
      {impacts.length > 0 && (
        <Notice tone="warn" title="Correction impacts">
          <ul className="list-disc pl-5">
            {impacts.map((i, k) => (
              <li key={k}>
                {i.impact.replace('_', ' ')} ({i.resolution}): {i.via}
              </li>
            ))}
          </ul>
          Revise the draft with active sources, then submit it for a new review.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="card p-4">
            <h2 className="font-semibold mb-3">Preview</h2>
            {v.kind === 'storyboard' && <Notice>Storyboard: scenes and narration for a future video. It is not a rendered video.</Notice>}
            <StoryBody body={v.body} lang={v.language} />
          </section>

          {!v.invariant_report?.ok && v.invariant_report && (
            <Notice tone="error" title="Machine fact checks failed">
              <ul className="list-disc pl-5">
                {v.invariant_report.issues.map((i, k) => (
                  <li key={k}>
                    Block {i.blockIndex + 1}: {i.message}
                  </li>
                ))}
              </ul>
            </Notice>
          )}

          {diff && cmp && (
            <section className="card p-4">
              <h2 className="font-semibold">
                Fact-difference panel: this version vs {sp.compare === 'previous' ? `version ${cmp.version_no}` : `${cmp.language === 'hi' ? 'Hindi' : 'English'} variant`}
              </h2>
              <p className="text-sm muted">
                Compares, claim by claim, the numbers, region terms and unit terms that appear in the text.{' '}
                {prev && sp.compare !== 'previous' && <Link href={`?compare=previous`}>Compare with the previous version instead</Link>}
                {sp.compare === 'previous' && sib && <Link href="?">Compare with the other language</Link>}
              </p>
              <div className="overflow-x-auto">
                <table className="data mt-2">
                  <thead>
                    <tr>
                      <th>Claim</th>
                      <th>This version</th>
                      <th>Other</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.map((d) => (
                      <tr key={d.key}>
                        <td>{d.key}</td>
                        <td>{d.a ? `${d.a.numbers.join(', ') || '—'}${d.a.region ? '' : ' · region missing'}${d.a.unit ? '' : ' · unit missing'}` : '—'}</td>
                        <td>{d.b ? `${d.b.numbers.join(', ') || '—'}${d.b.region ? '' : ' · region missing'}${d.b.unit ? '' : ' · unit missing'}` : '—'}</td>
                        <td>
                          <Badge tone={d.status === 'preserved' ? 'ok' : 'error'}>{d.status.replace(/_/g, ' ')}</Badge>
                          <div className="text-xs muted">{d.note}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs muted mt-2">Caveats: {facts.length} claims carry their caveats in both languages. Quotes stay in their original language.</p>
            </section>
          )}

          {isLatest && ['draft', 'changes_requested', 'correction_review', 'published', 'approved'].includes(v.state) && (
            <section className="card p-4">
              <h2 className="font-semibold">Edit (saves a new version; earlier approval does not carry over)</h2>
              <form action={editDraftAction} className="space-y-3 mt-2">
                <input type="hidden" name="versionId" value={id} />
                <input type="hidden" name="count" value={v.body.blocks.length} />
                <label className="label" htmlFor="title">
                  Title
                </label>
                <input id="title" name="title" defaultValue={v.title} className="input" lang={v.language} />
                {v.body.blocks.map((b, i) => (
                  <div key={i}>
                    <label className="label" htmlFor={`block-${i}`}>
                      Block {i + 1}: {b.type}
                      {b.claimKeys.length ? ` (claims ${b.claimKeys.join(', ')})` : ''}
                    </label>
                    <textarea id={`block-${i}`} name={`block-${i}`} defaultValue={b.text} className="input" rows={Math.min(8, Math.max(2, Math.ceil(b.text.length / 90)))} lang={v.language} />
                  </div>
                ))}
                <button className="btn btn-secondary">Save as new version</button>
              </form>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section className="card p-4 space-y-3 text-sm">
            <h2 className="font-semibold text-base">Workflow</h2>
            {['draft', 'changes_requested'].includes(v.state) && isLatest && (
              <form action={submitAction}>
                <input type="hidden" name="versionId" value={id} />
                <button className="btn btn-primary" disabled={!v.invariant_report?.ok}>
                  Submit for review
                </button>
              </form>
            )}
            {v.state === 'in_review' && (
              <div className="space-y-2">
                <p>
                  Scientific review: {approval.scientific ? 'approved' : 'pending'} {approval.needLang && `· Hindi language review: ${approval.language ? 'approved' : 'pending'}`}
                </p>
                {canReviewThis ? (
                  <form action={reviewAction} className="space-y-2">
                    <input type="hidden" name="versionId" value={id} />
                    <select name="kind" className="input" defaultValue="scientific" aria-label="Review type">
                      <option value="scientific">Scientific review</option>
                      {v.language === 'hi' && <option value="language">Hindi language review</option>}
                    </select>
                    <textarea name="notes" className="input" rows={2} placeholder="What you checked (e.g. numbers against the recipe, caveats)" aria-label="Review notes" />
                    <div className="flex gap-2">
                      <button name="decision" value="approve" className="btn btn-primary">
                        Approve
                      </button>
                      <button name="decision" value="request_changes" className="btn btn-secondary">
                        Request changes
                      </button>
                    </div>
                    {v.created_by === actor.id && <p className="text-xs">Development self-review mode: this approval will be labelled NOT independent.</p>}
                  </form>
                ) : (
                  <p className="muted">{isReviewer ? 'You wrote this draft; a different reviewer must review it.' : 'Waiting for a reviewer.'}</p>
                )}
              </div>
            )}
            {v.state === 'approved' && (
              <div className="space-y-2">
                {problems.length > 0 && (
                  <Notice tone="error" title="Pre-publication checks">
                    {problems.join(' ')}
                  </Notice>
                )}
                {isReviewer ? (
                  <form action={scheduleAction} className="space-y-2">
                    <input type="hidden" name="versionId" value={id} />
                    <label className="label" htmlFor="when">
                      Publish at (leave empty for now)
                    </label>
                    <input id="when" name="when" type="datetime-local" className="input" />
                    <select name="tz" className="input" defaultValue="Asia/Kolkata" aria-label="Time zone">
                      <option value="Asia/Kolkata">India (Asia/Kolkata)</option>
                      <option value="UTC">UTC</option>
                      <option value="Europe/London">Europe/London</option>
                      <option value="America/New_York">America/New_York</option>
                    </select>
                    <button className="btn btn-primary" disabled={problems.length > 0}>
                      Publish to website
                    </button>
                  </form>
                ) : (
                  <p className="muted">A reviewer schedules publication.</p>
                )}
              </div>
            )}
            {website?.status === 'published' && (
              <p>
                Live: <Link href={`/stories/${v.slug}`}>/stories/{v.slug}</Link> · <Link href={`/evidence/${website.id}`}>evidence receipt</Link>
              </p>
            )}
            <p>
              <a className="btn btn-secondary" href={`/api/exports/${id}`}>
                Download outreach kit (ZIP)
              </a>
            </p>
          </section>

          <section className="card p-4 text-sm space-y-2">
            <h2 className="font-semibold text-base">Channels</h2>
            {pubs.length === 0 && <p className="muted">No publications yet.</p>}
            {pubs.map((p) => (
              <p key={p.id}>
                <Badge tone={p.status === 'published' ? 'ok' : p.status === 'paused' ? 'warn' : 'neutral'}>{p.status}</Badge> {p.channel}
                {p.scheduled_at && p.status === 'scheduled' ? ` at ${fmtDate(p.scheduled_at, true)}` : ''}
                {p.published_at ? ` · ${fmtDate(p.published_at, true)}` : ''}
                {p.external_url ? (
                  <>
                    {' '}
                    · <a href={p.external_url}>post</a>
                  </>
                ) : null}
                {p.status_reason && <span className="block muted">{p.status_reason}</span>}
                {p.correction_notice && <span className="block">Notice: {p.correction_notice}</span>}
              </p>
            ))}
            <ul className="text-xs muted">
              {EXTERNAL_CHANNELS.map((c) => (
                <li key={c}>
                  {c}: not connected. {channelStatus(c).reason}
                </li>
              ))}
            </ul>
            {v.state === 'published' && isReviewer && (
              <form action={manualPostAction} className="space-y-2">
                <input type="hidden" name="versionId" value={id} />
                <p className="font-medium">Record a manual post (from the exported kit)</p>
                <select name="channel" className="input" aria-label="Channel">
                  {EXTERNAL_CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input name="url" className="input" placeholder="https://… URL of your post" aria-label="Post URL" />
                <button className="btn btn-secondary">Record post</button>
              </form>
            )}
          </section>

          <section className="card p-4 text-sm">
            <h2 className="font-semibold text-base">Reviews</h2>
            {reviews.length === 0 && <p className="muted">None.</p>}
            {reviews.map((r, i) => (
              <p key={i} className="mt-1">
                <Badge tone={r.decision === 'approve' ? 'ok' : 'warn'}>{r.decision}</Badge> {r.kind} by {r.name}
                {r.independent ? '' : ' (self-review, not independent)'} · {fmtDate(r.created_at, true)}
                {r.notes && <span className="block muted">{r.notes}</span>}
              </p>
            ))}
          </section>

          <section className="card p-4 text-sm">
            <h2 className="font-semibold text-base">Comments</h2>
            {comments.map((c, i) => (
              <p key={i} className="mt-1">
                <strong>{c.name}</strong> <span className="muted">{fmtDate(c.created_at, true)}</span>
                <span className="block">{c.body}</span>
              </p>
            ))}
            <form action={commentAction} className="mt-2 space-y-2">
              <input type="hidden" name="versionId" value={id} />
              <textarea name="body" className="input" rows={2} aria-label="Comment" />
              <button className="btn btn-secondary">Comment</button>
            </form>
          </section>

          <section className="card p-4 text-sm">
            <h2 className="font-semibold text-base">Version history</h2>
            <ul>
              {history.map((h) => (
                <li key={h.id}>
                  <Link href={`/workspace/drafts/${h.id}`}>v{h.version_no}</Link> {h.state} · {h.generation_method} · {fmtDate(h.created_at, true)}
                </li>
              ))}
            </ul>
            {sib && (
              <p className="mt-2">
                <Link href={`/workspace/drafts/${sib.id}`}>Open the {sib.language === 'hi' ? 'Hindi' : 'English'} variant</Link>
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
