import { getDb } from '@/lib/db';
import { pageActor } from '@/lib/web/guard';
import { hasRole } from '@/lib/auth/roles';
import { inviteAction, setMembershipAction } from '../actions';
import { llmStatus } from '@/lib/llm';
import { allowSelfReview, dbMode, externalSocialAllowed } from '@/lib/env';
import { Badge, Notice, PageHeader, fmtDate } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string; invite?: string }> }) {
  const actor = await pageActor('contributor');
  const sp = await searchParams;
  const db = await getDb();
  const isAdmin = hasRole(actor, 'admin');
  const users = isAdmin
    ? await db.query<{ id: string; email: string; display_name: string; role: string; status: string; created_at: Date }>(`select u.id, u.email, u.display_name, m.role, m.status, u.created_at from users u join memberships m on m.user_id = u.id order by u.created_at`)
    : [];
  const llm = llmStatus();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" />
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.invite && (
        <Notice tone="ok" title="Invitation created (shown once; valid 7 days)">
          <code className="break-all">{sp.invite}</code>
          <p className="mt-1">Send this link to the invitee through a private channel.</p>
        </Notice>
      )}
      <section className="card p-4 mb-6 text-sm space-y-1">
        <h2 className="font-semibold text-base">Capabilities</h2>
        <p>
          Database: <Badge>{dbMode()}</Badge>
        </p>
        <p>AI provider: {llm.configured ? <Badge tone="ok">{`${llm.provider} · ${llm.model}`}</Badge> : <Badge tone="warn">not configured (set LLM_API_KEY and LLM_MODEL)</Badge>}</p>
        <p>
          Embeddings / semantic search: <Badge tone="warn">not configured</Badge>
        </p>
        <p>
          External social posting: <Badge tone="warn">{externalSocialAllowed() ? 'allowed but no adapters/credentials' : 'disabled'}</Badge>
        </p>
        <p>
          Author self-review override: <Badge tone={allowSelfReview() ? 'warn' : 'ok'}>{allowSelfReview() ? 'ON (development only; approvals labelled not independent)' : 'off'}</Badge>
        </p>
      </section>
      {isAdmin && (
        <>
          <section className="card p-4 mb-6">
            <h2 className="font-semibold">Invite a team member</h2>
            <form action={inviteAction} className="grid gap-2 sm:grid-cols-3 mt-2">
              <input name="email" type="email" required className="input" placeholder="email" aria-label="Email" />
              <select name="role" className="input" aria-label="Role">
                <option value="contributor">contributor</option>
                <option value="reviewer">reviewer</option>
                <option value="admin">admin</option>
              </select>
              <button className="btn btn-primary">Create invitation link</button>
            </form>
          </section>
          <section>
            <h2 className="font-semibold mb-2">Members</h2>
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role / status</th>
                  <th>Since</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.display_name}</td>
                    <td>{u.email}</td>
                    <td>
                      {u.id === actor.id ? (
                        `${u.role} / ${u.status}`
                      ) : (
                        <form action={setMembershipAction} className="flex gap-1">
                          <input type="hidden" name="userId" value={u.id} />
                          <select name="role" defaultValue={u.role} className="input text-xs" aria-label="Role">
                            <option>contributor</option>
                            <option>reviewer</option>
                            <option>admin</option>
                          </select>
                          <select name="status" defaultValue={u.status} className="input text-xs" aria-label="Status">
                            <option>active</option>
                            <option>suspended</option>
                          </select>
                          <button className="btn btn-secondary text-xs">Save</button>
                        </form>
                      )}
                    </td>
                    <td>{fmtDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
