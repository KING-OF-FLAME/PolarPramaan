import Link from 'next/link';
import { publicRead } from '@/lib/web/data';
import { Badge, EmptyState, PageHeader, SetupRequired, fmtDate } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Published stories' };

export default async function Stories() {
  const res = await publicRead((q) =>
    q.query<{ slug: string; title: string; language: string; audience: string; kind: string; published_at: Date; correction_notice: string | null; publication_id: string; publication_status: string }>(
      `select distinct on (artifact_id) slug, title, language, audience, kind, published_at, correction_notice, publication_id, publication_status
         from public_artifact_versions order by artifact_id, version_no desc`,
    ),
  );
  return (
    <div>
      <PageHeader title="Published stories" lead="Articles, carousels, captions and storyboards that passed machine fact checks and independent human review. Each has a public evidence receipt." />
      {!res.ok && <SetupRequired />}
      {res.ok && res.data.length === 0 && <EmptyState title="Nothing has been published yet.">Stories appear only after review in the editorial workspace.</EmptyState>}
      {res.ok && res.data.length > 0 && (
        <ul className="space-y-3">
          {res.data
            .sort((a, b) => +new Date(b.published_at) - +new Date(a.published_at))
            .map((s) => (
              <li key={s.slug} className="card p-4">
                <Link href={`/stories/${s.slug}`} className="font-semibold">
                  {s.title}
                </Link>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <Badge>{s.language === 'hi' ? 'हिन्दी' : 'English'}</Badge>
                  <Badge>{s.audience}</Badge>
                  <Badge>{s.kind}</Badge>
                  {s.publication_status === 'withdrawn' && <Badge tone="error">Withdrawn</Badge>}
                  {s.correction_notice && <Badge tone="warn">Under correction review</Badge>}
                  <Link href={`/evidence/${s.publication_id}`} className="text-sm">
                    Evidence receipt
                  </Link>
                </div>
                <p className="text-xs muted mt-1">Published {fmtDate(s.published_at)}</p>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
