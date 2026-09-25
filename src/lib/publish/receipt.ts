// Public evidence receipt data, read only through the public_* views.
import type { Queryable } from '../db/core';
import type { VersionBody } from '../studio/service';

export interface Receipt {
  version: {
    id: string; artifactId: string; slug: string; kind: string; language: string; audience: string; versionNo: number; title: string;
    body: VersionBody | null; bodyHash: string; languageReview: string; generationMethod: string; invariantOk: boolean;
    publicationId: string; publicationStatus: string; publishedAt: string; correctionNotice: string | null;
  };
  claims: {
    id: string; key: string; text: string; assessment: string; origin: string; caveats: string[];
    evidence: { spanId: string; recordId: string; text: string | null; kind: string; page: number | null; rowKey: string | null; tStartMs: number | null; quoteValid: boolean; versionStatus: string }[];
    calcIds: string[];
  }[];
  reviews: { kind: string; decision: string; independent: boolean; reviewer: string; at: string }[];
  sources: { recordId: string; title: string; sourceName: string; canonicalUrl: string; license: string | null; attribution: string | null; retrievedAt: string | null; versionStatus: string; role: string }[];
  variants: { slug: string; language: string; audience: string; title: string }[];
}

export async function loadReceipt(q: Queryable, by: { publicationId?: string; slug?: string }): Promise<Receipt | null> {
  const [v] = by.publicationId
    ? await q.query<Record<string, unknown>>(`select * from public_artifact_versions where publication_id = $1`, [by.publicationId])
    : await q.query<Record<string, unknown>>(`select * from public_artifact_versions where slug = $1 order by version_no desc limit 1`, [by.slug]);
  if (!v) return null;
  const vid = String(v.id);
  const claimRows = await q.query<{ id: string; claim_key: string; text: string; assessment: string; assessment_origin: string; caveats: string[] }>(
    `select id, claim_key, text, assessment, assessment_origin, caveats from public_claims where artifact_version_id = $1 order by position`,
    [vid],
  );
  const ev = await q.query<{ claim_id: string; evidence_span_id: string; record_id: string; span_text: string | null; span_kind: string; page: number | null; row_key: string | null; t_start_ms: number | null; quote_valid: boolean; version_status: string }>(
    `select claim_id, evidence_span_id, record_id, span_text, span_kind, page, row_key, t_start_ms, quote_valid, version_status from public_claim_evidence where claim_id = any($1::uuid[])`,
    [claimRows.map((c) => c.id)],
  );
  const calcs = await q.query<{ claim_id: string; calculation_run_id: string }>(`select claim_id, calculation_run_id from public_claim_calculations where claim_id = any($1::uuid[])`, [claimRows.map((c) => c.id)]);
  const reviews = await q.query<{ kind: string; decision: string; independent: boolean; reviewer_name: string; created_at: Date }>(
    `select kind, decision, independent, reviewer_name, created_at from public_reviews where artifact_version_id = $1 order by created_at`,
    [vid],
  );
  const sources = await q.query<{ record_id: string; title: string; source_name: string; canonical_url: string; license: string | null; attribution: string | null; retrieved_at: Date | null; version_status: string; role: string }>(
    `select s.record_id, r.title, r.source_name, r.canonical_url, r.license, r.attribution, sv.retrieved_at, s.version_status, s.role
       from public_artifact_sources s join public_records r on r.id = s.record_id left join public_source_versions sv on sv.id = s.source_version_id
      where s.artifact_version_id = $1`,
    [vid],
  );
  const variants = await q.query<{ slug: string; language: string; audience: string; title: string }>(
    `select distinct on (slug) slug, language, audience, title from public_artifact_versions
      where (variant_of = $1 or artifact_id = $1 or artifact_id = $2 or variant_of = $2) and slug <> $3 order by slug, version_no desc`,
    [v.variant_of ?? v.artifact_id, v.artifact_id, v.slug],
  );
  const report = v.invariant_report as { ok?: boolean } | null;
  return {
    version: {
      id: vid, artifactId: String(v.artifact_id), slug: String(v.slug), kind: String(v.kind), language: String(v.language), audience: String(v.audience), versionNo: Number(v.version_no),
      title: String(v.title), body: (v.body as VersionBody) ?? null, bodyHash: String(v.body_hash), languageReview: String(v.language_review), generationMethod: String(v.generation_method),
      invariantOk: !!report?.ok, publicationId: String(v.publication_id), publicationStatus: String(v.publication_status), publishedAt: new Date(v.published_at as string).toISOString(),
      correctionNotice: (v.correction_notice as string) ?? null,
    },
    claims: claimRows.map((c) => ({
      id: c.id, key: c.claim_key, text: c.text, assessment: c.assessment, origin: c.assessment_origin, caveats: c.caveats,
      evidence: ev.filter((e) => e.claim_id === c.id).map((e) => ({ spanId: e.evidence_span_id, recordId: e.record_id, text: e.span_text, kind: e.span_kind, page: e.page, rowKey: e.row_key, tStartMs: e.t_start_ms, quoteValid: e.quote_valid, versionStatus: e.version_status })),
      calcIds: calcs.filter((x) => x.claim_id === c.id).map((x) => x.calculation_run_id),
    })),
    reviews: reviews.map((r) => ({ kind: r.kind, decision: r.decision, independent: r.independent, reviewer: r.reviewer_name, at: new Date(r.created_at).toISOString() })),
    sources: sources.map((s) => ({ recordId: s.record_id, title: s.title, sourceName: s.source_name, canonicalUrl: s.canonical_url, license: s.license, attribution: s.attribution, retrievedAt: s.retrieved_at ? new Date(s.retrieved_at).toISOString() : null, versionStatus: s.version_status, role: s.role })),
    variants,
  };
}
