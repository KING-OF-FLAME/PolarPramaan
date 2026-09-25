import 'server-only';
import { dbMode, SNAPSHOT_DB_PATH } from '../env';
import { createDb, type Db } from './core';

export type { Db, Queryable } from './core';
export { DbUnavailableError } from './core';

const g = globalThis as unknown as { __ppDb?: Promise<Db> };

/** Process-wide database handle. Throws DbUnavailableError when not configured. */
export function getDb(): Promise<Db> {
  if (!g.__ppDb) {
    const mode = dbMode();
    g.__ppDb = (mode === 'pglite-snapshot' ? createDb(mode, `snapshot:${SNAPSHOT_DB_PATH}`, { migrate: false }) : createDb(mode, process.env.DATABASE_URL)).catch((e) => {
      g.__ppDb = undefined;
      throw e;
    });
  }
  return g.__ppDb;
}
