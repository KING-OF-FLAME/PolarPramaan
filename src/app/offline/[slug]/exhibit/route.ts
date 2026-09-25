// Self-contained 2D exhibit HTML (no app JavaScript), cacheable by the pack service worker.
import { getDb } from '@/lib/db';
import type { PackManifest } from '@/lib/offline/packs';

const esc = (s: string | null | undefined) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function chart(m: PackManifest): string {
  if (!m.chart) return '';
  const pts = m.chart.points.filter((p) => p.v != null) as { t: string; v: number }[];
  if (pts.length < 2) return '';
  const W = 720, H = 300, L = 50, B = 30;
  const ys = pts.map((p) => p.v);
  const y0 = Math.min(...ys) * 0.9, y1 = Math.max(...ys) * 1.05;
  const sx = (i: number) => L + (i / (pts.length - 1)) * (W - L - 10);
  const sy = (v: number) => 10 + (1 - (v - y0) / (y1 - y0)) * (H - 10 - B);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.v).toFixed(1)}`).join(' ');
  const labels = pts.filter((_, i) => i % 8 === 0).map((p) => `<text x="${sx(pts.indexOf(p))}" y="${H - 8}" font-size="11" text-anchor="middle">${p.t.slice(0, 4)}</text>`).join('');
  const rows = pts.map((p) => `<tr><td>${p.t}</td><td>${p.v.toFixed(2)}</td></tr>`).join('');
  return `<section><h2>${esc(m.chart.title)}</h2><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.chart.title)}"><path d="${d}" fill="none" stroke="#0e7c86" stroke-width="2.5"/>${labels}<text x="4" y="20" font-size="11">${esc(m.chart.units)}</text></svg>
<p class="q">Look at the line: in which years was the February (summer minimum) extent lowest? Check the table to confirm.</p>
<details><summary>Data table (${pts.length} values)</summary><table><tr><th>Month</th><th>${esc(m.chart.units)}</th></tr>${rows}</table></details>
<p class="cite">${esc(m.chart.citation)}</p></section>`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let m: PackManifest | undefined;
  try {
    const db = await getDb();
    [m] = (await db.asPublic((q) => q.query<{ manifest: PackManifest }>(`select manifest from public_offline_packs where slug = $1`, [slug]))).map((r) => r.manifest);
  } catch {
    return new Response('Database not configured', { status: 503 });
  }
  if (!m) return new Response('Not found', { status: 404 });
  const items = m.items
    .map(
      (i) => `<article class="item">${i.imagePath ? `<img src="${esc(i.imagePath)}" alt="${esc(i.title)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('p'),{className:'miss',textContent:'Image not saved on this device.'}))">` : ''}
<h3>${esc(i.title)}</h3>${i.text ? `<p>${esc(i.text).replace(/\n\n/g, '</p><p>')}</p>` : ''}
<p class="cite">${esc(i.credit)}${i.license ? ` · ${esc(i.license)}` : ''} · retrieved ${esc((i.retrievedAt ?? '').slice(0, 10))} · <a href="${esc(i.canonicalUrl)}">source</a> · evidence version ${esc(i.sourceVersionId.slice(0, 8))}</p></article>`,
    )
    .join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.title)}</title>
<style>body{font-family:system-ui,'Noto Sans','Noto Sans Devanagari',sans-serif;max-width:900px;margin:0 auto;padding:1rem;color:#0b1f3a;background:#f5f9fc;line-height:1.55}
.banner{padding:.6rem .9rem;border-radius:8px;margin:.8rem 0;background:#d7f0ef}.warn{background:#fff6e0;color:#6b4a00}.grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
.item{background:#fff;border:1px solid #d3e3ee;border-radius:12px;padding:.8rem}.item img{width:100%;height:180px;object-fit:cover;border-radius:8px}.cite{font-size:.8rem;color:#4a6385}.miss{font-size:.8rem;color:#4a6385;border:1px dashed #d3e3ee;padding:1rem}
svg{width:100%;height:auto;background:#fff;border:1px solid #d3e3ee;border-radius:8px}table{border-collapse:collapse;font-size:.85rem}td,th{border-bottom:1px solid #d3e3ee;padding:2px 8px}.q{font-weight:600}</style></head>
<body><header><p style="font-size:.8rem">PolarPramaan offline exhibit · independent SIH26063 project</p><h1>${esc(m.title)}</h1><p>${esc(m.notice)}</p>
<div id="status" class="banner">Pack version ${m.packVersion}, built ${esc(m.generatedAt.slice(0, 16).replace('T', ' '))} UTC.</div></header>
<main><div class="grid">${items}</div>${chart(m)}
<section><h2>What is not included, and why</h2><ul>${m.excluded.map((e) => `<li>${esc(e.title)}: ${esc(e.reason)}</li>`).join('')}</ul></section></main>
<script>
(function(){var s=document.getElementById('status');var v=${m.packVersion};var ids=${JSON.stringify(m.sourceVersionIds)};
function off(){s.className='banner warn';s.textContent='You are offline. This copy (pack version '+v+', built ${esc(m.generatedAt.slice(0, 10))}) cannot know about changes made since it was saved. Reconnect to check for corrections.';}
function check(){fetch('/api/packs/${esc(m.slug)}/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:v,sourceVersionIds:ids})}).then(function(r){return r.json()}).then(function(d){
if(d.error){return off();}var msgs=[];if(d.newerVersion)msgs.push('A newer pack version ('+d.currentVersion+') is available; update it from the pack page.');
(d.corrections||[]).forEach(function(c){msgs.push('Correction: a source in this pack is now '+c.status+(c.reason?' ('+c.reason+')':'')+'.');});if(d.removedFromPublic)msgs.push(d.removedFromPublic+' source(s) are no longer public.');
s.className=msgs.length?'banner warn':'banner';s.textContent=msgs.length?msgs.join(' '):'Checked online just now: no corrections since this pack was built.';}).catch(off);}
if(navigator.onLine){check();}else{off();}window.addEventListener('online',check);window.addEventListener('offline',off);})();
</script></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
}
