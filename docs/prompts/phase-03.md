# Phase 03 — Real corpus, connectors and source rights

```text
Implement bounded connectors for NSIDC CSV, selected PANGAEA DOI TSV/metadata,
NASA media metadata and OpenAlex publication metadata; implement curated official
NCPOR/NPDC source-link records plus authorized upload. All six content kinds need
real UI/storage treatment. Do not invent a private NCPOR API or bypass source gates.

Add canonical IDs, deduplication, hashes, rights decisions, provenance, retries,
rate limits and an admin-visible import report. Use background jobs and durable
status. Fetch files from server-side allowlisted adapters with redirect/SSRF checks.
Unknown rights mean link-only, not silent text ingestion.

Run bootstrap against real endpoints, curate relevance and report actual outcomes.
Target the masterplan corpus but never fabricate to reach a count. Keep original
bytes outside Git; commit only allowed manifests and small licensed fixtures with
attribution. Give imported snapshots retrieval and observation timestamps.

Gate: two real numerical datasets parse, six content types are represented honestly,
re-running ingestion creates no duplicates, source outages are visible, and rights
controls prevent restricted mirroring. If Indian full-text rights are missing, record
that exact dependency and do not claim that part of the corpus is complete.
```
