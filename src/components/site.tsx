import Link from 'next/link';
import { currentActor } from '@/lib/auth/session';

const PUBLIC_NAV = [
  ['/explore', 'Explore'],
  ['/ask', 'Ask with Evidence'],
  ['/data-stories', 'Data Stories'],
  ['/check', 'Challenge a Headline'],
  ['/classroom', 'Classroom'],
  ['/stories', 'Published Stories'],
  ['/sources', 'Sources & Rights'],
  ['/about', 'About'],
] as const;

export async function SiteHeader() {
  const actor = await currentActor();
  return (
    <header className="site border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg" style={{ color: 'var(--text)', textDecoration: 'none' }}>
          <img src="/icon.svg" alt="" width={28} height={28} />
          PolarPramaan
        </Link>
        <nav aria-label="Main" className="hidden xl:flex gap-3 text-[0.85rem]">
          {PUBLIC_NAV.map(([href, label]) => (
            <Link key={href} href={href} style={{ color: 'var(--text)' }}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/workspace" className="btn btn-secondary text-sm">
            {actor ? `Workspace (${actor.role})` : 'Editor sign-in'}
          </Link>
          <details className="xl:hidden relative">
            <summary className="btn btn-secondary text-sm list-none" aria-label="Open menu">
              Menu
            </summary>
            <nav aria-label="Main (mobile)" className="absolute right-0 mt-2 card p-3 flex flex-col gap-2 z-20 min-w-56 shadow-lg">
              {PUBLIC_NAV.map(([href, label]) => (
                <Link key={href} href={href}>
                  {label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site border-t mt-10" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="max-w-6xl mx-auto px-4 py-6 text-sm muted space-y-2">
        <p>
          <strong>Independent student project for Smart India Hackathon problem statement SIH26063.</strong> PolarPramaan is not the official
          website of NCPOR, MoES or any provider, and is not endorsed by them. Every item links to its original source with its rights and
          retrieval date.
        </p>
        <p>
          <Link href="/sources">Sources &amp; Rights</Link> · <Link href="/about">About &amp; methods</Link> · <Link href="/offline">Offline packs</Link> ·{' '}
          <Link href="/feed.xml">RSS</Link>
        </p>
      </div>
    </footer>
  );
}
