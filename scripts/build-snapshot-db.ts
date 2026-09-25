// Builds the read-only preview database image from the committed snapshot:
// schema + curated import + glossary + record links + classroom calculations +
// offline pack. Used when no persistent DATABASE_URL is configured (see DECISIONS D9).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createDb } from '../src/lib/db/core';
import { curatedCatalog } from '../src/lib/ingest/curation';
import { applyItem, ensureSources } from '../src/lib/ingest/apply';
import { seedGlossary } from '../src/lib/studio/glossary';
import { seedRecordLinks } from '../src/lib/explorer/links';
import { buildMuseumPack } from '../src/lib/offline/packs';
import { INVESTIGATIONS, investigationData } from '../src/lib/classroom/investigations';
import { verifySnapshot } from '../src/lib/ingest/snapshot';
import { SNAPSHOT_DB_PATH } from '../src/lib/env';

if (process.env.DATABASE_URL) {
  console.log('DATABASE_URL is set: skipping the preview database image.');
  process.exit(0);
}
const bad = verifySnapshot().filter((r) => !r.ok);
if (bad.length) {
  console.error('snapshot integrity failure', bad);
  process.exit(1);
}
const t0 = Date.now();
const db = (await createDb('pglite-memory', undefined, { migrate: true })) as Awaited<ReturnType<typeof createDb>> & { dump: () => Promise<Blob> };
await ensureSources(db);
let failed = 0;
for (const it of curatedCatalog()) {
  try {
    await db.tx((q) => applyItem(q, it, 'curation manifest (src/lib/ingest/curation.ts)'));
  } catch (e) {
    failed++;
    console.error('import failed', it.externalId, (e as Error).message);
  }
}
await db.tx(async (q) => {
  await seedGlossary(q);
  await seedRecordLinks(q);
  for (const inv of INVESTIGATIONS) await investigationData(q, q, inv.slug);
  await buildMuseumPack(q);
});
await db.query(`insert into ingestion_jobs (adapter, status, created_by, started_at, finished_at, attempts, report) values ('preview-image-build', $1, 'build', now(), now(), 1, $2::jsonb)`, [failed ? 'partial' : 'succeeded', JSON.stringify({ summary: { failed } })]);
const blob = await db.dump();
mkdirSync(dirname(SNAPSHOT_DB_PATH), { recursive: true });
writeFileSync(SNAPSHOT_DB_PATH, Buffer.from(await blob.arrayBuffer()));
await db.close();
console.log(`preview database image: ${(blob.size / 1024 / 1024).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(0)}s (${failed} failed items)`);
if (failed) process.exit(1);
