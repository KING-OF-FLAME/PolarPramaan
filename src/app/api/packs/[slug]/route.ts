import { getDb } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return Response.json({ error: 'not found' }, { status: 404 });
  try {
    const db = await getDb();
    const [p] = await db.asPublic((q) => q.query<{ manifest: unknown; pack_version: number; status: string; generated_at: Date; byte_count: number }>(`select manifest, pack_version, status, generated_at, byte_count from public_offline_packs where slug = $1`, [slug]));
    if (!p) return Response.json({ error: 'not found' }, { status: 404 });
    return Response.json(p, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ error: 'database not configured' }, { status: 503 });
  }
}
