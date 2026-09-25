// Applies curated items to the database idempotently. Re-running creates no
// duplicates: records upsert on (source_id, external_id); a source version is
// created only when its content hash is new; a rights decision is appended only
// when it differs from the current one.
import type { Queryable } from '../db/core';
import type { CuratedItem } from './curation';
import { SOURCES } from './curation';
import { runExtraction } from './extract';
import { readSnapshot, sha256 } from './snapshot';
import { classifyDatasetChange } from '../corrections/diff';

export interface ApplyItemReport {
  externalId: string;
  title: string;
  kind: string;
  recordId: string;
  created: boolean;
  newVersion: boolean;
  rightsChanged: boolean;
  spans: number;
  observations: number;
  warnings: string[];
  error?: string;
}

export async function ensureSources(q: Queryable) {
  for (const s of SOURCES) {
    await q.query(
      `insert into sources (id, name, homepage, terms_url) values ($1, $2, $3, $4)
       on conflict (id) do update set name = excluded.name, homepage = excluded.homepage, terms_url = excluded.terms_url`,
      [s.id, s.name, s.homepage, s.terms_url],
    );
  }
}

const RIGHTS_FIELDS = [
  'status', 'license', 'attribution', 'policy_url', 'metadata_public', 'allow_store_original', 'allow_download',
  'allow_index_text', 'allow_quote', 'allow_ai_processing', 'allow_transform', 'allow_republish_media', 'allow_offline',
  'people_identifiable', 'rationale',
] as const;

export async function applyItem(q: Queryable, it: CuratedItem, decidedBy: string): Promise<ApplyItemReport> {
  const rep: ApplyItemReport = { externalId: it.externalId, title: it.title, kind: it.contentKind, recordId: '', created: false, newVersion: false, rightsChanged: false, spans: 0, observations: 0, warnings: [] };

  // Dedupe by DOI (publications) before inserting a new provider/external-id pair.
  const dupe = it.doi && it.contentKind === 'publication'
    ? await q.query<{ id: string; source_id: string; external_id: string }>(`select id, source_id, external_id from records where lower(doi) = lower($1) and content_kind = 'publication' and not (source_id = $2 and external_id = $3)`, [it.doi, it.sourceId, it.externalId])
    : [];
  if (dupe.length) {
    rep.recordId = dupe[0].id;
    rep.warnings.push(`Duplicate of existing record ${dupe[0].source_id}:${dupe[0].external_id} (same DOI); skipped.`);
    return rep;
  }

  const [rec] = await q.query<{ id: string; inserted: boolean }>(
    `insert into records (content_kind, title, description, source_id, external_id, doi, canonical_url, region, place_name, lat, lon,
       time_start, time_end, source_published_at, india_specific, tags, archival, visibility, catalog_status, thumbnail_url, media_url, credit)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'public','approved',$18,$19,$20)
     on conflict (source_id, external_id) do update set
       content_kind = excluded.content_kind, title = excluded.title, description = excluded.description, doi = excluded.doi,
       canonical_url = excluded.canonical_url, region = excluded.region, place_name = excluded.place_name, lat = excluded.lat,
       lon = excluded.lon, time_start = excluded.time_start, time_end = excluded.time_end,
       source_published_at = excluded.source_published_at, india_specific = excluded.india_specific, tags = excluded.tags,
       archival = excluded.archival, thumbnail_url = excluded.thumbnail_url, media_url = excluded.media_url,
       credit = excluded.credit, updated_at = now()
     returning id, (xmax = 0) as inserted`,
    [
      it.contentKind, it.title, it.description, it.sourceId, it.externalId, it.doi, it.canonicalUrl, it.region, it.placeName, it.lat, it.lon,
      it.timeStart, it.timeEnd, it.sourcePublishedAt, it.indiaSpecific, it.tags, it.archival, it.thumbnailUrl, it.mediaUrl, it.credit,
    ],
  );
  rep.recordId = rec.id;
  rep.created = rec.inserted;

  // Rights: append a decision only when something changed.
  const r = it.rights;
  const next: Record<(typeof RIGHTS_FIELDS)[number], unknown> = {
    status: r.status, license: r.license, attribution: r.attribution, policy_url: r.policyUrl, metadata_public: r.metadataPublic,
    allow_store_original: r.allowStoreOriginal, allow_download: r.allowDownload, allow_index_text: r.allowIndexText,
    allow_quote: r.allowQuote, allow_ai_processing: r.allowAiProcessing, allow_transform: r.allowTransform,
    allow_republish_media: r.allowRepublishMedia, allow_offline: r.allowOffline, people_identifiable: r.peopleIdentifiable,
    rationale: r.rationale,
  };
  const [cur] = await q.query<Record<string, unknown>>(`select * from current_rights where record_id = $1`, [rec.id]);
  if (!cur || RIGHTS_FIELDS.some((f) => (cur[f] ?? null) !== (next[f] ?? null))) {
    await q.query(
      `insert into rights_decisions (record_id, ${RIGHTS_FIELDS.join(', ')}, decided_by, review_due)
       values ($1, ${RIGHTS_FIELDS.map((_, i) => `$${i + 2}`).join(', ')}, $${RIGHTS_FIELDS.length + 2}, $${RIGHTS_FIELDS.length + 3})`,
      [rec.id, ...RIGHTS_FIELDS.map((f) => next[f]), decidedBy, r.reviewDue],
    );
    rep.rightsChanged = true;
  }

  // Source version: new only when content hash is new.
  const v = it.version;
  const existing = await q.query<{ id: string; status: string }>(
    `select id, status from source_versions where record_id = $1 and content_hash is not distinct from $2`,
    [rec.id, v.contentHash],
  );
  if (existing.length) return rep;

  let blobSha: string | null = null;
  if (v.storeBytesFrom && r.allowStoreOriginal) {
    const bytes = readSnapshot(v.storeBytesFrom);
    if (bytes.length <= 6 * 1024 * 1024) {
      blobSha = sha256(bytes);
      await q.query(`insert into blobs (sha256, bytes, mime, byte_size) values ($1, $2, $3, $4) on conflict (sha256) do nothing`, [
        blobSha, bytes, v.mime || 'application/octet-stream', bytes.length,
      ]);
    } else rep.warnings.push(`Original (${bytes.length} bytes) exceeds the 6 MB blob limit; not stored.`);
  }
  const [prev] = await q.query<{ id: string }>(
    `select id from source_versions where record_id = $1 and status in ('active', 'under_review') order by created_at desc limit 1`,
    [rec.id],
  );
  const [sv] = await q.query<{ id: string }>(
    `insert into source_versions (record_id, version_label, content_hash, blob_sha256, mime, byte_size, retrieval_url, snapshot_path,
       retrieved_at, source_published_at, supersedes_id, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active') returning id`,
    [rec.id, v.label, v.contentHash, blobSha, v.mime, blobSha ? readSnapshot(v.storeBytesFrom!).length : null, v.retrievalUrl, v.snapshotPath,
      v.retrievedAt, it.sourcePublishedAt, prev?.id ?? null],
  );
  rep.newVersion = true;

  // Extraction is gated by rights: no text indexing unless allowed; metadata is always allowed.
  for (const ex of it.extraction) {
    if (ex.type !== 'metadata' && ex.type !== 'nsidc-monthly' && ex.type !== 'pangaea-tab' && !r.allowIndexText) {
      rep.warnings.push(`Text extraction (${ex.type}) skipped: rights do not allow indexing text.`);
      continue;
    }
    if ((ex.type === 'nsidc-monthly' || ex.type === 'pangaea-tab') && !r.allowTransform) {
      rep.warnings.push('Numeric import skipped: rights do not allow derived calculations.');
      continue;
    }
    const res = await runExtraction(ex);
    rep.warnings.push(...res.warnings);
    let ordinal = rep.spans;
    // Batched inserts keep remote imports fast (one round trip per 100 spans).
    for (let i = 0; i < res.spans.length; i += 100) {
      const batch = res.spans.slice(i, i + 100);
      const params: unknown[] = [];
      const values = batch.map((s, j) => {
        params.push(sv.id, s.kind, ordinal++, s.page ?? null, s.charStart ?? null, s.charEnd ?? null, s.heading ?? null, s.rowKey ?? null, s.columnNames ?? null, s.tStartMs ?? null, s.tEndMs ?? null, s.text, s.method);
        const b = j * 13;
        return `(${Array.from({ length: 13 }, (_, k) => `$${b + k + 1}${k === 8 ? '::text[]' : ''}`).join(',')})`;
      });
      await q.query(
        `insert into evidence_spans (source_version_id, kind, ordinal, page, char_start, char_end, heading, row_key, column_names, t_start_ms, t_end_ms, text, extraction_method) values ${values.join(',')}`,
        params,
      );
    }
    rep.spans = ordinal;
    for (const se of res.series) {
      const [ds] = await q.query<{ id: string }>(
        `insert into dataset_series (source_version_id, series_key, variable, region, units, frequency, description)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [sv.id, se.seriesKey, se.variable, se.region, se.units, se.frequency, se.description],
      );
      // Batch insert observations.
      for (let i = 0; i < se.observations.length; i += 200) {
        const batch = se.observations.slice(i, i + 200);
        const params: unknown[] = [];
        const values = batch.map((o, j) => {
          params.push(ds.id, o.obsTime, o.value, o.rawValue, o.flag, o.rowKey, o.lat ?? null, o.lon ?? null, o.extra ? JSON.stringify(o.extra) : null);
          const b = j * 9;
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9}::jsonb)`;
        });
        await q.query(`insert into observations (series_id, obs_time, value, raw_value, flag, row_key, lat, lon, extra) values ${values.join(',')}`, params);
      }
      rep.observations += se.observations.length;
    }
  }

  // A new version of an existing record: classify the change and hand over to correction review.
  if (prev) {
    const change = await classifyDatasetChange(q, prev.id, sv.id);
    await q.query(`update source_versions set status = 'under_review', status_reason = $2, status_changed_at = now() where id = $1`, [
      sv.id, `New upstream version (${change.kind}); awaiting curator review before it replaces the active version.`,
    ]);
    await q.query(`update source_versions set status = 'active' where id = $1`, [prev.id]);
    rep.warnings.push(`New upstream version detected (${change.kind}: ${change.summary}); queued for curator review.`);
  }
  return rep;
}
