import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { llmStatus } from '@/lib/llm';
import { dbMode } from '@/lib/env';

export const metadata = { title: 'About & methods' };
export const dynamic = 'force-dynamic';

export default function About() {
  const llm = llmStatus();
  return (
    <article className="max-w-3xl space-y-5">
      <PageHeader title="About PolarPramaan" lead="“Pramaan” (प्रमाण) means proof or evidence. PolarPramaan is an independent student project for Smart India Hackathon problem statement SIH26063 (MoES / NCPOR, Smart Education)." />
      <p>
        India&apos;s polar programme already publishes data and catalogs, through the India National Polar Data Center and the NCPOR data portal. PolarPramaan
        does not replace them. It adds an outreach layer on top: every public claim is traced to its evidence, checked, reviewed, published with a receipt,
        and followed up when that evidence changes.
      </p>
      <h2 className="text-xl font-semibold">Methods in brief</h2>
      <ul className="list-disc pl-5 space-y-2">
        <li>
          <strong>Real data only.</strong> Records come from a hashed snapshot of official endpoints (NSIDC, PANGAEA, NASA, Wikimedia, OpenAlex, NOAA, NCPOR
          metadata). Missing values stay missing, and failed fetches are reported on <Link href="/sources">Sources &amp; Rights</Link>.
        </li>
        <li>
          <strong>Numbers are computed, not generated.</strong> Charts and every number in generated text come from deterministic calculations with saved
          recipes and a verification script.
        </li>
        <li>
          <strong>Evidence is exact.</strong> PDF page numbers, HTML heading and character offsets, table rows and columns, and caption timestamps are kept.
          Quotes are checked against the stored text. A matching quote shows the text exists; it does not prove the interpretation is correct.
        </li>
        <li>
          <strong>Rights control what the system may do.</strong> Indexing, quoting, AI processing, adaptation, media republication, offline copies and
          downloads are separate permissions, enforced on the server.
        </li>
        <li id="corrections">
          <strong>Corrections propagate.</strong> Withdrawing or superseding a source version flags dependent drafts, pauses scheduled publications, adds
          public notices and marks offline packs stale. Newly appended data rows do not invalidate earlier stories; corrected rows affect only the
          calculations that used them.
        </li>
        <li>
          <strong>Review is human and labelled honestly.</strong> Reviews are by project team members. Nothing claims NCPOR approval or review by an external
          scientist.
        </li>
      </ul>
      <h2 className="text-xl font-semibold">Current capability status</h2>
      <ul className="list-disc pl-5">
        <li>Database mode: {dbMode()}</li>
        <li>AI synthesis: {llm.configured ? `configured (${llm.model})` : 'not configured. Answers are extractive quotes; generation uses deterministic templates.'}</li>
        <li>Semantic (embedding) search: not configured. Search is lexical (PostgreSQL full text).</li>
        <li>External social posting: not connected. Export packages are produced for manual posting.</li>
        <li>OCR and audio transcription: not configured. Only text-layer PDFs and existing caption files are indexed.</li>
      </ul>
      <h2 id="setup" className="text-xl font-semibold">Setup</h2>
      <p>
        See <code>docs/SETUP.md</code> in the repository: set <code>DATABASE_URL</code>, run <code>pnpm db:migrate</code> and <code>pnpm ingest:bootstrap</code>, then
        create the first admin with <code>pnpm admin:invite --email you@example.org --role admin</code>.
      </p>
    </article>
  );
}
