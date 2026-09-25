// Verifies the committed snapshot (hashes), re-parses every numeric file, and
// reports actual catalog counts from the database.
import { verifySnapshot, manifest } from '../src/lib/ingest/snapshot';
import { curatedCatalog } from '../src/lib/ingest/curation';
import { runExtraction } from '../src/lib/ingest/extract';
import { scriptDb } from './lib';

const v = verifySnapshot();
const bad = v.filter((r) => !r.ok);
console.log(`snapshot files verified: ${v.length - bad.length}/${v.length}`);
for (const b of bad) console.log('  MISMATCH', b.path, b.problem);
const failedFetches = manifest().entries.filter((e) => !e.ok);
console.log(`recorded fetch failures: ${failedFetches.length}`);
for (const f of failedFetches) console.log('  ', f.provider, f.url, f.error);
let numericRows = 0;
for (const it of curatedCatalog()) {
  for (const ex of it.extraction) {
    if (ex.type !== 'nsidc-monthly' && ex.type !== 'pangaea-tab') continue;
    const r = await runExtraction(ex);
    numericRows += r.series.reduce((a, s) => a + s.observations.length, 0);
    console.log(`parsed ${it.externalId}: ${r.series.length} series, ${r.series.reduce((a, s) => a + s.observations.length, 0)} observations; ${r.warnings.join(' ')}`);
  }
}
console.log('numeric observations parsed:', numericRows);
if (process.argv.includes('--db')) {
  const db = await scriptDb();
  console.table(await db.query(`select content_kind, archival, count(*)::int n, count(*) filter (where india_specific)::int india from records where visibility = 'public' and catalog_status = 'approved' group by 1, 2 order by 1, 2`));
  console.table(await db.query(`select cr.status, count(*)::int n from records r join current_rights cr on cr.record_id = r.id group by 1 order by 2 desc`));
  await db.close();
}
process.exit(bad.length ? 1 : 0);
