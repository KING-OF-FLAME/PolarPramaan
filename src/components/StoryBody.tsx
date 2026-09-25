import Link from 'next/link';
import type { Block } from '@/lib/studio/templates';
import type { VersionBody } from '@/lib/studio/service';

export function StoryBody({ body, lang, receiptHref }: { body: VersionBody; lang: string; receiptHref?: string }) {
  return (
    <div lang={lang} className="prose-pp space-y-3">
      {body.blocks.map((b: Block, i: number) => {
        const cite = b.claimKeys.length && receiptHref ? (
          <Link href={`${receiptHref}#claim-${b.claimKeys[0]}`} className="text-xs align-super ml-1" aria-label="Show evidence">
            [evidence]
          </Link>
        ) : null;
        switch (b.type) {
          case 'heading':
            return null;
          case 'quote':
            return (
              <blockquote key={i} className="border-l-4 pl-3 italic" style={{ borderColor: 'var(--accent)' }}>
                {b.text}
                {cite}
              </blockquote>
            );
          case 'figure':
            return (
              <p key={i} className="card p-3 text-sm">
                📈 {b.text}: <Link href={`/calc/${b.calcRunId}`}>open the chart, table and recipe</Link>
              </p>
            );
          case 'media': {
            const m = body.media.find((x) => x.recordId === b.mediaRecordId);
            return (
              <figure key={i}>
                {m?.thumbnailUrl ? <img src={m.thumbnailUrl} alt={m.title} className="rounded-lg max-h-96" /> : null}
                <figcaption className="text-sm muted">
                  <Link href={`/records/${b.mediaRecordId}`}>{b.text}</Link>
                </figcaption>
              </figure>
            );
          }
          case 'caveats':
            return (
              <p key={i} className="text-sm rounded p-2" style={{ background: 'var(--warn-bg)', color: 'var(--warn-text)' }}>
                {lang === 'hi' ? 'सावधानियाँ: ' : 'Caveats: '}
                {b.text}
              </p>
            );
          case 'sources':
            return (
              <p key={i} className="text-sm muted">
                {b.text}
              </p>
            );
          case 'slide':
          case 'scene':
            return (
              <section key={i} className="card p-4">
                <p className="text-xs muted uppercase tracking-wide">
                  {b.type === 'slide' ? `Slide ${i + 1}` : `${b.title} · ${b.durationSec ?? ''}s`}
                </p>
                {b.type === 'slide' && <p className="font-semibold">{b.title}</p>}
                {b.visual && <p className="text-sm muted">Visual: {b.visual}</p>}
                <p className="mt-1">
                  {b.text}
                  {cite}
                </p>
                {b.calcRunId && (
                  <Link href={`/calc/${b.calcRunId}`} className="text-sm">
                    chart data
                  </Link>
                )}
              </section>
            );
          default:
            return (
              <p key={i}>
                {b.text}
                {cite}
              </p>
            );
        }
      })}
    </div>
  );
}
