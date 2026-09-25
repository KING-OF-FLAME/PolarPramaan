# Setup

## Accounts you need

| Service | Why | Required? |
|---|---|---|
| GitHub | code and the snapshot workflow (it has the outbound network the providers need) | yes |
| Vercel | hosting | yes, for a public deployment |
| PostgreSQL 15+ (Supabase free tier, Neon or any managed Postgres) | persistent catalog, editorial state, originals up to 6 MB | yes, for any shared deployment |
| AI provider (Anthropic) | optional answer synthesis | no |

The architecture intentionally has **no** Inngest, Supabase Auth or object-storage dependency; see `docs/DECISIONS.md` (D2–D4).

## Local development

```bash
pnpm install
pnpm ingest:bootstrap                       # creates .data/pglite, migrates, imports the real snapshot (~1 min)
pnpm admin:invite --email you@example.org --role admin
pnpm dev
```

Open the printed invitation link, set a password (at least 12 characters) and sign in at `/workspace/login`. Invite a second person as `reviewer`: authors cannot approve their own drafts. For a one-person demo only, `ALLOW_SELF_REVIEW=true` enables self-approval, which is labelled "not independent" on the receipt and ignored in production.

## Production (Vercel + Postgres)

1. Create a Postgres database. On Supabase, copy the **transaction pooler** connection string (port 6543). The app sets `prepare: false` for pooler compatibility.
2. From your machine (or CI), with `DATABASE_URL` pointing at that database:
   ```bash
   pnpm db:migrate
   pnpm ingest:bootstrap
   pnpm admin:invite --email you@example.org --role admin --base https://<your-app>.vercel.app
   ```
   The import reads the committed snapshot, so it needs no network access to the providers.
3. In Vercel project settings, set the environment variables `DATABASE_URL`, `NEXT_PUBLIC_APP_URL` (your production URL) and `CRON_SECRET` (a long random string), plus optionally `LLM_API_KEY` and `LLM_MODEL`.
4. Deploy. `vercel.json` registers a daily cron (Hobby plan limit) that processes scheduled publications. "Publish now" and the Publication Queue's "Process due items now" do not wait for the cron.
5. In the workspace, open **Ingest & Source Health → Build pack** to create the offline museum pack.

### Security notes for Supabase

Migration `0002` enables RLS on every table and revokes all privileges from `anon` and `authenticated`, so the Supabase REST API exposes nothing. The app connects only with the server-side `DATABASE_URL`. Public pages run each read in a read-only transaction as the restricted `pp_public` role, which can read only the `public_*` views.

## Refreshing source data

Run the **Snapshot real sources** workflow (Actions → workflow_dispatch; the `only` input takes, for example, `nsidc`). It fetches from the official endpoints, records hashes and failures in `data/snapshots/manifest.json`, and commits the result. Then run `pnpm ingest:bootstrap` again. Unchanged files are skipped. A changed file becomes a new source version in `under_review` and is classified as *append-only* or *row correction* for the curator on the Corrections page.
