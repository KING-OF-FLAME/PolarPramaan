import 'server-only';
import { dbMode } from '../env';
import { createDb, type Db } from './core';

export type { Db, Queryable } from './core';
export { DbUnavailableError } from './core';

const g = globalThis as unknown as { __ppDb?: Promise<Db> };

/** Process-wide database handle. Throws DbUnavailableError when not configured. */
export function getDb(): Promise<Db> {
  if (!g.__ppDb) {
    g.__ppDb = createDb(dbMode(), process.env.DATABASE_URL).catch((e) => {
      g.__ppDb = undefined;
      throw e;
    });
  }
  return g.__ppDb;
}
