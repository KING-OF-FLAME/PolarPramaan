// Scheduled publication processor, called by Vercel Cron with CRON_SECRET.
import { timingSafeEqual } from 'node:crypto';
import { getDb } from '@/lib/db';
import { processOutbox } from '@/lib/publish/service';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get('authorization') ?? '';
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return new Response('Unauthorized', { status: 401 });
  try {
    const db = await getDb();
    const out = await processOutbox((fn) => db.tx(fn), 25);
    return Response.json({ processed: out.length, outcomes: out });
  } catch {
    return new Response('Database not configured', { status: 503 });
  }
}
