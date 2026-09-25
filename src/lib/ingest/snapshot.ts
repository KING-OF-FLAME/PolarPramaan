// Access to the committed, hashed source snapshot (data/snapshots). The
// manifest records where each file came from and when it was retrieved.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ManifestEntry {
  provider: string;
  url: string;
  finalUrl?: string;
  path: string | null;
  retrievedAt: string;
  ok: boolean;
  status?: number;
  contentType?: string;
  bytes?: number;
  sha256?: string;
  error?: string;
  [k: string]: unknown;
}

export interface Manifest {
  generatedAt: string;
  runner: string;
  entries: ManifestEntry[];
}

export const SNAPSHOT_ROOT = join(process.cwd(), 'data', 'snapshots');

let cached: Manifest | null = null;
export function manifest(): Manifest {
  if (!cached) cached = JSON.parse(readFileSync(join(SNAPSHOT_ROOT, 'manifest.json'), 'utf8')) as Manifest;
  return cached;
}

/** Latest successful manifest entry for a snapshot path. */
export function entryFor(path: string): ManifestEntry | null {
  const matches = manifest().entries.filter((e) => e.ok && e.path === path);
  return matches.length ? matches[matches.length - 1] : null;
}

export function snapshotExists(path: string): boolean {
  return existsSync(join(SNAPSHOT_ROOT, path));
}

export function readSnapshot(path: string): Buffer {
  return readFileSync(join(SNAPSHOT_ROOT, path));
}

export function readSnapshotText(path: string): string {
  return readSnapshot(path).toString('utf8');
}

export function readSnapshotJson<T = unknown>(path: string): T {
  return JSON.parse(readSnapshotText(path)) as T;
}

export function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

export interface VerifyResult {
  path: string;
  ok: boolean;
  problem?: string;
}

/** Verify every stored snapshot file against the hash recorded at retrieval time. */
export function verifySnapshot(): VerifyResult[] {
  const out: VerifyResult[] = [];
  const latest = new Map<string, ManifestEntry>();
  for (const e of manifest().entries) if (e.ok && e.path) latest.set(e.path, e);
  for (const [path, e] of latest) {
    if (!snapshotExists(path)) {
      out.push({ path, ok: false, problem: 'file missing' });
      continue;
    }
    const h = sha256(readSnapshot(path));
    out.push(h === e.sha256 ? { path, ok: true } : { path, ok: false, problem: `sha256 mismatch (manifest ${e.sha256?.slice(0, 12)}…, file ${h.slice(0, 12)}…)` });
  }
  return out;
}
