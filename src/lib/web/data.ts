import 'server-only';
import { getDb, DbUnavailableError, type Db, type Queryable } from '../db';
import { isReadOnlyPreview } from '../env';

export type Loaded<T> = { ok: true; data: T } | { ok: false; reason: 'unconfigured' | 'error'; message: string };

/** Run a read through the restricted public role. */
export async function publicRead<T>(fn: (q: Queryable) => Promise<T>): Promise<Loaded<T>> {
  let db: Db;
  try {
    db = await getDb();
  } catch (e) {
    if (e instanceof DbUnavailableError) return { ok: false, reason: 'unconfigured', message: e.message };
    return { ok: false, reason: 'error', message: 'Database connection failed.' };
  }
  try {
    return { ok: true, data: await db.asPublic(fn) };
  } catch (e) {
    console.error('publicRead failed', (e as Error).message);
    return { ok: false, reason: 'error', message: 'The request could not be completed.' };
  }
}

/** Record an actual internal usage event (views, evidence opens, downloads). Best effort. */
export async function recordUsage(kind: 'record_view' | 'story_view' | 'evidence_open' | 'export_download' | 'receipt_view' | 'pack_saved', targetId: string) {
  if (isReadOnlyPreview()) return; // no persistent store: do not record ephemeral counts
  try {
    const db = await getDb();
    await db.query(`insert into usage_events (kind, target_id) values ($1, $2)`, [kind, targetId.slice(0, 100)]);
  } catch {
    // usage counting must never break a page
  }
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
