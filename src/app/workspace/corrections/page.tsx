import Link from 'next/link';
import { getDb } from '@/lib/db';
import { pageActor } from '@/lib/web/guard';
import { hasRole } from '@/lib/auth/roles';
import { acceptVersionAction, resolveImpactAction, withdrawAction } from '../actions';
import { Badge, Notice, PageHeader, fmtDate } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Corrections' };

export default async function Corrections({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; q?: string }> }) {
  const actor = await pageActor('contributor');
  const sp = await searchParams;
  const db = await getDb();
  const q = (sp.q ?? '').slice(0, 100);
  const versions = await db.query<{ id: string; title: string; label: string | null; retrieved_at: Date | null; deps: number }>(
    `select v.id, r.title, v.version_label label, v.retrieved_at,
            (select count(*)::int from artifact_version_sources s where s.source_version_id = v.id) +
            (select count(*)::int from calculation_runs c where v.id = any(c.input_source_version_ids)) deps
       from source_versions v join records r on r.id = v.record_id
      where v.status = 'active' and ($1 = '' or r.title ilike '%' || $1 || '%')
      order by deps desc, r.title limit 30`,
    [q],
  );
  const pending = await db.query<{ id: string; title: string; status_reason: string | null }>(`select v.id, r.title, v.status_reason from source_versions v join records r on r.id = v.record_id where v.status = 'under_review'`);
  const events = await db.query<{ id: string; kind: string; reason: string; created_at: Date; title: string; actor: string | null; detail: Record<string, unknown> | null }>(
    `select e.id, e.kind, e.reason, e.created_at, r.title, u.display_name actor, e.detail from correction_events e join source_versions v on v.id = e.source_version_id join records r on r.id = v.record_id left join users u on u.id = e.actor_id order by e.created_at desc limit 20`,
  );
  const impacts = await db.query<{ id: string; event_id: string; impact: string; via: string; resolution: string; version_id: string; title: string }>(
    `select i.id, i.event_id, i.impact, i.via, i.resolution, i.artifact_version_id version_id, av.title from correction_impacts i join artifact_versions av on av.id = i.artifact_version_id order by i.resolution, i.id`,
  );
  const isAdmin = hasRole(actor, 'admin');
  return (
    <div>
      <PageHeader title="Corrections" lead="One correction, every affected story. Withdrawing a source version finds every dependent draft, schedule, public page, external post and offline pack through the stored dependency graph. A withdrawal here is a local editorial action, not a retraction by the provider." />
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}
      {pending.length > 0 && (
        <section className="card p-4 mb-6">
          <h2 className="font-semibold">New upstream versions awaiting curator review</h2>
          {pending.map((p) => (
            <form key={p.id} action={acceptVersionAction} className="flex gap-2 items-center mt-2 text-sm">
              <input type="hidden" name="sourceVersionId" value={p.id} />
              <span>
                {p.title}: {p.status_reason}
              </span>
              {isAdmin && <button className="btn btn-secondary text-xs">Accept and propagate</button>}
            </form>
          ))}
        </section>
      )}
      {isAdmin && (
        <section className="card p-4 mb-6">
          <h2 className="font-semibold">Withdraw a source version</h2>
          <form className="flex gap-2 my-2" action="/workspace/corrections">
            <input name="q" defaultValue={q} className="input" placeholder="Filter sources by title" aria-label="Filter sources" />
            <button className="btn btn-secondary">Filter</button>
          </form>
          <form action={withdrawAction} className="space-y-2">
            <select name="sourceVersionId" className="input" required aria-label="Source version">
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title} · {v.label ?? ''} · retrieved {fmtDate(v.retrieved_at)} · {v.deps} direct dependents
                </option>
              ))}
            </select>
            <input name="reason" className="input" required minLength={10} placeholder="Reason, e.g. a curator found a transcription error in rows used" aria-label="Reason" />
            <button className="btn btn-danger">Withdraw and propagate</button>
          </form>
        </section>
      )}
      <section className="mb-6">
        <h2 className="font-semibold mb-2">Correction events</h2>
        {events.length === 0 && <p className="muted text-sm">None yet.</p>}
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="card p-3 text-sm">
              <Badge tone="warn">{e.kind}</Badge> {e.title}: {e.reason} · {e.actor ?? 'system'} · {fmtDate(e.created_at, true)}
              {e.detail && <pre className="text-xs muted whitespace-pre-wrap mt-1">{JSON.stringify(e.detail)}</pre>}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-semibold mb-2">Impacts</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Output</th>
              <th>Impact</th>
              <th>Dependency path</th>
              <th>Resolution</th>
            </tr>
          </thead>
          <tbody>
            {impacts.map((i) => (
              <tr key={i.id}>
                <td>
                  <Link href={`/workspace/drafts/${i.version_id}`}>{i.title}</Link>
                </td>
                <td>{i.impact.replace(/_/g, ' ')}</td>
                <td className="text-xs">{i.via}</td>
                <td>
                  <Badge tone={i.resolution === 'open' ? 'warn' : 'ok'}>{i.resolution}</Badge>
                  {i.resolution === 'open' && hasRole(actor, 'reviewer') && (
                    <form action={resolveImpactAction} className="flex gap-1 mt-1">
                      <input type="hidden" name="impactId" value={i.id} />
                      <select name="resolution" className="input text-xs" aria-label="Resolution">
                        <option value="revised">revised (new version reviewed)</option>
                        <option value="external_confirmed">external post corrected (confirmed)</option>
                        <option value="dismissed">dismissed (not affected)</option>
                      </select>
                      <button className="btn btn-secondary text-xs">Save</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
