#!/usr/bin/env node
// Fetches permitted real source material from official provider endpoints and
// writes a hashed, timestamped snapshot under data/snapshots/. Every attempt
// (success or failure) is recorded in data/snapshots/manifest.json.
//
// Runs where outbound network to the providers is allowed (GitHub Actions or a
// developer machine). It never fabricates content: a failed fetch is recorded
// as failed and nothing is written for it.
//
// Usage: node scripts/snapshot/fetch-sources.mjs [--only=nsidc,pangaea,...]

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const ROOT = join(process.cwd(), 'data', 'snapshots');
const UA = 'PolarPramaan-snapshot/0.1 (SIH26063 student project; +https://github.com/KING-OF-FLAME/PolarPramaan)';
const ALLOWED_HOSTS = new Set([
  'noaadata.apps.nsidc.org',
  'nsidc.org',
  'doi.pangaea.de',
  'images-api.nasa.gov',
  'images-assets.nasa.gov',
  'api.openalex.org',
  'commons.wikimedia.org',
  'en.wikipedia.org',
  'earthobservatory.nasa.gov',
  'science.nasa.gov',
  'climate.nasa.gov',
  'arctic.noaa.gov',
  'ncpor.res.in',
  'www.ncpor.res.in',
  'www.npdc.ncpor.res.in',
  'npdc.ncpor.res.in',
  'data.ncpor.res.in',
  'www.nasa.gov',
  'www.pangaea.de',
  'www.data.gov.in',
  'openalex.org',
  'help.openalex.org',
]);
const MAX_BYTES = 12 * 1024 * 1024;

const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (k) => only.length === 0 || only.includes(k);

const manifest = { generatedAt: new Date().toISOString(), runner: process.env.GITHUB_ACTIONS ? 'github-actions' : 'local', entries: [] };

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function fetchChecked(url, { accept, maxRedirects = 5 } = {}) {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const u = new URL(current);
    if (u.protocol !== 'https:') throw new Error(`non-https URL refused: ${current}`);
    if (!ALLOWED_HOSTS.has(u.hostname)) throw new Error(`host not allowlisted: ${u.hostname}`);
    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': UA, ...(accept ? { accept } : {}) },
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).toString();
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error(`response too large (${buf.length} bytes)`);
    return { status: res.status, contentType: res.headers.get('content-type') || '', finalUrl: current, buf };
  }
  throw new Error('too many redirects');
}

async function save(relPath, buf) {
  const p = join(ROOT, relPath);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, buf);
}

async function grab(provider, url, relPath, meta = {}, opts = {}) {
  const entry = { provider, url, path: relPath, retrievedAt: new Date().toISOString(), ...meta };
  try {
    let r = await fetchChecked(url, opts);
    for (let attempt = 1; r.status === 429 && attempt <= 4; attempt++) {
      const wait = 5000 * 2 ** attempt;
      console.log(`429 from ${url}; retrying in ${wait}ms`);
      await new Promise((res) => setTimeout(res, wait));
      r = await fetchChecked(url, opts);
    }
    entry.attempts = entry.attempts || 1;
    entry.status = r.status;
    entry.contentType = r.contentType;
    entry.finalUrl = r.finalUrl;
    entry.bytes = r.buf.length;
    if (r.status !== 200) {
      entry.ok = false;
      entry.error = `HTTP ${r.status}`;
    } else {
      entry.ok = true;
      entry.sha256 = sha256(r.buf);
      if (relPath) await save(relPath, r.buf);
    }
    manifest.entries.push(entry);
    console.log(`${entry.ok ? 'OK  ' : 'FAIL'} ${r.status} ${r.buf.length}B ${url}`);
    return entry.ok ? r : null;
  } catch (e) {
    entry.ok = false;
    entry.error = String(e && e.message ? e.message : e);
    manifest.entries.push(entry);
    console.log(`ERR  ${url} :: ${entry.error}`);
    return null;
  }
}

// Record a fetch in the manifest without writing the body (used for rights-unknown pages).
async function probe(provider, url, meta = {}) {
  return grab(provider, url, null, meta);
}

// ---------------------------------------------------------------- NSIDC G02135 v4
async function nsidc() {
  for (const hemi of ['north', 'south']) {
    const dir = `https://noaadata.apps.nsidc.org/NOAA/G02135/${hemi}/monthly/data/`;
    const listing = await grab('nsidc', dir, null, { note: 'directory listing' });
    if (!listing) continue;
    const html = listing.buf.toString('utf8');
    const files = [...new Set([...html.matchAll(/href="([^"]+\.csv)"/g)].map((m) => m[1].split('/').pop()))];
    console.log(`nsidc ${hemi}: ${files.length} monthly csv files listed`);
    for (const f of files) {
      if (!/_v4\.0\.csv$/.test(f)) continue; // do not splice product versions
      await grab('nsidc', dir + f, `nsidc/${hemi}/monthly/${f}`, { product: 'G02135', version: '4.0', hemisphere: hemi });
    }
  }
  // NSIDC documentation PDFs are not downloaded: NSIDC reuse terms for documents were not established.
}

// ---------------------------------------------------------------- PANGAEA 885208
async function pangaea() {
  await grab('pangaea', 'https://doi.pangaea.de/10.1594/PANGAEA.885208?format=textfile', 'pangaea/PANGAEA.885208.tab', { doi: '10.1594/PANGAEA.885208' });
  await grab('pangaea', 'https://doi.pangaea.de/10.1594/PANGAEA.885208?format=metadata_jsonld', 'pangaea/PANGAEA.885208.jsonld', { doi: '10.1594/PANGAEA.885208' });
}

// ---------------------------------------------------------------- NASA Image and Video Library
async function nasa() {
  const queries = [
    ['image', 'antarctica sea ice'],
    ['image', 'arctic sea ice'],
    ['image', 'antarctic ice sheet'],
    ['image', 'greenland ice sheet'],
    ['image', 'operation icebridge'],
    ['video', 'sea ice'],
    ['video', 'antarctica ice'],
  ];
  const videoIds = new Set();
  for (const [mt, q] of queries) {
    const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=${mt}&page_size=25`;
    const r = await grab('nasa', url, `nasa/search/${mt}-${q.replace(/\s+/g, '_')}.json`, { query: q, mediaType: mt });
    if (r && mt === 'video') {
      try {
        const j = JSON.parse(r.buf.toString('utf8'));
        for (const it of j.collection.items.slice(0, 6)) videoIds.add(it.data[0].nasa_id);
      } catch {}
    }
  }
  for (const id of videoIds) {
    // Asset list (verifies playable file URLs instead of guessing naming conventions).
    await grab('nasa', `https://images-assets.nasa.gov/video/${encodeURIComponent(id)}/collection.json`, `nasa/assets/${id}.json`, { nasaId: id, kind: 'asset-list' });
    const cap = await grab('nasa', `https://images-api.nasa.gov/captions/${encodeURIComponent(id)}`, `nasa/captions/${id}.json`, { nasaId: id });
    if (!cap) continue;
    try {
      const loc = JSON.parse(cap.buf.toString('utf8')).location;
      if (loc) {
        const u = new URL(loc.replace(/^http:/, 'https:'));
        const ext = u.pathname.split('.').pop();
        await grab('nasa', u.toString(), `nasa/captions/${id}.${ext}`, { nasaId: id, kind: 'caption-file' });
      }
    } catch {}
  }
}

// ---------------------------------------------------------------- OpenAlex
async function openalex() {
  const inst = await grab('openalex', 'https://api.openalex.org/institutions?search=National%20Centre%20for%20Polar%20and%20Ocean%20Research', 'openalex/institutions-search.json');
  if (!inst) return;
  let id = null;
  try {
    const j = JSON.parse(inst.buf.toString('utf8'));
    const hit = j.results.find((r) => /polar/i.test(r.display_name) && r.country_code === 'IN');
    id = hit ? hit.id.split('/').pop() : null;
    console.log('openalex institution:', hit && hit.display_name, id);
  } catch {}
  if (!id) return;
  await grab('openalex', `https://api.openalex.org/works?filter=institutions.id:${id}&sort=cited_by_count:desc&per-page=40`, 'openalex/works-ncpor-top-cited.json', { institution: id });
  await grab('openalex', `https://api.openalex.org/works?filter=institutions.id:${id},title_and_abstract.search:antarctic%20sea%20ice&sort=publication_date:desc&per-page=25`, 'openalex/works-ncpor-antarctic-sea-ice.json', { institution: id });
  await grab('openalex', `https://api.openalex.org/works?filter=institutions.id:${id},title_and_abstract.search:arctic%20svalbard&sort=publication_date:desc&per-page=15`, 'openalex/works-ncpor-arctic.json', { institution: id });
}

// ---------------------------------------------------------------- Wikimedia Commons (explicit per-file licences)
async function commons() {
  const qs = ['Maitri station Antarctica', 'Bharati station Antarctica', 'Himadri station Ny-Alesund', 'Dakshin Gangotri', 'Indian Antarctic expedition'];
  for (const q of qs) {
    const url =
      'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=8' +
      `&gsrsearch=${encodeURIComponent(q)}&prop=imageinfo&iiprop=url|extmetadata|size|mime&iiurlwidth=960`;
    await grab('commons', url, `commons/search-${q.replace(/\s+/g, '_')}.json`, { query: q });
  }
}

// ---------------------------------------------------------------- Wikipedia (CC BY-SA 4.0 plain-text extracts)
async function wikipedia() {
  const titles = [
    'Maitri (research station)',
    'Bharati (research station)',
    'Himadri Station',
    'Dakshin Gangotri',
    'Indian Antarctic Program',
    'National Centre for Polar and Ocean Research',
    'Himansh',
    'Sea ice',
    'Arctic sea ice decline',
    'Antarctic sea ice',
  ];
  for (const t of titles) {
    const url =
      'https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts|info|revisions&explaintext=1&inprop=url&rvprop=ids|timestamp&redirects=1' +
      `&titles=${encodeURIComponent(t)}`;
    await grab('wikipedia', url, `wikipedia/${t.replace(/[^A-Za-z0-9]+/g, '_')}.json`, { title: t, license: 'CC BY-SA 4.0' });
  }
}

// ---------------------------------------------------------------- US-government public-domain text pages
async function usgovText() {
  const pages = [
    ['earthobservatory', 'https://earthobservatory.nasa.gov/world-of-change/sea-ice-arctic'],
    ['earthobservatory', 'https://earthobservatory.nasa.gov/world-of-change/sea-ice-antarctic'],
    ['nasa-science', 'https://science.nasa.gov/earth/explore/earth-indicators/arctic-sea-ice/'],
    ['noaa-arc', 'https://arctic.noaa.gov/report-card/report-card-2024/sea-ice-2024/'],
  ];
  for (const [p, url] of pages) {
    const slug = new URL(url).pathname.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    await grab(p, url, `text/${p}/${slug}.html`, { kind: 'html-text' });
  }
}

// ---------------------------------------------------------------- NCPOR / NPDC (rights not established: metadata only)
function extractMeta(html, base) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || [])[1];
  const heads = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 25);
  const links = [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => {
      try {
        return { href: new URL(m[1], base).toString(), text: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() };
      } catch {
        return null;
      }
    })
    .filter((l) => l && l.text && /^https:\/\//.test(l.href));
  return { title: title && title.replace(/\s+/g, ' ').trim(), description: desc || null, headings: heads, links };
}

async function ncpor() {
  const out = [];
  for (const start of ['https://ncpor.res.in/', 'https://www.npdc.ncpor.res.in/', 'https://data.ncpor.res.in/']) {
    const r = await probe('ncpor', start, { note: 'metadata extraction only; full text not stored' });
    if (!r) continue;
    const m = extractMeta(r.buf.toString('utf8'), r.finalUrl);
    out.push({ url: r.finalUrl, retrievedAt: new Date().toISOString(), sha256: sha256(r.buf), title: m.title, description: m.description, headings: m.headings });
    const rel = m.links.filter((l) => /antarc|arctic|himal|maitri|bharati|himadri|expedition|southern ocean|cryosphere|station|report/i.test(l.text + ' ' + l.href) && /ncpor\.res\.in/.test(l.href));
    const seen = new Set();
    for (const l of rel) {
      if (seen.has(l.href) || seen.size >= 120) continue;
      seen.add(l.href);
      if (/\.(pdf|docx?|xlsx?|zip)$/i.test(l.href)) {
        out.push({ url: l.href, linkText: l.text, foundOn: r.finalUrl, kind: 'file-link', fetched: false });
        continue;
      }
      const p = await probe('ncpor', l.href, { note: 'metadata extraction only' });
      if (!p) continue;
      const pm = extractMeta(p.buf.toString('utf8'), p.finalUrl);
      out.push({ url: p.finalUrl, linkText: l.text, foundOn: r.finalUrl, retrievedAt: new Date().toISOString(), sha256: sha256(p.buf), title: pm.title, description: pm.description, headings: pm.headings });
      // Second level: record (never download) document links such as expedition reports.
      for (const dl of pm.links) {
        if (!/\.(pdf|docx?)$/i.test(dl.href) || !/ncpor\.res\.in/.test(dl.href) || seen.has(dl.href)) continue;
        if (!/expedition|isea|antarc|arctic|himal|report|southern|cruise|station/i.test(dl.text + ' ' + dl.href)) continue;
        seen.add(dl.href);
        out.push({ url: dl.href, linkText: dl.text, foundOn: p.finalUrl, kind: 'file-link', fetched: false });
      }
    }
  }
  await save('ncpor/pages-metadata.json', Buffer.from(JSON.stringify(out, null, 2)));
}

// ---------------------------------------------------------------- Reuse policies (evidence for rights decisions)
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

async function policies() {
  const pages = [
    ['nsidc-use-copyright', 'https://nsidc.org/about/use-copyright'],
    ['nsidc-g02135-v4-landing', 'https://nsidc.org/data/g02135/versions/4'],
    ['nasa-images-and-media', 'https://www.nasa.gov/nasa-brand-center/images-and-media/'],
    ['earthobservatory-image-use', 'https://earthobservatory.nasa.gov/image-use-policy'],
    ['pangaea-terms', 'https://www.pangaea.de/about/terms.php'],
    ['wikipedia-reusing-content', 'https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content'],
    ['godl-india', 'https://www.data.gov.in/Godl'],
    ['openalex-about', 'https://help.openalex.org/hc/en-us/articles/24397285563671-About-the-data'],
    ['noaa-arc-2024-home', 'https://arctic.noaa.gov/report-card/report-card-2024/'],
  ];
  for (const [slug, url] of pages) {
    const r = await grab('policies', url, null, { slug, note: 'policy text extracted; raw HTML not stored' });
    if (r) await save(`policies/${slug}.txt`, Buffer.from(`SOURCE: ${r.finalUrl}\nRETRIEVED: ${new Date().toISOString()}\nSHA256(raw): ${sha256(r.buf)}\n\n` + htmlToText(r.buf.toString('utf8'))));
  }
  // NCPOR: discover copyright / policy pages from the homepage links.
  const home = await grab('policies', 'https://ncpor.res.in/', null, { note: 'policy link discovery' });
  if (home) {
    const links = extractMeta(home.buf.toString('utf8'), home.finalUrl).links.filter((l) => /copyright|policy|terms|disclaimer|hyperlink/i.test(l.text));
    const seen = new Set();
    for (const l of links) {
      if (seen.has(l.href) || seen.size >= 8 || !ALLOWED_HOSTS.has(new URL(l.href).hostname)) continue;
      seen.add(l.href);
      const r = await grab('policies', l.href, null, { slug: 'ncpor-' + l.text, note: 'policy text extracted' });
      if (r) await save(`policies/ncpor-${l.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.txt`, Buffer.from(`SOURCE: ${r.finalUrl}\nLINK TEXT: ${l.text}\nRETRIEVED: ${new Date().toISOString()}\nSHA256(raw): ${sha256(r.buf)}\n\n` + htmlToText(r.buf.toString('utf8')).slice(0, 20000)));
    }
  }
}

// ---------------------------------------------------------------- CC-BY open-access papers with NCPOR authors
const OA_TOPIC = /antarc|arctic|sea ice|glacier|polar|southern ocean|svalbard|ice sheet|fjord/i;
async function oapdf() {
  const seen = new Set();
  const picks = [];
  for (const f of ['works-ncpor-antarctic-sea-ice', 'works-ncpor-top-cited', 'works-ncpor-arctic']) {
    let j;
    try {
      j = JSON.parse(await readFile(join(ROOT, 'openalex', f + '.json'), 'utf8'));
    } catch {
      continue;
    }
    for (const r of j.results) {
      const b = r.best_oa_location;
      if (!b || b.license !== 'cc-by' || !b.pdf_url || seen.has(r.id) || !OA_TOPIC.test(r.display_name) || r.type === 'preprint') continue;
      seen.add(r.id);
      picks.push({ id: r.id.split('/').pop(), url: b.pdf_url.replace(/^http:/, 'https:'), doi: r.doi, title: r.display_name });
    }
  }
  let ok = 0;
  for (const p of picks) {
    if (ok >= 6) break;
    let host;
    try {
      host = new URL(p.url).hostname;
    } catch {
      continue;
    }
    ALLOWED_HOSTS.add(host); // host taken from OpenAlex best_oa_location for a CC-BY work
    const r = await grab('oapdf', p.url, `oapdf/${p.id}.pdf`, { openalexId: p.id, doi: p.doi, title: p.title, license: 'cc-by' }, { accept: 'application/pdf' });
    if (r && !/pdf/i.test(r.contentType) && r.buf.subarray(0, 5).toString() !== '%PDF-') {
      const e = manifest.entries[manifest.entries.length - 1];
      e.ok = false;
      e.error = `not a PDF (content-type ${r.contentType})`;
      const { rm } = await import('node:fs/promises');
      await rm(join(ROOT, `oapdf/${p.id}.pdf`), { force: true });
      continue;
    }
    if (r) ok++;
  }
}

const steps = { oapdf, policies, nsidc, pangaea, nasa, openalex, commons, wikipedia, usgovText, ncpor };
for (const [k, fn] of Object.entries(steps)) {
  if (!want(k)) continue;
  console.log(`\n=== ${k}`);
  try {
    await fn();
  } catch (e) {
    console.log(`step ${k} crashed: ${e && e.stack}`);
    manifest.entries.push({ provider: k, ok: false, error: `step crashed: ${e && e.message}` });
  }
}

let prev = null;
try {
  prev = JSON.parse(await readFile(join(ROOT, 'manifest.json'), 'utf8'));
} catch {}
if (prev && only.length) {
  // Partial run: keep entries for providers not re-fetched.
  const redone = new Set(manifest.entries.map((e) => e.provider));
  manifest.entries = [...prev.entries.filter((e) => !redone.has(e.provider)), ...manifest.entries];
}
await save('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
const ok = manifest.entries.filter((e) => e.ok).length;
console.log(`\nsnapshot complete: ${ok}/${manifest.entries.length} fetches ok`);
