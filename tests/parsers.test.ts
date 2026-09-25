import { describe, expect, it } from 'vitest';
import { parseNsidcMonthlyCsv, splitCsvLine } from '@/lib/ingest/parse/nsidc';
import { parsePangaeaTab, declaredUnit } from '@/lib/ingest/parse/pangaea';
import { parseCaptions, groupCues } from '@/lib/ingest/parse/captions';
import { htmlToBlocks } from '@/lib/ingest/parse/html';
import { chunkBlocks } from '@/lib/ingest/parse/chunk';
import { readSnapshotText } from '@/lib/ingest/snapshot';
import { verifySnapshot } from '@/lib/ingest/snapshot';

describe('real snapshot integrity', () => {
  it('every stored file matches the SHA-256 recorded at retrieval', () => {
    const v = verifySnapshot();
    expect(v.length).toBeGreaterThan(60);
    expect(v.filter((x) => !x.ok)).toEqual([]);
  });
});

describe('NSIDC CSV', () => {
  it('parses real monthly files, keeps -9999 as missing and quoted product labels intact', () => {
    const n12 = parseNsidcMonthlyCsv(readSnapshotText('nsidc/north/monthly/N_12_extent_v4.0.csv'));
    const dec87 = n12.find((r) => r.rowKey === '1987-12')!;
    expect(dec87.extent).toBeNull();
    expect(dec87.sourceDataset).toBeNull();
    const s05 = parseNsidcMonthlyCsv(readSnapshotText('nsidc/south/monthly/S_05_extent_v4.0.csv'));
    expect(s05.find((r) => r.rowKey === '2024-05')!.sourceDataset).toBe('NSIDC-0051,NSIDC-0081');
    expect(splitCsvLine('2024,  5,"a,b", S')).toEqual(['2024', '5', 'a,b', 'S']);
  });
  it('rejects an unexpected header rather than guessing a schema', () => {
    expect(() => parseNsidcMonthlyCsv('year,month,extent\n1979,1,1')).toThrow(/unexpected header/);
  });
});

describe('PANGAEA TSV', () => {
  it('parses metadata, erratum, licence and declared units (duplicate Comment columns tolerated)', () => {
    const t = parsePangaeaTab(readSnapshotText('pangaea/PANGAEA.885208.tab'));
    expect(t.header.license).toMatch(/CC-BY-3.0/);
    expect(t.header.comment).toMatch(/wrong format/);
    expect(t.columns.filter((c) => c === 'Comment').length).toBe(2);
    expect(declaredUnit('Ice conc [tenths] (total)')).toBe('tenths');
    expect(t.rows.length).toBeGreaterThan(50);
  });
});

describe('captions', () => {
  it('parses SRT with font tags and groups rolling cues with timestamps', () => {
    const cues = parseCaptions('1\n00:00:04,490 --> 00:00:09,210\nthe polar ice<font color="#CCC"> caps</font>\n\n2\n00:00:40,000 --> 00:00:42,000\nlater\n');
    expect(cues[0]).toEqual({ startMs: 4490, endMs: 9210, text: 'the polar ice caps' });
    expect(groupCues(cues, 30_000)).toHaveLength(2);
  });
});

describe('HTML extraction', () => {
  it('keeps headings/paragraph offsets and drops scripts and link-only navigation', () => {
    const html = '<main><h2>Section A</h2><p>First paragraph with enough words to count as evidence here.</p><ul><li><a href="/x">World of Change: Something unrelated here</a></li></ul><script>alert(1)</script><p>Second paragraph, also long enough to be kept as evidence text.</p></main>';
    const blocks = htmlToBlocks(html);
    expect(blocks.map((b) => b.heading)).toEqual(['Section A', 'Section A']);
    expect(blocks.some((b) => /World of Change|alert/.test(b.text))).toBe(false);
    const { docText, chunks } = chunkBlocks(blocks);
    for (const c of chunks) expect(docText.slice(c.charStart, c.charEnd)).toBe(c.text);
  });
});
