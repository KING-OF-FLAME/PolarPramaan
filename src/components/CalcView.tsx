import Link from 'next/link';
import type { CalcResult } from '@/lib/calc/compute';
import type { Recipe } from '@/lib/calc/recipe';
import { decimalsFor, fmt, fmtSigned, rowKeyLabel } from '@/lib/calc/format';
import { claimsFromCalc } from '@/lib/studio/templates';
import SeriesChart from './SeriesChart';
import { Badge, Notice, fmtDate } from './ui';

export function CalcView({ recipe, result, calcId }: { recipe: Recipe; result: CalcResult; calcId: string | null }) {
  const s = result.stats;
  const units = result.series.units;
  const d = decimalsFor(units);
  const monthly = result.series.frequency === 'monthly';
  const points = result.rows.map((r) => ({ label: monthly ? r.rowKey.slice(0, 4) + (recipe.month ? '' : r.rowKey.slice(4)) : r.rowKey, value: r.included ? r.value : null }));
  let trendLine: { a: number; b: number } | null = null;
  if (s.trend && result.rows.length) {
    const inc = result.rows.filter((r) => r.included && r.value != null);
    const xs = inc.map((r) => Number(r.t.slice(0, 4)) + (Number(r.t.slice(5, 7)) - 1) / 12);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = inc.reduce((a, r) => a + r.value!, 0) / inc.length;
    const slope = s.trend.perDecade / 10;
    trendLine = { a: my + slope * (Number(result.rows[0].t.slice(0, 4)) - mx), b: my + slope * (Number(result.rows[result.rows.length - 1].t.slice(0, 4)) - mx) };
  }
  const fakeRun = { id: calcId ?? 'unsaved', recipe, recipeHash: '', codeVersion: '', result, units, createdAt: '' };
  const claims = claimsFromCalc(fakeRun, 'x');
  return (
    <div className="space-y-5">
      <div className="card p-4">
        <SeriesChart points={points} units={units} title={`${result.series.seriesKey}${recipe.month ? `, month ${recipe.month}` : ''}, ${recipe.periodStart}–${recipe.periodEnd}`} trend={trendLine} hideWithheld />
        {trendLine && <p className="text-xs muted">Dashed line: least-squares fit (descriptive only).</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card p-4">
          <h2 className="font-semibold">Results</h2>
          <dl className="text-sm mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="muted">Values used</dt>
            <dd>
              {result.n} {result.nExcluded ? `(${result.nExcluded} excluded)` : ''}
            </dd>
            {s.mean != null && s.mean !== undefined && (
              <>
                <dt className="muted">Mean</dt>
                <dd>{fmt(s.mean, units)}</dd>
              </>
            )}
            {s.min && (
              <>
                <dt className="muted">Lowest</dt>
                <dd>
                  {fmt(s.min.value, units)} ({monthly ? rowKeyLabel(s.min.rowKey) : s.min.rowKey})
                </dd>
              </>
            )}
            {s.max && (
              <>
                <dt className="muted">Highest</dt>
                <dd>
                  {fmt(s.max.value, units)} ({monthly ? rowKeyLabel(s.max.rowKey) : s.max.rowKey})
                </dd>
              </>
            )}
            {s.trend && (
              <>
                <dt className="muted">Fitted change</dt>
                <dd>
                  {fmtSigned(s.trend.perDecade, units)} per decade (n={s.trend.n}, r²={s.trend.r2.toFixed(2)})
                </dd>
              </>
            )}
            {s.first && s.last && (
              <>
                <dt className="muted">First → latest</dt>
                <dd>
                  {fmt(s.first.value, units)} ({s.first.rowKey}) → {fmt(s.last.value, units)} ({s.last.rowKey})
                </dd>
              </>
            )}
          </dl>
          {s.trendUnavailableReason && <Notice tone="warn">{s.trendUnavailableReason}</Notice>}
          <p className="text-xs muted mt-2">Full precision is kept internally; values are displayed to {d} decimal place(s).</p>
        </section>
        <section className="card p-4">
          <h2 className="font-semibold">Explanation from the computed results</h2>
          <div className="text-sm mt-2 space-y-2">
            {claims.map((c) => (
              <p key={c.key}>
                {c.text.en}{' '}
                {calcId ? (
                  <Link href={`/calc/${calcId}`} className="text-xs">
                    [calc {calcId.slice(0, 8)}]
                  </Link>
                ) : (
                  <span className="text-xs muted">[save to get a calculation id]</span>
                )}
              </p>
            ))}
            <details>
              <summary className="cursor-pointer text-sm">हिन्दी (unreviewed machine template)</summary>
              {claims.map((c) => (
                <p key={c.key} lang="hi" className="mt-1">
                  {c.text.hi}
                </p>
              ))}
            </details>
          </div>
          <p className="text-xs muted mt-2">Template text: every number is inserted from the calculation. No AI generated these sentences.</p>
        </section>
      </div>
      {result.qualityNotes.length > 0 && (
        <Notice tone="warn" title="Data quality notes">
          <ul className="list-disc pl-5">
            {result.qualityNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Notice>
      )}
      <section className="card p-4 text-sm space-y-1">
        <h2 className="font-semibold text-base">Provenance</h2>
        <p>
          Source: <Link href={`/records/${result.source.recordId}`}>{result.source.title}</Link> · version status <Badge>{result.source.versionStatus}</Badge> · retrieved{' '}
          {fmtDate(result.source.retrievedAt, true)}
        </p>
        {result.source.citation && <p>Cite: {result.source.citation}</p>}
        <p>
          Recipe: series <code>{recipe.seriesKey}</code>, {recipe.month ? `month ${recipe.month}, ` : ''}
          {recipe.periodStart} to {recipe.periodEnd}, missing values {recipe.missing}d{recipe.excludeFlags.length ? `, excluding flags ${recipe.excludeFlags.join(', ')}` : ''}
          {recipe.latRange ? `, latitude ${recipe.latRange.min} to ${recipe.latRange.max}` : ''}.
        </p>
      </section>
      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">Data table ({result.rows.length} rows)</summary>
        <div className="overflow-x-auto mt-3">
          <table className="data">
            <thead>
              <tr>
                <th>Row</th>
                <th>Date</th>
                <th>Value ({units})</th>
                <th>Raw</th>
                <th>Flag</th>
                <th>Used?</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.rowKey}>
                  <td>{r.rowKey}</td>
                  <td>{r.t}</td>
                  <td>{r.value == null ? '—' : r.value}</td>
                  <td>{r.raw}</td>
                  <td>{r.flag ?? ''}</td>
                  <td>{r.included ? 'yes' : `no: ${r.excludedReason}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
