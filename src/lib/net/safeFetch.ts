// Outbound fetch guard (SSRF protection). Only configured provider hosts,
// https only, every redirect re-validated, resolved addresses must be public,
// and responses are size- and time-bounded. There is no general URL proxy.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const MEDIA_HOSTS = new Set(['images-assets.nasa.gov', 'upload.wikimedia.org', 'thumb.wikimedia.org']);
export const PROVIDER_HOSTS = new Set([
  ...MEDIA_HOSTS,
  'noaadata.apps.nsidc.org', 'nsidc.org', 'doi.pangaea.de', 'images-api.nasa.gov', 'api.openalex.org',
  'commons.wikimedia.org', 'en.wikipedia.org',
]);

export class FetchBlocked extends Error {}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('ff');
}

export async function assertAllowedUrl(raw: string, hosts: Set<string>): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new FetchBlocked('Invalid URL.');
  }
  if (u.protocol !== 'https:') throw new FetchBlocked('Only https URLs are allowed.');
  if (u.username || u.password) throw new FetchBlocked('Credentials in URLs are not allowed.');
  if (u.port && u.port !== '443') throw new FetchBlocked('Non-standard ports are not allowed.');
  if (!hosts.has(u.hostname)) throw new FetchBlocked(`Host ${u.hostname} is not an allowlisted provider.`);
  if (isIP(u.hostname)) throw new FetchBlocked('IP-literal hosts are not allowed.');
  const addrs = await lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new FetchBlocked('Host did not resolve.');
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new FetchBlocked('Host resolves to a private or reserved address.');
  return u;
}

export async function safeFetch(raw: string, opts: { hosts?: Set<string>; maxBytes?: number; timeoutMs?: number; accept?: RegExp } = {}): Promise<{ bytes: Buffer; contentType: string; finalUrl: string }> {
  const hosts = opts.hosts ?? PROVIDER_HOSTS;
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  let url = (await assertAllowedUrl(raw, hosts)).toString();
  for (let i = 0; i < 5; i++) {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000), headers: { 'user-agent': 'PolarPramaan/0.1 (SIH26063 student project)' } });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new FetchBlocked('Redirect without location.');
      url = (await assertAllowedUrl(new URL(loc, url).toString(), hosts)).toString();
      continue;
    }
    if (!res.ok) throw new FetchBlocked(`Upstream returned HTTP ${res.status}.`);
    const ct = res.headers.get('content-type') ?? '';
    if (opts.accept && !opts.accept.test(ct)) throw new FetchBlocked(`Unexpected content type ${ct}.`);
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new FetchBlocked('Response too large.');
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new FetchBlocked('Response too large.');
        }
        chunks.push(value);
      }
    }
    return { bytes: Buffer.concat(chunks), contentType: ct, finalUrl: url };
  }
  throw new FetchBlocked('Too many redirects.');
}
