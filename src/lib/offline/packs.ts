// Offline evidence packs (F9). A pack is an explicit, versioned manifest of
// public items whose rights allow offline copies. Restricted, link-only or
// people-identifiable material is excluded at build time. The exhibit is a
// self-contained HTML page (no app JavaScript needed) plus same-origin images.
import type { Queryable } from '../db/core';
import { saveCalculation } from '../calc/compute';

export const PACK_BYTE_LIMIT = 5 * 1024 * 1024;

export interface PackItem {
  recordId: string;
  sourceVersionId: string;
  kind: string;
  title: string;
  credit: string | null;
  license: string | null;
  canonicalUrl: string;
  retrievedAt: string | null;
  text: string | null; // evidence excerpt(s)
  imagePath: string | null; // same-origin media proxy path
}

export interface PackManifest {
  slug: string;
  title: string;
  packVersion: number;
  generatedAt: string;
  sourceVersionIds: string[];
  items: PackItem[];
  chart: { calcId: string; title: string; units: string; points: { t: string; v: number | null }[]; citation: string | null } | null;
  urls: string[]; // URLs the service worker caches
  excluded: { title: string; reason: string }[];
  notice: string;
}

export const MUSEUM_SLUG = 'india-in-antarctica';

/** Build (or rebuild) the "India in Antarctica" compact exhibit from the catalog. */
export async function buildMuseumPack(q: Queryable): Promise<PackManifest> {
  const candidates = await q.query<{
    id: string; title: string; content_kind: string; credit: string | null; license: string | null; canonical_url: string; allow_offline: boolean;
    people_identifiable: boolean; status: string; thumbnail_url: string | null; sv_id: string | null; retrieved_at: Date | null; source_id: string;
  }>(
    `select r.id, r.title, r.content_kind, r.credit, cr.license, r.canonical_url, cr.allow_offline, cr.people_identifiable, cr.status,
            r.thumbnail_url, v.id as sv_id, v.retrieved_at, r.source_id
       from records r join current_rights cr on cr.record_id = r.id
       left join lateral (select id, retrieved_at from source_versions where record_id = r.id and status = 'active' order by created_at desc limit 1) v on true
      where r.india_specific and r.visibility = 'public' and r.catalog_status = 'approved'
        and (r.source_id in ('wikimedia-commons', 'wikipedia') or r.canonical_url like 'https://ncpor.res.in/%')
      order by r.content_kind, r.title`,
  );
  const items: PackItem[] = [];
  const excluded: PackManifest['excluded'] = [];
  for (const c of candidates) {
    if (!c.sv_id) continue;
    if (!c.allow_offline) {
      excluded.push({ title: c.title, reason: c.people_identifiable ? 'shows identifiable people' : c.status === 'link_only' ? 'link-only rights (official link kept online only)' : 'rights do not allow offline copies' });
      continue;
    }
    let text: string | null = null;
    if (c.source_id === 'wikipedia') {
      const spans = await q.query<{ text: string }>(`select text from evidence_spans where source_version_id = $1 order by ordinal limit 2`, [c.sv_id]);
      text = spans.map((s) => s.text).join('\n\n') || null;
    } else {
      const [s] = await q.query<{ text: string }>(`select text from evidence_spans where source_version_id = $1 and kind = 'metadata' order by ordinal limit 1`, [c.sv_id]);
      text = s?.text ?? null;
    }
    items.push({
      recordId: c.id, sourceVersionId: c.sv_id, kind: c.content_kind, title: c.title, credit: c.credit, license: c.license, canonicalUrl: c.canonical_url,
      retrievedAt: c.retrieved_at ? new Date(c.retrieved_at).toISOString() : null, text, imagePath: c.thumbnail_url && c.content_kind !== 'publication' ? `/api/media/${c.id}` : null,
    });
  }
  // A small dataset investigation: Antarctic February (minimum) extent.
  let chart: PackManifest['chart'] = null;
  const [s] = await q.query<{ source_version_id: string }>(
    `select ds.source_version_id from dataset_series ds join source_versions v on v.id = ds.source_version_id join current_rights cr on cr.record_id = v.record_id
      where ds.series_key = 'S-monthly-extent' and v.status = 'active' and cr.allow_offline limit 1`,
  );
  if (s) {
    const run = await saveCalculation(q, { seriesKey: 'S-monthly-extent', sourceVersionId: s.source_version_id, month: 2, periodStart: '1979-01-01', periodEnd: '2100-12-31', stats: ['mean', 'min', 'max'] }, null);
    chart = { calcId: run.id, title: 'Antarctic sea-ice extent in February (the usual annual minimum), NSIDC Sea Ice Index v4', units: run.result.series.units, points: run.result.rows.map((r) => ({ t: r.rowKey, v: r.included ? r.value : null })), citation: run.result.source.citation };
  }
  const [prev] = await q.query<{ pack_version: number; manifest: PackManifest }>(`select pack_version, manifest from offline_packs where slug = $1`, [MUSEUM_SLUG]);
  const sourceVersionIds = [...new Set([...items.map((i) => i.sourceVersionId), ...(s ? [s.source_version_id] : [])])];
  const sameContent = prev && JSON.stringify(prev.manifest.sourceVersionIds) === JSON.stringify(sourceVersionIds) && prev.manifest.items.length === items.length;
  const packVersion = prev ? (sameContent ? prev.pack_version : prev.pack_version + 1) : 1;
  const manifest: PackManifest = {
    slug: MUSEUM_SLUG,
    title: 'Pocket Polar Museum: India in Antarctica',
    packVersion,
    generatedAt: new Date().toISOString(),
    sourceVersionIds,
    items,
    chart,
    urls: [`/offline/${MUSEUM_SLUG}/exhibit?v=${packVersion}`, `/api/packs/${MUSEUM_SLUG}?v=${packVersion}`, ...items.filter((i) => i.imagePath).map((i) => i.imagePath!)],
    excluded,
    notice: 'A compact 2D exhibit built from catalog records. It is not a virtual tour or a digital twin. Images and text keep their original credits and licences.',
  };
  const bytes = Buffer.byteLength(JSON.stringify(manifest));
  await q.query(
    `insert into offline_packs (slug, title, description, manifest, byte_count, pack_version, generated_at, status)
     values ($1, $2, $3, $4::jsonb, $5, $6, now(), 'active')
     on conflict (slug) do update set manifest = excluded.manifest, byte_count = excluded.byte_count, pack_version = excluded.pack_version,
       generated_at = excluded.generated_at, status = 'active', title = excluded.title, description = excluded.description`,
    [MUSEUM_SLUG, manifest.title, 'Indian polar stations and expeditions: credited photographs, encyclopedia excerpts and a sea-ice data investigation.', JSON.stringify(manifest), bytes, packVersion],
  );
  return manifest;
}

/** What changed since a device saved a pack (used on reconnect). */
export async function packChangesSince(q: Queryable, slug: string, version: number, sourceVersionIds: string[]) {
  const [p] = await q.query<{ pack_version: number; status: string; generated_at: Date }>(`select pack_version, status, generated_at from public_offline_packs where slug = $1`, [slug]);
  const changed = sourceVersionIds.length
    ? await q.query<{ id: string; status: string; status_reason: string | null; status_changed_at: Date | null; record_id: string }>(
        `select id, status, status_reason, status_changed_at, record_id from public_source_versions where id = any($1::uuid[]) and status <> 'active'`,
        [sourceVersionIds],
      )
    : [];
  const missing = sourceVersionIds.length
    ? sourceVersionIds.length - (await q.query<{ n: number }>(`select count(*)::int n from public_source_versions where id = any($1::uuid[])`, [sourceVersionIds]))[0].n
    : 0;
  return {
    currentVersion: p?.pack_version ?? null,
    packStatus: p?.status ?? 'missing',
    newerVersion: p ? p.pack_version > version : false,
    corrections: changed.map((c) => ({ sourceVersionId: c.id, recordId: c.record_id, status: c.status, reason: c.status_reason, at: c.status_changed_at ? new Date(c.status_changed_at).toISOString() : null })),
    removedFromPublic: missing,
  };
}
