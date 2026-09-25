import { getDb } from '@/lib/db';
import { isUuid, recordUsage } from '@/lib/web/data';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ svId: string }> }) {
  const { svId } = await params;
  if (!isUuid(svId)) return new Response('Not found', { status: 404 });
  try {
    const db = await getDb();
    const ok = await db.asPublic((q) => q.query(`select 1 from public_source_versions where id = $1 and downloadable`, [svId]));
    if (!ok.length) return new Response('Not available for download. Use the official source link.', { status: 404 });
    const [b] = await db.query<{ bytes: Uint8Array; mime: string; snapshot_path: string | null }>(
      `select b.bytes, b.mime, v.snapshot_path from source_versions v join blobs b on b.sha256 = v.blob_sha256 where v.id = $1`,
      [svId],
    );
    if (!b) return new Response('Not found', { status: 404 });
    await recordUsage('export_download', `original:${svId}`);
    const name = (b.snapshot_path ?? 'original').split('/').pop();
    return new Response(new Uint8Array(b.bytes), { headers: { 'content-type': b.mime === 'text/html' ? 'text/plain; charset=utf-8' : b.mime, 'content-disposition': `attachment; filename="${name}"`, 'x-content-type-options': 'nosniff' } });
  } catch {
    return new Response('Database not configured', { status: 503 });
  }
}
