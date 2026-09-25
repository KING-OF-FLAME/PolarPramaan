import { z } from 'zod';

export const CODE_VERSION = 'calc-v1';

export const RecipeSchema = z
  .object({
    seriesKey: z.string().min(3).max(120),
    sourceVersionId: z.string().uuid(),
    /** Calendar month filter for monthly series (e.g. 9 = September). */
    month: z.number().int().min(1).max(12).nullable().default(null),
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Rows flagged with these provider labels are excluded (e.g. near-real-time rows). */
    excludeFlags: z.array(z.string().max(60)).max(10).default([]),
    missing: z.literal('exclude').default('exclude'),
    stats: z.array(z.enum(['mean', 'min', 'max', 'first_last', 'trend', 'baseline_anomaly', 'rank'])).min(1).max(7),
    /** Optional latitude band for per-observation data with positions (inclusive). */
    latRange: z.object({ min: z.number().min(-90).max(90), max: z.number().min(-90).max(90) }).nullable().default(null),
    baseline: z
      .object({ start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .nullable()
      .default(null),
  })
  .refine((r) => r.periodStart <= r.periodEnd, 'periodStart must not be after periodEnd');

export type Recipe = z.infer<typeof RecipeSchema>;

/** Canonical JSON (sorted keys) so the same recipe always hashes the same. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}
