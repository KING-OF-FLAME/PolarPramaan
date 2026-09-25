import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicRead, recordUsage, isUuid } from '@/lib/web/data';
import { loadReceipt } from '@/lib/publish/receipt';
import { Badge, Notice, PageHeader, SetupRequired, fmtDate } from '@/components/ui';
import { QrCode } from '@/components/QrCode';
import { appUrl } from '@/lib/env';
import { formatMs } from '@/lib/ingest/parse/captions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Evidence receipt' };

export default async function EvidenceReceipt({ params }: { params: Promise<{ publicationId: string }> }) {
  const { publicationId } = await params;
  if (!isUuid(publicationId)) notFound();
  const res = await publicRead((q) => loadReceipt(q, { publicationId }));
  if (!res.ok) return <SetupRequired />;
  if (!res.data) notFound();
  const r = res.data;
  await recordUsage('receipt_view', publicationId);
  const url = `${appUrl()}/evidence/${publicationId}`;
  return (
    <div className="max-w-4xl">
      <PageHeader title="Evidence receipt" lead={<>For: <Link href={`/stories/${r.version.slug}`}>{r.version.title}</Link> (version {r.version.versionNo})</>} />
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="card p-4 text-sm space-y-1">
          <p>
            <strong>Status:</strong> <Badge tone={r.version.publicationStatus === 'published' ? 'ok' : 'error'}>{r.version.publicationStatus}</Badge>{' '}
            {r.version.correctionNotice && <Badge tone="warn">under correction review</Badge>}
          </p>
          <p>
            <strong>Published:</strong> {fmtDate(r.version.publishedAt, true)}
          </p>
          <p>
            <strong>Content hash (sha256):</strong> <code className="break-all">{r.version.bodyHash}</code>
          </p>
          <p>
            <strong>How the text was made:</strong> {r.version.generationMethod === 'template-deterministic' ? 'deterministic templates filled from calculations and verbatim quotes (no AI)' : r.version.generationMethod}
          </p>
          <p>
            <strong>Machine fact checks:</strong> {r.version.invariantOk ? 'passed (numbers, units and region terms match their claims)' : 'not passing'}
          </p>
          <p>
            <strong>Human review:</strong>{' '}
            {r.reviews.length === 0
              ? 'none recorded'
              : r.reviews.map((x, i) => (
                  <span key={i} className="block">
                    {x.kind} review: {x.decision.replace('_', ' ')} by {x.reviewer} (project team reviewer{x.independent ? ', not the author' : ', NOT independent: author self-review in development mode'}) on{' '}
                    {fmtDate(x.at)}
                  </span>
                ))}
          </p>
          <p className="muted">
            Reviews are by PolarPramaan team members. They do not imply approval by NCPOR, NSIDC, NASA or any provider. A QR code links to this receipt;
            it does not make the content true by itself.
          </p>
        </div>
        <QrCode url={url} />
      </div>
      {r.version.correctionNotice && (
        <Notice tone="warn" title="Correction notice">
          {r.version.correctionNotice}
        </Notice>
      )}
      <h2 className="text-xl font-semibold mt-6">Claims and their evidence</h2>
      <ol className="space-y-3 mt-3">
        {r.claims.map((c) => (
          <li key={c.id} id={`claim-${c.key}`} className="card p-4 scroll-mt-20">
            <p lang={r.version.language}>{c.text}</p>
            <div className="flex gap-2 flex-wrap mt-2">
              <Badge tone={c.assessment === 'supported' ? 'ok' : 'warn'}>{c.assessment}</Badge>
              <Badge>{c.origin === 'machine' ? 'machine-assessed' : 'human-assessed'}</Badge>
            </div>
            {c.calcIds.map((id) => (
              <p key={id} className="text-sm mt-2">
                Computed by <Link href={`/calc/${id}`}>calculation {id.slice(0, 8)}</Link> (recipe, rows and verification script available).
              </p>
            ))}
            {c.evidence.map((e) => (
              <div key={e.spanId} className="text-sm mt-2 rounded p-2" style={{ background: 'var(--surface-2)' }}>
                {e.text ? <mark className="evidence">{e.text.length > 600 ? e.text.slice(0, 600) + '…' : e.text}</mark> : <em>Evidence text is not publicly quotable. Follow the link to the source.</em>}
                <p className="muted mt-1">
                  {e.kind.replace('_', ' ')}
                  {e.page ? ` · PDF page ${e.page}` : ''}
                  {e.rowKey ? ` · row ${e.rowKey}` : ''}
                  {e.tStartMs != null ? ` · ${formatMs(e.tStartMs)}` : ''} · quote {e.quoteValid ? 'verified against stored text' : 'NOT verified'} · source version {e.versionStatus}{' '}
                  · <Link href={`/records/${e.recordId}?span=${e.spanId}#span-${e.spanId}`}>open</Link>
                </p>
              </div>
            ))}
            {c.caveats.length > 0 && <p className="text-sm muted mt-2">Caveats: {c.caveats.join(' ')}</p>}
          </li>
        ))}
      </ol>
      <h2 className="text-xl font-semibold mt-6">Sources</h2>
      <table className="data mt-2">
        <thead>
          <tr>
            <th>Source</th>
            <th>Role</th>
            <th>Licence / credit</th>
            <th>Retrieved</th>
            <th>Version</th>
          </tr>
        </thead>
        <tbody>
          {r.sources.map((s, i) => (
            <tr key={i}>
              <td>
                <Link href={`/records/${s.recordId}`}>{s.title}</Link>
                <div className="text-xs muted">{s.sourceName}</div>
              </td>
              <td>{s.role}</td>
              <td className="text-xs">{s.attribution ?? s.license ?? '—'}</td>
              <td>{fmtDate(s.retrievedAt)}</td>
              <td>
                <Badge tone={s.versionStatus === 'active' ? 'ok' : 'error'}>{s.versionStatus}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-sm">
        <a href={`/api/exports/${r.version.id}`} className="btn btn-secondary">
          Download outreach kit (ZIP)
        </a>
      </p>
    </div>
  );
}
