import { getDb } from '@/lib/db';
import { packChangesSince } from '@/lib/offline/packs';

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let body: { version?: number; sourceVersionIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }
  const ids = (body.sourceVersionIds ?? []).filter((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200);
  try {
    const db = await getDb();
    const res = await db.asPublic((q) => packChangesSince(q, slug, Number(body.version) || 0, ids));
    return Response.json({ checkedAt: new Date().toISOString(), ...res }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ error: 'database not configured' }, { status: 503 });
  }
}
