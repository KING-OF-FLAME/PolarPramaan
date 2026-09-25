import { getDb } from '@/lib/db';
import { appUrl } from '@/lib/env';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function GET() {
  const base = appUrl();
  let items: { slug: string; title: string; published_at: Date; publication_id: string; language: string }[] = [];
  try {
    const db = await getDb();
    items = await db.asPublic((q) =>
      q.query(`select distinct on (artifact_id) slug, title, published_at, publication_id, language from public_artifact_versions where publication_status = 'published' order by artifact_id, version_no desc`),
    );
  } catch {
    items = [];
  }
  items.sort((a, b) => +new Date(b.published_at) - +new Date(a.published_at));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>PolarPramaan — published evidence-backed stories</title>
<link>${base}/stories</link>
<description>Independent SIH26063 project. Each item links to its evidence receipt.</description>
${items
  .map((i) => `<item><title>${esc(i.title)}</title><link>${base}/stories/${i.slug}</link><guid isPermaLink="false">${i.publication_id}</guid><pubDate>${new Date(i.published_at).toUTCString()}</pubDate><description>Evidence receipt: ${base}/evidence/${i.publication_id}</description></item>`)
  .join('\n')}
</channel></rss>`;
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } });
}
