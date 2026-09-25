# Phase 11 — Security, scientific integrity and integration verification

```text
Audit and test the completed workflow. Cover role bypass, private search leakage,
SSRF redirects, malicious document instructions, unsafe HTML, unauthorized signed
uploads, source restrictions, stale data, job retries, correction races, changed
approvals, duplicate publication, missing keys and provider downtime.

Run real database-backed E2E tests plus a bounded live connector smoke test. Unit
tests may use labeled fixtures, but live integration results must be reported
separately. Test mobile/keyboard navigation, chart tables and evidence link targets.
Check cost/rate limiting and inspect client bundles for accidentally exposed secrets.

Scan production paths for dummy data, random measurements, fake success handlers,
hardcoded counters, demo auth and unimplemented TODOs. Remove production mocks.
Do not hide failed features to obtain a green screenshot. Measure performance on
the actual corpus and record environment/counts; do not invent benchmark numbers.

Gate: lint/typecheck/build, unit, database permission and core E2E tests pass;
all ten feature contracts have recorded evidence or specific blockers. Fix concrete
failures, update evaluation report and prepare a release candidate. Commit.
```
