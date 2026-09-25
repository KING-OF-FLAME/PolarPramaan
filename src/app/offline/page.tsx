import Link from 'next/link';
import { publicRead } from '@/lib/web/data';
import { PageHeader, SetupRequired, EmptyState, Badge, fmtDate } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Offline evidence packs' };

export default async function Offline() {
  const res = await publicRead((q) => q.query<{ slug: string; title: string; description: string; pack_version: number; generated_at: Date; status: string; byte_count: number }>(`select slug, title, description, pack_version, generated_at, status, byte_count from public_offline_packs order by title`));
  return (
    <div>
      <PageHeader title="Offline evidence packs" lead="Save a small, approved exhibit to read without a connection, for example at a field station or in a classroom with poor connectivity. Packs keep their sources, versions and saved-on date, and check for corrections when you reconnect." />
      {!res.ok && <SetupRequired />}
      {res.ok && res.data.length === 0 && <EmptyState title="No packs have been built yet.">An admin builds packs from the workspace.</EmptyState>}
      {res.ok && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {res.data.map((p) => (
            <li key={p.slug} className="card p-4">
              <Link href={`/offline/${p.slug}`} className="font-semibold">
                {p.title}
              </Link>
              <p className="text-sm muted mt-1">{p.description}</p>
              <p className="text-xs muted mt-2">
                Version {p.pack_version} · built {fmtDate(p.generated_at)} · <Badge tone={p.status === 'active' ? 'ok' : 'warn'}>{p.status}</Badge>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
