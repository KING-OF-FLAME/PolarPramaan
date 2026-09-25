import Link from 'next/link';
import { publicRead } from '@/lib/web/data';
import { checkStatement } from '@/lib/misconceptions/check';
import { Badge, Notice, PageHeader, SetupRequired } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Challenge a Headline' };

const TONE = { supported: 'ok', contradicted: 'error', mixed: 'warn', insufficient: 'neutral' } as const;
const EXAMPLES = [
  'Antarctic sea ice has been increasing since 1979.',
  'Arctic sea ice reaches its minimum in March.',
  'The record low Arctic sea ice extent for September was in 2020.',
  'Melting Arctic sea ice is the main cause of sea level rise.',
  'Arctic sea ice concentration fell to 4 million km².',
  'Arctic sea ice thickness has halved.',
];

export default async function Check({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const statement = (s ?? '').trim().slice(0, 500);
  const res = statement ? await publicRead((q) => checkStatement(q, statement)) : null;
  return (
    <div>
      <PageHeader
        title="Challenge a Headline"
        lead="Enter a polar-science statement. The checker tests what it can against the stored NSIDC data and the catalog text, then labels each part supported, contradicted, mixed or insufficient, with its evidence. It never gives a confidence percentage."
      />
      <form className="card p-4 space-y-3">
        <label className="label" htmlFor="s">
          Statement or headline
        </label>
        <textarea id="s" name="s" className="input" rows={2} defaultValue={statement} maxLength={500} required />
        <button className="btn btn-primary">Check it</button>
        <p className="text-sm muted">
          Try:{' '}
          {EXAMPLES.map((e, i) => (
            <span key={e}>
              <Link href={`/check?s=${encodeURIComponent(e)}`}>{e}</Link>
              {i < EXAMPLES.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </p>
      </form>
      {res && !res.ok && <SetupRequired />}
      {res && res.ok && (
        <section className="mt-6 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-semibold">Overall</h2>
            <Badge tone={TONE[res.data.overall]}>{res.data.overall}</Badge>
            <span className="text-sm muted">
              Parsed: region {res.data.parsed.region ?? '—'}, metric {res.data.parsed.metric ?? '—'}, month {res.data.parsed.month ?? '—'}, years{' '}
              {res.data.parsed.years.join(', ') || '—'}, direction {res.data.parsed.direction ?? '—'}
            </span>
          </div>
          {res.data.findings.map((f, i) => (
            <div key={i} className="card p-4">
              <p className="font-semibold">
                {f.aspect} <Badge tone={TONE[f.assessment]}>{f.assessment}</Badge>
              </p>
              <p className="mt-1">{f.explanation}</p>
              {f.evidence.map((e, j) => (
                <div key={j} className="text-sm mt-2 rounded p-2" style={{ background: 'var(--surface-2)' }}>
                  <p className="font-medium">{e.label}</p>
                  <p className="muted">{e.detail}</p>
                  {e.spanId && e.recordId && (
                    <Link href={`/records/${e.recordId}?span=${e.spanId}#span-${e.spanId}`}>Open evidence</Link>
                  )}
                </div>
              ))}
            </div>
          ))}
          {res.data.rewrite && (
            <Notice tone="ok" title="A qualified rewrite, based only on the evidence above">
              {res.data.rewrite}
            </Notice>
          )}
          {res.data.passages.length > 0 && (
            <details className="card p-4">
              <summary className="cursor-pointer font-semibold">Related passages for your own reading ({res.data.passages.length})</summary>
              <ul className="mt-2 space-y-2 text-sm">
                {res.data.passages.map((p) => (
                  <li key={p.spanId}>
                    “{p.text.slice(0, 300)}
                    {p.text.length > 300 ? '…' : ''}” — <Link href={`/records/${p.recordId}?span=${p.spanId}#span-${p.spanId}`}>{p.recordTitle}</Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-sm muted">{res.data.coverageNote}</p>
        </section>
      )}
    </div>
  );
}
