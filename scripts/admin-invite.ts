// Bootstrap/recovery: create an invitation link directly in the database.
// Usage: pnpm admin:invite --email you@example.org --role admin [--base https://your-app]
import { createInvite } from '../src/lib/auth/store';
import { scriptDb } from './lib';

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const email = arg('email');
const role = (arg('role') ?? 'admin') as 'admin';
if (!email || !['admin', 'reviewer', 'contributor'].includes(role)) {
  console.error('Usage: pnpm admin:invite --email you@example.org --role admin|reviewer|contributor [--base URL]');
  process.exit(2);
}
const db = await scriptDb();
const token = await createInvite(db, email, role, null);
const base = (arg('base') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
console.log(`Invitation for ${email} (${role}), valid 7 days:\n${base}/workspace/invite/${token}`);
await db.close();
