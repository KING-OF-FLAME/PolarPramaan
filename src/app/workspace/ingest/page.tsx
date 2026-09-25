import { getDb } from '@/lib/db';
import { pageActor } from '@/lib/web/guard';
import { rebuildPackAction } from '../actions';
import { manifest } from '@/lib/ingest/snapshot';
import { Badge, Notice, PageHeader, fmtDate } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ingest & source health' };

export default async function Ingest({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  await pageActor('contributor');
  const sp = await searchParams;
  const db = await getDb();
  const jobs = await db.query<{ id: string; adapter: string; status: string; created_at: Date; finished_at: Date | null; report: { summary?: Record<string, number> } | null }>(
    `select id, adapter, status, created_at, finished_at, report from ingestion_jobs order by created_at desc limit 10`,
  );
  const stale = await db.query<{ title: string; retrieved_at: Date }>(
    `select r.title, v.retrieved_at from source_versions v join records r on r.id = v.record_id where v.status = 'active' and v.retrieved_at < now() - interval '90 days' order by v.retrieved_at limit 20`,
  );
  let m: ReturnType<typeof manifest> | null = null;
  try {
    m = manifest();
  } catch {
    m = null;
  }
  const [{ age }] = await db.query<{ age: number | null }>(`select floor(extract(epoch from (now() - $1::timestamptz)) / 86400)::int age`, [m?.generatedAt ?? null]);
  const ageDays = m ? age : null;
  return (
    <div>
      <PageHeader title="Ingest & Source Health" lead="Imports run from the hashed snapshot (pnpm ingest:bootstrap). The snapshot is refreshed by the “Snapshot real sources” GitHub Actions workflow, which reaches the official provider endpoints." />
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}
      <section className="card p-4 mb-6 text-sm">
        <h2 className="font-semibold text-base">Snapshot</h2>
        {m ? (
          <p>
            Generated {fmtDate(m.generatedAt, true)} ({ageDays} days ago) · {m.entries.filter((e) => e.ok).length} ok / {m.entries.filter((e) => !e.ok).length} failed fetches.{' '}
            {ageDays !== null && ageDays > 35 && <Badge tone="warn">stale: monthly NSIDC files may have new rows</Badge>}
          </p>
        ) : (
          <p>No manifest available.</p>
        )}
        {stale.length > 0 && <p className="mt-2">{stale.length} active source version(s) were retrieved more than 90 days ago.</p>}
      </section>
      <section className="card p-4 mb-6">
        <h2 className="font-semibold">Offline pack</h2>
        <form action={rebuildPackAction}>
          <button className="btn btn-secondary mt-2">Build / rebuild “India in Antarctica” pack</button>
        </form>
      </section>
      <h2 className="font-semibold mb-2">Import jobs</h2>
      <table className="data">
        <thead>
          <tr>
            <th>Job</th>
            <th>Status</th>
            <th>Started</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td>{j.adapter}</td>
              <td>
                <Badge tone={j.status === 'succeeded' ? 'ok' : j.status === 'failed' ? 'error' : 'warn'}>{j.status}</Badge>
              </td>
              <td>{fmtDate(j.created_at, true)}</td>
              <td className="text-xs">{j.report?.summary ? Object.entries(j.report.summary).map(([k, v]) => `${k}: ${v}`).join(', ') : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
