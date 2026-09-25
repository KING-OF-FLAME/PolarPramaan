import { notFound } from 'next/navigation';
import { INVESTIGATIONS } from '@/lib/classroom/investigations';
import { loadInvestigation } from '@/lib/classroom/load';
import { SetupRequired, fmtDate } from '@/components/ui';
import { fmt } from '@/lib/calc/format';
import { appUrl } from '@/lib/env';
import PrintButton from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

export default async function TeacherPack({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const inv = INVESTIGATIONS.find((i) => i.slug === slug);
  if (!inv) notFound();
  const res = await loadInvestigation(slug);
  if (!res.ok || !res.data) return <SetupRequired />;
  const d = res.data;
  const base = appUrl();
  return (
    <article className="max-w-3xl mx-auto space-y-4">
      <div className="no-print">
        <PrintButton />
      </div>
      <h1 className="text-2xl font-bold">Teacher pack: {inv.title}</h1>
      <p className="text-sm muted">
        PolarPramaan (independent SIH26063 project) · generated {fmtDate(new Date(), true)} · suggested level: {inv.level}. No curriculum alignment is
        claimed.
      </p>
      <section>
        <h2 className="font-semibold text-lg">Learning goal</h2>
        <p>Students read a real observational record, make a reasoned prediction, compare it with withheld observations, and explain which evidence changed their thinking.</p>
      </section>
      <section>
        <h2 className="font-semibold text-lg">Steps</h2>
        <ol className="list-decimal pl-5">
          {inv.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
      <section>
        <h2 className="font-semibold text-lg">Question</h2>
        <p>{inv.question}</p>
        <ul className="list-disc pl-5">
          {inv.options.map((o) => (
            <li key={o.id}>{o.label}</li>
          ))}
        </ul>
      </section>
      <section className="card p-4">
        <h2 className="font-semibold text-lg">Answer key</h2>
        <p>
          <strong>{inv.options.find((o) => o.id === d.answer.correct)?.label}.</strong> {d.answer.explanation}
        </p>
        <table className="data mt-3">
          <thead>
            <tr>
              <th>Period</th>
              <th>n</th>
              <th>Mean</th>
              <th>Lowest</th>
              <th>Highest</th>
              <th>Calculation</th>
            </tr>
          </thead>
          <tbody>
            {[d.known, d.withheld].map((r) => (
              <tr key={r.id}>
                <td>
                  {r.recipe.periodStart} → {r.recipe.periodEnd}
                  {r.recipe.latRange ? ` (lat ${r.recipe.latRange.min}…${r.recipe.latRange.max})` : ''}
                </td>
                <td>{r.result.n}</td>
                <td>{fmt(r.result.stats.mean, r.units)}</td>
                <td>{r.result.stats.min ? `${fmt(r.result.stats.min.value, r.units)} (${r.result.stats.min.rowKey})` : '—'}</td>
                <td>{r.result.stats.max ? `${fmt(r.result.stats.max.value, r.units)} (${r.result.stats.max.rowKey})` : '—'}</td>
                <td className="break-all text-xs">
                  {base}/calc/{r.id}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2 className="font-semibold text-lg">Discussion prompts</h2>
        <ul className="list-disc pl-5">
          <li>What is the difference between a single unusual year and a long-term change?</li>
          <li>What does this dataset measure, and what does it not measure (for example, extent versus thickness)?</li>
          <li>Why do scientists record where every number came from?</li>
        </ul>
      </section>
      <section className="text-sm">
        <h2 className="font-semibold text-lg">Source and citation</h2>
        <p>{d.known.result.source.citation ?? d.known.result.source.title}</p>
        <p>Data quality notes: {[...new Set([...d.known.result.qualityNotes, ...d.withheld.result.qualityNotes])].join(' ') || 'none'}</p>
      </section>
    </article>
  );
}
