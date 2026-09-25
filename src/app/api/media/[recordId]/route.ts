// Same-origin media proxy for offline packs and exports. Serves only public
// records whose rights allow offline copies or republication, only from
// allowlisted media hosts. It is not a general URL proxy.
import { getDb } from '@/lib/db';
import { safeFetch, MEDIA_HOSTS } from '@/lib/net/safeFetch';
import { isUuid } from '@/lib/web/data';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params;
  if (!isUuid(recordId)) return new Response('Not found', { status: 404 });
  let row: { media_url: string | null; thumbnail_url: string | null } | undefined;
  try {
    const db = await getDb();
    [row] = await db.asPublic((q) =>
      q.query<{ media_url: string | null; thumbnail_url: string | null }>(
        `select media_url, thumbnail_url from public_records where id = $1 and content_kind in ('photo', 'video', 'institutional_activity', 'expedition_report') and (allow_offline or allow_republish_media)`,
        [recordId],
      ),
    );
  } catch {
    return new Response('Database not configured', { status: 503 });
  }
  const url = row?.thumbnail_url ?? row?.media_url;
  if (!url) return new Response('Not available', { status: 404 });
  try {
    const f = await safeFetch(url, { hosts: MEDIA_HOSTS, accept: /^image\//, maxBytes: 3 * 1024 * 1024 });
    return new Response(new Uint8Array(f.bytes), { headers: { 'content-type': f.contentType, 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" } });
  } catch (e) {
    return new Response(`Upstream image unavailable: ${(e as Error).message}`, { status: 502 });
  }
}
