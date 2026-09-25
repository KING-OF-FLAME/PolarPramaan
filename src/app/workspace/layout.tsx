import Link from 'next/link';
import { currentActor } from '@/lib/auth/session';
import { logoutAction } from './actions';
import { dbMode, isReadOnlyPreview } from '@/lib/env';
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
      {isReadOnlyPreview() && (
        <Notice tone="warn" title="Editorial workspace disabled in this read-only preview">
          This deployment runs on a database image built from the committed source snapshot, with no persistent database. Drafts, reviews,
          publications and corrections would be lost, so sign-in is disabled. Configure <code>DATABASE_URL</code> (see docs/SETUP.md) to enable the workspace.
          The full editorial workflow is exercised by the automated end-to-end tests (docs/EVALUATION.md).
        </Notice>
      )}
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
