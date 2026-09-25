import type { TextBlock } from './html';

/** Split a MediaWiki plaintext extract into paragraphs with section headings. */
export function wikipediaExtractToBlocks(extract: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let heading: string | null = 'Introduction';
  for (const raw of extract.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^=+\s*(.*?)\s*=+$/);
    if (h) {
      heading = h[1];
      continue;
    }
    if (/^(References|External links|See also|Further reading|Notes)$/i.test(heading || '')) continue;
    if (line.length < 40) continue;
    blocks.push({ heading, text: line });
  }
  return blocks;
}
