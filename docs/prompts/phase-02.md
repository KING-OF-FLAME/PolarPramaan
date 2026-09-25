# Phase 02 — Database, storage and real authentication

```text
Implement SQL migrations for the masterplan schema, constraints and indexes.
Build Supabase Auth, invite-only editorial access, first-admin bootstrap and
server-verified roles. Implement private original-file buckets, signed uploads,
signed reads and public-approved export access. Add RLS, grants and storage policies.
Never authorize from editable client metadata or from the visible navigation alone.

Test anonymous, contributor, reviewer and admin access. Check direct API/SQL paths,
search RPCs, views and object URLs. Include denial cases and cross-user draft access.
Do not reset an existing remote database. Use local or isolated test instances.

Gate: persistent authenticated CRUD works, unauthorized reads/writes are denied,
and files survive a new session/deployment. Record evidence, commit and continue.
```
