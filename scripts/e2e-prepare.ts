// Prepares an isolated E2E database (PGlite file) from the real snapshot and
// writes one-time invitation tokens for three test accounts.
import { rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { createDb } from '../src/lib/db/core';
import { curatedCatalog } from '../src/lib/ingest/curation';
import { applyItem, ensureSources } from '../src/lib/ingest/apply';
import { createInvite } from '../src/lib/auth/store';
import { seedGlossary } from '../src/lib/studio/glossary';
import { seedRecordLinks } from '../src/lib/explorer/links';

const dir = process.env.E2E_DB_DIR ?? '.data/e2e-db';
rmSync(dir, { recursive: true, force: true });
mkdirSync('.data', { recursive: true });
const t0 = Date.now();
const db = await createDb('pglite-file', `pglite:${dir}`, { migrate: true });
await ensureSources(db);
for (const it of curatedCatalog()) await db.tx((q) => applyItem(q, it, 'e2e'));
await db.tx(async (q) => {
  await seedGlossary(q);
  await seedRecordLinks(q);
});
const invites = {
  admin: await createInvite(db, 'e2e-admin@example.org', 'admin', null),
  author: await createInvite(db, 'e2e-author@example.org', 'contributor', null),
  reviewer: await createInvite(db, 'e2e-reviewer@example.org', 'reviewer', null),
};
writeFileSync('.data/e2e-invites.json', JSON.stringify(invites));
await db.close();
console.log(`e2e database ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
