import { getDb } from '@/lib/db';
import { currentActor } from '@/lib/auth/session';
import { hasRole } from '@/lib/auth/roles';
import { buildExport } from '@/lib/publish/export';
import { appUrl } from '@/lib/env';
import { isUuid, recordUsage } from '@/lib/web/data';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  if (!isUuid(versionId)) return new Response('Not found', { status: 404 });
  let db;
  try {
    db = await getDb();
  } catch {
    return new Response('Database not configured', { status: 503 });
  }
  const isPublic = (await db.asPublic((q) => q.query(`select 1 from public_artifact_versions where id = $1 and publication_status = 'published'`, [versionId]))).length > 0;
  if (!isPublic) {
    const actor = await currentActor();
    if (!hasRole(actor, 'contributor')) return new Response('Not found', { status: 404 });
  }
  try {
    const out = await db.tx((q) => buildExport(q, versionId, appUrl()));
    await recordUsage('export_download', versionId);
    return new Response(new Uint8Array(out.zip), {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="polarpramaan-kit-${versionId.slice(0, 8)}.zip"`,
        'cache-control': isPublic ? 'public, max-age=300' : 'private, no-store',
      },
    });
  } catch (e) {
    console.error('export failed', (e as Error).message);
    return new Response('Export failed.', { status: 500 });
  }
}
