-- PolarPramaan core schema.
-- The application connects with a privileged server-only DATABASE_URL. Anonymous
-- public reads run inside a transaction under the restricted role pp_public,
-- which can only SELECT from the public_* views defined in 0002. Every base
-- table has RLS enabled with no policies for pp_public/anon/authenticated, so a
-- leaked anon key (e.g. Supabase PostgREST) cannot read base tables.


-- ------------------------------------------------------------------ identity
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and position('@' in email) > 1),
  display_name text not null,
  password_hash text,
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table memberships (
  user_id uuid primary key references users(id) on delete cascade,
  role text not null check (role in ('contributor', 'reviewer', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  invited_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email text not null check (email = lower(email)),
  role text not null check (role in ('contributor', 'reviewer', 'admin')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references users(id)
);

create table sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text
);
create index sessions_user_idx on sessions(user_id);

-- ------------------------------------------------------------------ sources & catalog
create table sources (
  id text primary key,                          -- e.g. 'nsidc', 'pangaea', 'nasa-images'
  name text not null,
  homepage text not null,
  terms_url text,
  notes text
);

create table records (
  id uuid primary key default gen_random_uuid(),
  content_kind text not null check (content_kind in
    ('expedition_report', 'dataset', 'publication', 'photo', 'video', 'institutional_activity')),
  title text not null,
  description text,
  source_id text not null references sources(id),
  external_id text not null,                    -- provider id / DOI / canonical URL
  doi text,
  canonical_url text not null,
  region text check (region in ('arctic', 'antarctic', 'southern_ocean', 'himalaya', 'global', 'india')),
  place_name text,
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  time_start date,
  time_end date,
  source_published_at timestamptz,
  india_specific boolean not null default false,
  tags text[] not null default '{}',
  archival text not null default 'link_only' check (archival in ('link_only', 'archived')),
  visibility text not null default 'internal' check (visibility in ('public', 'internal')),
  catalog_status text not null default 'pending' check (catalog_status in ('pending', 'approved', 'withdrawn')),
  thumbnail_url text,
  media_url text,
  credit text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);
create index records_kind_idx on records(content_kind);
create index records_doi_idx on records(lower(doi)) where doi is not null;
create unique index records_canonical_url_idx on records(canonical_url);

-- Rights decisions are append-only; the latest row per record is current.
create table rights_decisions (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references records(id) on delete cascade,
  status text not null check (status in ('cleared', 'attribution_required', 'link_only', 'restricted', 'unknown')),
  license text,
  attribution text,
  policy_url text,
  -- metadata rights
  metadata_public boolean not null default true,
  -- original-file rights
  allow_store_original boolean not null default false,
  allow_download boolean not null default false,
  allow_index_text boolean not null default false,
  allow_quote boolean not null default false,
  allow_ai_processing boolean not null default false,
  -- derivative rights
  allow_transform boolean not null default false,
  allow_republish_media boolean not null default false,
  allow_offline boolean not null default false,
  people_identifiable boolean not null default false,
  rationale text not null,
  decided_by text not null,                     -- user id or named curation manifest
  decided_at timestamptz not null default now(),
  review_due date
);
create index rights_record_idx on rights_decisions(record_id, decided_at desc);

create view current_rights as
  select distinct on (record_id) * from rights_decisions order by record_id, decided_at desc, id;

create table blobs (
  sha256 text primary key,
  bytes bytea not null,
  mime text not null,
  byte_size integer not null check (byte_size <= 6 * 1024 * 1024),
  created_at timestamptz not null default now()
);

create table source_versions (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references records(id) on delete cascade,
  version_label text,
  content_hash text,                            -- sha256 of retrieved bytes (null for link-only)
  blob_sha256 text references blobs(sha256),
  mime text,
  byte_size integer,
  retrieval_url text,
  snapshot_path text,
  retrieved_at timestamptz,
  source_published_at timestamptz,
  supersedes_id uuid references source_versions(id),
  status text not null default 'active' check (status in ('active', 'under_review', 'superseded', 'withdrawn')),
  status_reason text,
  status_changed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (record_id, content_hash)
);
create index source_versions_record_idx on source_versions(record_id);

create table evidence_spans (
  id uuid primary key default gen_random_uuid(),
  source_version_id uuid not null references source_versions(id) on delete cascade,
  kind text not null check (kind in ('text', 'pdf_page', 'table_row', 'caption_cue', 'metadata')),
  ordinal integer not null,
  page integer,
  char_start integer,
  char_end integer,
  heading text,
  row_key text,
  column_names text[],
  t_start_ms integer,
  t_end_ms integer,
  text text not null,
  extraction_method text not null,              -- e.g. 'pdfjs-text', 'html-block', 'tsv-row', 'vtt-cue'
  tsv tsvector generated always as (to_tsvector('english', coalesce(heading, '') || ' ' || text)) stored,
  unique (source_version_id, ordinal)
);
create index evidence_spans_tsv_idx on evidence_spans using gin(tsv);

-- Optional semantic index (disabled unless an embedding provider is configured).
create table embeddings (
  span_id uuid not null references evidence_spans(id) on delete cascade,
  model text not null,
  dim integer not null,
  vector real[] not null,
  created_at timestamptz not null default now(),
  primary key (span_id, model)
);

create table record_links (
  id uuid primary key default gen_random_uuid(),
  from_record uuid not null references records(id) on delete cascade,
  to_record uuid not null references records(id) on delete cascade,
  relation text not null check (relation in ('describes', 'depicts', 'located_at', 'produced_by', 'part_of', 'cites', 'related_context')),
  evidence_span_id uuid references evidence_spans(id),
  note text,
  curator_status text not null default 'suggested' check (curator_status in ('suggested', 'verified', 'rejected')),
  created_by text not null,
  created_at timestamptz not null default now(),
  check (from_record <> to_record),
  check (curator_status <> 'verified' or evidence_span_id is not null or note is not null),
  unique (from_record, to_record, relation)
);

-- ------------------------------------------------------------------ numeric data
create table dataset_series (
  id uuid primary key default gen_random_uuid(),
  source_version_id uuid not null references source_versions(id) on delete cascade,
  series_key text not null,                     -- e.g. 'N-09-extent'
  variable text not null,                       -- 'sea_ice_extent', 'sea_ice_area', 'ice_concentration_total' ...
  region text not null,
  units text not null,
  frequency text not null check (frequency in ('monthly', 'daily', 'per_observation')),
  description text,
  unique (source_version_id, series_key, variable)
);

create table observations (
  id bigserial primary key,
  series_id uuid not null references dataset_series(id) on delete cascade,
  obs_time timestamptz not null,
  value double precision,                       -- null when the provider flags missing
  raw_value text not null,
  flag text,                                    -- provider flag / source dataset label / missing marker
  row_key text not null,
  lat double precision,
  lon double precision,
  extra jsonb,
  unique (series_id, row_key)
);
create index observations_series_time_idx on observations(series_id, obs_time);

create table calculation_runs (
  id uuid primary key default gen_random_uuid(),
  recipe jsonb not null,
  recipe_hash text not null,
  code_version text not null,
  input_source_version_ids uuid[] not null,
  input_row_keys text[] not null,
  result jsonb not null,
  units text not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index calculation_runs_hash_idx on calculation_runs(recipe_hash);

-- ------------------------------------------------------------------ artifacts & claims
create table artifacts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('article', 'carousel', 'caption', 'storyboard', 'lesson', 'answer')),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,90}$'),
  title text not null,
  language text not null check (language in ('en', 'hi')),
  audience text not null check (audience in ('school', 'press', 'research')),
  variant_of uuid references artifacts(id),
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table artifact_versions (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references artifacts(id) on delete cascade,
  version_no integer not null,
  title text not null,
  body jsonb not null,                          -- structured blocks, each carrying claim ids
  body_hash text not null,
  state text not null default 'draft' check (state in
    ('draft', 'in_review', 'changes_requested', 'approved', 'published', 'correction_review', 'superseded', 'withdrawn')),
  language_review text not null default 'not_required' check (language_review in ('not_required', 'machine_unreviewed', 'human_reviewed')),
  generation_method text not null,              -- 'template-deterministic', 'llm:<model>', 'manual-edit'
  invariant_report jsonb,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  unique (artifact_id, version_no)
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  claim_key text not null,                      -- stable across language variants
  text text not null,
  language text not null check (language in ('en', 'hi')),
  region text,
  period_start date,
  period_end date,
  metric text,
  unit text,
  assessment text not null check (assessment in ('supported', 'contradicted', 'mixed', 'insufficient')),
  assessment_origin text not null check (assessment_origin in ('machine', 'human')),
  caveats text[] not null default '{}',
  machine_check jsonb,
  created_at timestamptz not null default now()
);

create table claim_evidence (
  claim_id uuid not null references claims(id) on delete cascade,
  evidence_span_id uuid not null references evidence_spans(id),
  quote text,
  quote_valid boolean not null,
  primary key (claim_id, evidence_span_id)
);

create table claim_calculations (
  claim_id uuid not null references claims(id) on delete cascade,
  calculation_run_id uuid not null references calculation_runs(id),
  primary key (claim_id, calculation_run_id)
);

create table artifact_version_claims (
  artifact_version_id uuid not null references artifact_versions(id) on delete cascade,
  claim_id uuid not null references claims(id),
  position integer not null,
  primary key (artifact_version_id, claim_id)
);

create table artifact_version_sources (
  artifact_version_id uuid not null references artifact_versions(id) on delete cascade,
  source_version_id uuid not null references source_versions(id),
  role text not null check (role in ('evidence', 'dataset', 'media')),
  primary key (artifact_version_id, source_version_id, role)
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  artifact_version_id uuid not null references artifact_versions(id) on delete cascade,
  reviewer_id uuid not null references users(id),
  kind text not null check (kind in ('scientific', 'language')),
  decision text not null check (decision in ('approve', 'request_changes')),
  notes text,
  independent boolean not null,
  reviewed_source_version_ids uuid[] not null,
  created_at timestamptz not null default now()
);

create table review_comments (
  id uuid primary key default gen_random_uuid(),
  artifact_version_id uuid not null references artifact_versions(id) on delete cascade,
  author_id uuid not null references users(id),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table publications (
  id uuid primary key default gen_random_uuid(),
  artifact_version_id uuid not null references artifact_versions(id),
  channel text not null check (channel in ('website', 'export', 'instagram', 'facebook', 'x', 'youtube')),
  status text not null check (status in ('scheduled', 'publishing', 'published', 'paused', 'failed', 'uncertain', 'cancelled', 'withdrawn')),
  scheduled_at timestamptz,
  published_at timestamptz,
  idempotency_key text not null unique,
  external_id text,
  external_url text,
  status_reason text,
  correction_notice text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one live website publication per artifact version.
create unique index publications_one_live_site on publications(artifact_version_id)
  where channel = 'website' and status in ('scheduled', 'publishing', 'published');

create table outbox (
  id bigserial primary key,
  publication_id uuid not null references publications(id) on delete cascade,
  kind text not null,
  run_after timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed', 'cancelled')),
  attempts integer not null default 0,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (publication_id, kind)
);

create table correction_events (
  id uuid primary key default gen_random_uuid(),
  source_version_id uuid not null references source_versions(id),
  kind text not null check (kind in ('withdrawal', 'supersession', 'row_correction', 'append_only')),
  reason text not null,
  detail jsonb,
  actor_id uuid references users(id),
  created_at timestamptz not null default now()
);

create table correction_impacts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references correction_events(id) on delete cascade,
  artifact_version_id uuid not null references artifact_versions(id),
  publication_id uuid references publications(id),
  impact text not null check (impact in ('draft_revalidate', 'publication_paused', 'public_notice', 'external_task', 'offline_pack_stale')),
  via text not null,                            -- human-readable dependency path
  resolution text not null default 'open' check (resolution in ('open', 'revised', 'dismissed', 'external_confirmed')),
  resolved_at timestamptz,
  unique (event_id, artifact_version_id, impact)
);

create table offline_packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  manifest jsonb not null,
  byte_count integer not null,
  pack_version integer not null default 1,
  generated_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'stale', 'retired'))
);

create table glossary_terms (
  id uuid primary key default gen_random_uuid(),
  term_en text not null unique,
  term_hi text not null,
  must_preserve boolean not null default true,
  note text,
  reviewed_by text,
  reviewed_at timestamptz
);

-- ------------------------------------------------------------------ operations
create table ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  adapter text not null,
  params jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'partial')),
  report jsonb,
  attempts integer not null default 0,
  created_by text not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table job_attempts (
  id bigserial primary key,
  job_id uuid not null references ingestion_jobs(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  error text
);

create table audit_events (
  id bigserial primary key,
  actor_id uuid references users(id),
  action text not null,
  target_type text,
  target_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table usage_events (
  id bigserial primary key,
  kind text not null check (kind in ('record_view', 'story_view', 'evidence_open', 'export_download', 'receipt_view', 'pack_saved')),
  target_id text not null,
  created_at timestamptz not null default now()
);
create index usage_events_kind_target_idx on usage_events(kind, target_id);

create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
