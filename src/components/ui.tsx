import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageHeader({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
      {lead && <p className="muted mt-2 max-w-3xl">{lead}</p>}
      {children}
    </div>
  );
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'error' | 'ok'; title?: string; children: ReactNode }) {
  const styles: Record<string, React.CSSProperties> = {
    info: { background: 'var(--accent-soft)', color: 'var(--text)' },
    warn: { background: 'var(--warn-bg)', color: 'var(--warn-text)' },
    error: { background: 'var(--err-bg)', color: 'var(--err-text)' },
    ok: { background: 'var(--ok-bg)', color: 'var(--ok-text)' },
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'note'} className="rounded-lg px-4 py-3 my-3 text-sm" style={styles[tone]}>
      {title && <p className="font-semibold mb-1">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'error' | 'ok'; title?: string }) {
  const map: Record<string, React.CSSProperties> = {
    neutral: { background: 'var(--surface-2)', color: 'var(--muted)', borderColor: 'var(--border)' },
    accent: { background: 'var(--accent-soft)', color: 'var(--accent-strong)', borderColor: 'transparent' },
    warn: { background: 'var(--warn-bg)', color: 'var(--warn-text)', borderColor: 'transparent' },
    error: { background: 'var(--err-bg)', color: 'var(--err-text)', borderColor: 'transparent' },
    ok: { background: 'var(--ok-bg)', color: 'var(--ok-text)', borderColor: 'transparent' },
  };
  return (
    <span title={title} className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap" style={map[tone]}>
      {children}
    </span>
  );
}

export const KIND_LABEL: Record<string, string> = {
  expedition_report: 'Expedition report',
  dataset: 'Dataset',
  publication: 'Publication',
  photo: 'Photo',
  video: 'Video',
  institutional_activity: 'Institutional activity',
};

export const REGION_LABEL: Record<string, string> = {
  arctic: 'Arctic',
  antarctic: 'Antarctic',
  southern_ocean: 'Southern Ocean',
  himalaya: 'Himalaya',
  global: 'Global',
  india: 'India',
};

export function RightsBadge({ status }: { status: string | null }) {
  if (!status) return <Badge tone="error">No rights decision</Badge>;
  if (status === 'link_only') return <Badge tone="warn" title="Only the title and link are recorded; content is not stored or reused">Link-only</Badge>;
  if (status === 'restricted') return <Badge tone="error">Restricted</Badge>;
  if (status === 'unknown') return <Badge tone="warn">Rights unknown</Badge>;
  return <Badge tone="ok">{status === 'cleared' ? 'Cleared' : 'Reuse with attribution'}</Badge>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card p-6 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="muted mt-2 text-sm">{children}</div>}
    </div>
  );
}

export function SetupRequired({ what }: { what?: string }) {
  return (
    <Notice tone="warn" title="Database not configured">
      {what ?? 'This page needs the PolarPramaan database.'} Set <code>DATABASE_URL</code> and run the import (see <Link href="/about#setup">setup</Link>). No
      placeholder content is shown instead.
    </Notice>
  );
}

export function fmtDate(d: string | Date | null | undefined, withTime = false): string {
  if (!d) return 'not supplied';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return String(d);
  return withTime ? date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : date.toISOString().slice(0, 10);
}
