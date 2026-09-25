import { createDb, migrate } from '../src/lib/db/core';
import { dbMode } from '../src/lib/env';

const mode = dbMode();
if (mode === 'unconfigured') {
  console.error('DATABASE_URL is not set. See docs/SETUP.md.');
  process.exit(2);
}
const db = await createDb(mode, process.env.DATABASE_URL, { migrate: false });
const applied = await migrate(db);
console.log(applied.length ? `applied: ${applied.join(', ')}` : 'database schema is up to date');
await db.close();
