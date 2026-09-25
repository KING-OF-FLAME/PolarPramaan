import Link from 'next/link';
import { publicRead } from '@/lib/web/data';
import { PageHeader, SetupRequired, Badge } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Data Stories' };

export default async function DataStories() {
  const res = await publicRead((q) =>
    q.query<{ id: string; record_id: string; title: string; series_key: string; variable: string; units: string; frequency: string; description: string; source_version_id: string; version_status: string; n: number; t0: string; t1: string }>(
      `select ds.id, ds.record_id, r.title, ds.series_key, ds.variable, ds.units, ds.frequency, ds.description, ds.source_version_id, ds.version_status,
              (select count(*)::int from public_observations o where o.series_id = ds.id) n,
              (select to_char(min(obs_time),'YYYY-MM') from public_observations o where o.series_id = ds.id) t0,
              (select to_char(max(obs_time),'YYYY-MM') from public_observations o where o.series_id = ds.id) t1
         from public_dataset_series ds join public_records r on r.id = ds.record_id order by r.title, ds.series_key`,
    ),
  );
  const presets = [
    { label: 'Arctic September minimum, 1979–latest, with trend', q: 'series=N-monthly-extent&month=9&from=1979-01-01&to=2100-12-31' },
    { label: 'Antarctic February minimum, 1979–latest', q: 'series=S-monthly-extent&month=2&from=1979-01-01&to=2100-12-31' },
    { label: 'Antarctic September maximum, 1979–latest', q: 'series=S-monthly-extent&month=9&from=1979-01-01&to=2100-12-31' },
    { label: 'Arctic March maximum, 1979–latest', q: 'series=N-monthly-extent&month=3&from=1979-01-01&to=2100-12-31' },
  ];
  return (
    <div>
      <PageHeader
        title="Data Stories: a chart you can reproduce"
        lead="Choose a real series and a period. Every number is computed deterministically from stored observations, saved with a recipe (source version, filters, missing-value handling, code version) and downloadable, so anyone can reproduce it."
      />
      {!res.ok ? (
        <SetupRequired />
      ) : (
        <>
          <h2 className="font-semibold mb-2">Start from a preset</h2>
          <ul className="grid gap-2 sm:grid-cols-2 mb-6">
            {presets.map((p) => {
              const s = res.data.find((d) => p.q.includes(`series=${d.series_key}&`));
              return s ? (
                <li key={p.label} className="card p-3">
                  <Link href={`/data-stories/explore?sv=${s.source_version_id}&${p.q}`}>{p.label}</Link>
                </li>
              ) : null;
            })}
          </ul>
          <h2 className="font-semibold mb-2">All public numeric series</h2>
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>Series</th>
                  <th>Dataset</th>
                  <th>Units</th>
                  <th>Values</th>
                  <th>Coverage</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {res.data.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/data-stories/explore?sv=${s.source_version_id}&series=${encodeURIComponent(s.series_key)}`}>{s.series_key}</Link>
                      <div className="text-xs muted">{s.description}</div>
                    </td>
                    <td>
                      <Link href={`/records/${s.record_id}`}>{s.title}</Link>
                    </td>
                    <td>{s.units}</td>
                    <td>{s.n}</td>
                    <td>
                      {s.t0} → {s.t1}
                    </td>
                    <td>
                      <Badge tone={s.version_status === 'active' ? 'ok' : 'warn'}>{s.version_status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
