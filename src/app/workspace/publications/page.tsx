import Link from 'next/link';
import { getDb } from '@/lib/db';
import { pageActor } from '@/lib/web/guard';
import { cancelPublicationAction, processOutboxAction } from '../actions';
import { channelStatus, EXTERNAL_CHANNELS } from '@/lib/publish/service';
import { Badge, Notice, PageHeader, fmtDate } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Publication queue' };

export default async function Publications({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  await pageActor('contributor');
  const sp = await searchParams;
  const db = await getDb();
  const rows = await db.query<{ id: string; channel: string; status: string; scheduled_at: Date | null; published_at: Date | null; status_reason: string | null; correction_notice: string | null; version_id: string; title: string; external_url: string | null }>(
    `select p.id, p.channel, p.status, p.scheduled_at, p.published_at, p.status_reason, p.correction_notice, p.artifact_version_id version_id, av.title, p.external_url
       from publications p join artifact_versions av on av.id = p.artifact_version_id order by coalesce(p.published_at, p.scheduled_at) desc nulls last limit 200`,
  );
  const [due] = await db.query<{ n: number }>(`select count(*)::int n from outbox where status = 'pending' and run_after <= now()`);
  return (
    <div>
      <PageHeader title="Publication Queue" lead="Website publication runs through a durable outbox. A due item is re-checked (approval, sources, rights) right before it goes live, and a failed check pauses it." />
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}
      <form action={processOutboxAction} className="mb-4 flex items-center gap-3">
        <button className="btn btn-secondary">Process due items now</button>
        <span className="text-sm muted">{due.n} due. A cron job also processes the queue (see docs/RUNBOOK.md).</span>
      </form>
      <div className="overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th>Story</th>
              <th>Channel</th>
              <th>Status</th>
              <th>When (UTC)</th>
              <th>Notes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/workspace/drafts/${r.version_id}`}>{r.title}</Link>
                </td>
                <td>
                  {r.channel}
                  {r.external_url && (
                    <>
                      {' '}
                      <a href={r.external_url}>↗</a>
                    </>
                  )}
                </td>
                <td>
                  <Badge tone={r.status === 'published' ? 'ok' : r.status === 'paused' || r.status === 'failed' ? 'warn' : 'neutral'}>{r.status}</Badge>
                </td>
                <td>{fmtDate(r.published_at ?? r.scheduled_at, true)}</td>
                <td className="text-xs">
                  {r.status_reason}
                  {r.correction_notice && <span className="block">Notice: {r.correction_notice}</span>}
                </td>
                <td>
                  {(r.status === 'scheduled' || r.status === 'paused') && (
                    <form action={cancelPublicationAction}>
                      <input type="hidden" name="publicationId" value={r.id} />
                      <button className="btn btn-secondary text-xs">Cancel</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="font-semibold mt-6">External channels</h2>
      <ul className="text-sm mt-2">
        {EXTERNAL_CHANNELS.map((c) => (
          <li key={c}>
            <Badge tone="warn">not connected</Badge> {c}: {channelStatus(c).reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
