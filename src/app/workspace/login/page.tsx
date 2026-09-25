import { redirect } from 'next/navigation';
import { currentActor } from '@/lib/auth/session';
import { loginAction } from '../actions';
import { Notice, PageHeader } from '@/components/ui';

export const metadata = { title: 'Editor sign-in' };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  if (await currentActor()) redirect('/workspace');
  const sp = await searchParams;
  return (
    <div className="max-w-md">
      <PageHeader title="Editor sign-in" lead="The editorial workspace is invite-only. Public pages need no account." />
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.ok && <Notice tone="ok">{sp.ok}</Notice>}
      <form action={loginAction} className="card p-4 space-y-3">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="username" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        <button className="btn btn-primary">Sign in</button>
      </form>
    </div>
  );
}
