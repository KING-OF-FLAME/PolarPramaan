import Link from 'next/link';
import { publicRead } from '@/lib/web/data';
import { manifest } from '@/lib/ingest/snapshot';
import { KIND_LABEL, PageHeader, SetupRequired, Badge, fmtDate } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sources & Rights' };

export default async function Sources() {
  const res = await publicRead(async (q) => {
    const bySource = await q.query<{ source_name: string; source_homepage: string; n: number; archived: number; link_only: number }>(
      `select source_name, source_homepage, count(*)::int n, count(*) filter (where archival = 'archived')::int archived, count(*) filter (where archival = 'link_only')::int link_only
         from public_records group by 1, 2 order by n desc`,
    );
    const byRights = await q.query<{ rights_status: string; license: string | null; n: number }>(`select rights_status, license, count(*)::int n from public_records group by 1, 2 order by n desc`);
    const byKind = await q.query<{ content_kind: string; archival: string; india: number; n: number }>(
      `select content_kind, archival, count(*) filter (where india_specific)::int india, count(*)::int n from public_records group by 1, 2 order by 1, 2`,
    );
    return { bySource, byRights, byKind };
  });
  let m: ReturnType<typeof manifest> | null = null;
  try {
    m = manifest();
  } catch {
    m = null;
  }
  const failures = m?.entries.filter((e) => !e.ok) ?? [];
  return (
    <div>
      <PageHeader
        title="Sources & Rights"
        lead="Where every item comes from, what we are allowed to do with it, and what failed. Being publicly visible is not the same as being free to republish: each record carries separate permissions for its metadata, original file and derivatives."
      />
      {!res.ok ? (
        <SetupRequired />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-4">
            <h2 className="font-semibold">By provider</h2>
            <table className="data mt-2">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Records</th>
                  <th>Archived</th>
                  <th>Link-only</th>
                </tr>
              </thead>
              <tbody>
                {res.data.bySource.map((s) => (
                  <tr key={s.source_name}>
                    <td>
                      <a href={s.source_homepage}>{s.source_name}</a>
                    </td>
                    <td>{s.n}</td>
                    <td>{s.archived}</td>
                    <td>{s.link_only}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="card p-4">
            <h2 className="font-semibold">By content type (six required kinds)</h2>
            <table className="data mt-2">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Archival</th>
                  <th>Records</th>
                  <th>India-specific</th>
                </tr>
              </thead>
              <tbody>
                {res.data.byKind.map((k) => (
                  <tr key={k.content_kind + k.archival}>
                    <td>{KIND_LABEL[k.content_kind]}</td>
                    <td>{k.archival === 'archived' ? 'archived snapshot' : 'link-only reference'}</td>
                    <td>{k.n}</td>
                    <td>{k.india}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs muted mt-2">
              Indian expedition reports are link-only: NCPOR&apos;s copyright page states “All Rights Reserved”, so their full text is not archived here. Archiving
              them needs NCPOR&apos;s permission.
            </p>
          </section>
          <section className="card p-4 lg:col-span-2">
            <h2 className="font-semibold">By rights decision</h2>
            <ul className="mt-2 text-sm grid sm:grid-cols-2 gap-1">
              {res.data.byRights.map((r) => (
                <li key={`${r.rights_status}${r.license}`}>
                  <Badge>{r.rights_status}</Badge> {r.license ?? 'no licence (link only)'}: {r.n}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      <section className="card p-4 mt-6">
        <h2 className="font-semibold">Snapshot provenance</h2>
        {m ? (
          <>
            <p className="text-sm mt-1">
              Source files were fetched from official endpoints by a GitHub Actions job ({m.runner}), most recently on {fmtDate(m.generatedAt, true)}. Each file&apos;s
              SHA-256 is recorded and checked before import. {m.entries.filter((e) => e.ok).length} fetches succeeded and {failures.length} failed. Failures are listed
              below, not hidden.
            </p>
            {failures.length > 0 && (
              <ul className="text-sm mt-2 list-disc pl-5">
                {failures.map((f, i) => (
                  <li key={i} className="break-all">
                    {f.provider}: {f.url} — {f.error}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm">Snapshot manifest not available in this deployment.</p>
        )}
        <p className="text-sm mt-2">
          The reuse policy texts used for rights decisions are stored in the repository under <code>data/snapshots/policies/</code>. See also <Link href="/about">methods</Link>.
        </p>
      </section>
    </div>
  );
}
