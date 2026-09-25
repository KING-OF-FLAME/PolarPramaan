import 'server-only';
import { redirect } from 'next/navigation';
import { currentActor } from '../auth/session';
import { hasRole, type Actor, type Role } from '../auth/roles';
import { isReadOnlyPreview } from '../env';

export async function pageActor(min: Role = 'contributor'): Promise<Actor> {
  if (isReadOnlyPreview()) redirect('/workspace/login');
  const a = await currentActor();
  if (!a) redirect('/workspace/login');
  if (!hasRole(a, min)) redirect('/workspace?error=' + encodeURIComponent(`This page needs the ${min} role.`));
  return a;
}
