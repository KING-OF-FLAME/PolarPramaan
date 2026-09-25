# Build state (checkpoint)

Last updated: 2026-09-25. Live checklist: https://claude.ai/artifact/PSsZWwomXx1w2HykxheSBC

**Deployment:** https://polarpramaan-sih26063.vercel.app (Vercel project `polarpramaan-sih26063`, production), running on the **persistent Supabase database** `polarpramaan-sih26063` (ap-south-1; D14) with AI synthesis from OpenRouter free models (D15). The deploy bootstrap imported 99 records, 1,977 evidence spans and 2,608 observations with 0 failures. Live smoke test (run 36159027692) passed 24/24 checks at 2026-09-25T16:10:48Z. Admin and reviewer invitations were issued to the owner on 2026-09-25 and expire after 7 days.

| Phase | Status | Evidence |
|---|---|---|
| 00 Preflight | done | Accounts verified; snapshot workflow; policy captures; docs and phase prompts (`docs/prompts/`) |
| 01 Shell & CI | done | `.github/workflows/ci.yml` green on GitHub (lint, typecheck, tests, build, E2E, bundle scan) |
| 02 DB/auth/storage | done (Supabase in production) | Migrations, RLS, pp_public, invite-only sessions; tests in `tests/db` |
| 03 Real corpus | done | 99 records, 2,608 observations, 95/95 hashes verified (`docs/SOURCES.md`) |
| 04 Evidence (F1) | done | hit@5 17/20, citations 74/74, refusals 10/10 (`docs/EVALUATION.md`) |
| 05 Data stories (F2) | done | SQL cross-check test; live CSV export verified |
| 06 Studio (F4, F7) | done (deployed) | DB + E2E tests |
| 07 Publish (F10) | done (deployed) | E2E: publish, QR decode, ZIP |
| 08 Corrections (F3) | done (deployed) | DB + E2E tests |
| 09 Explorer/checker (F5, F6) | done | Live smoke checks |
| 10 Classroom/offline (F8, F9) | done | Live smoke checks; offline verified in E2E |
| 11 Security & verification | done | 39 unit/DB + 9 E2E tests (E2E also passes on PostgreSQL 16); SSRF/injection/auth tests; bundle scan clean; no production mocks |
| 12 Release | done: production on Supabase + OpenRouter free model | README, SETUP, RUNBOOK, ARCHITECTURE, EVALUATION, DEMO |

Next action when resuming: the owner accepts the admin invite, walks through docs/DEMO.md on the live site (drafting as admin, approving as the separate reviewer account), then F3/F7/F10 can be marked verified deployed. Hindi language approval still needs a competent Hindi reviewer (B3); NCPOR full text stays link-only until permission is recorded (B4).
