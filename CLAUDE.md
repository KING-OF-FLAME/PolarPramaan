# PolarPramaan: instructions for coding agents

- Specification: `SIH26063` masterplan (summarised in `docs/`). Progress lives in `docs/BUILD_STATE.md`, `docs/FEATURE_MATRIX.md` and `docs/BLOCKERS.md`; update them after every milestone.
- Never add fixtures, random values, fake counters, placeholder success responses, fake auth or invented publication receipts to production paths. Tests may use clearly labelled fixtures that are never loaded in production.
- Real data comes only from `data/snapshots/` (refreshed by the "Snapshot real sources" workflow) or from authorised uploads. Rights decisions live in `src/lib/ingest/policies.ts` and `curation.ts` and must cite policy evidence.
- Numbers in generated text must come from `calculation_runs`. LLM output must pass `validateLlmClaims`.
- Public reads go through `db.asPublic` (the `pp_public` role and `public_*` views). New public data needs a new view in a new migration; never grant base tables.
- Checks before committing: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; `pnpm test:e2e` for workflow changes (set `PW_CHROMIUM_PATH` if the bundled browser differs).
