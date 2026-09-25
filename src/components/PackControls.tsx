'use client';
import { useEffect, useState } from 'react';

interface Meta {
  saved: boolean;
  version?: number;
  savedAt?: string;
  bytes?: number;
  saved_count?: number;
  failed?: { url: string; reason: string }[];
}

async function ask(msg: object): Promise<Record<string, unknown>> {
  const reg = await navigator.serviceWorker.ready;
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => resolve(e.data);
    (reg.active ?? navigator.serviceWorker.controller)?.postMessage(msg, [ch.port2]);
  });
}

export default function PackControls({ slug, version, urls, exhibitUrl }: { slug: string; version: number; urls: string[]; exhibitUrl: string }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const ok = 'serviceWorker' in navigator && 'caches' in window;
    Promise.resolve()
      .then(() => {
        if (!ok) throw new Error('unsupported');
        return navigator.serviceWorker.register('/sw.js', { scope: '/' });
      })
      .then(() => ask({ type: 'pack-status', slug }))
      .then((m) => setMeta(m as unknown as Meta))
      .catch((e: Error) => (e.message === 'unsupported' ? setSupported(false) : setErr('Could not start offline storage in this browser.')));
  }, [slug]);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const res = (await ask({ type: 'save-pack', slug, version, urls })) as { version?: number; savedAt?: string; bytes?: number; count?: number; failed?: { url: string; reason: string }[] };
      setMeta({ saved: true, version: res.version, savedAt: res.savedAt, bytes: res.bytes, saved_count: res.count, failed: res.failed });
      fetch(`/api/packs/${slug}/saved`, { method: 'POST' }).catch(() => undefined);
    } catch {
      setErr('Saving failed.');
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    await ask({ type: 'remove-pack', slug });
    setMeta({ saved: false });
    setBusy(false);
  }
  if (!supported) return <p className="text-sm">This browser does not support offline storage (service workers). The exhibit can still be viewed online.</p>;
  return (
    <div className="card p-4 space-y-2" aria-live="polite">
      {meta?.saved ? (
        <>
          <p>
            Saved on this device: pack version {meta.version} on {meta.savedAt?.replace('T', ' ').slice(0, 16)} UTC ({Math.round((meta.bytes ?? 0) / 1024)} KB).
            {meta.version !== version && <strong> A newer version ({version}) is available.</strong>}
          </p>
          {meta.failed && meta.failed.length > 0 && (
            <details>
              <summary className="text-sm">{meta.failed.length} item(s) could not be saved</summary>
              <ul className="text-xs">
                {meta.failed.map((f) => (
                  <li key={f.url}>
                    {f.url}: {f.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <p>Not saved on this device.</p>
      )}
      <div className="flex gap-2 flex-wrap">
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {meta?.saved ? 'Update saved pack' : 'Save pack for offline use'}
        </button>
        {meta?.saved && (
          <button className="btn btn-secondary" onClick={remove} disabled={busy}>
            Remove from this device
          </button>
        )}
        <a className="btn btn-secondary" href={exhibitUrl}>
          Open exhibit
        </a>
      </div>
      {err && <p className="text-sm">{err}</p>}
      <p className="text-xs muted">Only the files listed in this public pack are stored. Nothing from the editorial workspace is cached.</p>
    </div>
  );
}
