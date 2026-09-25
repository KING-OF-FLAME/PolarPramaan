// Lexical evidence retrieval over PostgreSQL full-text search. Public callers
// must pass a pp_public connection (db.asPublic), which can only read the
// public_* views, so restricted spans cannot leak into results, counts or snippets.
import type { Queryable } from '../db/core';

export interface SpanHit {
  spanId: string;
  recordId: string;
  sourceVersionId: string;
  recordTitle: string;
  contentKind: string;
  sourceName: string;
  canonicalUrl: string;
  kind: string;
  heading: string | null;
  text: string;
  page: number | null;
  rowKey: string | null;
  columnNames: string[] | null;
  tStartMs: number | null;
  tEndMs: number | null;
  rank: number;
  coverage: number; // fraction of distinct query lexemes present in this span
  license: string | null;
  attribution: string | null;
  allowAi: boolean;
  retrievedAt: string | null;
}

const STOP = new Set(
  'a an and are as at be been but by can did do does for from had has have how i if in into is it its of on or over than that the their them there these they this to was were what when where which who why will with would about after before between during more most much many some very your you our we us per year years'.split(' '),
);

export function contentTerms(question: string): string[] {
  return [...new Set(question.toLowerCase().normalize('NFKC').match(/[a-z0-9ऀ-ॿ]+(?:[-'][a-z]+)?/g) || [])].filter((t) => t.length > 1 && !STOP.has(t));
}

export async function searchSpans(q: Queryable, question: string, opts: { limit?: number; publicOnly: boolean; kinds?: string[] }): Promise<SpanHit[]> {
  const terms = contentTerms(question).slice(0, 16);
  if (!terms.length) return [];
  const limit = Math.min(opts.limit ?? 12, 50);
  // OR-query over content terms, ranked by cover density; coverage computed per span.
  const tsq = terms.map((t) => t.replace(/[^a-z0-9ऀ-ॿ]/g, '')).filter(Boolean).join(' | ');
  const common = `
       ts_rank_cd(e.tsv, query.tq, 32) as rank,
       (select count(*) from lexemes where e.tsv @@ to_tsquery('simple', lexemes.lx))::float / greatest((select count(*) from lexemes), 1) as coverage`;
  const sql = opts.publicOnly
    ? `with query as (select to_tsquery('english', $1) as tq),
            lexemes as (select distinct unnest(tsvector_to_array(to_tsvector('english', $2))) as lx)
       select e.id as span_id, e.record_id, e.source_version_id, r.title as record_title, r.content_kind, r.source_name, r.canonical_url,
              e.kind, e.heading, e.text, e.page, e.row_key, e.column_names, e.t_start_ms, e.t_end_ms, ${common},
              r.license, r.attribution, r.allow_ai_processing, v.retrieved_at
         from public_evidence_spans e cross join query
         join public_source_versions v on v.id = e.source_version_id
         join public_records r on r.id = e.record_id
        where e.tsv @@ query.tq ${opts.kinds?.length ? 'and e.kind = any($4)' : ''}
        order by coverage desc, rank desc, e.id
        limit $3`
    : `with query as (select to_tsquery('english', $1) as tq),
            lexemes as (select distinct unnest(tsvector_to_array(to_tsvector('english', $2))) as lx)
       select e.id as span_id, v.record_id, e.source_version_id, r.title as record_title, r.content_kind, s.name as source_name, r.canonical_url,
              e.kind, e.heading, e.text, e.page, e.row_key, e.column_names, e.t_start_ms, e.t_end_ms, ${common},
              cr.license, cr.attribution, coalesce(cr.allow_ai_processing, false) as allow_ai_processing, v.retrieved_at
         from evidence_spans e cross join query
         join source_versions v on v.id = e.source_version_id
         join records r on r.id = v.record_id
         join sources s on s.id = r.source_id
         left join current_rights cr on cr.record_id = r.id
        where e.tsv @@ query.tq and v.status = 'active' and r.catalog_status <> 'withdrawn'
              ${opts.kinds?.length ? 'and e.kind = any($4)' : ''}
        order by coverage desc, rank desc, e.id
        limit $3`;
  const rows = await q.query<Record<string, unknown>>(sql, opts.kinds?.length ? [tsq, terms.join(' '), limit, opts.kinds] : [tsq, terms.join(' '), limit]);
  return rows.map((r) => ({
    spanId: String(r.span_id),
    recordId: String(r.record_id),
    sourceVersionId: String(r.source_version_id),
    recordTitle: String(r.record_title),
    contentKind: String(r.content_kind),
    sourceName: String(r.source_name),
    canonicalUrl: String(r.canonical_url),
    kind: String(r.kind),
    heading: (r.heading as string) ?? null,
    text: String(r.text),
    page: (r.page as number) ?? null,
    rowKey: (r.row_key as string) ?? null,
    columnNames: (r.column_names as string[]) ?? null,
    tStartMs: (r.t_start_ms as number) ?? null,
    tEndMs: (r.t_end_ms as number) ?? null,
    rank: Number(r.rank),
    coverage: Number(r.coverage),
    license: (r.license as string) ?? null,
    attribution: (r.attribution as string) ?? null,
    allowAi: Boolean(r.allow_ai_processing),
    retrievedAt: r.retrieved_at ? new Date(r.retrieved_at as string).toISOString() : null,
  }));
}

export async function searchRecords(q: Queryable, text: string, opts: { limit?: number; kind?: string | null; region?: string | null; india?: boolean }) {
  const terms = contentTerms(text);
  const tsq = terms.map((t) => t.replace(/[^a-z0-9ऀ-ॿ]/g, '')).filter(Boolean).join(' & ');
  return q.query<Record<string, unknown>>(
    `select r.id, r.content_kind, r.title, r.description, r.source_name, r.region, r.place_name, r.time_start::text as time_start,
            r.india_specific, r.archival, r.thumbnail_url, r.rights_status, r.license, r.credit, r.source_published_at
       from public_records r
      where ($1 = '' or to_tsvector('english', r.title || ' ' || coalesce(r.description, '') || ' ' || array_to_string(r.tags, ' ')) @@ to_tsquery('english', $1)
             or exists (select 1 from public_evidence_spans e where e.record_id = r.id and e.tsv @@ to_tsquery('english', $1)))
        and ($2::text is null or r.content_kind = $2)
        and ($3::text is null or r.region = $3)
        and (not $4 or r.india_specific)
      order by r.india_specific desc, r.content_kind, r.title
      limit $5`,
    [tsq, opts.kind ?? null, opts.region ?? null, !!opts.india, Math.min(opts.limit ?? 60, 200)],
  );
}
