import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicRead, isUuid } from '@/lib/web/data';
import { loadCalculation } from '@/lib/calc/compute';
import { CalcView } from '@/components/CalcView';
import { PageHeader, SetupRequired, fmtDate } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function CalcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const res = await publicRead((q) => loadCalculation(q, id, true));
  if (!res.ok) return <SetupRequired />;
  if (!res.data) notFound();
  const run = res.data;
  return (
    <div>
      <PageHeader title={`Calculation ${id.slice(0, 8)}`} lead={`Saved ${fmtDate(run.createdAt, true)} · code ${run.codeVersion} · recipe hash ${run.recipeHash.slice(0, 16)}…`} />
      <div className="flex gap-2 flex-wrap mb-5 no-print">
        <a className="btn btn-secondary" href={`/api/calc/${id}/export?format=csv`}>
          Selected rows (CSV)
        </a>
        <a className="btn btn-secondary" href={`/api/calc/${id}/export?format=json`}>
          Recipe + results (JSON)
        </a>
        <a className="btn btn-secondary" href={`/api/calc/${id}/export?format=verify`}>
          Verification script
        </a>
        <Link className="btn btn-secondary" href={`/data-stories/explore?sv=${run.recipe.sourceVersionId}&series=${encodeURIComponent(run.recipe.seriesKey)}${run.recipe.month ? `&month=${run.recipe.month}` : ''}&from=${run.recipe.periodStart}&to=${run.recipe.periodEnd}`}>
          Change the period
        </Link>
      </div>
      <p className="text-sm muted mb-4">
        To reproduce: download the CSV and JSON, then run <code>node verify-calculation.mjs rows.csv recipe.json</code>. The script recomputes n, mean,
        extremes and the fitted trend without any PolarPramaan code.
      </p>
      <CalcView recipe={run.recipe} result={run.result} calcId={id} />
    </div>
  );
}
