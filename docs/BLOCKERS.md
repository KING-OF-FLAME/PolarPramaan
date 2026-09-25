# Blockers and external dependencies

| # | Blocker | Effect | Exact action needed |
|---|---|---|---|
| B1 | ~~No persistent PostgreSQL~~ **Resolved 2026-09-25** | Supabase project `polarpramaan-sih26063` (ap-south-1) with a dedicated `polarpramaan_app` role; the build migrates and imports the snapshot | None |
| B2 | ~~No AI provider key~~ **Resolved 2026-09-25** | OpenRouter, free models only (`LLM_MODEL` must end in `:free`; anything else is refused in code). Free-tier rate limits apply; when the provider is busy, Ask says so and shows the retrieved evidence without a substitute answer | Rotate the OpenRouter key if it was ever shared in plain text |
| B3 | Hindi language review | Hindi variants cannot be published until a human language reviewer approves them in the workspace | A competent Hindi reviewer with the `reviewer` role |
| B4 | NCPOR full-text rights | Indian expedition and annual reports are link-only | Written permission from NCPOR for specific documents; then upload them via Catalog Review and record the rights decision |
| B5 | Social platform posting | Channels show "not connected" | Platform accounts, API credentials and explicit authorisation. Until then, use the export kit and record posts manually |
| B6 | Container egress policy blocks provider hosts | Live fetches run in GitHub Actions, not locally | None required (workaround in place). Allowing the hosts in the environment settings would enable local refresh |
| B7 | Embedding/semantic search | Lexical search only | Optional embedding provider |
| B8 | OCR / transcription | Only text-layer PDFs and existing caption files are indexed | Optional processing service |
