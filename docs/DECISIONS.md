# Decisions

| ID | Decision | Why | Masterplan deviation? |
|---|---|---|---|
| D1 | Use the existing repository `KING-OF-FLAME/PolarPramaan` and the assigned branch instead of creating `polarpramaan-sih26063` | The session was started on this repository with explicit branch instructions. The Vercel project is still named `polarpramaan-sih26063` | Yes, minor |
| D2 | DB-backed auth (scrypt password hashes, hashed session tokens, invite-only onboarding) instead of Supabase Auth | No Supabase project was available, and auth had to be testable end to end in CI. It is small, audited in tests, and has no client-side role claims | Yes, documented minimal change |
| D3 | Original files stored in Postgres (`blobs`, ≤ 6 MB) instead of object storage | One persistent store; fits the corpus; uploads are capped at 4 MB, under Vercel's 4.5 MB body limit | Yes |
| D4 | Durable Postgres outbox + Vercel Cron + synchronous processing instead of Inngest | Every job here is short (publishing, pack build). This avoids an extra service; retries and idempotency live in the database | Yes |
| D5 | Source ingestion from a hashed snapshot produced by a GitHub Actions workflow | The build container's egress policy blocks the provider hosts; Actions runners can reach them. Snapshots give reproducible, reviewable imports | No (the plan allows permitted snapshots) |
| D6 | PGlite (embedded Postgres) for local dev, tests and the preview image | Real PostgreSQL semantics (RLS, roles, FTS) with no server | No |
| D7 | Public reads under a restricted `pp_public` role that can read only `public_*` views; RLS on all base tables with no policies; `anon`/`authenticated` revoked | Database-level enforcement, independent of application code | No |
| D8 | Deterministic bilingual templates as the default generation method; LLM only for optional answer synthesis with validation | No AI key was available, and templates guarantee that numbers match their calculations | No |
| D9 | Read-only snapshot preview on Vercel while no persistent DB is configured (superseded by D14 on 2026-09-25; still the fallback when `DATABASE_URL` is absent) | Gives a live public site on real data without faking editorial persistence. The workspace is disabled with an explanation | Temporary |
| D10 | Bundled OFL Noto Sans / Noto Sans Devanagari fonts for server-rendered PNG slides | Vercel functions have no system fonts; Hindi must render | No |
| D11 | NSIDC documents not ingested | Reuse terms could not be established (the terms page returned 404) | No |
| D12 | PANGAEA ice concentration values (0–100) kept "as recorded" despite the declared unit "tenths", with a flag | The provider does not document a conversion, so none is guessed | No |
| D13 | Hotlink credited provider images instead of `next/image` optimisation | Avoids re-hosting copies; credits stay with the source | No |
| D14 | Supabase Postgres through the transaction pooler, with a dedicated non-superuser `polarpramaan_app` role; `pp_public` and its schema grant are created once by an admin (docs/SETUP.md); the Vercel build migrates and runs the idempotent import | The app role cannot grant schema privileges it does not hold. Keeping the admin step explicit and failing the deploy if `pp_public` cannot read views avoids silent breakage | No |
| D15 | AI synthesis via OpenRouter restricted to `:free` models (default `nvidia/nemotron-3-super-120b-a12b:free`) | The owner asked for free models only; enforced in `llmStatus()`, so a paid model id disables AI rather than incurring cost. Output still passes quote validation | No |
