import { getDb } from '@/lib/db';
import { peekInvite } from '@/lib/auth/store';
import { acceptInviteAction } from '../../actions';
import { Notice, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function Invite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  let inv = null;
  try {
    inv = await peekInvite(await getDb(), token);
  } catch {
    inv = null;
  }
  if (!inv) return <Notice tone="error">This invitation is invalid, expired or already used.</Notice>;
  return (
    <div className="max-w-md">
      <PageHeader title="Accept invitation" lead={`You are invited as ${inv.role} (${inv.email}).`} />
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      <form action={acceptInviteAction} className="card p-4 space-y-3">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="name">
            Display name (shown on reviews you sign)
          </label>
          <input id="name" name="name" required minLength={2} maxLength={80} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password (at least 12 characters)
          </label>
          <input id="password" name="password" type="password" minLength={12} autoComplete="new-password" required className="input" />
        </div>
        <button className="btn btn-primary">Create account</button>
      </form>
    </div>
  );
}
