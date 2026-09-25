# Phase 08 — Correction impact propagation (F3)

```text
Implement dependency queries and correction events from source supersession,
curator withdrawal and corrected data rows. Distinguish append-only source growth
from changes to used observations. Mark affected drafts for revalidation, pause
scheduled jobs and add public correction notices to affected published versions.
Preserve an audit trail and the prior source/version context where rights permit.

Use a real curator withdrawal of a real imported source for the UI demonstration;
do not fabricate an upstream scientific retraction. Describe the operation accurately.
Use isolated tests for artificial content-diff scenarios. The existing PANGAEA
coordinate erratum can illustrate why corrections matter, without inventing a
historical old file that you have not obtained.

Gate: all dependent artifacts are identified, an unrelated artifact stays unaffected,
the pending-publish race is blocked, and corrected content requires a new review.
External channels produce truthful correction tasks/receipts. Commit and continue.
```
