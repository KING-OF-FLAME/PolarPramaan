import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicRead, recordUsage } from '@/lib/web/data';
import { loadReceipt } from '@/lib/publish/receipt';
import { Badge, Notice, SetupRequired, fmtDate } from '@/components/ui';
import { StoryBody } from '@/components/StoryBody';

export const dynamic = 'force-dynamic';

export default async function Story({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,90}$/.test(slug)) notFound();
  const res = await publicRead((q) => loadReceipt(q, { slug }));
  if (!res.ok) return <SetupRequired />;
  if (!res.data) notFound();
  const r = res.data;
  await recordUsage('story_view', r.version.id);
  const receipt = `/evidence/${r.version.publicationId}`;
  return (
    <article className="max-w-3xl">
      <h1 className="text-2xl sm:text-3xl font-bold" lang={r.version.language}>
        {r.version.title}
      </h1>
      <div className="flex gap-2 flex-wrap my-3">
        <Badge>{r.version.language === 'hi' ? 'हिन्दी' : 'English'}</Badge>
        <Badge>{r.version.audience}</Badge>
        <Badge>{r.version.kind}</Badge>
        <Badge tone={r.reviews.some((x) => x.decision === 'approve' && x.kind === 'scientific') ? 'ok' : 'warn'}>Scientific review: team reviewer</Badge>
        {r.version.language === 'hi' && <Badge tone={r.version.languageReview === 'human_reviewed' ? 'ok' : 'warn'}>Hindi: {r.version.languageReview.replace('_', ' ')}</Badge>}
        <Link href={receipt} className="text-sm">
          Evidence receipt →
        </Link>
      </div>
      {r.version.publicationStatus === 'withdrawn' && <Notice tone="error">This story has been withdrawn.</Notice>}
      {r.version.correctionNotice && (
        <Notice tone="warn" title="Correction notice">
          {r.version.correctionNotice}
        </Notice>
      )}
      {r.version.kind === 'storyboard' && <Notice>This is a video storyboard (a plan for scenes and narration), not a rendered video.</Notice>}
      {r.version.body && <StoryBody body={r.version.body} lang={r.version.language} receiptHref={receipt} />}
      <p className="text-sm muted mt-6">
        Version {r.version.versionNo} · published {fmtDate(r.version.publishedAt, true)} · {r.version.generationMethod}
      </p>
      {r.variants.length > 0 && (
        <p className="text-sm mt-2">
          Other versions:{' '}
          {r.variants.map((v) => (
            <Link key={v.slug} href={`/stories/${v.slug}`} className="mr-3">
              {v.language === 'hi' ? 'हिन्दी' : 'English'} ({v.audience})
            </Link>
          ))}
        </p>
      )}
    </article>
  );
}
