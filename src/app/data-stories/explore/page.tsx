import Link from 'next/link';
import { publicRead, isUuid } from '@/lib/web/data';
import { computeRecipe, CalcError } from '@/lib/calc/compute';
import { PageHeader, SetupRequired, Notice } from '@/components/ui';
import { CalcView } from '@/components/CalcView';
import { monthName } from '@/lib/calc/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reproducible chart' };

type SP = Promise<Record<string, string | undefined>>;

export default async function ExploreSeries({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const sv = sp.sv ?? '';
  const series = (sp.series ?? '').slice(0, 120);
  if (!isUuid(sv) || !series) return <Notice tone="warn">Choose a series from <Link href="/data-stories">Data Stories</Link>.</Notice>;
  const month = sp.month ? Number(sp.month) : null;
  const res = await publicRead(async (q) => {
    try {
      const [meta] = await q.query<{ frequency: string; t0: string; t1: string }>(
        `select ds.frequency, (select to_char(min(obs_time),'YYYY-MM-DD') from public_observations o where o.series_id = ds.id) t0,
                (select to_char(max(obs_time),'YYYY-MM-DD') from public_observations o where o.series_id = ds.id) t1
           from public_dataset_series ds where ds.source_version_id = $1 and ds.series_key = $2`,
        [sv, series],
      );
      if (!meta) return { error: 'Series not found or not public.' };
      // Clamp the requested period to the data's actual coverage so labels never overstate it.
      const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? '') && sp.from! > meta.t0 ? sp.from! : meta.t0;
      const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? '') && sp.to! < meta.t1 ? sp.to! : meta.t1;
      const recipeInput = {
        seriesKey: series,
        sourceVersionId: sv,
        month: month && month >= 1 && month <= 12 ? month : null,
        periodStart: from,
        periodEnd: to,
        excludeFlags: sp.final === '1' ? ['NSIDC-0803'] : [],
        stats: ['mean', 'min', 'max', 'first_last', 'trend'],
      };
      const out = await computeRecipe(q, recipeInput, { publicOnly: true });
      return { ...out, meta };
    } catch (e) {
      if (e instanceof CalcError || (e as Error).name === 'ZodError') return { error: (e as Error).message };
      throw e;
    }
  });
  if (!res.ok) return <SetupRequired />;
  if ('error' in res.data) return <Notice tone="error">{res.data.error}</Notice>;
  const { recipe, result, meta } = res.data;
  const monthly = meta?.frequency === 'monthly';
  return (
    <div>
      <PageHeader title={result.series.description ?? result.series.seriesKey} lead={`Source: ${result.source.title}`} />
      <form className="card p-4 grid gap-3 sm:grid-cols-5 items-end mb-5 no-print">
        <input type="hidden" name="sv" value={sv} />
        <input type="hidden" name="series" value={series} />
        {monthly && (
          <div>
            <label className="label" htmlFor="month">
              Month
            </label>
            <select id="month" name="month" defaultValue={recipe.month ?? ''} className="input">
              <option value="">All months</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {monthName(i + 1)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="from">
            From
          </label>
          <input id="from" name="from" type="date" defaultValue={recipe.periodStart} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="to">
            To
          </label>
          <input id="to" name="to" type="date" defaultValue={recipe.periodEnd} className="input" />
        </div>
        {monthly && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="final" value="1" defaultChecked={recipe.excludeFlags.includes('NSIDC-0803')} /> Final data only (exclude near-real-time)
          </label>
        )}
        <button className="btn btn-primary">Recompute</button>
      </form>
      <CalcView recipe={recipe} result={result} calcId={null} />
      <form method="post" action="/api/calc" className="mt-5 no-print">
        <input type="hidden" name="recipe" value={JSON.stringify(recipe)} />
        <button className="btn btn-primary">Save calculation and get downloads</button>
        <p className="text-sm muted mt-1">
          Saving stores the recipe and result under a stable id, so stories can cite it and you can download the selected rows, recipe JSON and a verification script.
        </p>
      </form>
    </div>
  );
}
