import Link from 'next/link';
import { getDb } from '@/lib/db';
import { pageActor } from '@/lib/web/guard';
import { Badge, Notice, PageHeader, fmtDate } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Workspace' };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await pageActor('contributor');
  const sp = await searchParams;
  const db = await getDb();
  const mine = await db.query<{ id: string; title: string; state: string; language: string; kind: string; created_at: Date }>(
    `select distinct on (av.artifact_id) av.id, av.title, av.state, a.language, a.kind, av.created_at from artifact_versions av join artifacts a on a.id = av.artifact_id
      where a.created_by = $1 order by av.artifact_id, av.version_no desc`,
    [actor.id],
  );
  const [counts] = await db.query<{ review: number; scheduled: number; paused: number; impacts: number; pending_records: number; pending_versions: number }>(
    `select (select count(*)::int from artifact_versions where state = 'in_review') review,
            (select count(*)::int from publications where status = 'scheduled') scheduled,
            (select count(*)::int from publications where status = 'paused') paused,
            (select count(*)::int from correction_impacts where resolution = 'open') impacts,
            (select count(*)::int from records where catalog_status = 'pending') pending_records,
            (select count(*)::int from source_versions where status = 'under_review') pending_versions`,
  );
  return (
    <div>
      <PageHeader title={`Welcome, ${actor.displayName}`} lead="Your editorial work. Counts are live database queries." />
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-6">
        {[
          ['In review', counts.review, '/workspace/review'],
          ['Scheduled', counts.scheduled, '/workspace/publications'],
          ['Paused', counts.paused, '/workspace/publications'],
          ['Open correction impacts', counts.impacts, '/workspace/corrections'],
          ['Records pending review', counts.pending_records, '/workspace/catalog'],
          ['Upstream versions pending', counts.pending_versions, '/workspace/corrections'],
        ].map(([l, n, h]) => (
          <Link key={String(l)} href={String(h)} className="card p-3" style={{ textDecoration: 'none' }}>
            <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
              {String(n)}
            </p>
            <p className="text-sm muted">{String(l)}</p>
          </Link>
        ))}
      </div>
      <div className="flex gap-2 mb-4">
        <Link href="/workspace/studio" className="btn btn-primary">
          New draft
        </Link>
      </div>
      <h2 className="font-semibold mb-2">Your drafts and stories</h2>
      {mine.length === 0 ? (
        <p className="muted text-sm">None yet.</p>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Title</th>
              <th>Kind</th>
              <th>Language</th>
              <th>State</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {mine.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link href={`/workspace/drafts/${m.id}`}>{m.title}</Link>
                </td>
                <td>{m.kind}</td>
                <td>{m.language}</td>
                <td>
                  <Badge tone={m.state === 'published' ? 'ok' : m.state === 'correction_review' ? 'warn' : 'neutral'}>{m.state}</Badge>
                </td>
                <td>{fmtDate(m.created_at, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
