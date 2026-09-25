# Phase 07 — Review, website publication and evidence receipts (F10)

```text
Implement the editorial state machine with immutable artifact versions, comments,
approve/reject, timezone-aware scheduling, approval invalidation and pre-publish
checks. Use a durable outbox and idempotent internal publication transaction.

Publish real approved content to the website and RSS/metadata where appropriate.
Create a public evidence receipt with citations, calculation links, review scope,
source dates, correction state and accessible text. Generate evidence-receipt QR
codes, test their decoded URLs, and ensure their destinations work for anonymous
visitors without exposing private evidence or temporary URLs. Generate actual
downloadable carousel images/captions/attribution and a real export ZIP. A storyboard remains
labeled a storyboard. Prevent source-file leakage in exports.

Add provider interfaces for optional external publishing, but leave unconfigured
channels visibly not connected. Only implement and claim an external adapter after
current official API checks and authorized real credentials. No unsolicited posting.
Handle uncertain external timeouts without automatic duplicate publication.

Gate: authorized approve->publish works; unapproved or modified versions fail;
repeated delivery does not duplicate a site post; exported files open correctly;
only actual internal events appear in analytics. Commit and continue.
```
