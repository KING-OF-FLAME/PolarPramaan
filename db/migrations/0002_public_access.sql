-- Public read surface. Anonymous page requests execute `set local role pp_public`
-- and may only read these views. Each view applies catalog status, visibility and
-- the current rights decision, so a rights change takes effect immediately.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'pp_public') then
    create role pp_public nologin;
  end if;
end $$;

do $$ begin
  execute format('grant pp_public to %I', current_user);
exception when others then
  raise notice 'could not grant pp_public to %: %', current_user, sqlerrm;
end $$;

-- Lock every base table: RLS on, no policies for non-owner roles.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on public.%I from public', t.tablename);
  end loop;
end $$;

-- Supabase exposes the public schema through PostgREST to anon/authenticated.
-- This app never uses those roles, so revoke everything from them if they exist.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
    execute 'revoke all on all sequences in schema public from anon';
    execute 'revoke all on all functions in schema public from anon';
    execute 'alter default privileges in schema public revoke all on tables from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
    execute 'revoke all on all functions in schema public from authenticated';
    execute 'alter default privileges in schema public revoke all on tables from authenticated';
  end if;
end $$;

grant usage on schema public to pp_public;

create view public_records as
  select r.id, r.content_kind, r.title, r.description, r.source_id, s.name as source_name, s.homepage as source_homepage,
         r.external_id, r.doi, r.canonical_url, r.region, r.place_name, r.lat, r.lon, r.time_start, r.time_end,
         r.source_published_at, r.india_specific, r.tags, r.archival, r.thumbnail_url, r.media_url, r.credit,
         r.updated_at,
         cr.status as rights_status, cr.license, cr.attribution, cr.policy_url, cr.decided_at as rights_decided_at,
         cr.allow_download, cr.allow_quote, cr.allow_index_text, cr.allow_ai_processing, cr.allow_transform, cr.allow_republish_media,
         cr.allow_offline, cr.people_identifiable, cr.rationale as rights_rationale
  from records r
  join sources s on s.id = r.source_id
  join current_rights cr on cr.record_id = r.id
  where r.visibility = 'public' and r.catalog_status = 'approved' and cr.metadata_public;

create view public_source_versions as
  select v.id, v.record_id, v.version_label, v.content_hash, v.mime, v.byte_size, v.retrieval_url,
         v.retrieved_at, v.source_published_at, v.supersedes_id, v.status, v.status_reason, v.status_changed_at,
         (pr.allow_download and v.blob_sha256 is not null and v.status = 'active') as downloadable
  from source_versions v
  join public_records pr on pr.id = v.record_id;

create view public_evidence_spans as
  select e.id, e.source_version_id, v.record_id, e.kind, e.ordinal, e.page, e.char_start, e.char_end, e.heading,
         e.row_key, e.column_names, e.t_start_ms, e.t_end_ms, e.text, e.extraction_method, e.tsv
  from evidence_spans e
  join source_versions v on v.id = e.source_version_id
  join public_records pr on pr.id = v.record_id
  where v.status = 'active'
    and ((e.kind = 'metadata') or (pr.allow_index_text and pr.allow_quote));

create view public_dataset_series as
  select ds.id, ds.source_version_id, v.record_id, ds.series_key, ds.variable, ds.region, ds.units, ds.frequency, ds.description,
         v.status as version_status
  from dataset_series ds
  join source_versions v on v.id = ds.source_version_id
  join public_records pr on pr.id = v.record_id
  where pr.allow_transform;

create view public_observations as
  select o.id, o.series_id, o.obs_time, o.value, o.raw_value, o.flag, o.row_key, o.lat, o.lon, o.extra
  from observations o
  join public_dataset_series ds on ds.id = o.series_id;

create view public_calculation_runs as
  select c.id, c.recipe, c.recipe_hash, c.code_version, c.input_source_version_ids, c.input_row_keys, c.result, c.units, c.created_at
  from calculation_runs c
  where not exists (
    select 1 from unnest(c.input_source_version_ids) as iv(id)
    where iv.id not in (select id from public_source_versions)
  );

-- Website publications that are (or were) publicly visible.
create view public_publications as
  select p.id, p.artifact_version_id, p.status, p.published_at, p.correction_notice, p.updated_at
  from publications p
  where p.channel = 'website' and p.published_at is not null and p.status in ('published', 'withdrawn');

create view public_artifact_versions as
  select av.id, av.artifact_id, a.kind, a.slug, a.language, a.audience, a.variant_of, av.version_no, av.title,
         case when pp.status = 'withdrawn' then null else av.body end as body,
         av.body_hash, av.state, av.language_review, av.generation_method, av.invariant_report, av.created_at,
         pp.id as publication_id, pp.status as publication_status, pp.published_at, pp.correction_notice
  from artifact_versions av
  join artifacts a on a.id = av.artifact_id
  join public_publications pp on pp.artifact_version_id = av.id;

create view public_claims as
  select c.id, c.claim_key, c.text, c.language, c.region, c.period_start, c.period_end, c.metric, c.unit,
         c.assessment, c.assessment_origin, c.caveats, c.machine_check, avc.artifact_version_id, avc.position
  from claims c
  join artifact_version_claims avc on avc.claim_id = c.id
  join public_artifact_versions pav on pav.id = avc.artifact_version_id;

-- Evidence links are listed for every public claim; the span text is only
-- present when the span itself is publicly quotable.
create view public_claim_evidence as
  select ce.claim_id, ce.evidence_span_id, ce.quote_valid,
         pes.text as span_text, pes.kind as span_kind, pes.page, pes.row_key, pes.t_start_ms, pes.t_end_ms, pes.heading,
         v.record_id, v.status as version_status
  from claim_evidence ce
  join evidence_spans e on e.id = ce.evidence_span_id
  join source_versions v on v.id = e.source_version_id
  left join public_evidence_spans pes on pes.id = ce.evidence_span_id
  where ce.claim_id in (select id from public_claims);

create view public_claim_calculations as
  select cc.claim_id, cc.calculation_run_id
  from claim_calculations cc
  where cc.claim_id in (select id from public_claims)
    and cc.calculation_run_id in (select id from public_calculation_runs);

create view public_reviews as
  select rv.artifact_version_id, rv.kind, rv.decision, rv.independent, rv.created_at, u.display_name as reviewer_name
  from reviews rv
  join users u on u.id = rv.reviewer_id
  where rv.artifact_version_id in (select id from public_artifact_versions);

create view public_artifact_sources as
  select avs.artifact_version_id, avs.source_version_id, avs.role, v.record_id, v.status as version_status
  from artifact_version_sources avs
  join source_versions v on v.id = avs.source_version_id
  where avs.artifact_version_id in (select id from public_artifact_versions);

create view public_offline_packs as
  select id, slug, title, description, manifest, byte_count, pack_version, generated_at, status
  from offline_packs where status in ('active', 'stale');

create view public_glossary as
  select term_en, term_hi, must_preserve, note, reviewed_at is not null as reviewed from glossary_terms;

create view public_record_links as
  select l.id, l.from_record, l.to_record, l.relation, l.evidence_span_id, l.note
  from record_links l
  where l.curator_status = 'verified'
    and l.from_record in (select id from public_records)
    and l.to_record in (select id from public_records);

create view public_correction_notices as
  select ce.id, ce.kind, ce.reason, ce.created_at, v.record_id
  from correction_events ce
  join source_versions v on v.id = ce.source_version_id
  where v.record_id in (select r.id from records r where r.visibility = 'public');

do $$
declare v text;
begin
  foreach v in array array['public_records','public_source_versions','public_evidence_spans','public_dataset_series',
    'public_observations','public_calculation_runs','public_publications','public_artifact_versions','public_claims',
    'public_claim_evidence','public_claim_calculations','public_reviews','public_artifact_sources','public_offline_packs',
    'public_glossary','public_record_links','public_correction_notices'] loop
    execute format('revoke all on public.%I from public', v);
    execute format('grant select on public.%I to pp_public', v);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon, authenticated', v);
    end if;
  end loop;
end $$;
