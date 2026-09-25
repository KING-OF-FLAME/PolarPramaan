import Link from 'next/link';
import { getDb } from '@/lib/db';
import { pageActor } from '@/lib/web/guard';
import { Badge, PageHeader, fmtDate } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Review queue' };

export default async function Review() {
  const actor = await pageActor('contributor');
  const db = await getDb();
  const rows = await db.query<{ id: string; title: string; language: string; kind: string; audience: string; author: string; created_by: string; created_at: Date; state: string }>(
    `select av.id, av.title, a.language, a.kind, a.audience, u.display_name author, av.created_by, av.created_at, av.state
       from artifact_versions av join artifacts a on a.id = av.artifact_id join users u on u.id = av.created_by
      where av.state in ('in_review', 'approved', 'correction_review') order by av.state, av.created_at`,
  );
  return (
    <div>
      <PageHeader title="Scientific Review" lead="Versions waiting for review, approved versions waiting for publication, and versions under correction review." />
      <table className="data">
        <thead>
          <tr>
            <th>Title</th>
            <th>State</th>
            <th>Kind</th>
            <th>Lang</th>
            <th>Author</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`/workspace/drafts/${r.id}`}>{r.title}</Link>
              </td>
              <td>
                <Badge tone={r.state === 'approved' ? 'ok' : r.state === 'correction_review' ? 'warn' : 'accent'}>{r.state}</Badge>
              </td>
              <td>
                {r.kind} / {r.audience}
              </td>
              <td>{r.language}</td>
              <td>
                {r.author}
                {r.created_by === actor.id ? ' (you)' : ''}
              </td>
              <td>{fmtDate(r.created_at, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted mt-3">Nothing in review.</p>}
    </div>
  );
}
