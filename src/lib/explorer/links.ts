import type { Queryable } from '../db/core';

// Rule-based relationships between catalog records. A link is only
// "verified" when a stored evidence span of the source record literally names
// the target; everything else is inserted as a "suggested" link that a curator
// must confirm (with evidence) in the workspace. Nothing here draws routes or
// invents dates.
export async function seedRecordLinks(q: Queryable) {
  const stations = await q.query<{ id: string; place_name: string }>(
    `select id, place_name from records where source_id = 'wikipedia' and place_name is not null`,
  );
  for (const st of stations) {
    const name = st.place_name;
    const candidates = await q.query<{ record_id: string; span_id: string | null; kind: string }>(
      `select r.id as record_id,
              (select e.id from evidence_spans e join source_versions v on v.id = e.source_version_id
                where v.record_id = r.id and v.status = 'active' and e.text ilike '%' || $1 || '%' order by e.ordinal limit 1) as span_id,
              r.content_kind as kind
         from records r
        where r.id <> $2 and r.source_id in ('wikimedia-commons', 'nasa-images', 'ncpor')
          and (r.place_name ilike $1 || '%' or r.title ilike '%' || $1 || '%')`,
      [name, st.id],
    );
    for (const c of candidates) {
      await q.query(
        `insert into record_links (from_record, to_record, relation, evidence_span_id, note, curator_status, created_by)
         values ($1, $2, $3, $4, $5, $6, 'link rules (src/lib/explorer/links.ts)')
         on conflict (from_record, to_record, relation) do nothing`,
        [
          c.record_id, st.id, c.kind === 'photo' ? 'depicts' : 'related_context', c.span_id,
          c.span_id ? `Source text names "${name}".` : `Title/place matches "${name}"; needs a supporting span.`,
          c.span_id ? 'verified' : 'suggested',
        ],
      );
    }
  }
  // Suggested topical links (unverified): NCPOR-affiliated sea-ice papers -> the NSIDC hemisphere dataset.
  await q.query(
    `insert into record_links (from_record, to_record, relation, note, curator_status, created_by)
     select p.id, d.id, 'related_context', 'Same topic (title mentions sea ice in this hemisphere). Needs curator confirmation.', 'suggested', 'link rules (src/lib/explorer/links.ts)'
       from records p join records d on d.source_id = 'nsidc'
        and ((d.external_id like '%-S' and p.title ~* 'antarctic') or (d.external_id like '%-N' and p.title ~* 'arctic'))
      where p.content_kind = 'publication' and p.title ~* 'sea ice'
     on conflict (from_record, to_record, relation) do nothing`,
  );
  await q.query(
    `insert into record_links (from_record, to_record, relation, note, curator_status, created_by)
     select n.id, w.id, 'related_context', 'NCPOR Antarctica page and the encyclopedia article on the same programme. Needs curator confirmation.', 'suggested', 'link rules (src/lib/explorer/links.ts)'
       from records n join records w on w.source_id = 'wikipedia' and w.title like 'Indian Antarctic Programme%'
      where n.source_id = 'ncpor' and n.canonical_url like '%/antarcticas'
     on conflict (from_record, to_record, relation) do nothing`,
  );
}
