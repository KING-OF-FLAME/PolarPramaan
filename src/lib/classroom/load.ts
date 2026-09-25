import 'server-only';
import { getDb, DbUnavailableError } from '../db';
import { investigationData } from './investigations';

export async function loadInvestigation(slug: string) {
  try {
    const db = await getDb();
    // Series lookups read the public_* views; the deterministic calculation runs are saved with the server connection.
    return { ok: true as const, data: await db.tx((q) => investigationData(q, q, slug)) };
  } catch (e) {
    return { ok: false as const, unconfigured: e instanceof DbUnavailableError };
  }
}
