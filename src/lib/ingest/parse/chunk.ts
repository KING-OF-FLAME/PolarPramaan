import type { TextBlock } from './html';

export interface Chunk {
  heading: string | null;
  text: string;
  charStart: number; // offsets into the normalized document text (blocks joined by "\n\n")
  charEnd: number;
  page?: number;
}

/** Split blocks into sentence-aligned chunks of at most maxLen characters, preserving offsets. */
export function chunkBlocks(blocks: TextBlock[], maxLen = 700): { docText: string; chunks: Chunk[] } {
  let docText = '';
  const chunks: Chunk[] = [];
  for (const b of blocks) {
    if (docText) docText += '\n\n';
    const base = docText.length;
    docText += b.text;
    const sentences = b.text.match(/[^.!?]+[.!?]+["’”)]*\s*|[^.!?]+$/g) || [b.text];
    let start = 0;
    let cur = '';
    for (const s of sentences) {
      if (cur && (cur + s).length > maxLen) {
        chunks.push({ heading: b.heading, text: cur.trim(), charStart: base + start, charEnd: base + start + cur.trimEnd().length });
        start += cur.length;
        cur = '';
      }
      cur += s;
    }
    if (cur.trim()) chunks.push({ heading: b.heading, text: cur.trim(), charStart: base + start, charEnd: base + start + cur.trimEnd().length });
  }
  return { docText, chunks };
}
