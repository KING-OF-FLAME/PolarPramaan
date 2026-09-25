# Feature matrix

Status vocabulary: `not started` · `implemented` · `verified locally` · `verified deployed` · `blocked externally`.

Live smoke test on the production URL passed 23/23 on 2026-09-25 (workflow run 36135848190).

**"Verified deployed" for editorial features requires a persistent database.** The current Vercel deployment is a read-only snapshot preview (DECISIONS D9), so editorial features are verified locally (browser E2E against a production build) but not on the deployment.

| ID | Feature | Status | Evidence | Remaining dependency |
|---|---|---|---|---|
| F1 | Evidence-linked answers | verified deployed (extractive); AI synthesis implemented but blocked externally | `/ask`; benchmark hit@5 17/20, citations 74/74 valid, 10/10 out-of-corpus refused (`docs/eval-results.json`); quote/label validator + injection tests (`tests/security.test.ts`) | `LLM_API_KEY`/`LLM_MODEL` for AI synthesis; embeddings not configured |
| F2 | Reproducible data stories | verified deployed | `/data-stories/explore`; SQL cross-check test (mean/min/max/OLS match to 1e-8); CSV/JSON/verification-script exports | — |
| F3 | Correction impact tracking | verified locally | `tests/db/workflow.test.ts` (dependents only, pending-publish race paused, unrelated story publishes, rights change after approval pauses, new review required, append vs row correction); E2E withdrawal → public notice | Persistent DB for deployed verification |
| F4 | Rights-aware publishing | verified locally (server enforcement); verified deployed (public rights display, link-only behaviour) | RightsViolation tests; E2E refusal of people-identifiable photo with same-place alternatives; link-only NCPOR text cannot be quoted | — |
| F5 | Expedition evidence explorer | verified deployed | `/explore` (list, orthographic polar map, timeline), `/explore/expedition` (day-by-day real ship positions), verified links on record pages | Curator verification of suggested links needs the workspace (DB) |
| F6 | Misconception checker | verified deployed | `/check`: season, record-year, long-term direction (with "mixed" for Antarctic), metric/unit, sea ice vs sea level; parser tests | Coverage limited to the documented rules |
| F7 | Audience and language adaptation | verified locally | EN/HI drafts with invariant checks and fact-difference panel (DB + E2E tests); edited number flagged and blocks review | Hindi text is team-drafted: a **competent Hindi reviewer** must approve it (enforced by the language-review gate) |
| F8 | Classroom investigations | verified deployed | 3 investigations with predict-then-reveal on withheld real observations; printable teacher packs citing calculation ids | No curriculum mapping claimed |
| F9 | Offline evidence packs | verified locally (E2E: works offline, reports withdrawal on reconnect, cache removal); pack page and exhibit verified deployed | `public/sw.js`, `/offline/india-in-antarctica` | Images depend on provider availability when saving |
| F10 | Review, publication, receipt | verified locally | E2E: two-language review gates, website publish, receipt QR decodes to the receipt URL, ZIP contains PNG slides, caption, alt text, attribution, data, QR; idempotent outbox tests | Persistent DB for deployed publishing; social platforms not connected (no credentials) |
