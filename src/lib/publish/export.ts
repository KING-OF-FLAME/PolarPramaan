// Outreach kit export (F10): real files built from one reviewed artifact version.
// Slides and chart are rendered to PNG with sharp (bundled OFL Noto fonts, so
// Hindi renders on servers without system fonts). Photos are embedded only if
// rights allow republication and the image can actually be fetched; otherwise
// the slide says so. The storyboard stays a storyboard.
import { join } from 'node:path';
import JSZip from 'jszip';
import QRCode from 'qrcode';
import type { Queryable } from '../db/core';
import { getVersion, type VersionBody } from '../studio/service';
import { loadCalculation, type CalcRun } from '../calc/compute';
import { rowsCsv, verifyScript } from '../calc/export';
import { checkUses } from '../rights/check';
import { safeFetch, MEDIA_HOSTS } from '../net/safeFetch';
import type { Block } from '../studio/templates';

process.env.FONTCONFIG_FILE ??= join(process.cwd(), 'assets', 'fonts', 'fonts.conf');

const W = 1080;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT = "'Noto Sans', 'Noto Sans Devanagari', sans-serif";

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = cut[maxLines - 1].replace(/\s*\S*$/, '') + ' …';
    return cut;
  }
  return lines;
}

function textBlock(lines: string[], x: number, y: number, size: number, weight = 400, fill = '#ffffff', lh = 1.35) {
  return lines.map((l, i) => `<text x="${x}" y="${y + i * size * lh}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(l)}</text>`).join('');
}

export function chartSvg(run: CalcRun, width = 960, height = 460, dark = true): string {
  const pts = run.result.rows.filter((r) => r.included && r.value != null);
  const fg = dark ? '#e6eef7' : '#0b1f3a';
  if (pts.length < 2) return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="10" y="30" fill="${fg}">Not enough data to draw</text></svg>`;
  const xs = pts.map((p) => Date.parse(p.t));
  const ys = pts.map((p) => p.value!);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const pad = (y1 - y0) * 0.1 || 1;
  y0 -= pad;
  y1 += pad;
  const L = 70, R = 20, T = 20, B = 50;
  const sx = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (width - L - R);
  const sy = (y: number) => T + (1 - (y - y0) / (y1 - y0)) * (height - T - B);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(Date.parse(p.t)).toFixed(1)},${sy(p.value!).toFixed(1)}`).join(' ');
  const ticks = 5;
  const yt = Array.from({ length: ticks }, (_, i) => y0 + ((y1 - y0) * i) / (ticks - 1));
  const years = [...new Set(pts.map((p) => p.t.slice(0, 4)))];
  const step = Math.max(1, Math.ceil(years.length / 8));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${yt.map((y) => `<line x1="${L}" x2="${width - R}" y1="${sy(y)}" y2="${sy(y)}" stroke="${dark ? '#22395a' : '#d3e3ee'}"/><text x="${L - 8}" y="${sy(y) + 5}" text-anchor="end" font-family="${FONT}" font-size="16" fill="${fg}">${y.toFixed(1)}</text>`).join('')}
  ${years.filter((_, i) => i % step === 0).map((yr) => `<text x="${sx(Date.parse(pts.find((p) => p.t.startsWith(yr))!.t))}" y="${height - 18}" text-anchor="middle" font-family="${FONT}" font-size="16" fill="${fg}">${yr}</text>`).join('')}
  <path d="${path}" fill="none" stroke="#3fb6bd" stroke-width="4" stroke-linejoin="round"/>
  ${pts.map((p) => `<circle cx="${sx(Date.parse(p.t)).toFixed(1)}" cy="${sy(p.value!).toFixed(1)}" r="3.5" fill="#3fb6bd"/>`).join('')}
  <text x="${L}" y="${T - 4}" font-family="${FONT}" font-size="16" fill="${fg}">${esc(run.result.series.units)}</text>
</svg>`;
}

async function qrDataUri(url: string): Promise<string> {
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#0b1f3a', light: '#ffffff' } });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function slideSvg(opts: { index: number; total: number; title: string; text: string; lang: string; chart?: string; imageDataUri?: string | null; imageNote?: string; credit: string; qr: string; receiptUrl: string }) {
  const hi = opts.lang === 'hi';
  const maxChars = hi ? 34 : 40;
  const hasVisual = !!(opts.chart || opts.imageDataUri || opts.imageNote);
  const titleLines = wrap(opts.title, hi ? 28 : 32, 2);
  const bodyLines = wrap(opts.text, maxChars, hasVisual ? 5 : 11);
  const visualY = 170 + titleLines.length * 20;
  let visual = '';
  if (opts.chart) visual = `<image x="60" y="${visualY}" width="960" height="460" href="data:image/svg+xml;base64,${Buffer.from(opts.chart).toString('base64')}"/>`;
  else if (opts.imageDataUri) visual = `<image x="60" y="${visualY}" width="960" height="460" preserveAspectRatio="xMidYMid meet" href="${opts.imageDataUri}"/>`;
  else if (opts.imageNote) visual = `<rect x="60" y="${visualY}" width="960" height="200" rx="16" fill="#14305a"/>${textBlock(wrap(opts.imageNote, 50, 4), 90, visualY + 60, 28, 400, '#e6eef7')}`;
  const bodyY = hasVisual ? visualY + (opts.chart || opts.imageDataUri ? 500 : 240) : 260;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">
  <rect width="${W}" height="${W}" fill="#0b1f3a"/>
  <rect x="0" y="0" width="${W}" height="12" fill="#3fb6bd"/>
  <text x="60" y="80" font-family="${FONT}" font-size="26" fill="#9fb3cc">PolarPramaan · ${opts.index}/${opts.total}</text>
  ${textBlock(titleLines, 60, 150, 50, 700)}
  ${visual}
  ${textBlock(bodyLines, 60, bodyY, hasVisual ? 34 : 40, 400)}
  <rect x="0" y="${W - 150}" width="${W}" height="150" fill="#07111f"/>
  ${textBlock(wrap(opts.credit, 62, 2), 60, W - 100, 22, 400, '#9fb3cc')}
  ${textBlock(wrap(hi ? 'प्रमाण रसीद: QR स्कैन करें' : 'Evidence receipt: scan the QR', 40, 1), 60, W - 40, 22, 700, '#3fb6bd')}
  <image x="${W - 140}" y="${W - 140}" width="120" height="120" href="${opts.qr}"/>
</svg>`;
}

export interface ExportResult {
  zip: Buffer;
  files: string[];
  notes: string[];
}

export async function buildExport(q: Queryable, versionId: string, baseUrl: string): Promise<ExportResult> {
  const v = await getVersion(q, versionId);
  if (!v) throw new Error('Version not found.');
  const [pub] = await q.query<{ id: string }>(`select id from publications where artifact_version_id = $1 and channel = 'website' and status = 'published'`, [versionId]);
  const receiptUrl = pub ? `${baseUrl}/evidence/${pub.id}` : `${baseUrl}/workspace/drafts/${versionId}`;
  const draft = !pub;
  const body = v.body as VersionBody;
  const notes: string[] = [];
  if (draft) notes.push('DRAFT export: this version is not published; the QR points to the editorial workspace, not to a public receipt.');
  const sharp = (await import('sharp')).default;
  const zip = new JSZip();
  const qr = await qrDataUri(receiptUrl);
  zip.file('evidence-receipt-qr.png', await QRCode.toBuffer(receiptUrl, { type: 'png', margin: 2, width: 600 }));

  const runs = new Map<string, CalcRun>();
  for (const id of body.calcRunIds) {
    const r = await loadCalculation(q, id, false);
    if (r) runs.set(id, r);
  }
  // Media rights are re-checked at export time.
  const verdicts = await checkUses(q, body.media.flatMap((m) => [{ recordId: m.recordId, op: 'republish_media' as const }, { recordId: m.recordId, op: 'transform' as const }]));
  const mediaAllowed = new Set(body.media.filter((m) => verdicts.filter((x) => x.recordId === m.recordId).every((x) => x.allowed)).map((m) => m.recordId));
  const mediaUrls = new Map<string, string | null>();
  for (const m of body.media) {
    const [row] = await q.query<{ media_url: string | null }>(`select media_url from records where id = $1`, [m.recordId]);
    mediaUrls.set(m.recordId, row?.media_url ?? null);
  }
  async function imageFor(recordId: string): Promise<{ uri: string | null; note?: string }> {
    const m = body.media.find((x) => x.recordId === recordId);
    if (!m) return { uri: null };
    if (!mediaAllowed.has(recordId)) return { uri: null, note: `Image omitted: rights no longer allow republication. See ${baseUrl}/records/${recordId}` };
    const url = mediaUrls.get(recordId);
    if (!url) return { uri: null, note: 'Image unavailable.' };
    try {
      const f = await safeFetch(url, { hosts: MEDIA_HOSTS, accept: /^image\/(jpeg|png|webp)/, maxBytes: 4 * 1024 * 1024 });
      const png = await sharp(f.bytes).resize(960, 460, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
      return { uri: `data:image/jpeg;base64,${png.toString('base64')}` };
    } catch (e) {
      notes.push(`Photo "${m.title}" could not be fetched at export time (${(e as Error).message}). Its slide shows a text note instead.`);
      return { uri: null, note: `Photo could not be retrieved at export time. Use the credited original: ${url}` };
    }
  }

  const credits = [...runs.values()].map((r) => r.result.source.citation ?? r.result.source.title);
  for (const m of body.media) credits.push(`${m.title}: ${m.credit ?? ''}${m.license ? ` (${m.license})` : ''}`);
  const creditLine = (runs.size ? `Data: ${[...runs.values()].map((r) => r.result.source.title.split(' — ')[0]).join('; ')}` : 'Sources in receipt') + ` · ${v.language === 'hi' ? 'हिन्दी संस्करण' : 'English'}`;

  // Slides: carousel blocks, or a summary card + chart for other kinds.
  const slides: { title: string; text: string; calcRunId?: string; mediaRecordId?: string }[] =
    v.kind === 'carousel'
      ? body.blocks.filter((b) => b.type === 'slide').map((b: Block) => ({ title: b.title ?? '', text: b.text, calcRunId: b.calcRunId, mediaRecordId: b.mediaRecordId }))
      : [
          { title: v.title, text: body.blocks.filter((b) => ['paragraph', 'caption'].includes(b.type)).map((b) => b.text).join(' ') },
          ...(body.calcRunIds[0] ? [{ title: v.language === 'hi' ? 'आँकड़े' : 'The data', text: '', calcRunId: body.calcRunIds[0] }] : []),
        ];
  const altTexts: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const run = s.calcRunId ? runs.get(s.calcRunId) : undefined;
    const img = s.mediaRecordId ? await imageFor(s.mediaRecordId) : { uri: null as string | null };
    const svg = await slideSvg({ index: i + 1, total: slides.length, title: s.title, text: s.text, lang: v.language, chart: run ? chartSvg(run) : undefined, imageDataUri: img.uri, imageNote: img.note, credit: creditLine, qr, receiptUrl });
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const name = `slides/slide-${String(i + 1).padStart(2, '0')}.png`;
    zip.file(name, png);
    altTexts.push(`${name}: ${s.title}. ${s.text}${run ? ` Line chart of ${run.result.series.variable} (${run.result.series.units}), ${run.recipe.periodStart} to ${run.recipe.periodEnd}, ${run.result.n} values.` : ''}`);
  }
  for (const [id, run] of runs) {
    zip.file(`data/calc-${id.slice(0, 8)}-rows.csv`, rowsCsv(run));
    zip.file(`data/calc-${id.slice(0, 8)}-recipe.json`, JSON.stringify({ calculationId: id, recipe: run.recipe, stats: run.result.stats, n: run.result.n, units: run.units, source: run.result.source, codeVersion: run.codeVersion }, null, 2));
    zip.file(`data/chart-${id.slice(0, 8)}.png`, await sharp(Buffer.from(chartSvg(run, 1200, 600, false))).flatten({ background: '#ffffff' }).png().toBuffer());
  }
  if (runs.size) zip.file('data/verify-calculation.mjs', verifyScript());

  const plain = body.blocks.filter((b) => b.type !== 'figure' && b.type !== 'media').map((b) => (b.title ? `${b.title}\n` : '') + b.text).join('\n\n');
  const caption = body.blocks.filter((b) => ['caption', 'paragraph', 'slide'].includes(b.type) && b.claimKeys.length).map((b) => b.text).slice(0, 2).join(' ');
  zip.file(`caption-${v.language}.txt`, `${caption}\n\n${v.language === 'hi' ? 'प्रमाण' : 'Evidence'}: ${receiptUrl}\n#PolarScience #SeaIce\n`);
  zip.file('alt-text.txt', altTexts.join('\n\n') + '\n');
  zip.file('attribution.txt', ['Attribution and licences', '', ...credits, '', `Evidence receipt: ${receiptUrl}`, 'Produced with PolarPramaan (independent SIH26063 project). Not endorsed by any data provider.'].join('\n') + '\n');
  zip.file('evidence-receipt.txt', `${receiptUrl}\nVersion ${v.version_no}, content hash ${hashOf(v)}\n`);
  const html = `<!doctype html><html lang="${v.language}"><head><meta charset="utf-8"><title>${esc(v.title)}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,'Noto Sans','Noto Sans Devanagari',sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#0b1f3a;line-height:1.6}blockquote{border-left:4px solid #0e7c86;margin:0;padding-left:1rem}.c{background:#fff6e0;padding:.5rem}</style></head><body><h1>${esc(v.title)}</h1>${body.blocks
    .map((b) => (b.type === 'heading' ? '' : b.type === 'quote' ? `<blockquote>${esc(b.text)}</blockquote>` : b.type === 'caveats' ? `<p class="c">${esc(b.text)}</p>` : b.type === 'figure' ? `<p><img src="data/chart-${(b.calcRunId ?? '').slice(0, 8)}.png" alt="Chart" style="max-width:100%"></p>` : `<p>${b.title ? `<strong>${esc(b.title)}</strong><br>` : ''}${esc(b.text)}</p>`))
    .join('')}<p><a href="${esc(receiptUrl)}">Evidence receipt</a></p></body></html>`;
  zip.file(`article-${v.language}.html`, html);
  if (v.kind === 'storyboard') {
    zip.file('storyboard.md', `# ${v.title}\n\nThis is a STORYBOARD (scene plan and narration), not a rendered video.\n\n${body.blocks.map((b) => `## ${b.title}\n- Duration: ${b.durationSec ?? ''} s\n- Visual: ${b.visual ?? ''}\n- Narration: ${b.text}\n`).join('\n')}\nEvidence: ${receiptUrl}\n`);
  }
  zip.file('README.txt', [`PolarPramaan outreach kit — ${v.title}`, `Kind: ${v.kind}; audience: ${v.audience}; language: ${v.language}; version ${v.version_no}; state: ${v.state}.`, ...notes, '', 'Contents: slides/*.png (1080×1080), caption, alt text, attribution, article HTML, data (rows, recipe, chart, verification script), evidence QR.', 'Posting to external platforms is manual; record the post URL in the workspace so corrections can be followed up.', '', plain.slice(0, 4000)].join('\n'));
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const files = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
  return { zip: buf, files, notes };
}

function hashOf(v: object): string {
  return String((v as { body_hash?: string }).body_hash ?? '');
}
