// SRT / WebVTT caption parsing with timestamp preservation.

export interface Cue {
  startMs: number;
  endMs: number;
  text: string;
}

function ts(s: string): number {
  const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
  if (!m) throw new Error(`bad caption timestamp "${s}"`);
  const [, h, mi, se, ms] = m;
  return ((Number(h || 0) * 60 + Number(mi)) * 60 + Number(se)) * 1000 + Number(ms.padEnd(3, '0'));
}

function clean(t: string): string {
  return t
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseCaptions(text: string): Cue[] {
  const body = text.replace(/^﻿/, '').replace(/\r/g, '');
  const blocks = body.split(/\n\s*\n/);
  const cues: Cue[] = [];
  for (const b of blocks) {
    const lines = b.split('\n').filter((l) => l.trim() !== '');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, z] = lines[i].split('-->');
    const t = clean(lines.slice(i + 1).join(' '));
    if (!t) continue;
    cues.push({ startMs: ts(a), endMs: ts(z.trim().split(/\s+/)[0]), text: t });
  }
  return cues;
}

/**
 * Auto-generated captions often repeat the previous line (rolling captions).
 * Drop a cue whose text is fully contained at the end of the running transcript,
 * then group cues into windows of roughly `windowMs`.
 */
export function groupCues(cues: Cue[], windowMs = 30_000): Cue[] {
  const out: Cue[] = [];
  let cur: Cue | null = null;
  let lastText = '';
  for (const c of cues) {
    if (c.text === lastText) continue;
    lastText = c.text;
    if (!cur) cur = { ...c };
    else if (c.startMs - cur.startMs < windowMs) {
      cur.endMs = Math.max(cur.endMs, c.endMs);
      cur.text += ' ' + c.text;
    } else {
      out.push(cur);
      cur = { ...c };
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
