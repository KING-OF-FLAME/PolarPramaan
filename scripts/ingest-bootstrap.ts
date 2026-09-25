// Imports the curated real-source catalog from data/snapshots into the database.
// Idempotent: safe to re-run; prints an import report and records it in ingestion_jobs.
import { curatedCatalog } from '../src/lib/ingest/curation';
import { applyItem, ensureSources, type ApplyItemReport } from '../src/lib/ingest/apply';
import { verifySnapshot } from '../src/lib/ingest/snapshot';
import { seedGlossary } from '../src/lib/studio/glossary';
import { seedRecordLinks } from '../src/lib/explorer/links';
import { scriptDb } from './lib';

const bad = verifySnapshot().filter((r) => !r.ok);
if (bad.length) {
  console.error('Snapshot integrity check failed:', bad);
  process.exit(1);
}
const db = await scriptDb();
const [job] = await db.query<{ id: string }>(`insert into ingestion_jobs (adapter, status, created_by, started_at, attempts) values ('snapshot-bootstrap', 'running', 'cli', now(), 1) returning id`);
await ensureSources(db);
const items = curatedCatalog();
const reports: ApplyItemReport[] = [];
for (const it of items) {
  try {
    reports.push(await db.tx((q) => applyItem(q, it, 'curation manifest (src/lib/ingest/curation.ts)')));
  } catch (e) {
    reports.push({ externalId: it.externalId, title: it.title, kind: it.contentKind, recordId: '', created: false, newVersion: false, rightsChanged: false, spans: 0, observations: 0, warnings: [], error: (e as Error).message });
  }
}
await db.tx(async (q) => {
  await seedGlossary(q);
  await seedRecordLinks(q);
});
const failed = reports.filter((r) => r.error);
const summary = {
  items: items.length,
  created: reports.filter((r) => r.created).length,
  newVersions: reports.filter((r) => r.newVersion).length,
  rightsChanges: reports.filter((r) => r.rightsChanged).length,
  spans: reports.reduce((a, r) => a + r.spans, 0),
  observations: reports.reduce((a, r) => a + r.observations, 0),
  failed: failed.length,
};
await db.query(`update ingestion_jobs set status = $2, report = $3::jsonb, finished_at = now() where id = $1`, [
  job.id, failed.length ? (failed.length === items.length ? 'failed' : 'partial') : 'succeeded', JSON.stringify({ summary, reports }),
]);
const counts = await db.query<{ content_kind: string; archival: string; n: number }>(
  `select content_kind, archival, count(*)::int n from records group by 1, 2 order by 1, 2`,
);
console.log('import summary', summary);
console.table(counts);
for (const r of reports) if (r.error || r.warnings.length) console.log(`- ${r.title.slice(0, 70)}: ${r.error ? 'ERROR ' + r.error : r.warnings.join(' | ')}`);
await db.close();
process.exit(failed.length ? 1 : 0);
