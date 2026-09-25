import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { computeRecipe, saveCalculation } from '@/lib/calc/compute';
import { rateLimit } from '@/lib/auth/store';
import { assertSameOrigin, clientIp, currentActor } from '@/lib/auth/session';

export async function POST(req: Request) {
  try {
    await assertSameOrigin();
  } catch {
    return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  }
  const form = await req.formData();
  let input: unknown;
  try {
    input = JSON.parse(String(form.get('recipe') ?? ''));
  } catch {
    return NextResponse.json({ error: 'Invalid recipe.' }, { status: 400 });
  }
  let db;
  try {
    db = await getDb();
  } catch {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const actor = await currentActor();
  if (!actor && !(await rateLimit(db, `calc-save:${await clientIp()}`, 30, 3600))) {
    return NextResponse.json({ error: 'Too many saved calculations from this address; try again later.' }, { status: 429 });
  }
  try {
    // Anonymous saves are limited to public data: verify through the public role first.
    await db.asPublic((q) => computeRecipe(q, input, { publicOnly: true }));
    const run = await db.tx((q) => saveCalculation(q, input, actor?.id ?? null));
    return NextResponse.redirect(new URL(`/calc/${run.id}`, req.url), 303);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 300) }, { status: 400 });
  }
}
