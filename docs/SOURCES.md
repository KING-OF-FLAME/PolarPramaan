# Sources and rights

Snapshot fetched by the **Snapshot real sources** GitHub Actions workflow on 2026-09-25 (runner: github-actions). Every stored file's SHA-256 is recorded in `data/snapshots/manifest.json`, and `pnpm data:verify` currently reports **95/95** files matching. Reuse-policy evidence captured on the same day is in `data/snapshots/policies/`.

## Actual catalog counts (public, approved), from `pnpm data:verify --db`

| Content type | Archived snapshot | Link-only reference | India-specific |
|---|---|---|---|
| Dataset | 3 (NSIDC N, NSIDC S, PANGAEA.885208) | 2 (NCPOR data portal pages) | 2 |
| Expedition report | 0 | 5 | 5 |
| Publication | 8 (Wikipedia ×4, NASA EO ×2, NOAA ARC 2024, CC-BY PDFs are in "publication" too) | 29 (OpenAlex metadata, NCPOR PDF link) | 31 |
| Photo | 0 (displayed from provider servers) | 22 | 8 |
| Video | 0 (streamed from NASA) | 12 | 0 |
| Institutional activity | 6 (Wikipedia station/programme articles) | 12 (NCPOR pages, Commons stamp/official photo) | 18 |
| **Total** | **17** | **82** | **64** |

"Archived" means the original bytes or text are stored and indexed. "Link-only" means only metadata is stored, plus provider-supplied descriptions where the rights allow, and readers are sent to the source. Photos and videos with clear reuse rights are displayed from the provider's servers with credit. They are not re-hosted, so they count as link-only.

Numeric observations: **2,608** (NSIDC monthly extent and area for both hemispheres, 1978–2026; PANGAEA ship observations). Evidence spans: **1,977** public (text passages, PDF page chunks, table rows, caption cues, metadata).

**Minimum functional corpus check:**

| Requirement | Status |
|---|---|
| ≥2 usable data products | 3 (NSIDC N, NSIDC S, PANGAEA) |
| ≥5 rights-cleared text documents | 4 Wikipedia station/programme articles + 6 Wikipedia/NASA/NOAA explainers + 5 CC-BY PDFs |
| ≥10 media records | 22 photos + 12 videos, of which 14 NASA and 8 Commons photos are cleared for display |
| Indian expedition/activity context | 64 India-specific records |

**Missing (institutional dependency):** a rights-cleared Indian full-text corpus. NCPOR expedition reports and annual reports are link-only, because NCPOR's copyright page states "All Rights Reserved". This gap is not filled with unrelated material.

## Rights decisions by provider

| Provider | Decision | Evidence |
|---|---|---|
| NSIDC Sea Ice Index v4 | Attribution required. Derived calculations and charts allowed with citation; original files linked, not re-hosted | Landing page: "As a condition of using these data, you must cite the use of this data set." |
| NSIDC documents (user guide, etc.) | **Not used** (no documents downloaded) | Use/copyright page returned 404, so terms were not established |
| PANGAEA.885208 | CC-BY-3.0: store, download, quote, adapt | File header "License: Creative Commons Attribution 3.0 Unported" |
| NASA images, videos and text | Educational/informational use with "NASA" credit; no implied endorsement; identifiable persons need review | NASA media guidelines (captured) |
| NOAA Arctic Report Card | Quote and index only; no AI processing, adaptation or offline copies | Non-federal co-authors; no licence text captured |
| Wikipedia | CC BY-SA 4.0: quote, adapt (share-alike), offline | Reusing Wikipedia content (captured) |
| Wikimedia Commons | Per-file licence from Commons metadata (CC BY-SA 3.0/4.0, GODL-India). "Public domain / unknown author" becomes link-only. Official photos with identifiable people are blocked from outreach reuse | Commons extmetadata |
| OpenAlex | Bibliographic metadata only; no abstracts or full text | Metadata ≠ article rights |
| CC-BY open-access PDFs (5) | Quote, index, adapt with attribution; figures not reused; download from publisher | OpenAlex best_oa_location licence = cc-by |
| NCPOR / NCPOR data portal | Link-only | Copyright policy page: "All Rights Reserved" |

## Recorded fetch failures (not hidden)

| Source | Failure |
|---|---|
| NASA Science Arctic sea-ice indicator page | HTTP 404 |
| NSIDC use-copyright page | HTTP 404 |
| data.gov.in GODL licence page | HTTP 403 |
| NPDC portal (npdc.ncpor.res.in) | Connection failed |
| NCPOR expedition online form | Not fetched: host is not on the allowlist, and forms are never automated |
| Wiley (×2) | HTTP 403 |
| Nature (×3) | Redirected to a login host, or returned HTML instead of a PDF |
