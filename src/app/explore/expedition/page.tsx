import Link from 'next/link';
import { publicRead } from '@/lib/web/data';
import { PageHeader, SetupRequired, Notice, Badge } from '@/components/ui';
import PolarMap, { type MapPoint } from '@/components/PolarMap';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Expedition time machine' };

export default async function Expedition({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { day } = await searchParams;
  const res = await publicRead(async (q) => {
    const [rec] = await q.query<{ id: string; title: string; description: string | null }>(`select id, title, description from public_records where doi = '10.1594/PANGAEA.885208'`);
    if (!rec) return null;
    const obs = await q.query<{ row_key: string; t: string; lat: number; lon: number; value: number | null; raw_value: string; flag: string | null; extra: { comment?: string | null } | null }>(
      `select o.row_key, to_char(o.obs_time, 'YYYY-MM-DD') t, o.lat, o.lon, o.value, o.raw_value, o.flag, o.extra
         from public_observations o join public_dataset_series ds on ds.id = o.series_id
        where ds.record_id = $1 and ds.series_key = 'PANGAEA.885208-ice_concentration_total' order by o.obs_time, o.id`,
      [rec.id],
    );
    const erratum = await q.query<{ id: string; text: string }>(`select id, text from public_evidence_spans where record_id = $1 and heading = 'Comment (erratum)'`, [rec.id]);
    return { rec, obs, erratum: erratum[0] ?? null };
  });
  if (!res.ok) return <SetupRequired />;
  if (!res.data) return <Notice tone="warn">The PANGAEA expedition dataset is not in the public catalog.</Notice>;
  const { rec, obs, erratum } = res.data;
  const days = [...new Set(obs.map((o) => o.t))];
  const current = days.includes(day ?? '') ? day! : days[days.length - 1];
  const upto = obs.filter((o) => o.t <= current);
  const today = obs.filter((o) => o.t === current);
  return (
    <div>
      <PageHeader
        title="Expedition time machine: SA Agulhas II, December 2016"
        lead="Step through the documented days of a real ship-based sea-ice survey. Each point is a recorded observation position, not a reconstructed route."
      />
      <nav aria-label="Days" className="flex flex-wrap gap-2 mb-4">
        {days.map((d) => (
          <Link key={d} href={`/explore/expedition?day=${d}`} aria-current={d === current ? 'step' : undefined} className={`btn text-sm ${d === current ? 'btn-primary' : 'btn-secondary'}`}>
            {d}
          </Link>
        ))}
      </nav>
      <PolarMap points={upto.map<MapPoint>((o) => ({ id: o.row_key, lat: Number(o.lat), lon: Number(o.lon), label: `${o.row_key} · ${o.t} · ice conc ${o.raw_value || 'n/a'} (as recorded)`, kind: 'observation' }))} />
      <h2 className="font-semibold mt-6">
        Observations on {current} <Badge>{today.length}</Badge>
      </h2>
      <div className="overflow-x-auto">
        <table className="data mt-2">
          <thead>
            <tr>
              <th>Event</th>
              <th>Lat</th>
              <th>Lon</th>
              <th>Total ice conc. (declared: tenths; as recorded)</th>
              <th>Observer comment</th>
            </tr>
          </thead>
          <tbody>
            {today.map((o) => (
              <tr key={o.row_key}>
                <td>{o.row_key}</td>
                <td>{Number(o.lat).toFixed(4)}</td>
                <td>{Number(o.lon).toFixed(4)}</td>
                <td>
                  {o.raw_value || '—'} {o.flag === 'outside_declared_unit_range' && <Badge tone="warn">exceeds declared range</Badge>}
                </td>
                <td className="text-sm">{o.extra?.comment ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Notice title="Why corrections matter">
        {erratum ? (
          <>
            The provider documents a correction to this dataset: “{erratum.text}”{' '}
            <Link href={`/records/${rec.id}?span=${erratum.id}#span-${erratum.id}`}>Open the evidence</Link>. The positions shown here are the corrected
            ones in the current file. PolarPramaan has not obtained the earlier file and does not reconstruct it.
          </>
        ) : (
          'No erratum text is available in the public evidence.'
        )}
      </Notice>
      <p className="text-sm">
        Source: <Link href={`/records/${rec.id}`}>{rec.title}</Link> (PANGAEA, CC-BY-3.0).
      </p>
    </div>
  );
}
