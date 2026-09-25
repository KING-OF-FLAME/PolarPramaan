# Build state (checkpoint)

Last updated: 2026-09-25. Live checklist: https://claude.ai/artifact/PSsZWwomXx1w2HykxheSBC

**Deployment:** https://polarpramaan-sih26063.vercel.app (Vercel project `polarpramaan-sih26063`, production), running as a **read-only snapshot preview** (DECISIONS D9). Live smoke test (`.github/workflows/live-smoke.yml`, run 36135848190) passed 23/23 checks at 2026-09-25T12:36:26Z.

| Phase | Status | Evidence |
|---|---|---|
| 00 Preflight | done | Accounts verified; snapshot workflow; policy captures; docs and phase prompts (`docs/prompts/`) |
| 01 Shell & CI | done | `.github/workflows/ci.yml` green on GitHub (lint, typecheck, tests, build, E2E, bundle scan) |
| 02 DB/auth/storage | done (local), production DB blocked externally | Migrations, RLS, pp_public, invite-only sessions; tests in `tests/db` |
| 03 Real corpus | done | 99 records, 2,608 observations, 95/95 hashes verified (`docs/SOURCES.md`) |
| 04 Evidence (F1) | done | hit@5 17/20, citations 74/74, refusals 10/10 (`docs/EVALUATION.md`) |
| 05 Data stories (F2) | done | SQL cross-check test; live CSV export verified |
| 06 Studio (F4, F7) | done (local) | DB + E2E tests |
| 07 Publish (F10) | done (local) | E2E: publish, QR decode, ZIP |
| 08 Corrections (F3) | done (local) | DB + E2E tests |
| 09 Explorer/checker (F5, F6) | done | Live smoke checks |
| 10 Classroom/offline (F8, F9) | done | Live smoke checks; offline verified in E2E |
| 11 Security & verification | done | 38 unit/DB + 9 E2E tests; SSRF/injection/auth tests; bundle scan clean; no production mocks |
| 12 Release | done as a preview; full editorial deployment blocked on `DATABASE_URL` | README, SETUP, RUNBOOK, ARCHITECTURE, EVALUATION, DEMO |

Next action when resuming: configure `DATABASE_URL` in Vercel (docs/SETUP.md), run migrate, bootstrap and admin:invite against it, redeploy, then run the live smoke test and the manual editorial demo (docs/DEMO.md) on the deployment.
