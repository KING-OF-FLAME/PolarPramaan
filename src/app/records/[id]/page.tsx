import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicRead, recordUsage, isUuid } from '@/lib/web/data';
import { Badge, KIND_LABEL, Notice, PageHeader, REGION_LABEL, RightsBadge, SetupRequired, fmtDate } from '@/components/ui';
import { formatMs } from '@/lib/ingest/parse/captions';

export const dynamic = 'force-dynamic';

const PAGE = 40;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return { title: 'Record' };
  const r = await publicRead((q) => q.query<{ title: string }>(`select title from public_records where id = $1`, [id]));
  return { title: r.ok && r.data[0] ? r.data[0].title : 'Record' };
}

export default async function RecordPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; span?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const focus = sp.span && isUuid(sp.span) ? sp.span : null;
  const res = await publicRead(async (q) => {
    const [r] = await q.query<Record<string, unknown>>(`select * from public_records where id = $1`, [id]);
    if (!r) return null;
    const versions = await q.query<Record<string, unknown>>(`select * from public_source_versions where record_id = $1 order by retrieved_at desc nulls last`, [id]);
    const [{ n }] = await q.query<{ n: number }>(`select count(*)::int n from public_evidence_spans where record_id = $1`, [id]);
    let page = Math.max(1, Number(sp.page) || 1);
    if (focus) {
      const [pos] = await q.query<{ ord: number }>(
        `select count(*)::int ord from public_evidence_spans a join public_evidence_spans b on b.id = $2
          where a.record_id = $1 and (a.source_version_id, a.ordinal) < (b.source_version_id, b.ordinal)`,
        [id, focus],
      );
      if (pos) page = Math.floor(pos.ord / PAGE) + 1;
    }
    const spans = await q.query<Record<string, unknown>>(
      `select id, kind, heading, text, page, row_key, column_names, t_start_ms, t_end_ms, extraction_method, char_start, char_end
         from public_evidence_spans where record_id = $1 order by source_version_id, ordinal limit $2 offset $3`,
      [id, PAGE, (page - 1) * PAGE],
    );
    const series = await q.query<Record<string, unknown>>(`select id, series_key, variable, units, frequency, description, source_version_id, version_status from public_dataset_series where record_id = $1`, [id]);
    const links = await q.query<{ id: string; relation: string; other: string; title: string; note: string | null; evidence_span_id: string | null; direction: string }>(
      `select l.id, l.relation, r2.id as other, r2.title, l.note, l.evidence_span_id, case when l.from_record = $1 then 'out' else 'in' end as direction
         from public_record_links l join public_records r2 on r2.id = case when l.from_record = $1 then l.to_record else l.from_record end
        where l.from_record = $1 or l.to_record = $1`,
      [id],
    );
    const corrections = await q.query<{ kind: string; reason: string; created_at: Date }>(`select kind, reason, created_at from public_correction_notices where record_id = $1 order by created_at desc`, [id]);
    return { r, versions, spans, total: n, page, series, links, corrections };
  });
  if (!res.ok) return <SetupRequired />;
  if (!res.data) notFound();
  await recordUsage(focus ? 'evidence_open' : 'record_view', focus ?? id);
  const { r, versions, spans, total, page, series, links, corrections } = res.data;
  const pages = Math.ceil(total / PAGE);
  const flag = (b: unknown, label: string) => (
    <li className="flex items-center gap-2">
      <Badge tone={b ? 'ok' : 'neutral'}>{b ? 'Yes' : 'No'}</Badge> {label}
    </li>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <PageHeader title={String(r.title)}>
          <div className="flex gap-2 flex-wrap mt-3">
            <Badge tone="accent">{KIND_LABEL[String(r.content_kind)]}</Badge>
            <RightsBadge status={r.rights_status as string} />
            {r.archival === 'link_only' ? <Badge>Link-only reference (not archived)</Badge> : <Badge tone="ok">Archived snapshot</Badge>}
            {Boolean(r.india_specific) && <Badge>India</Badge>}
            {r.region ? <Badge>{REGION_LABEL[String(r.region)]}</Badge> : null}
          </div>
        </PageHeader>
        {corrections.map((c, i) => (
          <Notice key={i} tone="warn" title={`Correction event: ${c.kind.replace('_', ' ')} (${fmtDate(c.created_at)})`}>
            {c.reason}
          </Notice>
        ))}
        {r.description ? <p className="mb-4">{String(r.description)}</p> : null}
        {r.content_kind === 'photo' && r.media_url && r.allow_republish_media ? (
          <figure className="mb-4">
            <img src={String(r.media_url)} alt={String(r.title)} className="rounded-lg max-h-[480px] w-auto" />
            <figcaption className="text-sm muted mt-1">Credit: {String(r.credit ?? r.attribution ?? '')}</figcaption>
          </figure>
        ) : null}
        {r.content_kind === 'photo' && r.media_url && !r.allow_republish_media ? (
          <Notice tone="warn">
            This image is shown only on the source site: {String(r.rights_rationale)} <a href={String(r.canonical_url)}>View at source</a>.
          </Notice>
        ) : null}
        {r.content_kind === 'video' && r.media_url ? (
          <figure className="mb-4">
            <video controls preload="none" poster={r.thumbnail_url ? String(r.thumbnail_url) : undefined} className="w-full rounded-lg" src={String(r.media_url)}>
              <a href={String(r.canonical_url)}>Watch at NASA</a>
            </video>
            <figcaption className="text-sm muted mt-1">Streams from NASA servers. Credit: {String(r.credit ?? '')}</figcaption>
          </figure>
        ) : null}

        {series.length > 0 && (
          <section className="card p-4 mb-6">
            <h2 className="font-semibold">Numeric series</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {series.map((s) => (
                <li key={String(s.id)}>
                  <Link href={`/data-stories/explore?sv=${s.source_version_id}&series=${encodeURIComponent(String(s.series_key))}`}>{String(s.series_key)}</Link> —{' '}
                  {String(s.description)} ({String(s.units)}, {String(s.frequency)})
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="text-lg font-semibold">Evidence ({total} passages/rows/cues)</h2>
          {total === 0 && (
            <p className="text-sm muted mt-2">
              No stored text. {r.rights_status === 'link_only' ? 'Rights allow only a link to the official source.' : 'The rights for this item do not allow quoting its text.'}
            </p>
          )}
          <ol className="mt-3 space-y-3">
            {spans.map((s) => {
              const isFocus = s.id === focus;
              return (
                <li key={String(s.id)} id={`span-${s.id}`} className="card p-3 scroll-mt-20" style={isFocus ? { outline: '3px solid var(--accent)' } : undefined}>
                  <div className="text-xs muted flex gap-2 flex-wrap mb-1">
                    <span>{String(s.kind).replace('_', ' ')}</span>
                    {s.heading ? <span>· {String(s.heading)}</span> : null}
                    {s.page ? <span>· PDF page {String(s.page)} (physical)</span> : null}
                    {s.t_start_ms != null ? (
                      <span>
                        · {formatMs(Number(s.t_start_ms))}–{formatMs(Number(s.t_end_ms))}
                      </span>
                    ) : null}
                    {s.row_key ? <span>· row {String(s.row_key)}</span> : null}
                    {s.char_start != null ? (
                      <span>
                        · chars {String(s.char_start)}–{String(s.char_end)}
                      </span>
                    ) : null}
                    <span>· {String(s.extraction_method)}</span>
                  </div>
                  {s.kind === 'table_row' && Array.isArray(s.column_names) ? (
                    <div className="overflow-x-auto">
                      <table className="data">
                        <thead>
                          <tr>
                            {(s.column_names as string[]).map((c, i) => (
                              <th key={i}>{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {splitRow(String(s.text), (s.column_names as string[]).length).map((c, i) => (
                              <td key={i}>{c}</td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{isFocus ? <mark className="evidence">{String(s.text)}</mark> : String(s.text)}</p>
                  )}
                </li>
              );
            })}
          </ol>
          {pages > 1 && (
            <nav className="flex gap-2 mt-4 flex-wrap" aria-label="Evidence pages">
              {Array.from({ length: pages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 3)
                .map((p) => (
                  <Link key={p} href={`/records/${id}?page=${p}`} className={`btn text-sm ${p === page ? 'btn-primary' : 'btn-secondary'}`}>
                    {p}
                  </Link>
                ))}
            </nav>
          )}
        </section>
      </div>

      <aside className="space-y-4">
        <section className="card p-4 text-sm space-y-2">
          <h2 className="font-semibold text-base">Source</h2>
          <p>
            <strong>Provider:</strong> {String(r.source_name)}
          </p>
          <p className="break-all">
            <strong>Original:</strong> <a href={String(r.canonical_url)}>{String(r.canonical_url)}</a>
          </p>
          {r.doi ? (
            <p>
              <strong>DOI:</strong> <a href={`https://doi.org/${r.doi}`}>{String(r.doi)}</a>
            </p>
          ) : null}
          <p>
            <strong>Identifier:</strong> <span className="break-all">{String(r.external_id)}</span>
          </p>
          <p>
            <strong>Published/updated at source:</strong> {fmtDate(r.source_published_at as string)}
          </p>
          {r.time_start ? (
            <p>
              <strong>Observation/event time:</strong> {fmtDate(r.time_start as string)}
              {r.time_end ? ` to ${fmtDate(r.time_end as string)}` : ''}
            </p>
          ) : null}
          {r.place_name ? (
            <p>
              <strong>Place:</strong> {String(r.place_name)}
              {r.lat != null ? ` (${Number(r.lat).toFixed(3)}, ${Number(r.lon).toFixed(3)})` : ''}
            </p>
          ) : null}
          {r.credit ? (
            <p>
              <strong>Credit:</strong> {String(r.credit)}
            </p>
          ) : null}
        </section>
        <section className="card p-4 text-sm space-y-2">
          <h2 className="font-semibold text-base">Rights and permitted uses</h2>
          <p>
            <strong>Licence/terms:</strong> {String(r.license ?? 'none recorded')}
          </p>
          {r.attribution ? (
            <p>
              <strong>Attribution:</strong> {String(r.attribution)}
            </p>
          ) : null}
          <ul className="space-y-1">
            {flag(r.allow_index_text, 'Index text for search')}
            {flag(r.allow_quote, 'Quote with attribution')}
            {flag(r.allow_ai_processing, 'Send to an AI provider')}
            {flag(r.allow_transform, 'Derive charts / adaptations')}
            {flag(r.allow_republish_media, 'Republish media in outreach')}
            {flag(r.allow_offline, 'Include in offline packs')}
            {flag(r.allow_download, 'Download original from here')}
          </ul>
          <p className="muted">{String(r.rights_rationale)}</p>
          <p className="muted">
            Decided {fmtDate(r.rights_decided_at as string)}
            {r.policy_url ? (
              <>
                {' '}
                · <a href={String(r.policy_url)}>policy</a>
              </>
            ) : null}
          </p>
        </section>
        <section className="card p-4 text-sm">
          <h2 className="font-semibold text-base">Versions</h2>
          <ul className="mt-2 space-y-2">
            {versions.map((v) => (
              <li key={String(v.id)}>
                <Badge tone={v.status === 'active' ? 'ok' : v.status === 'withdrawn' ? 'error' : 'warn'}>{String(v.status)}</Badge> {String(v.version_label ?? '')}
                <br />
                <span className="muted">
                  Retrieved {fmtDate(v.retrieved_at as string, true)}
                  {v.content_hash ? ` · sha256 ${String(v.content_hash).slice(0, 12)}…` : ''}
                </span>
                {v.status_reason ? <p className="muted">{String(v.status_reason)}</p> : null}
                {v.downloadable ? (
                  <p>
                    <a href={`/api/originals/${v.id}`}>Download original</a>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
        {links.length > 0 && (
          <section className="card p-4 text-sm">
            <h2 className="font-semibold text-base">Verified relationships</h2>
            <ul className="mt-2 space-y-2">
              {links.map((l) => (
                <li key={l.id}>
                  {l.direction === 'out' ? l.relation.replace('_', ' ') : `is ${l.relation.replace('_', ' ')} target of`} →{' '}
                  <Link href={`/records/${l.other}`}>{l.title}</Link>
                  {l.note ? <span className="muted"> — {l.note}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

function splitRow(text: string, n: number): string[] {
  const cells = text.includes('\t') ? text.split('\t') : text.split(',').map((c) => c.trim());
  if (cells.length === n) return cells;
  // quoted CSV fields (e.g. "NSIDC-0051,NSIDC-0081")
  const m = text.match(/("[^"]*"|[^,]+)/g) || [];
  return m.map((c) => c.trim().replace(/^"|"$/g, ''));
}
