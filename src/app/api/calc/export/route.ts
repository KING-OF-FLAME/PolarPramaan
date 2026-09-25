// On-request exports for an unsaved recipe (computed through the public role, nothing stored).
import { getDb } from '@/lib/db';
import { computeRecipe, recipeHash } from '@/lib/calc/compute';
import { CODE_VERSION } from '@/lib/calc/recipe';
import { rowsCsv, verifyScript } from '@/lib/calc/export';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const format = url.searchParams.get('format') ?? 'json';
  if (format === 'verify') return new Response(verifyScript(), { headers: { 'content-type': 'text/javascript; charset=utf-8', 'content-disposition': 'attachment; filename="verify-calculation.mjs"' } });
  let input: unknown;
  try {
    input = JSON.parse(url.searchParams.get('recipe') ?? '');
  } catch {
    return new Response('Invalid recipe', { status: 400 });
  }
  try {
    const db = await getDb();
    const { recipe, result } = await db.asPublic((q) => computeRecipe(q, input, { publicOnly: true }));
    const run = { id: 'unsaved', recipe, recipeHash: recipeHash(recipe), codeVersion: CODE_VERSION, result, units: result.series.units, createdAt: new Date().toISOString() };
    const base = `polarpramaan-${recipe.seriesKey}-${recipe.periodStart}-${recipe.periodEnd}`.replace(/[^A-Za-z0-9._-]/g, '_');
    if (format === 'csv') return new Response(rowsCsv(run), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${base}-rows.csv"` } });
    const payload = { calculationId: null, note: 'Computed on request; not saved.', codeVersion: run.codeVersion, recipeHash: run.recipeHash, recipe, units: run.units, source: result.source, stats: result.stats, n: result.n, qualityNotes: result.qualityNotes, attribution: result.source.citation };
    return new Response(JSON.stringify(payload, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${base}-recipe.json"` } });
  } catch (e) {
    return new Response((e as Error).message.slice(0, 200), { status: 400 });
  }
}
