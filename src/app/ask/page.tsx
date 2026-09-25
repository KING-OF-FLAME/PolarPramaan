import Link from 'next/link';
import { publicRead } from '@/lib/web/data';
import { askWithEvidence, type AskResult } from '@/lib/evidence/ask';
import { llmStatus } from '@/lib/llm';
import { Badge, Notice, PageHeader, SetupRequired } from '@/components/ui';
import { formatMs } from '@/lib/ingest/parse/captions';
import { getDb } from '@/lib/db';
import { rateLimit } from '@/lib/auth/store';
import { clientIp } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ask with Evidence' };

const EXAMPLES = [
  'What was the Arctic sea ice extent in September 2012?',
  'Why has Antarctic sea ice declined since 2016?',
  'When was Dakshin Gangotri established?',
  'What is the difference between sea ice extent and area?',
];

export default async function Ask({ searchParams }: { searchParams: Promise<{ q?: string; ai?: string }> }) {
  const sp = await searchParams;
  const question = (sp.q ?? '').trim().slice(0, 400);
  const wantAi = sp.ai === '1';
  const llm = llmStatus();
  let result: AskResult | null = null;
  let error: 'setup' | 'rate' | null = null;
  if (question) {
    let allowed = true;
    if (wantAi && llm.configured) {
      try {
        const db = await getDb();
        allowed = await rateLimit(db, `ask-ai:${await clientIp()}`, 10, 3600);
      } catch {
        allowed = false;
      }
    }
    if (!allowed) error = 'rate';
    else {
      const r = await publicRead((q) => askWithEvidence(q, question, { publicOnly: true, useLlm: wantAi }));
      if (r.ok) result = r.data;
      else error = 'setup';
    }
  }
  return (
    <div>
      <PageHeader
        title="Ask with Evidence"
        lead="Ask a polar-science question. Every statement links to the exact passage, data row or video timestamp it comes from. If the catalog has no adequate evidence, the answer says so."
      />
      <form className="card p-4 space-y-3" role="search">
        <label className="label" htmlFor="q">
          Your question
        </label>
        <input id="q" name="q" defaultValue={question} className="input" maxLength={400} placeholder="e.g. How low did Arctic sea ice go in September 2012?" required />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ai" value="1" defaultChecked={wantAi} disabled={!llm.configured} />
          Synthesise with AI (quotes are still checked){!llm.configured && <span className="muted"> · unavailable: no AI provider configured</span>}
        </label>
        <button className="btn btn-primary">Find evidence</button>
        <p className="text-sm muted">
          Try:{' '}
          {EXAMPLES.map((e, i) => (
            <span key={e}>
              <Link href={`/ask?q=${encodeURIComponent(e)}`}>{e}</Link>
              {i < EXAMPLES.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </p>
      </form>

      {error === 'setup' && <SetupRequired />}
      {error === 'rate' && <Notice tone="warn">AI synthesis limit reached for now (10 per hour). Untick the AI option to get an extractive answer.</Notice>}
      {result && (
        <section className="mt-6 space-y-4" aria-live="polite">
          <div className="flex gap-2 items-center flex-wrap">
            <h2 className="text-xl font-semibold">Result</h2>
            <Badge tone={result.status === 'answered' ? 'ok' : result.status === 'insufficient' ? 'warn' : 'error'}>
              {result.status === 'answered' ? 'Evidence found' : result.status === 'insufficient' ? 'Insufficient evidence' : result.status === 'provider_error' ? 'AI provider error' : 'Empty question'}
            </Badge>
            <Badge>{result.mode === 'llm' ? `AI synthesis (${result.model})` : 'Extractive: verbatim quotes only'}</Badge>
          </div>
          {result.notes.map((n, i) => (
            <p key={i} className="text-sm muted">
              {n}
            </p>
          ))}
          {result.status === 'insufficient' && (
            <Notice tone="warn" title="No answer was generated">
              The rights-cleared sources in this catalog do not cover this question well enough. Try <Link href="/explore">browsing the catalog</Link> or
              rephrasing with specific terms (region, month, metric).
            </Notice>
          )}
          <ol className="space-y-3">
            {result.claims.map((c) => {
              const hit = (id: string) => result!.retrieved.find((h) => h.spanId === id)!;
              return (
                <li key={c.id} className="card p-4">
                  <details>
                    <summary className="cursor-pointer">
                      <span className="font-medium">{c.text}</span>{' '}
                      <Badge tone="ok" title="Quote matched the stored source text">
                        Quote verified
                      </Badge>{' '}
                      <Badge title="Assessed by software, not by a human reviewer">Machine check</Badge>
                    </summary>
                    <div className="mt-3 space-y-2">
                      {c.evidence.map((e) => {
                        const h = hit(e.spanId);
                        return (
                          <div key={e.spanId} className="rounded-md p-3 text-sm" style={{ background: 'var(--surface-2)' }}>
                            <p>
                              <mark className="evidence">{e.quote}</mark>
                            </p>
                            <p className="muted mt-2">
                              {h.recordTitle} · {h.sourceName}
                              {h.page ? ` · PDF page ${h.page}` : ''}
                              {h.tStartMs != null ? ` · ${formatMs(h.tStartMs)}–${formatMs(h.tEndMs ?? h.tStartMs)}` : ''}
                              {h.rowKey ? ` · row ${h.rowKey}` : ''}
                              {h.license ? ` · ${h.license}` : ''}
                            </p>
                            <p className="mt-1">
                              <Link href={`/records/${h.recordId}?span=${h.spanId}#span-${h.spanId}`}>Open the exact evidence</Link> ·{' '}
                              <a href={h.canonicalUrl}>Original source</a>
                            </p>
                          </div>
                        );
                      })}
                      {c.caveats.length > 0 && <p className="text-sm muted">Caveats: {c.caveats.join(' ')}</p>}
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>
          <p className="text-sm muted">
            Matching a quote shows that the text exists in the source. It does not prove that the interpretation is correct. Nothing here has been reviewed
            by a scientist unless it appears in a <Link href="/stories">published story</Link>.
          </p>
        </section>
      )}
    </div>
  );
}
