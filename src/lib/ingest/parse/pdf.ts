// PDF text extraction with page numbers (text-layer PDFs only; no OCR).
import type { Chunk } from './chunk';

export async function pdfPages(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const pages: string[] = [];
  const maxPages = Math.min(doc.numPages, 120);
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let text = '';
    for (const item of content.items as { str?: string; hasEOL?: boolean }[]) {
      if (typeof item.str !== 'string') continue;
      text += item.str + (item.hasEOL ? '\n' : ' ');
    }
    pages.push(text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim());
  }
  await task.destroy();
  return pages;
}

// Skip very short fragments and table-of-contents leader lines ("Summary ........ 1").
const keep = (t: string) => t.trim().length >= 40 && !/\.{6,}/.test(t);

/** Chunk page text into paragraph-ish spans; offsets are relative to each page's normalized text. */
export function chunkPdfPages(pages: string[], maxLen = 800): Chunk[] {
  const chunks: Chunk[] = [];
  pages.forEach((pageText, idx) => {
    const flat = pageText.replace(/-\n(?=[a-z])/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const sentences = flat.match(/[^.!?]+[.!?]+["’”)]*\s*|[^.!?]+$/g) || [];
    let start = 0;
    let cur = '';
    for (const s of sentences) {
      if (cur && (cur + s).length > maxLen) {
        if (keep(cur)) chunks.push({ heading: null, text: cur.trim(), charStart: start, charEnd: start + cur.trimEnd().length, page: idx + 1 });
        start += cur.length;
        cur = '';
      }
      cur += s;
    }
    if (keep(cur)) chunks.push({ heading: null, text: cur.trim(), charStart: start, charEnd: start + cur.trimEnd().length, page: idx + 1 });
  });
  return chunks;
}

/** The page-normalized text used for offsets (for quote validation). */
export function normalizePdfPage(pageText: string): string {
  return pageText.replace(/-\n(?=[a-z])/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}
