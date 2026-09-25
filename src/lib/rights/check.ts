// Server-side rights enforcement (F4). Every generation, export, offline pack
// and AI call asks these functions; the UI only displays their verdicts.
import type { Queryable } from '../db/core';

export type Operation = 'index' | 'quote' | 'ai' | 'transform' | 'republish_media' | 'offline' | 'download' | 'store';

const FIELD: Record<Operation, string> = {
  index: 'allow_index_text',
  quote: 'allow_quote',
  ai: 'allow_ai_processing',
  transform: 'allow_transform',
  republish_media: 'allow_republish_media',
  offline: 'allow_offline',
  download: 'allow_download',
  store: 'allow_store_original',
};

const LABEL: Record<Operation, string> = {
  index: 'index its text for search',
  quote: 'quote it',
  ai: 'send it to an AI provider',
  transform: 'adapt or derive from it',
  republish_media: 'republish this media in outreach material',
  offline: 'include it in an offline pack',
  download: 'offer the original file for download',
  store: 'store a copy of the original',
};

export interface RightsRow {
  record_id: string;
  title: string;
  status: string;
  license: string | null;
  attribution: string | null;
  policy_url: string | null;
  rationale: string;
  people_identifiable: boolean;
  catalog_status: string;
  visibility: string;
  canonical_url: string;
  [k: string]: unknown;
}

export interface Verdict {
  recordId: string;
  title: string;
  operation: Operation;
  allowed: boolean;
  reason: string;
  policyUrl: string | null;
  officialUrl: string;
}

export async function rightsFor(q: Queryable, recordIds: string[]): Promise<Map<string, RightsRow>> {
  if (!recordIds.length) return new Map();
  const rows = await q.query<RightsRow>(
    `select cr.*, r.title, r.catalog_status, r.visibility, r.canonical_url
       from records r left join current_rights cr on cr.record_id = r.id where r.id = any($1::uuid[])`,
    [recordIds],
  );
  return new Map(rows.map((r) => [r.record_id ?? '', r]));
}

export function verdict(row: RightsRow | undefined, recordId: string, op: Operation): Verdict {
  if (!row || !row.status) {
    return { recordId, title: row?.title ?? recordId, operation: op, allowed: false, reason: 'No rights decision is recorded for this item, so it is treated as link-only.', policyUrl: null, officialUrl: row?.canonical_url ?? '' };
  }
  if (row.catalog_status === 'withdrawn') {
    return { recordId, title: row.title, operation: op, allowed: false, reason: 'This record has been withdrawn from the catalog.', policyUrl: row.policy_url, officialUrl: row.canonical_url };
  }
  const allowed = Boolean(row[FIELD[op]]);
  let reason: string;
  if (allowed) reason = `Allowed: ${row.license ?? row.status}${row.attribution ? `. Credit: ${row.attribution}` : ''}.`;
  else if (op === 'republish_media' && row.people_identifiable) reason = 'Blocked: the image shows identifiable people, and consent or publicity rights have not been reviewed.';
  else if (row.status === 'link_only') reason = `Blocked: this is a link-only record. Rights allow only listing the title and link, not permission to ${LABEL[op]}. Use the official source.`;
  else reason = `Blocked: the recorded rights (${row.license ?? row.status}) do not allow us to ${LABEL[op]}.`;
  return { recordId, title: row.title, operation: op, allowed, reason, policyUrl: row.policy_url, officialUrl: row.canonical_url };
}

export async function checkUses(q: Queryable, uses: { recordId: string; op: Operation }[]): Promise<Verdict[]> {
  const map = await rightsFor(q, [...new Set(uses.map((u) => u.recordId))]);
  return uses.map((u) => verdict(map.get(u.recordId), u.recordId, u.op));
}

export class RightsViolation extends Error {
  constructor(public verdicts: Verdict[]) {
    super(verdicts.filter((v) => !v.allowed).map((v) => `${v.title}: ${v.reason}`).join(' '));
    this.name = 'RightsViolation';
  }
}

export async function assertUses(q: Queryable, uses: { recordId: string; op: Operation }[]) {
  const v = await checkUses(q, uses);
  if (v.some((x) => !x.allowed)) throw new RightsViolation(v);
  return v;
}

export interface Alternative {
  recordId: string;
  title: string;
  credit: string | null;
  license: string | null;
  thumbnailUrl: string | null;
  placeName: string | null;
  why: string;
}

/**
 * Suggest permitted replacement media for a blocked item. Candidates must
 * independently allow republication and transformation, must not show
 * identifiable people, and must share the same place or region. If nothing
 * qualifies the result is empty ("none found"), never a loosely related picture.
 */
export async function suggestAlternatives(q: Queryable, recordId: string, limit = 4): Promise<Alternative[]> {
  const [src] = await q.query<{ place_name: string | null; region: string | null; content_kind: string; tags: string[] }>(
    `select place_name, region, content_kind, tags from records where id = $1`,
    [recordId],
  );
  if (!src) return [];
  const place = src.place_name?.split(' ')[0] ?? null;
  const rows = await q.query<{ id: string; title: string; credit: string | null; license: string | null; thumbnail_url: string | null; place_name: string | null; same_place: boolean }>(
    `select r.id, r.title, r.credit, cr.license, r.thumbnail_url, r.place_name,
            ($2::text is not null and r.place_name ilike $2 || '%') as same_place
       from records r join current_rights cr on cr.record_id = r.id
      where r.id <> $1 and r.content_kind in ('photo') and r.catalog_status = 'approved' and r.visibility = 'public'
        and cr.allow_republish_media and cr.allow_transform and not cr.people_identifiable
        and r.thumbnail_url is not null
        and (($2::text is not null and r.place_name ilike $2 || '%') or ($2::text is null and r.region = $3))
      order by same_place desc, r.title
      limit $4`,
    [recordId, place, src.region, limit],
  );
  return rows.map((r) => ({
    recordId: r.id,
    title: r.title,
    credit: r.credit,
    license: r.license,
    thumbnailUrl: r.thumbnail_url,
    placeName: r.place_name,
    why: r.same_place ? `Same place (${r.place_name}); rights allow republication with credit.` : `Same region; rights allow republication with credit. It does not show ${src.place_name ?? 'the original subject'}.`,
  }));
}
