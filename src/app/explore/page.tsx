import Link from 'next/link';
import { publicRead } from '@/lib/web/data';
import { searchRecords } from '@/lib/evidence/search';
import { Badge, EmptyState, KIND_LABEL, PageHeader, REGION_LABEL, RightsBadge, SetupRequired, fmtDate } from '@/components/ui';
import PolarMap, { type MapPoint } from '@/components/PolarMap';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Explore the catalog' };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function Explore({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 200);
  const kind = one(sp.kind);
  const region = one(sp.region);
  const india = one(sp.india) === '1';
  const view = one(sp.view) || 'list';
  const yFrom = Number(one(sp.from)) || null;
  const yTo = Number(one(sp.to)) || null;

  const res = await publicRead(async (db) => {
    const records = await searchRecords(db, q, { kind: kind in KIND_LABEL ? kind : null, region: region in REGION_LABEL ? region : null, india, limit: 200 });
    const located = await db.query<{ id: string; title: string; lat: number; lon: number; content_kind: string }>(
      `select id, title, lat, lon, content_kind from public_records where lat is not null and lon is not null`,
    );
    const obs = await db.query<{ id: string; lat: number; lon: number; row_key: string; t: string }>(
      `select o.id::text, o.lat, o.lon, o.row_key, to_char(o.obs_time, 'YYYY-MM-DD') t from public_observations o
         join public_dataset_series ds on ds.id = o.series_id where ds.series_key like 'PANGAEA.885208-ice_concentration_total' and o.lat is not null`,
    );
    const dated = await db.query<{ id: string; title: string; time_start: string; content_kind: string; india_specific: boolean; place_name: string | null }>(
      `select id, title, time_start::text, content_kind, india_specific, place_name from public_records where time_start is not null
        and ($1::int is null or extract(year from time_start) >= $1) and ($2::int is null or extract(year from time_start) <= $2)
        order by time_start, title`,
      [yFrom, yTo],
    );
    return { records, located, obs, dated };
  });

  const tab = (v: string, label: string) => {
    const params = new URLSearchParams({ ...(q && { q }), ...(kind && { kind }), ...(region && { region }), ...(india && { india: '1' }), view: v });
    return (
      <Link href={`/explore?${params}`} aria-current={view === v ? 'page' : undefined} className={`btn ${view === v ? 'btn-primary' : 'btn-secondary'} text-sm`}>
        {label}
      </Link>
    );
  };

  return (
    <div>
      <PageHeader
        title="Explore the catalog"
        lead="Real records across six content types, each with source, rights and retrieval date. Filter by type, region or India-specific material, then open a record to see its evidence."
      />
      <form className="card p-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto_auto] items-end" role="search" action="/explore">
        <div>
          <label className="label" htmlFor="q">
            Search titles, descriptions and evidence
          </label>
          <input id="q" name="q" defaultValue={q} className="input" placeholder="e.g. Maitri, September extent, Larsen C" />
        </div>
        <div>
          <label className="label" htmlFor="kind">
            Content type
          </label>
          <select id="kind" name="kind" defaultValue={kind} className="input">
            <option value="">All types</option>
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="region">
            Region
          </label>
          <select id="region" name="region" defaultValue={region} className="input">
            <option value="">All regions</option>
            {Object.entries(REGION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="india" value="1" defaultChecked={india} /> India / NCPOR only
        </label>
        <input type="hidden" name="view" value={view} />
        <button className="btn btn-primary" type="submit">
          Apply
        </button>
      </form>

      <div className="flex gap-2 my-4" role="navigation" aria-label="Views">
        {tab('list', 'List')}
        {tab('map', 'Polar map')}
        {tab('timeline', 'Timeline')}
      </div>

      {!res.ok && <SetupRequired />}
      {res.ok && view === 'list' && (
        <>
          <p className="text-sm muted mb-2">{res.data.records.length} matching record(s).</p>
          {res.data.records.length === 0 ? (
            <EmptyState title="No records match these filters." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {res.data.records.map((r) => (
                <li key={String(r.id)} className="card p-4 flex flex-col gap-2">
                  {r.thumbnail_url ? (
                    <img src={String(r.thumbnail_url)} alt="" loading="lazy" className="w-full h-36 object-cover rounded-md" />
                  ) : null}
                  <Link href={`/records/${r.id}`} className="font-semibold leading-snug">
                    {String(r.title)}
                  </Link>
                  <div className="flex gap-1.5 flex-wrap">
                    <Badge tone="accent">{KIND_LABEL[String(r.content_kind)]}</Badge>
                    <RightsBadge status={r.rights_status as string} />
                    {r.archival === 'link_only' && <Badge>Link-only reference</Badge>}
                    {Boolean(r.india_specific) && <Badge>India</Badge>}
                    {r.region ? <Badge>{REGION_LABEL[String(r.region)]}</Badge> : null}
                  </div>
                  <p className="text-xs muted mt-auto">{String(r.source_name)}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {res.ok && view === 'map' && (
        <>
          <PolarMap
            points={[
              ...res.data.located.map<MapPoint>((r) => ({ id: r.id, lat: Number(r.lat), lon: Number(r.lon), label: r.title, href: `/records/${r.id}`, kind: 'record' })),
              ...res.data.obs.map<MapPoint>((o) => ({ id: `o${o.id}`, lat: Number(o.lat), lon: Number(o.lon), label: `Ship observation ${o.row_key} (${o.t})`, kind: 'observation' })),
            ]}
          />
          <h2 className="font-semibold mt-6">Located items (table alternative)</h2>
          <table className="data mt-2">
            <thead>
              <tr>
                <th>Record</th>
                <th>Latitude</th>
                <th>Longitude</th>
              </tr>
            </thead>
            <tbody>
              {res.data.located.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/records/${r.id}`}>{r.title}</Link>
                  </td>
                  <td>{Number(r.lat).toFixed(3)}</td>
                  <td>{Number(r.lon).toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm muted mt-2">
            Coordinates come only from the source (Wikipedia coordinates for stations; the PANGAEA median position and per-observation positions after
            the 2018 position erratum). Items without source coordinates are not placed on the map.
          </p>
        </>
      )}
      {res.ok && view === 'timeline' && (
        <>
          <form className="flex gap-2 items-end mb-3" action="/explore">
            <input type="hidden" name="view" value="timeline" />
            <div>
              <label className="label" htmlFor="from">
                From year
              </label>
              <input id="from" name="from" type="number" min={1900} max={2100} defaultValue={yFrom ?? ''} className="input w-28" />
            </div>
            <div>
              <label className="label" htmlFor="to">
                To year
              </label>
              <input id="to" name="to" type="number" min={1900} max={2100} defaultValue={yTo ?? ''} className="input w-28" />
            </div>
            <button className="btn btn-secondary">Filter</button>
          </form>
          <p className="text-sm muted mb-3">
            Only items with a source-supplied event date appear. Items with unknown dates are left out, not guessed. For the expedition time
            machine, see <Link href="/explore/expedition">the SA Agulhas II cruise, day by day</Link>.
          </p>
          {res.data.dated.length === 0 ? (
            <EmptyState title="No dated items in this range." />
          ) : (
            <ol className="border-l-2 pl-4 space-y-3" style={{ borderColor: 'var(--accent)' }}>
              {res.data.dated.map((d) => (
                <li key={d.id}>
                  <p className="text-sm font-semibold">{fmtDate(d.time_start)}</p>
                  <Link href={`/records/${d.id}`}>{d.title}</Link>{' '}
                  <span className="text-xs muted">
                    {KIND_LABEL[d.content_kind]}
                    {d.place_name ? ` · ${d.place_name}` : ''}
                    {d.india_specific ? ' · India' : ''}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
