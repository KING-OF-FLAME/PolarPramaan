import { createDb, type Db } from '../src/lib/db/core';
import { dbMode } from '../src/lib/env';

export async function scriptDb(): Promise<Db> {
  const mode = dbMode();
  if (mode === 'unconfigured') {
    console.error('DATABASE_URL is not set (and this is not a local development environment). See docs/SETUP.md.');
    process.exit(2);
  }
  return createDb(mode, process.env.DATABASE_URL, { migrate: true });
}
