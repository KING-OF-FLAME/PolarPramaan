// Minimal, dependency-free HTML text extraction for trusted-provider pages.
// Output is plain text only; no markup from sources is ever rendered as HTML.

export interface TextBlock {
  heading: string | null;
  text: string;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', hellip: '…', deg: '°', sup2: '²', minus: '−', times: '×', shy: '',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function htmlTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripTags(m[1]) : null;
}

export function htmlToBlocks(html: string): TextBlock[] {
  let doc = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|form|button|select)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const main = doc.match(/<main[^>]*>([\s\S]*)<\/main>/i);
  if (main) doc = main[1];
  doc = doc.replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const blocks: TextBlock[] = [];
  let heading: string | null = null;
  const re = /<(h[1-4]|p|li|figcaption|blockquote)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc))) {
    const tag = m[1].toLowerCase();
    // Navigation/related-link lists: an element whose whole content is a single link is not evidence.
    if (!tag.startsWith('h') && /^\s*<a\b[^>]*>[\s\S]*?<\/a>\s*$/i.test(m[3]) && (m[3].match(/<a\b/gi) || []).length === 1) continue;
    const text = stripTags(m[3]);
    if (!text) continue;
    if (tag.startsWith('h')) {
      heading = text;
      continue;
    }
    if (text.length < 40) continue; // skip link lists / labels
    blocks.push({ heading, text });
  }
  return blocks;
}
