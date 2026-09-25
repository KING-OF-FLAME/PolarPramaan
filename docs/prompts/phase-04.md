# Phase 04 — Search, extraction and exact evidence (F1)

```text
Implement bounded text extraction with PDF page references, HTML heading/offset
references, table row/column references and existing caption timestamp references.
Do not add unconfigured OCR/transcription or pretend metadata search is vision search.
Create lexical search, optional embedding retrieval and authorization-aware fusion.

Build Ask with Evidence: retrieve, generate structured claims, validate source IDs,
check quotations, retain caveats and render evidence alongside each claim. Use only
rights-cleared text for AI calls. Add explicit no-evidence and provider-error results.
If embeddings are unconfigured, lexical search still works; label semantic search
unavailable. Do not replace model failure with a manufactured generated answer.

Create a benchmark of 30 manually source-checked queries: 20 answerable and 10
out-of-corpus/ambiguous queries. Measure retrieval hit@5, citation validity and
human-checked support separately. Targets: >=85% hit@5 on the 20, all citations
resolve, and all 10 unanswerable queries avoid invented factual answers.

Gate: click-through evidence works; access-control and document-injection tests
pass; actual benchmark scores are recorded. Thresholds are targets, not claims
of universal accuracy. Commit and continue.
```
