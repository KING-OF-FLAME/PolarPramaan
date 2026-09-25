// Server-side configuration. Reading a missing optional key never throws; the
// dependent capability reports itself unavailable instead.
import 'server-only';

export type DbMode = 'postgres' | 'pglite-file' | 'unconfigured';

export function dbMode(): DbMode {
  const url = process.env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) return 'postgres';
  if (url && url.startsWith('pglite:')) return 'pglite-file';
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

/** One-person development override: lets an author approve their own draft.
 *  Always off in production; approvals made with it are labelled non-independent. */
export function allowSelfReview(): boolean {
  return !isProduction() && process.env.ALLOW_SELF_REVIEW === 'true';
}

export function externalSocialAllowed(): boolean {
  return process.env.ALLOW_EXTERNAL_SOCIAL_PUBLISH === 'true';
}
