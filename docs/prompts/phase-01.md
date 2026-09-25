# Phase 01 — Application shell and continuous integration

```text
Implement the Next.js TypeScript application with pinned dependencies, accessible
components, public/editorial navigation and all required loading/error/empty states.
Create package commands for lint, typecheck, test, test:e2e, build, db:test,
ingest:bootstrap, data:verify and eval:run. Implement scripts as phases need them;
an unavailable command must fail explicitly, never return a fake passing result.

Set up CI for dependency install, lint, typecheck, unit tests and production build.
Create .env.example and .gitignore. Public pages must work with an empty database
or show an honest setup error; they must not import demo arrays. Add project notice,
metadata, mobile layouts, keyboard focus and reduced-motion behavior.

Gate: production build and shell checks pass; no pretend records or inert feature
buttons; setup is reproducible from README. Commit and update BUILD_STATE.
```
