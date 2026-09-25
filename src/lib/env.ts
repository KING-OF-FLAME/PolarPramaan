// Server-side configuration. Reading a missing optional key never throws; the
// dependent capability reports itself unavailable instead.
import 'server-only';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type DbMode = 'postgres' | 'pglite-file' | 'pglite-snapshot' | 'unconfigured';

export const SNAPSHOT_DB_PATH = join(process.cwd(), 'data', 'build', 'snapshot-db.tar.gz');

export function dbMode(): DbMode {
  const url = process.env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) return 'postgres';
  if (url && url.startsWith('pglite:')) return 'pglite-file';
  // Read-only public preview: a database image built from the committed snapshot at build time.
  if (!url && process.env.PREVIEW_SNAPSHOT_DB === '1' && existsSync(SNAPSHOT_DB_PATH)) return 'pglite-snapshot';
  // Local development default: a file-backed PGlite database under .data/.
  if (!url && process.env.NODE_ENV !== 'production' && !process.env.VERCEL) return 'pglite-file';
  return 'unconfigured';
}

export function appUrl(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  return u.replace(/\/$/, '');
}

export function llmConfig() {
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  const provider = process.env.LLM_PROVIDER || 'anthropic';
  return key && model ? { provider, key, model } : null;
}

export const isProduction = () => process.env.NODE_ENV === 'production';

/** True when running the read-only snapshot preview (no persistent database). */
export const isReadOnlyPreview = () => dbMode() === 'pglite-snapshot';

/** One-person development override: lets an author approve their own draft.
 *  Always off in production; approvals made with it are labelled non-independent. */
export function allowSelfReview(): boolean {
  return !isProduction() && process.env.ALLOW_SELF_REVIEW === 'true';
}

export function externalSocialAllowed(): boolean {
  return process.env.ALLOW_EXTERNAL_SOCIAL_PUBLISH === 'true';
}
