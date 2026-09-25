// Persistence for users, invites and sessions. Free of Next.js imports so it can
// be exercised directly by database tests.
import type { Queryable } from '../db/core';
import { hashPassword, newToken, sha256Hex, validatePassword, verifyPassword } from './crypto';
import type { Actor, Role } from './roles';

export const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;
export const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

export async function createInvite(q: Queryable, email: string, role: Role, createdBy: string | null): Promise<string> {
  const token = newToken();
  await q.query(
    `insert into invites (token_hash, email, role, created_by, expires_at) values ($1, $2, $3, $4, $5)`,
    [sha256Hex(token), email.trim().toLowerCase(), role, createdBy, new Date(Date.now() + INVITE_TTL_MS)],
  );
  await audit(q, createdBy, 'invite.create', 'invite', email.trim().toLowerCase(), { role });
  return token;
}

export async function peekInvite(q: Queryable, token: string) {
  const [row] = await q.query<{ email: string; role: Role; expires_at: Date; used_at: Date | null }>(
    `select email, role, expires_at, used_at from invites where token_hash = $1`,
    [sha256Hex(token)],
  );
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

export async function acceptInvite(q: Queryable, token: string, displayName: string, password: string): Promise<{ userId: string } | { error: string }> {
  const pwErr = validatePassword(password);
  if (pwErr) return { error: pwErr };
  const name = displayName.trim();
  if (name.length < 2 || name.length > 80) return { error: 'Enter a display name (2–80 characters).' };
  // Lock the invite row so concurrent accepts cannot both succeed.
  const [inv] = await q.query<{ id: string; email: string; role: Role; created_by: string | null; expires_at: Date; used_at: Date | null }>(
    `select id, email, role, created_by, expires_at, used_at from invites where token_hash = $1 for update`,
    [sha256Hex(token)],
  );
  if (!inv || inv.used_at || new Date(inv.expires_at).getTime() < Date.now()) return { error: 'This invitation is invalid, expired or already used.' };
  const hash = await hashPassword(password);
  const existing = await q.query<{ id: string }>(`select id from users where email = $1`, [inv.email]);
  let userId: string;
  if (existing.length) {
    userId = existing[0].id;
    await q.query(`update users set password_hash = $2, display_name = $3 where id = $1`, [userId, hash, name]);
  } else {
    [{ id: userId }] = await q.query<{ id: string }>(
      `insert into users (email, display_name, password_hash) values ($1, $2, $3) returning id`,
      [inv.email, name, hash],
    );
  }
  await q.query(
    `insert into memberships (user_id, role, invited_by) values ($1, $2, $3)
     on conflict (user_id) do update set role = excluded.role, status = 'active'`,
    [userId, inv.role, inv.created_by],
  );
  await q.query(`update invites set used_at = now(), used_by = $2 where id = $1`, [inv.id, userId]);
  await audit(q, userId, 'invite.accept', 'user', userId, { role: inv.role });
  return { userId };
}

export async function login(q: Queryable, email: string, password: string, userAgent: string | null): Promise<{ token: string } | null> {
  const [u] = await q.query<{ id: string; password_hash: string | null; disabled: boolean }>(
    `select u.id, u.password_hash, u.disabled from users u join memberships m on m.user_id = u.id
     where u.email = $1 and m.status = 'active'`,
    [email.trim().toLowerCase()],
  );
  // Always run a hash comparison to keep timing similar for unknown users.
  const ok = await verifyPassword(password, u?.password_hash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==');
  if (!u || u.disabled || !ok) return null;
  const token = newToken();
  await q.query(`insert into sessions (token_hash, user_id, expires_at, user_agent) values ($1, $2, $3, $4)`, [
    sha256Hex(token), u.id, new Date(Date.now() + SESSION_TTL_MS), userAgent?.slice(0, 200) ?? null,
  ]);
  await q.query(`delete from sessions where user_id = $1 and expires_at < now()`, [u.id]);
  await audit(q, u.id, 'session.login', 'user', u.id, null);
  return { token };
}

export async function actorForToken(q: Queryable, token: string | undefined | null): Promise<Actor | null> {
  if (!token || token.length > 100) return null;
  const [row] = await q.query<{ id: string; email: string; display_name: string; role: Role }>(
    `select u.id, u.email, u.display_name, m.role
       from sessions s join users u on u.id = s.user_id join memberships m on m.user_id = u.id
      where s.token_hash = $1 and s.expires_at > now() and not u.disabled and m.status = 'active'`,
    [sha256Hex(token)],
  );
  return row ? { id: row.id, email: row.email, displayName: row.display_name, role: row.role } : null;
}

export async function logout(q: Queryable, token: string) {
  await q.query(`delete from sessions where token_hash = $1`, [sha256Hex(token)]);
}

export async function audit(q: Queryable, actorId: string | null, action: string, targetType: string | null, targetId: string | null, detail: unknown) {
  await q.query(`insert into audit_events (actor_id, action, target_type, target_id, detail) values ($1, $2, $3, $4, $5::jsonb)`, [
    actorId, action, targetType, targetId, detail == null ? null : JSON.stringify(detail),
  ]);
}

/** Persistent fixed-window rate limit. Returns false when the limit is exceeded. */
export async function rateLimit(q: Queryable, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const [row] = await q.query<{ count: number }>(
    `insert into rate_limits (key, window_start, count) values ($1, $2, 1)
     on conflict (key, window_start) do update set count = rate_limits.count + 1 returning count`,
    [key, windowStart],
  );
  if (Number(row.count) === 1) await q.query(`delete from rate_limits where key = $1 and window_start < $2`, [key, windowStart]);
  return Number(row.count) <= limit;
}
