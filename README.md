# PolarPramaan

**From polar evidence to public understanding.** An independent student project for Smart India Hackathon problem statement **SIH26063** (MoES / NCPOR, Smart Education). It is *not* an official NCPOR or MoES website and is not endorsed by any data provider.

PolarPramaan is a polar-science repository and outreach platform. Every public claim links to the exact evidence behind it (a PDF page, an HTML passage, a data row or a video caption timestamp), and the platform tracks what needs correcting when that evidence changes.

```
real source → reproducible calculation → evidence-linked claims → EN/HI audience drafts
→ machine fact checks + human review → website publication + evidence receipt (QR) + export kit
→ correction propagation (drafts, schedules, public pages, external posts, offline packs)
```

## What is in it

| Feature | Where |
|---|---|
| F1 Evidence-linked answers (extractive by default; optional AI with quote validation) | `/ask`, `src/lib/evidence/` |
| F2 Reproducible data stories (deterministic calculations, recipe/CSV/verification script) | `/data-stories`, `/calc/[id]`, `src/lib/calc/` |
| F3 Correction impact tracking | `/workspace/corrections`, `src/lib/corrections/` |
| F4 Rights-aware publishing (server-side verdicts + permitted alternatives) | `src/lib/rights/`, Draft Studio |
| F5 Expedition evidence explorer (polar orthographic map, timeline, day-by-day cruise) | `/explore`, `/explore/expedition` |
| F6 Misconception checker (four-state, no confidence percentages) | `/check`, `src/lib/misconceptions/` |
| F7 Audience and language adaptation with fact checks and a fact-difference panel | `/workspace/drafts/[id]`, `src/lib/studio/` |
| F8 Classroom predict-then-reveal investigations with printable teacher packs | `/classroom` |
| F9 Offline evidence pack (service worker, 2D exhibit, correction check on reconnect) | `/offline`, `public/sw.js` |
| F10 Review, website publication, evidence receipt with QR, outreach ZIP, RSS | `/stories`, `/evidence/[id]`, `/api/exports/[id]` |

The current status of each feature and the evidence for it are in [`docs/FEATURE_MATRIX.md`](docs/FEATURE_MATRIX.md).

## Real data

The catalog is built only from real, attributable sources. It uses a hashed snapshot committed under `data/snapshots/`, fetched from official endpoints by the **Snapshot real sources** GitHub Actions workflow:

- **NSIDC:** Sea Ice Index v4 monthly CSVs, both hemispheres.
- **PANGAEA.885208:** SA Agulhas II Antarctic ship observations, CC-BY-3.0, including its documented position erratum.
- **NASA Image and Video Library:** images, videos and caption files.
- **Wikimedia Commons:** photographs of Indian stations and expeditions, with per-file licences (GODL-India, CC BY-SA).
- **Wikipedia:** CC BY-SA 4.0 articles on stations and sea ice.
- **NASA Earth Observatory and NOAA Arctic Report Card:** text pages.
- **OpenAlex:** bibliographic metadata for NCPOR-affiliated papers, plus five CC-BY open-access PDFs.
- **NCPOR / NCPOR data portal:** official pages, recorded as link-only because NCPOR's copyright page states "All Rights Reserved".

Actual counts, failures and rights decisions are listed in [`docs/SOURCES.md`](docs/SOURCES.md) and on the `/sources` page.

## Quick start (local)

```bash
pnpm install
pnpm ingest:bootstrap        # migrates a local PGlite DB in .data/ and imports the real snapshot
pnpm admin:invite --email you@example.org --role admin   # prints a one-time invite link
pnpm dev                     # http://localhost:3000
```

Production uses PostgreSQL 15+ (Supabase or any provider) via `DATABASE_URL`. See [`docs/SETUP.md`](docs/SETUP.md) and [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

## Commands

| Command | Purpose |
|---|---|
| `pnpm lint` / `pnpm typecheck` | Static checks |
| `pnpm test` | Unit and database tests (in-memory Postgres via PGlite, loaded with real snapshot data) |
| `pnpm test:e2e` | Browser E2E of the hero sequence (needs `pnpm build`) |
| `pnpm build` | Production build |
| `pnpm db:migrate` | Apply SQL migrations |
| `pnpm ingest:bootstrap` | Idempotent import of the curated real-source catalog |
| `pnpm data:verify [--db]` | Verify snapshot hashes, re-parse numeric files, print counts |
| `pnpm eval:run` | Run the 30-query evidence retrieval benchmark |
| `pnpm admin:invite` | Create an invitation link (first-admin bootstrap and recovery) |
| `pnpm jobs:run` | Process due publications (for environments without cron) |
| `pnpm snapshot:fetch` | Re-fetch sources (needs outbound network to the providers) |

## Documentation

`docs/ARCHITECTURE.md` · `docs/DECISIONS.md` · `docs/BLOCKERS.md` · `docs/BUILD_STATE.md` · `docs/FEATURE_MATRIX.md` · `docs/SOURCES.md` · `docs/EVALUATION.md` · `docs/DEMO.md` · `docs/RUNBOOK.md` · `docs/SETUP.md` · `docs/prompts/`

## Licence

Code: MIT. Data and media keep their original licences, which are shown on every record. Bundled fonts: SIL OFL 1.1 (`assets/fonts/`).
