# Build state (checkpoint)

Status vocabulary: done · in progress · not started · blocked (external).
Last updated: 2026-09-25 (session in progress).

| Phase | Scope | Status | Evidence / notes |
|---|---|---|---|
| 00 Preflight | Tooling, accounts, source anchors, docs set | in progress | GitHub (KING-OF-FLAME) + Vercel (hobby) authenticated; no Supabase/LLM keys; container egress blocks providers → GitHub Actions snapshot workflow used. Docs files (CLAUDE.md, DECISIONS, BLOCKERS, FEATURE_MATRIX, SOURCES, phase prompts) still to write. |
| 01 App shell & CI | Next.js 16 + TS + Tailwind, commands, CI | in progress | Pinned deps, configs, layout/header/footer done; CI workflow + lint pending. |
| 02 DB, auth, storage | Migrations, RLS, roles, sessions, invites | done (local) | 0001/0002 migrations; pp_public role + public_* views; scrypt + DB sessions; blobs in Postgres (≤6 MB). Tested in tests/db. Supabase not configured (blocked externally). |
| 03 Real corpus | Connectors, rights, dedupe, import | done (snapshot) | 99 real items imported idempotently (NSIDC, PANGAEA, NASA, Commons, Wikipedia, NOAA/NASA pages, OpenAlex, CC-BY PDFs, NCPOR link-only). |
| 04 Search & evidence (F1) | Extraction, search, Ask | in progress | Search + extractive/LLM ask + validators done; /ask UI + 30-query benchmark pending. |
| 05 Data stories (F2) | Calcs, chart, recipe, export | in progress | Engine + SQL cross-check test done; UI/exports pending. |
| 06 Studio (F4, F7) | Rights checks, EN/HI, invariants, fact diff | in progress | Services + tests done; UI pending. |
| 07 Review & publish (F10) | State machine, outbox, receipts, QR, ZIP | in progress | Services + idempotency tests done; receipts/QR/ZIP/RSS UI pending. |
| 08 Corrections (F3) | Propagation, race blocking | in progress | Services + tests done; UI pending. |
| 09 Explorer & misconceptions (F5, F6) | Map/timeline, 4-state checker | in progress | Explore/map/timeline/expedition pages written; checker service done, UI pending. |
| 10 Classroom & offline (F8, F9) | Investigations, teacher packs, SW | in progress | Services done; pages, service worker pending. |
| 11 Security & verification | Audits, E2E, bundle scan | not started | |
| 12 Release | README, runbook, deploy, handover | not started | Vercel deploy needs a Postgres DATABASE_URL (blocked until provided). |
