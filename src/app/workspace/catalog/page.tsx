import Link from 'next/link';
import { getDb } from '@/lib/db';
import { pageActor } from '@/lib/web/guard';
import { linkDecisionAction, uploadAction } from '../actions';
import { Badge, KIND_LABEL, Notice, PageHeader, RightsBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Catalog review' };

export default async function Catalog({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  await pageActor('contributor');
  const sp = await searchParams;
  const db = await getDb();
  const pending = await db.query<{ id: string; title: string; content_kind: string; status: string | null }>(
    `select r.id, r.title, r.content_kind, cr.status from records r left join current_rights cr on cr.record_id = r.id where r.catalog_status = 'pending' or r.visibility = 'internal' order by r.created_at desc`,
  );
  const links = await db.query<{ id: string; relation: string; note: string | null; a: string; at: string; b: string; bt: string }>(
    `select l.id, l.relation, l.note, ra.id a, ra.title at, rb.id b, rb.title bt from record_links l join records ra on ra.id = l.from_record join records rb on rb.id = l.to_record where l.curator_status = 'suggested' limit 50`,
  );
  const [counts] = await db.query<{ total: number; public: number }>(`select count(*)::int total, count(*) filter (where visibility = 'public' and catalog_status = 'approved')::int public from records`);
  return (
    <div>
      <PageHeader title="Catalog Review" lead={`${counts.total} records; ${counts.public} public. Upload authorised material, review rights, and confirm suggested relationships with evidence.`} />
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}
      <section className="card p-4 mb-6">
        <h2 className="font-semibold">Authorised upload</h2>
        <form action={uploadAction} className="grid gap-3 sm:grid-cols-2 mt-2">
          <div>
            <label className="label" htmlFor="file">
              File (PDF, CSV, text, JPEG, PNG or MP4; up to 4 MB)
            </label>
            <input id="file" name="file" type="file" required className="input" accept=".pdf,.csv,.txt,.jpg,.jpeg,.png,.mp4" />
          </div>
          <div>
            <label className="label" htmlFor="kind">
              Content type
            </label>
            <select id="kind" name="kind" className="input">
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="title">
              Title
            </label>
            <input id="title" name="title" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="sourceUrl">
              Original source URL
            </label>
            <input id="sourceUrl" name="sourceUrl" required className="input" placeholder="https://" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="description">
              Description
            </label>
            <textarea id="description" name="description" className="input" rows={2} />
          </div>
          <label className="text-sm">
            <input type="checkbox" name="india" /> India-specific
          </label>
          <label className="text-sm">
            <input type="checkbox" name="authorized" required /> I am authorised to upload this material for review.
          </label>
          <div className="sm:col-span-2">
            <button className="btn btn-primary">Upload to quarantine</button>
            <p className="text-xs muted mt-1">Uploads stay private and unprocessed until an admin records a rights decision.</p>
          </div>
        </form>
      </section>
      <section className="mb-6">
        <h2 className="font-semibold mb-2">Pending or internal records</h2>
        {pending.length === 0 && <p className="muted text-sm">None.</p>}
        <ul className="space-y-1 text-sm">
          {pending.map((p) => (
            <li key={p.id}>
              <Link href={`/workspace/catalog/${p.id}`}>{p.title}</Link> <Badge>{KIND_LABEL[p.content_kind]}</Badge> <RightsBadge status={p.status} />
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-semibold mb-2">Suggested relationships (unverified)</h2>
        <p className="text-sm muted mb-2">Suggested by rules, never by an AI. To verify one, give the id of an evidence span that supports it; verified links then appear publicly.</p>
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.id} className="card p-3 text-sm">
              <Link href={`/records/${l.a}`}>{l.at}</Link> — {l.relation} → <Link href={`/records/${l.b}`}>{l.bt}</Link>
              <span className="block muted">{l.note}</span>
              <form action={linkDecisionAction} className="flex gap-2 mt-2">
                <input type="hidden" name="linkId" value={l.id} />
                <input name="spanId" className="input" placeholder="Supporting evidence span id" aria-label="Supporting evidence span id" />
                <button name="decision" value="verified" className="btn btn-secondary text-xs">
                  Verify
                </button>
                <button name="decision" value="rejected" className="btn btn-secondary text-xs">
                  Reject
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
