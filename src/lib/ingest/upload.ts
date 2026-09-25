// Text extraction for authorised contributor uploads, run only after a curator
// grants indexing rights. Numeric series import from uploads is not automatic.
import type { Queryable } from '../db/core';
import { chunkPdfPages, pdfPages } from './parse/pdf';
import { chunkBlocks } from './parse/chunk';
import { splitCsvLine } from './parse/nsidc';

export async function runExtractionForUpload(q: Queryable, recordId: string): Promise<number> {
  const [v] = await q.query<{ id: string; mime: string; bytes: Uint8Array; source_id: string; n: number }>(
    `select v.id, v.mime, b.bytes, r.source_id, (select count(*)::int from evidence_spans e where e.source_version_id = v.id) n
       from source_versions v join records r on r.id = v.record_id join blobs b on b.sha256 = v.blob_sha256
      where v.record_id = $1 and v.status = 'active' order by v.created_at desc limit 1`,
    [recordId],
  );
  if (!v || v.source_id !== 'upload' || v.n > 0) return 0;
  const bytes = Buffer.from(v.bytes);
  const spans: { kind: string; text: string; page?: number; charStart?: number; charEnd?: number; heading?: string | null; rowKey?: string; columns?: string[]; method: string }[] = [];
  if (v.mime === 'application/pdf') {
    for (const c of chunkPdfPages(await pdfPages(new Uint8Array(bytes)))) spans.push({ kind: 'pdf_page', text: c.text, page: c.page, charStart: c.charStart, charEnd: c.charEnd, method: 'pdfjs-text' });
  } else if (v.mime === 'text/plain') {
    const { chunks } = chunkBlocks(bytes.toString('utf8').split(/\n\s*\n/).map((t) => ({ heading: null, text: t.replace(/\s+/g, ' ').trim() })).filter((b) => b.text.length > 20));
    for (const c of chunks) spans.push({ kind: 'text', text: c.text, charStart: c.charStart, charEnd: c.charEnd, heading: c.heading, method: 'plain-text' });
  } else if (v.mime === 'text/csv') {
    const lines = bytes.toString('utf8').split(/\r?\n/).filter((l) => l.trim());
    const head = splitCsvLine(lines[0] ?? '');
    lines.slice(1, 2001).forEach((l, i) => spans.push({ kind: 'table_row', text: l, rowKey: `row-${i + 1}`, columns: head, method: 'csv-row' }));
  }
  let ord = 0;
  for (const sp of spans) {
    await q.query(
      `insert into evidence_spans (source_version_id, kind, ordinal, page, char_start, char_end, heading, row_key, column_names, text, extraction_method) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [v.id, sp.kind, ord++, sp.page ?? null, sp.charStart ?? null, sp.charEnd ?? null, sp.heading ?? null, sp.rowKey ?? null, sp.columns ?? null, sp.text, sp.method],
    );
  }
  return spans.length;
}
