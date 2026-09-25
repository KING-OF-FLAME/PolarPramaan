# Master execution prompt

```text
Read SIH26063_PolarPramaan_Claude_Code_Masterplan.md completely. You are implementing
the project described in that file, not merely proposing it. Build PolarPramaan
for SIH26063 with real sourced data and deployable production code.

Treat all feature contracts, rights rules, source limits and acceptance gates as
requirements. Start by inspecting this directory and existing repository state.
Preserve unrelated work and existing instructions. If this is not already the
project directory, create an isolated polarpramaan directory. Do not overwrite
an unrelated repo or force-push anything.

Execute phases 00–12 sequentially. Create CLAUDE.md, docs/BUILD_STATE.md,
docs/DECISIONS.md, docs/BLOCKERS.md, docs/FEATURE_MATRIX.md, docs/SOURCES.md and
the individual phase prompt files. Use the masterplan as the specification.
At every phase record what is implemented, tested, blocked and externally verified.
Commit meaningful completed milestones after checking for secrets and unrelated files.

Use stable supported dependencies verified against official documentation and pin
them. Select the specified Next.js/Supabase/Inngest architecture unless a concrete
compatibility issue requires a documented minimal change. No unnecessary services.

Use available authenticated GitHub/Vercel CLIs. I want a new private GitHub repo
named polarpramaan-sih26063 under the currently authenticated personal account,
and a Vercel deployment of the completed public-facing application. Verify the
account and existing project before creation. If only organizational ownership
is available or the name collides, do not guess or mutate the existing project;
continue locally and report the exact decision needed. Do not publish secrets,
private sources or restricted files. Do not spend money or change paid plans
without explicit authorization. Account sign-in and missing secrets may require
me; do all independent work before asking for that setup.

Never substitute fixtures, Math.random, fabricated measurements, static fake
counters, placeholder success responses, fake admin authentication or invented
publication receipts for a working implementation. Tests may use isolated,
explicit test fixtures; they must never be loaded as production content.

Import permitted real sources, retain provenance and source timestamps, and
show honest empty, stale, unavailable and not-connected states. Missing API keys
disable that capability with a setup message; do not manufacture an answer.
Do not use a competitor site as a scientific source or imply NCPOR endorsement.

Implement all ten features to their bounded contracts. Finish the core workflow
before extensions. If an external dependency blocks one feature, continue other
work, record the blocker and leave that feature incomplete. Never silently omit it.

Implement the judge-visible interactions in section 3.1, including rights-aware
replacement suggestions, a fact-difference panel, retrospective observation reveal,
a compact offline exhibit and a working evidence-receipt QR. These are part of
their existing feature contracts, not optional decorative placeholders.

For each phase: inspect, implement, run meaningful checks, fix failures, update
BUILD_STATE and FEATURE_MATRIX, then continue. Do not stop after scaffolding,
screenshots or a plan. If context is low, checkpoint the exact next action and
resume from files. Do not seek confirmation for routine implementation choices.

External social accounts remain unconnected until real credentials and explicit
authorization for posting are provided. Website publishing and real social export
packages are required. Never claim social posting works from a mocked adapter.

Final output must include actual repo/deployment URLs if created, verification
results, actual source counts, all ten feature statuses, operational instructions,
and specific unfinished dependencies. Begin Phase 00 now.
```
