import Link from 'next/link';
import { notFound } from 'next/navigation';
import { INVESTIGATIONS } from '@/lib/classroom/investigations';
import { loadInvestigation } from '@/lib/classroom/load';
import PredictReveal from '@/components/PredictReveal';
import { PageHeader, SetupRequired } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function InvestigationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const inv = INVESTIGATIONS.find((i) => i.slug === slug);
  if (!inv) notFound();
  const res = await loadInvestigation(slug);
  if (!res.ok || !res.data) return <SetupRequired what="This investigation computes its data from the catalog." />;
  const d = res.data;
  const monthly = d.known.result.series.frequency === 'monthly';
  const pts = (rows: typeof d.known.result.rows) => rows.map((r) => ({ label: monthly ? r.rowKey.slice(0, 4) : `${r.lat?.toFixed(2)}°`, value: r.included ? r.value : null }));
  const sortLat = (rows: typeof d.known.result.rows) => [...rows].sort((a, b) => (b.lat ?? 0) - (a.lat ?? 0));
  const known = monthly ? pts(d.known.result.rows) : pts(sortLat(d.known.result.rows));
  const withheld = monthly ? pts(d.withheld.result.rows) : pts(sortLat(d.withheld.result.rows));
  return (
    <div>
      <PageHeader title={inv.title} lead={inv.summary} />
      <ol className="list-decimal pl-5 mb-4 text-sm space-y-1">
        {inv.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <PredictReveal
        question={inv.question}
        options={inv.options}
        known={known}
        withheld={withheld}
        units={d.known.result.series.units}
        correct={d.answer.correct}
        explanation={d.answer.explanation}
        calcLinks={d.answer.calcIds.map((id, i) => ({ href: `/calc/${id}`, label: i === 0 ? 'Calculation: shown period' : 'Calculation: revealed period' }))}
        knownLabel={monthly ? `${d.known.recipe.periodStart.slice(0, 4)}–${d.known.recipe.periodEnd.slice(0, 4)}` : 'Observations north of 65°S'}
        withheldLabel={monthly ? `${d.withheld.recipe.periodStart.slice(0, 4)} onwards` : 'observations south of 65°S'}
      />
      <p className="text-sm mt-4">
        Source: <Link href={`/records/${d.known.result.source.recordId}`}>{d.known.result.source.title}</Link>. {d.known.result.source.citation}
      </p>
      <p className="text-sm mt-2">
        <Link href={`/classroom/${slug}/teacher`}>Open the printable teacher pack</Link>
      </p>
    </div>
  );
}
