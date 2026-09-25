import Link from 'next/link';
import { getDb } from '@/lib/db';
import { pageActor } from '@/lib/web/guard';
import { searchSpans } from '@/lib/evidence/search';
import { checkUses, suggestAlternatives } from '@/lib/rights/check';
import { createDraftAction, saveCalcAction } from '../actions';
import { Badge, Notice, PageHeader, RightsBadge } from '@/components/ui';
import { monthName } from '@/lib/calc/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Draft Studio' };

type SP = Promise<Record<string, string | undefined>>;

export default async function Studio({ searchParams }: { searchParams: SP }) {
  await pageActor('contributor');
  const sp = await searchParams;
  const db = await getDb();
  const eq = (sp.eq ?? '').slice(0, 200);
  const calcs = await db.query<{ id: string; recipe: { seriesKey: string; month: number | null; periodStart: string; periodEnd: string }; units: string; created_at: Date; status: string; n: number }>(
    `select c.id, c.recipe, c.units, c.created_at, v.status, (c.result->>'n')::int n
       from calculation_runs c join source_versions v on v.id = c.input_source_version_ids[1]
      order by (c.id::text = $1) desc, c.created_at desc limit 25`,
    [sp.calc ?? ''],
  );
  const series = await db.query<{ source_version_id: string; series_key: string; frequency: string; t0: string; t1: string }>(
    `select ds.source_version_id, ds.series_key, ds.frequency,
            (select to_char(min(obs_time),'YYYY-MM-DD') from observations o where o.series_id = ds.id) t0,
            (select to_char(max(obs_time),'YYYY-MM-DD') from observations o where o.series_id = ds.id) t1
       from dataset_series ds join source_versions v on v.id = ds.source_version_id where v.status = 'active' order by ds.series_key`,
  );
  const spans = eq ? await searchSpans(db, eq, { publicOnly: false, limit: 15 }) : [];
  const spanVerdicts = await checkUses(db, [...new Set(spans.map((s) => s.recordId))].map((recordId) => ({ recordId, op: 'quote' as const })));
  const photos = await db.query<{ id: string; title: string; thumbnail_url: string | null; place_name: string | null; status: string | null; credit: string | null }>(
    `select r.id, r.title, r.thumbnail_url, r.place_name, cr.status, r.credit from records r left join current_rights cr on cr.record_id = r.id
      where r.content_kind in ('photo', 'institutional_activity', 'expedition_report') and r.thumbnail_url is not null and r.catalog_status = 'approved'
      order by r.india_specific desc, r.title limit 40`,
  );
  const photoVerdicts = await checkUses(db, photos.map((p) => ({ recordId: p.id, op: 'republish_media' as const })));
  const blocked = (sp.blocked ?? '').split(',').filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const blockedInfo = await Promise.all(
    blocked.map(async (id) => ({ id, verdicts: await checkUses(db, [{ recordId: id, op: 'republish_media' }, { recordId: id, op: 'quote' }, { recordId: id, op: 'transform' }]), alternatives: await suggestAlternatives(db, id) })),
  );

  return (
    <div>
      <PageHeader
        title="Draft Studio"
        lead="Pick computed results, evidence passages and permitted media, then generate traceable English and Hindi drafts for a chosen audience. Rights are enforced on the server, and blocked items come with reasons."
      />
      {sp.error && <Notice tone="error" title="Could not create the draft">{sp.error}</Notice>}
      {blockedInfo.map((b) => (
        <div key={b.id} className="card p-4 mb-4" style={{ borderColor: 'var(--err-text)' }}>
          <p className="font-semibold">Can we publish this? {b.verdicts[0].title}</p>
          <ul className="text-sm mt-2 list-disc pl-5">
            {b.verdicts.map((v) => (
              <li key={v.operation}>
                <strong>{v.operation.replace('_', ' ')}:</strong> {v.reason}
              </li>
            ))}
          </ul>
          <p className="text-sm mt-2">
            Official source: <a href={b.verdicts[0].officialUrl}>{b.verdicts[0].officialUrl}</a>
          </p>
          <p className="font-semibold mt-3 text-sm">Permitted alternatives from the catalog</p>
          {b.alternatives.length === 0 ? (
            <p className="text-sm muted">None found. No permitted item matches the same place or region, so nothing is substituted.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-4 mt-2">
              {b.alternatives.map((a) => (
                <li key={a.recordId} className="text-xs">
                  {a.thumbnailUrl && <img src={a.thumbnailUrl} alt="" className="w-full h-24 object-cover rounded" />}
                  <Link href={`/records/${a.recordId}`}>{a.title}</Link>
                  <p className="muted">{a.why}</p>
                  <p className="muted">{a.credit}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <section className="card p-4 mb-6">
        <h2 className="font-semibold">1. Compute a result (optional)</h2>
        <form action={saveCalcAction} className="grid gap-2 sm:grid-cols-5 items-end mt-2">
          <select name="recipe" className="input sm:col-span-4" aria-label="Preset calculation">
            {series.flatMap((s) =>
              s.frequency === 'monthly'
                ? [9, 2, 3].map((m) => (
                    <option key={s.series_key + m} value={JSON.stringify({ seriesKey: s.series_key, sourceVersionId: s.source_version_id, month: m, periodStart: '1979-01-01', periodEnd: s.t1, stats: ['mean', 'min', 'max', 'trend', 'first_last'] })}>
                      {s.series_key}, {monthName(m)}, 1979–{s.t1.slice(0, 4)} (mean, extremes, trend)
                    </option>
                  ))
                : [
                    <option key={s.series_key} value={JSON.stringify({ seriesKey: s.series_key, sourceVersionId: s.source_version_id, periodStart: s.t0, periodEnd: s.t1, stats: ['mean', 'min', 'max'] })}>
                      {s.series_key}, all observations (mean, extremes)
                    </option>,
                  ],
            )}
          </select>
          <button className="btn btn-secondary">Compute &amp; save</button>
        </form>
        <p className="text-xs muted mt-1">
          For custom periods, use <Link href="/data-stories">Data Stories</Link> and save the calculation; it will appear below.
        </p>
      </section>

      <form action={createDraftAction} className="space-y-6">
        <section className="card p-4">
          <h2 className="font-semibold">2. Select calculations (up to 3)</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {calcs.map((c) => (
              <li key={c.id}>
                <label className="flex gap-2 items-start">
                  <input type="checkbox" name="calc" value={c.id} defaultChecked={c.id === sp.calc} disabled={c.status !== 'active'} />
                  <span>
                    <Link href={`/calc/${c.id}`}>{c.id.slice(0, 8)}</Link> · {c.recipe.seriesKey}
                    {c.recipe.month ? `, ${monthName(c.recipe.month)}` : ''}, {c.recipe.periodStart}→{c.recipe.periodEnd} · n={c.n} {c.status !== 'active' && <Badge tone="error">source {c.status}</Badge>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-4">
          <h2 className="font-semibold">3. Add evidence passages (up to 5, quoted verbatim)</h2>
          <p className="text-sm muted">Use the evidence search box at the bottom of the page; results show whether quoting is permitted.</p>
          {spans.length > 0 && (
            <ul className="mt-2 space-y-2 text-sm">
              {spans.map((h) => {
                const v = spanVerdicts.find((x) => x.recordId === h.recordId)!;
                return (
                  <li key={h.spanId} className="flex gap-2 items-start">
                    <input type="checkbox" name="span" value={h.spanId} aria-label={`Use passage from ${h.recordTitle}`} />
                    <span>
                      “{h.text.slice(0, 220)}
                      {h.text.length > 220 ? '…' : ''}” — {h.recordTitle} {v.allowed ? <Badge tone="ok">quote allowed</Badge> : <Badge tone="error" title={v.reason}>quote blocked</Badge>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="font-semibold">4. Media (optional, up to 3)</h2>
          <ul className="grid gap-3 sm:grid-cols-4 mt-2">
            {photos.map((p) => {
              const v = photoVerdicts.find((x) => x.recordId === p.id)!;
              return (
                <li key={p.id} className="text-xs">
                  <label className="block">
                    {p.thumbnail_url && <img src={p.thumbnail_url} alt="" className="w-full h-24 object-cover rounded" loading="lazy" />}
                    <span className="flex gap-1 items-start mt-1">
                      <input type="checkbox" name="media" value={p.id} />
                      <span>
                        {p.title.slice(0, 80)} <RightsBadge status={p.status} /> {!v.allowed && <Badge tone="error">not republishable</Badge>}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-xs muted mt-2">Blocked items can still be selected, so you can see the server refuse them and suggest alternatives.</p>
        </section>

        <section className="card p-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="kind">
              Output
            </label>
            <select id="kind" name="kind" className="input" defaultValue="article">
              <option value="article">Website article</option>
              <option value="carousel">Carousel (slides)</option>
              <option value="caption">Social caption</option>
              <option value="storyboard">Video storyboard (not a rendered video)</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="audience">
              Audience
            </label>
            <select id="audience" name="audience" className="input" defaultValue="school">
              <option value="school">School learners</option>
              <option value="press">Journalists (press brief)</option>
              <option value="research">Researchers</option>
            </select>
          </div>
          <fieldset>
            <legend className="label">Languages</legend>
            <label className="mr-3">
              <input type="checkbox" name="lang" value="en" defaultChecked disabled /> English
            </label>
            <input type="hidden" name="lang" value="en" />
            <label>
              <input type="checkbox" name="lang" value="hi" defaultChecked /> हिन्दी (needs human language review)
            </label>
          </fieldset>
          <div className="sm:col-span-3">
            <button className="btn btn-primary">Generate traceable drafts</button>
          </div>
        </section>
      </form>
      <form className="card p-4 mt-4 flex gap-2" action="/workspace/studio">
        {sp.calc && <input type="hidden" name="calc" value={sp.calc} />}
        <input name="eq" defaultValue={eq} className="input" placeholder="Search evidence to quote, e.g. Antarctic sea ice decline 2016" aria-label="Search evidence" />
        <button className="btn btn-secondary">Search evidence</button>
      </form>
    </div>
  );
}
