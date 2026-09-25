import { getDb } from '@/lib/db';
import { loadCalculation } from '@/lib/calc/compute';
import { recordUsage, isUuid } from '@/lib/web/data';
import { verifyScript, rowsCsv } from '@/lib/calc/export';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new Response('Not found', { status: 404 });
  const format = new URL(req.url).searchParams.get('format') ?? 'json';
  let run;
  try {
    const db = await getDb();
    run = await db.asPublic((q) => loadCalculation(q, id, true));
  } catch {
    return new Response('Database not configured', { status: 503 });
  }
  if (!run) return new Response('Not found or not public', { status: 404 });
  await recordUsage('export_download', `calc:${id}:${format}`);
  const base = `polarpramaan-calc-${id.slice(0, 8)}`;
  if (format === 'csv') {
    return new Response(rowsCsv(run), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${base}-rows.csv"` } });
  }
  if (format === 'verify') {
    return new Response(verifyScript(), { headers: { 'content-type': 'text/javascript; charset=utf-8', 'content-disposition': `attachment; filename="verify-calculation.mjs"` } });
  }
  const payload = {
    calculationId: run.id,
    codeVersion: run.codeVersion,
    recipeHash: run.recipeHash,
    recipe: run.recipe,
    units: run.units,
    source: run.result.source,
    stats: run.result.stats,
    n: run.result.n,
    qualityNotes: run.result.qualityNotes,
    method: {
      mean: 'arithmetic mean of included values',
      trend: 'ordinary least squares slope of value against decimal year (fraction of the year elapsed at the observation timestamp, UTC), multiplied by 10 for per-decade',
      missing: 'rows whose provider value is missing (-9999 or empty) are excluded, never zero-filled',
    },
    attribution: run.result.source.citation,
    createdAt: run.createdAt,
  };
  return new Response(JSON.stringify(payload, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${base}-recipe.json"` } });
}
