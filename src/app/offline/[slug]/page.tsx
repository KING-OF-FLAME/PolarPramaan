import { notFound } from 'next/navigation';
import { publicRead } from '@/lib/web/data';
import type { PackManifest } from '@/lib/offline/packs';
import { Notice, PageHeader, SetupRequired, fmtDate, Badge } from '@/components/ui';
import PackControls from '@/components/PackControls';

export const dynamic = 'force-dynamic';

export default async function PackPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) notFound();
  const res = await publicRead((q) => q.query<{ manifest: PackManifest; status: string; byte_count: number }>(`select manifest, status, byte_count from public_offline_packs where slug = $1`, [slug]));
  if (!res.ok) return <SetupRequired />;
  const p = res.data[0];
  if (!p) notFound();
  const m = p.manifest;
  return (
    <div className="max-w-3xl">
      <PageHeader title={m.title} lead={m.notice} />
      {p.status === 'stale' && <Notice tone="warn">A source in this pack changed after it was built. An admin needs to rebuild it; saved copies will show the correction when they reconnect.</Notice>}
      <p className="text-sm muted mb-3">
        Pack version {m.packVersion}, built {fmtDate(m.generatedAt, true)} · {m.items.length} items · manifest {Math.round(p.byte_count / 1024)} KB (+ images, 5 MB limit)
      </p>
      <PackControls slug={slug} version={m.packVersion} urls={m.urls} exhibitUrl={m.urls[0]} />
      <h2 className="font-semibold mt-6">Included</h2>
      <ul className="text-sm mt-2 space-y-1">
        {m.items.map((i) => (
          <li key={i.recordId}>
            {i.title} <Badge>{i.kind}</Badge> <span className="muted">{i.license ?? ''}</span>
          </li>
        ))}
        {m.chart && <li>Data investigation: {m.chart.title}</li>}
      </ul>
      <h2 className="font-semibold mt-6">Excluded (rights)</h2>
      <ul className="text-sm mt-2 space-y-1">
        {m.excluded.map((e, i) => (
          <li key={i}>
            {e.title}: <span className="muted">{e.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
