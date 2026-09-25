import type { Queryable } from '../db/core';

export interface ChangeClassification {
  kind: 'append_only' | 'row_correction' | 'content_change' | 'identical';
  summary: string;
  changedRowKeys: string[]; // "<series_key>/<row_key>" for rows whose value changed or disappeared
  appendedRowKeys: string[];
}

/**
 * Compare two versions of the same record. For datasets, distinguishes newly
 * appended rows (which do not invalidate earlier stories) from corrections to
 * rows that already existed (which invalidate outputs that used those rows).
 */
export async function classifyDatasetChange(q: Queryable, oldVersionId: string, newVersionId: string): Promise<ChangeClassification> {
  const rows = async (vid: string) =>
    q.query<{ k: string; raw_value: string }>(
      `select ds.series_key || '/' || o.row_key as k, o.raw_value
         from observations o join dataset_series ds on ds.id = o.series_id
        where ds.source_version_id = $1`,
      [vid],
    );
  const [a, b] = await Promise.all([rows(oldVersionId), rows(newVersionId)]);
  if (a.length === 0 && b.length === 0) {
    const spans = async (vid: string) => (await q.query<{ text: string }>(`select text from evidence_spans where source_version_id = $1 order by ordinal`, [vid])).map((r) => r.text).join('\n');
    const same = (await spans(oldVersionId)) === (await spans(newVersionId));
    return { kind: same ? 'identical' : 'content_change', summary: same ? 'extracted text identical' : 'extracted text changed', changedRowKeys: [], appendedRowKeys: [] };
  }
  const oldMap = new Map(a.map((r) => [r.k, r.raw_value]));
  const newMap = new Map(b.map((r) => [r.k, r.raw_value]));
  const changed: string[] = [];
  for (const [k, v] of oldMap) if (!newMap.has(k) || newMap.get(k) !== v) changed.push(k);
  const appended = [...newMap.keys()].filter((k) => !oldMap.has(k));
  if (changed.length) return { kind: 'row_correction', summary: `${changed.length} existing row(s) changed or removed; ${appended.length} appended`, changedRowKeys: changed, appendedRowKeys: appended };
  if (appended.length) return { kind: 'append_only', summary: `${appended.length} row(s) appended; no existing rows changed`, changedRowKeys: [], appendedRowKeys: appended };
  return { kind: 'identical', summary: 'no row changes', changedRowKeys: [], appendedRowKeys: [] };
}
