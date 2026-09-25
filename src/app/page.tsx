import Link from 'next/link';
import { publicRead } from '@/lib/web/data';
import { KIND_LABEL, SetupRequired, Notice, fmtDate, Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const res = await publicRead(async (q) => {
    const counts = await q.query<{ content_kind: string; archival: string; n: number }>(
      `select content_kind, archival, count(*)::int n from public_records group by 1, 2 order by 1, 2`,
    );
    const [india] = await q.query<{ n: number }>(`select count(*)::int n from public_records where india_specific`);
    const [spans] = await q.query<{ n: number }>(`select count(*)::int n from public_evidence_spans`);
    const [obs] = await q.query<{ n: number }>(`select count(*)::int n from public_observations`);
    const stories = await q.query<{ slug: string; title: string; language: string; audience: string; kind: string; published_at: Date; correction_notice: string | null }>(
      `select distinct on (artifact_id) slug, title, language, audience, kind, published_at, correction_notice
         from public_artifact_versions where publication_status = 'published' order by artifact_id, version_no desc limit 6`,
    );
    return { counts, india: india.n, spans: spans.n, obs: obs.n, stories };
  });

  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr] items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-strong)' }}>
            SIH26063 · independent project
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mt-2">From polar evidence to public understanding</h1>
          <p className="mt-4 text-lg max-w-2xl">
            PolarPramaan connects every public science claim to the exact evidence behind it: a report passage, a data row or a video
            timestamp. It also tracks what needs correcting when that evidence changes.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/ask" className="btn btn-primary">
              Find evidence
            </Link>
            <Link href="/data-stories" className="btn btn-secondary">
              Reproduce a chart
            </Link>
            <Link href="/workspace/studio" className="btn btn-secondary">
              Create a verified story
            </Link>
          </div>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">What is in the catalog now</h2>
          {!res.ok ? (
            <SetupRequired what="Catalog counts come from the database." />
          ) : (
            <>
              <table className="data mt-3" aria-label="Catalog counts by content type">
                <thead>
                  <tr>
                    <th>Content type</th>
                    <th>Archived</th>
                    <th>Link-only</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(KIND_LABEL).map((k) => {
                    const a = res.data.counts.find((c) => c.content_kind === k && c.archival === 'archived')?.n ?? 0;
                    const l = res.data.counts.find((c) => c.content_kind === k && c.archival === 'link_only')?.n ?? 0;
                    return (
                      <tr key={k}>
                        <td>
                          <Link href={`/explore?kind=${k}`}>{KIND_LABEL[k]}</Link>
                        </td>
                        <td>{a}</td>
                        <td>{l}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-sm muted mt-3">
                {res.data.india} India/NCPOR-specific records · {res.data.spans.toLocaleString('en-IN')} evidence passages and data rows ·{' '}
                {res.data.obs.toLocaleString('en-IN')} numeric observations. Link-only items point to the official source; their content is not
                stored or reused.
              </p>
            </>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold">The evidence-to-publication loop</h2>
        <ol className="grid gap-4 mt-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['1. Real source', 'Records keep provider, identifier, rights, retrieval date, version and content hash.', '/explore'],
            ['2. Reproduce a result', 'Charts come from stored observations with a downloadable recipe. No AI writes a number.', '/data-stories'],
            ['3. Show me the proof', 'Every answer sentence opens the exact passage, row or timestamp. Out-of-catalog questions are refused.', '/ask'],
            ['4. Same science, different reader', 'School, press and researcher versions in English and Hindi, with a fact-difference check.', '/workspace/studio'],
            ['5. Reviewed publication', 'Independent review, website publishing, export packages and a public evidence receipt with QR.', '/stories'],
            ['6. One correction, every affected story', 'Withdraw a source and every dependent draft, schedule and page is flagged.', '/about#corrections'],
          ].map(([t, d, href]) => (
            <li key={t} className="card p-4">
              <Link href={href} className="font-semibold">
                {t}
              </Link>
              <p className="text-sm muted mt-1">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold">Recently published</h2>
          <Link href="/stories" className="text-sm">
            All stories
          </Link>
        </div>
        {res.ok && res.data.stories.length === 0 && (
          <Notice>
            No stories are published yet. Stories appear here only after an independent review in the editorial workspace. Nothing is
            pre-filled.
          </Notice>
        )}
        {res.ok && res.data.stories.length > 0 && (
          <ul className="grid gap-3 mt-3 sm:grid-cols-2">
            {res.data.stories.map((s) => (
              <li key={s.slug} className="card p-4">
                <Link href={`/stories/${s.slug}`} className="font-semibold">
                  {s.title}
                </Link>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <Badge>{s.language === 'hi' ? 'हिन्दी' : 'English'}</Badge>
                  <Badge>{s.audience}</Badge>
                  <Badge>{s.kind}</Badge>
                  {s.correction_notice && <Badge tone="warn">Under correction review</Badge>}
                </div>
                <p className="text-xs muted mt-2">Published {fmtDate(s.published_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
