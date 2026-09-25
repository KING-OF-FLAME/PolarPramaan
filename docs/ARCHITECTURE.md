# Architecture

```
            ┌──────────────── GitHub Actions: "Snapshot real sources" ────────────────┐
            │ NSIDC · PANGAEA · NASA · Wikimedia · Wikipedia · NOAA · OpenAlex · NCPOR │
            │ → data/snapshots/** + manifest.json (sha256, retrieval time, failures)   │
            └───────────────────────────────┬─────────────────────────────────────────┘
                                            │ pnpm ingest:bootstrap (idempotent)
                                            ▼
┌──────────────────────────── PostgreSQL (Supabase / any PG15+ / PGlite) ────────────────────────────┐
│ records · rights_decisions (append-only) · source_versions · evidence_spans (tsvector)            │
│ dataset_series · observations · calculation_runs · claims · claim_evidence · claim_calculations   │
│ artifacts · artifact_versions (immutable) · reviews · publications · outbox                        │
│ correction_events · correction_impacts · offline_packs · users/sessions/invites · audit/usage     │
│ RLS on every table; role pp_public → SELECT on public_* views only                                │
└───────────────────────────────┬───────────────────────────────────────────────────────────────────┘
                                │
                  Next.js 16 App Router (Vercel, Node runtime)
   Public (pp_public, read-only tx)                    Workspace (server actions, role checks)
   /explore /records /ask /data-stories /calc          /workspace/studio → createDraft (rights gate)
   /check /classroom /stories /evidence /offline       /workspace/drafts → edit (new version), review,
   /sources /feed.xml /api/media /api/exports            schedule → outbox → processOutbox (fail-closed)
                                                        /workspace/corrections → withdraw → propagate
```

## Key flows

- **F2 calculation**: `computeRecipe` reads observations (the public role for anonymous callers), clamps the period to the data's coverage, excludes missing and flagged rows explicitly, and computes mean, extremes, OLS trend (only for monthly series of 20 or more values), baseline anomaly and ranks. `saveCalculation` stores the recipe, hash, code version, input row keys and result, and reuses the stored result when an identical recipe gives the same result.
- **F1 answer**: `searchSpans` runs PostgreSQL full-text search over the span text plus its record title, then ranks by coverage (the fraction of query term groups matched), ties broken by `ts_rank_cd`. `relevant()` then drops weak hits (coverage threshold and proper-noun anchors). The answer is extractive (verbatim sentences), or, when configured, an LLM answer whose citations and quotes are validated against the stored text.
- **F7 generation**: claims come from calculation results (numbers inserted from the run) and from verbatim quotes. Templates compose blocks per kind and audience in English and Hindi. `checkInvariants` compares the numbers, region and unit terms in each block with its claims. `factDiff` compares two versions claim by claim.
- **F10 publish**: `submitForReview` → `reviewVersion` (independent reviewer; Hindi also needs a language review) → `schedulePublication` (idempotency key per version) → `processOutbox` (row lock, re-check approval, sources and rights, then publish or pause). Receipts are read from the public views; QR codes point to `/evidence/{publicationId}`.
- **F3 correction**: `dependentsOf` finds versions through artifact sources, claim evidence spans and calculation input versions or row keys. `applyImpacts` sends drafts back for revalidation, pauses scheduled publications, adds a notice to live website pages, creates tasks for external posts, and marks offline packs stale.

## Security boundaries

- Server-only `DATABASE_URL`; no client database access; anonymous reads run in read-only transactions as `pp_public`.
- Authorisation happens in every server action and route (`requireActor`), never from navigation.
- Outbound fetches use `safeFetch`: provider allowlist, https only, redirects re-validated, resolved IPs must be public, size and time limits.
- Uploads: 4 MB limit, type and magic-byte checks, HTML/SVG rejected, kept in quarantine (internal, rights unknown) until an admin decides.
- Source text is rendered as text, never as HTML. CSP, `X-Frame-Options: DENY` and `nosniff` headers are set.
- Retrieved documents are untrusted: LLM prompts wrap them as data; outputs are validated; the model has no tools.
