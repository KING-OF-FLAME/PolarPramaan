# Phase 12 — GitHub/Vercel release, live smoke test and handover

```text
Prepare README, architecture notes, env/setup guide, migration/runbook, source/rights
manifest, evaluation report, rollback procedure and a five-minute demo script.
Record licenses for copied dependencies/assets. Keep restricted data and secrets
out of the repo. Confirm target GitHub account and Vercel project before changes.

Using available authorized credentials, push the private repo, configure Supabase
and Inngest integration, apply reviewed additive migrations, set environment secrets
through secure CLI/project settings, deploy a Vercel preview and perform live checks.
Use a separate preview data environment where available; never point destructive
tests at production. Verify auth callback URLs and signed job callbacks after deploy.

When the release gates pass, deploy the intended public application to production
under the master prompt's authorization. Recheck login, catalog/search, source
citations, one computation, review/publication, exported files and job persistence.
Test fresh-browser access and ensure editorial/private resources remain protected.

Do not mark deployment complete based only on a URL or a successful build. Record
deployment ID/URL, commit SHA, checked timestamp and live test results. If credentials,
rights or a provider are missing, deliver the finished independent work and the
smallest exact setup/action list. Do not fabricate a successful deployed state.

Final handover: actual repo URL, actual app URL, actual real-source counts by kind
and archival/link-only status, all ten feature statuses, evaluation metrics, known
limitations, ongoing cost drivers and how to resume unfinished external integrations.
```
