import 'server-only';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { getDb } from '../db';
import { actorForToken } from './store';
import { assertRole, type Actor, type Role } from './roles';
import { isProduction } from '../env';

export const SESSION_COOKIE = isProduction() ? '__Host-pp_session' : 'pp_session';

export const currentActor = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const db = await getDb();
    return await actorForToken(db, token);
  } catch {
    return null;
  }
});

export async function requireActor(min: Role): Promise<Actor> {
  return assertRole(await currentActor(), min);
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Same-origin check for route-handler mutations (server actions check this themselves). */
export async function assertSameOrigin() {
  const h = await headers();
  const origin = h.get('origin');
  const host = h.get('x-forwarded-host') || h.get('host');
  if (!origin || !host || new URL(origin).host !== host) {
    throw Object.assign(new Error('Cross-origin request rejected.'), { status: 403 });
  }
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
}
