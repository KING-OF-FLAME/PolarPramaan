import Link from 'next/link';
import { currentActor } from '@/lib/auth/session';
import { logoutAction } from './actions';
import { dbMode } from '@/lib/env';
import { Notice } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

const NAV: [string, string][] = [
  ['/workspace', 'Dashboard'],
  ['/workspace/studio', 'Draft Studio'],
  ['/workspace/review', 'Review'],
  ['/workspace/publications', 'Publication Queue'],
  ['/workspace/corrections', 'Corrections'],
  ['/workspace/catalog', 'Catalog Review'],
  ['/workspace/ingest', 'Ingest & Source Health'],
  ['/workspace/settings', 'Settings'],
];

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  return (
    <div>
      {dbMode() === 'unconfigured' && <Notice tone="warn" title="Editorial workspace unavailable">No persistent database is configured (DATABASE_URL). Editorial work would not survive, so the workspace is disabled.</Notice>}
      {actor && (
        <div className="flex flex-wrap items-center gap-2 mb-6 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
          <nav aria-label="Workspace" className="flex flex-wrap gap-3 text-sm">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto text-sm muted">
            {actor.displayName} ({actor.role})
          </span>
          <form action={logoutAction}>
            <button className="btn btn-secondary text-sm">Sign out</button>
          </form>
        </div>
      )}
      {children}
    </div>
  );
}
