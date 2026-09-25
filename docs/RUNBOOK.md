# Runbook

## Routine operations
- **Scheduled publications**: processed by Vercel Cron (`/api/cron/outbox`, daily on Hobby), on "Publish now", or manually via Workspace → Publication Queue → "Process due items now", or `pnpm jobs:run`.
- **Source refresh**: run the "Snapshot real sources" workflow, then `pnpm ingest:bootstrap` against production. Check Workspace → Corrections for new versions awaiting review.
- **Offline pack**: rebuild after catalog changes (Workspace → Ingest → Build pack). Saved devices see the newer version and correction notices when they reconnect.

## First admin / lost access
`pnpm admin:invite --email <you> --role admin --base <app URL>` with `DATABASE_URL` set. This creates a new one-time invitation (7 days). Accepting an invitation for an existing email resets that account's password and role.

## Migrations
Migrations in `db/migrations/` are additive and tracked in `schema_migrations`. Run `pnpm db:migrate`. Never reset a shared database. Test against a copy or a local PGlite database first.

## Rollback
- **Application:** in Vercel, promote the previous deployment (Deployments → ⋯ → Promote), or `git revert` the commit and redeploy.
- **Data:** editorial state is append-only. Versions, reviews, rights decisions and corrections are never updated in place except for status fields. To undo a withdrawal, the curator records a new correction or re-import. Status is not edited by hand.
- **Database:** use your provider's point-in-time restore (Supabase: Database → Backups).

## Incident checklist
1. Private content visible publicly? Set the record's visibility to `internal` (Workspace → Catalog → record). Public views apply this immediately; there is no cache of private data.
2. A wrong story is live? Withdraw the underlying source version (Corrections), or edit and republish. Receipts show the correction notice.
3. Leaked secret? Rotate `DATABASE_URL` credentials, `CRON_SECRET` and `LLM_API_KEY` in Vercel and redeploy. Sessions can be revoked with `delete from sessions`.

## Monitoring
- Vercel runtime logs: errors are logged without secrets or signed URLs.
- `audit_events` table: every editorial action with actor and target.
- `usage_events`: actual internal views, evidence opens, downloads and pack saves. No third-party analytics.
