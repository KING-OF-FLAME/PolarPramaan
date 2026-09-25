import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { pageActor } from '@/lib/web/guard';
import { hasRole } from '@/lib/auth/roles';
import { isUuid } from '@/lib/web/data';
import { rightsDecisionAction } from '../../actions';
import { Badge, Notice, PageHeader, fmtDate } from '@/components/ui';

export const dynamic = 'force-dynamic';

const FLAGS: [string, string][] = [
  ['metadata_public', 'Metadata may be public'],
  ['allow_store_original', 'Store original'],
  ['allow_download', 'Offer original for download'],
  ['allow_index_text', 'Index text'],
  ['allow_quote', 'Quote'],
  ['allow_ai_processing', 'Send to AI provider'],
  ['allow_transform', 'Derivatives / charts / adaptations'],
  ['allow_republish_media', 'Republish media'],
  ['allow_offline', 'Offline packs'],
  ['people_identifiable', 'Shows identifiable people'],
];

export default async function CatalogRecord({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const actor = await pageActor('contributor');
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const [r] = await db.query<Record<string, unknown>>(`select r.*, cr.* , r.id as rid from records r left join current_rights cr on cr.record_id = r.id where r.id = $1`, [id]);
  if (!r) notFound();
  const history = await db.query<{ status: string; rationale: string; decided_by: string; decided_at: Date }>(`select status, rationale, decided_by, decided_at from rights_decisions where record_id = $1 order by decided_at desc`, [id]);
  const [{ n }] = await db.query<{ n: number }>(`select count(*)::int n from evidence_spans e join source_versions v on v.id = e.source_version_id where v.record_id = $1`, [id]);
  return (
    <div className="max-w-3xl">
      <PageHeader title={String(r.title)} lead={`${String(r.content_kind)} · ${String(r.visibility)} · ${String(r.catalog_status)} · ${n} evidence spans`} />
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}
      <p className="text-sm break-all">
        Source: <a href={String(r.canonical_url)}>{String(r.canonical_url)}</a> · <Link href={`/records/${id}`}>public page</Link> (visible only when public and approved)
      </p>
      {hasRole(actor, 'admin') ? (
        <form action={rightsDecisionAction} className="card p-4 mt-4 space-y-3">
          <input type="hidden" name="recordId" value={id} />
          <h2 className="font-semibold">New rights decision</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <select name="status" defaultValue={String(r.status ?? 'unknown')} className="input" aria-label="Rights status">
              {['cleared', 'attribution_required', 'link_only', 'restricted', 'unknown'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input name="license" defaultValue={String(r.license ?? '')} className="input" placeholder="Licence / terms" aria-label="Licence" />
            <input name="attribution" defaultValue={String(r.attribution ?? '')} className="input" placeholder="Attribution text" aria-label="Attribution" />
            <input name="policyUrl" defaultValue={String(r.policy_url ?? '')} className="input" placeholder="Policy URL" aria-label="Policy URL" />
          </div>
          <div className="grid sm:grid-cols-2 gap-1 text-sm">
            {FLAGS.map(([k, label]) => (
              <label key={k}>
                <input type="checkbox" name={k} defaultChecked={Boolean(r[k])} /> {label}
              </label>
            ))}
          </div>
          <textarea name="rationale" required minLength={15} className="input" rows={3} placeholder="Why: cite the policy text or permission you relied on" aria-label="Rationale" />
          <div className="grid sm:grid-cols-2 gap-3">
            <select name="visibility" defaultValue={String(r.visibility)} className="input" aria-label="Visibility">
              <option value="internal">internal</option>
              <option value="public">public</option>
            </select>
            <select name="catalogStatus" defaultValue={String(r.catalog_status)} className="input" aria-label="Catalog status">
              <option value="pending">pending</option>
              <option value="approved">approved</option>
              <option value="withdrawn">withdrawn</option>
            </select>
          </div>
          <button className="btn btn-primary">Record decision</button>
          <p className="text-xs muted">Granting &ldquo;Index text&rdquo; on an upload runs text extraction (PDF, text, CSV rows). Nothing is sent to an AI provider by this step.</p>
        </form>
      ) : (
        <Notice>Only admins record rights decisions.</Notice>
      )}
      <h2 className="font-semibold mt-6">Rights history</h2>
      <ul className="text-sm space-y-2 mt-2">
        {history.map((h, i) => (
          <li key={i}>
            <Badge>{h.status}</Badge> {fmtDate(h.decided_at, true)} by {h.decided_by}: <span className="muted">{h.rationale}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
