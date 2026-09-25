# Evaluation report

Environment: Node 22, Next.js 16.3.6, PGlite 0.5.8 (PostgreSQL 17 in WASM), snapshot of 2026-09-25. All figures below come from real runs in this repository.

## Automated tests

| Suite | Result | What it covers |
|---|---|---|
| `pnpm test` (Vitest) | **38/38 pass** | Snapshot hash integrity; NSIDC/PANGAEA/caption/HTML parsers on real files; auth primitives; SSRF guard; LLM output validation and document injection; invariants; OLS; 22 database tests on real data (access control, idempotent import, SQL cross-check of calculations, missing values, rights blocks, bilingual drafts, number-edit flag, review gates, idempotent publishing, withdrawal propagation, race conditions, append-only vs row correction, offline pack) |
| `pnpm test:e2e` (Playwright, production build) | **9/9 pass** | Invite-only accounts; anonymous denial; author compute → drafts (EN/HI) with a permitted photo; refusal of a people-identifiable photo with same-place alternatives; edited number blocks review; reviewer approval (scientific + Hindi language) and publishing; public story; **QR decoded from the receipt page and from the ZIP equals the receipt URL**; ZIP has PNG slides, caption, alt text, attribution and data; withdrawal adds a public notice; offline pack works with the network off and reports the withdrawal on reconnect; cache removal |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | pass | — |
| `pnpm data:verify` | 95/95 files match their recorded SHA-256; 2,608 observations parse | — |

## Evidence retrieval benchmark (`pnpm eval:run`, `tests/eval/benchmark.json`)

| Metric | Result | Target |
|---|---|---|
| Retrieval hit@5 (20 answerable queries) | **17/20 (85%)** | ≥ 85% |
| Citation validity (quotes match stored text, spans were retrieved) | **74/74** | all |
| Out-of-corpus queries refused (no claims) | **10/10** | all |

The expected passages were checked by hand against the stored snapshot text. **The benchmark was also used during development** (the general retrieval improvements: title context, synonym groups, proper-noun anchors), so it is not a held-out score. Misses: "How long did it take to build Dakshin Gangotri" (the passage says "built in eight weeks" but ranks below other Dakshin Gangotri passages), "What licence covers the SA Agulhas II observations", and "Glacier mass balance in the Lahaul and Spiti region".

Human-checked support rate (does each quoted sentence actually answer the question?) is **not measured automatically**. Procedure: for each answerable query, a reviewer marks each extractive claim as supports / partially / does not answer.

## Data quality findings surfaced by the system (real)

- NSIDC Dec 1987 and Jan 1988 are missing (-9999) and are excluded, never zero-filled.
- 20 of the most recent NSIDC months per hemisphere come from the near-real-time product NSIDC-0803, and this is flagged in every calculation that uses them.
- One Antarctic row lists two input products in one quoted field ("NSIDC-0051,NSIDC-0081"), which the parser handles.
- PANGAEA.885208 declares ice concentration in "tenths", but 25 values exceed 10 (up to 100). They are kept as recorded and flagged, not converted.

## Performance (local production build, PGlite)

Typical server response times: catalog pages 20–150 ms; Ask with Evidence about 0.4–1 s; Challenge a Headline about 2.5 s (it computes several climatology recipes); preview cold start (loading the 10.5 MB database image) about 2 s.
