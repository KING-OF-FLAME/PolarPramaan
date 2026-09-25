# Blockers and external dependencies

| # | Blocker | Effect | Exact action needed |
|---|---|---|---|
| B1 | No persistent PostgreSQL configured for the Vercel project | The deployment is a read-only preview; editorial workflow (F3, F7, F10 publishing) is verified locally only | Create a Supabase (or Neon) database. Set `DATABASE_URL` (pooler URI), `NEXT_PUBLIC_APP_URL` and `CRON_SECRET` in Vercel. Run `pnpm db:migrate && pnpm ingest:bootstrap && pnpm admin:invite ...` against it, then redeploy (see docs/SETUP.md) |
| B2 | No AI provider key | Ask with Evidence uses extractive answers only (a working, truthful mode) | Optional: set `LLM_API_KEY` and `LLM_MODEL` (e.g. `claude-opus-5`) |
| B3 | Hindi language review | Hindi variants cannot be published until a human language reviewer approves them in the workspace | A competent Hindi reviewer with the `reviewer` role |
| B4 | NCPOR full-text rights | Indian expedition and annual reports are link-only | Written permission from NCPOR for specific documents; then upload them via Catalog Review and record the rights decision |
| B5 | Social platform posting | Channels show "not connected" | Platform accounts, API credentials and explicit authorisation. Until then, use the export kit and record posts manually |
| B6 | Container egress policy blocks provider hosts | Live fetches run in GitHub Actions, not locally | None required (workaround in place). Allowing the hosts in the environment settings would enable local refresh |
| B7 | Embedding/semantic search | Lexical search only | Optional embedding provider |
| B8 | OCR / transcription | Only text-layer PDFs and existing caption files are indexed | Optional processing service |
