'use server';
// Editorial server actions. Every action re-checks the caller's role on the
// server; navigation visibility is never the authorization boundary.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createHash } from 'node:crypto';
import { getDb } from '@/lib/db';
import { acceptInvite, createInvite, login, logout, rateLimit, audit } from '@/lib/auth/store';
import { SESSION_COOKIE, clearSessionCookie, clientIp, requireActor, setSessionCookie } from '@/lib/auth/session';
import { cookies } from 'next/headers';
import { AuthError, type Role } from '@/lib/auth/roles';
import { createDraft, editVersion, StudioError } from '@/lib/studio/service';
import { RightsViolation } from '@/lib/rights/check';
import { cancelScheduled, processOutbox, PublishError, recordManualExternalPost, reviewVersion, schedulePublication, submitForReview, EXTERNAL_CHANNELS, type ExternalChannel } from '@/lib/publish/service';
import { acceptNewVersion, CorrectionError, resolveImpact, withdrawSourceVersion } from '@/lib/corrections/service';
import { saveCalculation } from '@/lib/calc/compute';
import { buildMuseumPack } from '@/lib/offline/packs';
import { zonedToUtc } from '@/lib/web/time';
import { runExtractionForUpload } from '@/lib/ingest/upload';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const back = (path: string, params: Record<string, string>) => redirect(`${path}${path.includes('?') ? '&' : '?'}${new URLSearchParams(params)}`);

function friendly(e: unknown): string {
  if (e instanceof AuthError || e instanceof StudioError || e instanceof PublishError || e instanceof CorrectionError) return e.message;
  if (e instanceof RightsViolation) return e.message;
  if (e && typeof e === 'object' && 'digest' in e) throw e; // Next.js redirect/notFound
  console.error('action failed', (e as Error)?.message);
  return 'The action failed. Nothing was changed.';
}

// ------------------------------------------------------------------ auth
export async function loginAction(form: FormData) {
  if ((await import('@/lib/env')).isReadOnlyPreview()) back('/workspace/login', { error: 'Sign-in is disabled in the read-only preview.' });
  const email = s(form, 'email').toLowerCase();
  const password = String(form.get('password') ?? '');
  const db = await getDb();
  const ip = await clientIp();
  if (!(await rateLimit(db, `login:${ip}`, 20, 900)) || !(await rateLimit(db, `login:${email}`, 8, 900))) back('/workspace/login', { error: 'Too many attempts. Wait 15 minutes.' });
  const res = await login(db, email, password, (await headers()).get('user-agent'));
  if (!res) back('/workspace/login', { error: 'Email or password is incorrect, or the account is inactive.' });
  await setSessionCookie(res!.token);
  redirect('/workspace');
}

export async function logoutAction() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await logout(await getDb(), token);
  await clearSessionCookie();
  redirect('/');
}

export async function acceptInviteAction(form: FormData) {
  const token = s(form, 'token');
  const db = await getDb();
  if (!(await rateLimit(db, `invite:${await clientIp()}`, 10, 3600))) back(`/workspace/invite/${token}`, { error: 'Too many attempts.' });
  const res = await db.tx((q) => acceptInvite(q, token, s(form, 'name'), String(form.get('password') ?? '')));
  if ('error' in res) back(`/workspace/invite/${token}`, { error: res.error });
  back('/workspace/login', { ok: 'Account ready. Sign in.' });
}

export async function inviteAction(form: FormData) {
  let url = '';
  try {
    const actor = await requireActor('admin');
    const role = s(form, 'role') as Role;
    if (!['contributor', 'reviewer', 'admin'].includes(role)) throw new StudioError('Choose a role.');
    const email = s(form, 'email').toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new StudioError('Enter a valid email.');
    const token = await createInvite(await getDb(), email, role, actor.id);
    const h = await headers();
    url = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}/workspace/invite/${token}`;
  } catch (e) {
    back('/workspace/settings', { error: friendly(e) });
  }
  back('/workspace/settings', { invite: url });
}

export async function setMembershipAction(form: FormData) {
  try {
    const actor = await requireActor('admin');
    const userId = s(form, 'userId');
    if (userId === actor.id) throw new StudioError('You cannot change your own role or status.');
    const role = s(form, 'role');
    const status = s(form, 'status');
    const db = await getDb();
    await db.query(`update memberships set role = $2, status = $3 where user_id = $1`, [userId, role, status]);
    if (status === 'suspended') await db.query(`delete from sessions where user_id = $1`, [userId]);
    await audit(db, actor.id, 'membership.update', 'user', userId, { role, status });
  } catch (e) {
    back('/workspace/settings', { error: friendly(e) });
  }
  revalidatePath('/workspace/settings');
}

// ------------------------------------------------------------------ studio
export async function saveCalcAction(form: FormData) {
  let id = '';
  try {
    const actor = await requireActor('contributor');
    const db = await getDb();
    const run = await db.tx((q) => saveCalculation(q, JSON.parse(s(form, 'recipe')), actor.id));
    id = run.id;
  } catch (e) {
    back('/workspace/studio', { error: friendly(e) });
  }
  back('/workspace/studio', { calc: id });
}

export async function createDraftAction(form: FormData) {
  let first = '';
  try {
    const actor = await requireActor('contributor');
    const db = await getDb();
    const res = await db.tx((q) =>
      createDraft(q, actor, {
        kind: s(form, 'kind') as 'article',
        audience: s(form, 'audience') as 'school',
        calcRunIds: form.getAll('calc').map(String).filter(Boolean),
        spanIds: form.getAll('span').map(String).filter(Boolean),
        mediaRecordIds: form.getAll('media').map(String).filter(Boolean),
        languages: form.getAll('lang').map(String) as ('en' | 'hi')[],
      }),
    );
    first = res.versionIds[0];
  } catch (e) {
    if (e instanceof RightsViolation) {
      const blocked = e.verdicts.filter((v) => !v.allowed).map((v) => v.recordId);
      back('/workspace/studio', { error: e.message, blocked: [...new Set(blocked)].join(',') });
    }
    back('/workspace/studio', { error: friendly(e) });
  }
  redirect(`/workspace/drafts/${first}`);
}

export async function editDraftAction(form: FormData) {
  const vid = s(form, 'versionId');
  let nv = '';
  try {
    const actor = await requireActor('contributor');
    const n = Number(s(form, 'count'));
    const texts = Array.from({ length: n }, (_, i) => String(form.get(`block-${i}`) ?? ''));
    const res = await (await getDb()).tx((q) => editVersion(q, actor, vid, texts, s(form, 'title') || undefined));
    nv = res.versionId;
  } catch (e) {
    back(`/workspace/drafts/${vid}`, { error: friendly(e) });
  }
  redirect(`/workspace/drafts/${nv}`);
}

export async function submitAction(form: FormData) {
  const vid = s(form, 'versionId');
  try {
    const actor = await requireActor('contributor');
    await (await getDb()).tx((q) => submitForReview(q, actor, vid));
  } catch (e) {
    back(`/workspace/drafts/${vid}`, { error: friendly(e) });
  }
  back(`/workspace/drafts/${vid}`, { ok: 'Submitted for review.' });
}

export async function reviewAction(form: FormData) {
  const vid = s(form, 'versionId');
  try {
    const actor = await requireActor('reviewer');
    await (await getDb()).tx((q) => reviewVersion(q, actor, vid, s(form, 'kind') as 'scientific', s(form, 'decision') as 'approve', s(form, 'notes')));
  } catch (e) {
    back(`/workspace/drafts/${vid}`, { error: friendly(e) });
  }
  back(`/workspace/drafts/${vid}`, { ok: 'Review recorded.' });
}

export async function commentAction(form: FormData) {
  const vid = s(form, 'versionId');
  try {
    const actor = await requireActor('contributor');
    const body = s(form, 'body').slice(0, 4000);
    if (!body) throw new StudioError('Write a comment first.');
    await (await getDb()).query(`insert into review_comments (artifact_version_id, author_id, body) values ($1, $2, $3)`, [vid, actor.id, body]);
  } catch (e) {
    back(`/workspace/drafts/${vid}`, { error: friendly(e) });
  }
  back(`/workspace/drafts/${vid}`, { ok: 'Comment added.' });
}

export async function scheduleAction(form: FormData) {
  const vid = s(form, 'versionId');
  let msg = '';
  try {
    const actor = await requireActor('reviewer');
    const local = s(form, 'when');
    const tz = s(form, 'tz') || 'Asia/Kolkata';
    const when = local ? zonedToUtc(local, tz) : null;
    const db = await getDb();
    const res = await db.tx((q) => schedulePublication(q, actor, vid, when));
    const outcomes = await processOutbox((fn) => db.tx(fn), 5);
    const mine = outcomes.find((o) => o.publicationId === res.publicationId);
    msg = mine?.result === 'published' ? 'Published to the website.' : mine?.result === 'paused' ? `Paused: ${mine.problems?.join(' ')}` : `Scheduled for ${when ? when.toISOString() : 'now'} (UTC).`;
  } catch (e) {
    back(`/workspace/drafts/${vid}`, { error: friendly(e) });
  }
  back(`/workspace/drafts/${vid}`, { ok: msg });
}

export async function cancelPublicationAction(form: FormData) {
  try {
    const actor = await requireActor('reviewer');
    await (await getDb()).tx((q) => cancelScheduled(q, actor, s(form, 'publicationId')));
  } catch (e) {
    back('/workspace/publications', { error: friendly(e) });
  }
  back('/workspace/publications', { ok: 'Cancelled.' });
}

export async function processOutboxAction() {
  let n = 0;
  try {
    await requireActor('reviewer');
    const db = await getDb();
    n = (await processOutbox((fn) => db.tx(fn), 20)).length;
  } catch (e) {
    back('/workspace/publications', { error: friendly(e) });
  }
  back('/workspace/publications', { ok: `Processed ${n} due item(s).` });
}

export async function manualPostAction(form: FormData) {
  const vid = s(form, 'versionId');
  try {
    const actor = await requireActor('reviewer');
    const ch = s(form, 'channel') as ExternalChannel;
    if (!EXTERNAL_CHANNELS.includes(ch)) throw new PublishError('Unknown channel.');
    await (await getDb()).tx((q) => recordManualExternalPost(q, actor, vid, ch, s(form, 'url')));
  } catch (e) {
    back(`/workspace/drafts/${vid}`, { error: friendly(e) });
  }
  back(`/workspace/drafts/${vid}`, { ok: 'External post recorded (editor-reported, not platform-verified).' });
}

// ------------------------------------------------------------------ corrections & catalog
export async function withdrawAction(form: FormData) {
  let msg = '';
  try {
    const actor = await requireActor('admin');
    const res = await (await getDb()).tx((q) => withdrawSourceVersion(q, actor, s(form, 'sourceVersionId'), s(form, 'reason')));
    msg = `Withdrawn. ${res.affected.length} dependent version(s): ${res.counts.drafts} draft(s) sent back for revalidation, ${res.counts.paused} scheduled publication(s) paused, ${res.counts.notices} public notice(s), ${res.counts.external} external follow-up task(s), ${res.stalePacks.length} offline pack(s) marked stale.`;
  } catch (e) {
    back('/workspace/corrections', { error: friendly(e) });
  }
  back('/workspace/corrections', { ok: msg });
}

export async function acceptVersionAction(form: FormData) {
  let msg = '';
  try {
    const actor = await requireActor('admin');
    const res = await (await getDb()).tx((q) => acceptNewVersion(q, actor, s(form, 'sourceVersionId')));
    msg = `Accepted (${res.kind}): ${res.change.summary}. ${res.affected.length} dependent version(s) flagged.`;
  } catch (e) {
    back('/workspace/corrections', { error: friendly(e) });
  }
  back('/workspace/corrections', { ok: msg });
}

export async function resolveImpactAction(form: FormData) {
  try {
    const actor = await requireActor('reviewer');
    await (await getDb()).tx((q) => resolveImpact(q, actor, s(form, 'impactId'), s(form, 'resolution') as 'revised'));
  } catch (e) {
    back('/workspace/corrections', { error: friendly(e) });
  }
  back('/workspace/corrections', { ok: 'Impact updated.' });
}

export async function linkDecisionAction(form: FormData) {
  try {
    const actor = await requireActor('reviewer');
    const decision = s(form, 'decision');
    const span = s(form, 'spanId');
    const db = await getDb();
    if (decision === 'verified') {
      if (!/^[0-9a-f-]{36}$/i.test(span)) throw new StudioError('A verified link needs a supporting evidence span id.');
      await db.query(`update record_links set curator_status = 'verified', evidence_span_id = $2 where id = $1`, [s(form, 'linkId'), span]);
    } else await db.query(`update record_links set curator_status = 'rejected' where id = $1`, [s(form, 'linkId')]);
    await audit(db, actor.id, `link.${decision}`, 'record_link', s(form, 'linkId'), { span });
  } catch (e) {
    back('/workspace/catalog', { error: friendly(e) });
  }
  back('/workspace/catalog', { ok: 'Link updated.' });
}

const BOOL_FIELDS = ['metadata_public', 'allow_store_original', 'allow_download', 'allow_index_text', 'allow_quote', 'allow_ai_processing', 'allow_transform', 'allow_republish_media', 'allow_offline', 'people_identifiable'] as const;

export async function rightsDecisionAction(form: FormData) {
  const recordId = s(form, 'recordId');
  try {
    const actor = await requireActor('admin');
    const rationale = s(form, 'rationale');
    if (rationale.length < 15) throw new StudioError('Explain the decision (at least 15 characters) and cite the policy.');
    const status = s(form, 'status');
    const db = await getDb();
    await db.tx(async (q) => {
      await q.query(
        `insert into rights_decisions (record_id, status, license, attribution, policy_url, ${BOOL_FIELDS.join(', ')}, rationale, decided_by)
         values ($1, $2, $3, $4, $5, ${BOOL_FIELDS.map((_, i) => `$${i + 6}`).join(', ')}, $${BOOL_FIELDS.length + 6}, $${BOOL_FIELDS.length + 7})`,
        [recordId, status, s(form, 'license') || null, s(form, 'attribution') || null, s(form, 'policyUrl') || null, ...BOOL_FIELDS.map((f) => form.get(f) === 'on'), rationale, actor.id],
      );
      const visibility = s(form, 'visibility');
      const catalog = s(form, 'catalogStatus');
      await q.query(`update records set visibility = $2, catalog_status = $3, updated_at = now() where id = $1`, [recordId, visibility === 'public' ? 'public' : 'internal', ['pending', 'approved', 'withdrawn'].includes(catalog) ? catalog : 'pending']);
      await audit(q, actor.id, 'rights.decide', 'record', recordId, { status });
      if (form.get('allow_index_text') === 'on') await runExtractionForUpload(q, recordId);
    });
  } catch (e) {
    back(`/workspace/catalog/${recordId}`, { error: friendly(e) });
  }
  back(`/workspace/catalog/${recordId}`, { ok: 'Rights decision recorded.' });
}

const UPLOAD_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'text/csv': 'csv', 'text/plain': 'txt', 'image/jpeg': 'jpg', 'image/png': 'png', 'video/mp4': 'mp4' };

export async function uploadAction(form: FormData) {
  let id = '';
  try {
    const actor = await requireActor('contributor');
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new StudioError('Choose a file.');
    if (file.size > 4 * 1024 * 1024) throw new StudioError('Files are limited to 4 MB in this deployment.');
    const mime = file.type in UPLOAD_TYPES ? file.type : '';
    if (!mime) throw new StudioError('Allowed types: PDF, CSV, plain text, JPEG, PNG, MP4. HTML and SVG are rejected.');
    const bytes = Buffer.from(await file.arrayBuffer());
    // Content sniffing: the declared type must match the bytes.
    const magic = bytes.subarray(0, 8).toString('latin1');
    const okMagic = mime === 'application/pdf' ? magic.startsWith('%PDF-') : mime === 'image/png' ? magic.startsWith('\x89PNG') : mime === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 : mime === 'video/mp4' ? bytes.subarray(4, 8).toString('latin1') === 'ftyp' : !/<(script|html|svg|iframe)/i.test(bytes.subarray(0, 4096).toString('utf8'));
    if (!okMagic) throw new StudioError('The file contents do not match its declared type.');
    const kind = s(form, 'kind');
    const title = s(form, 'title');
    const sourceUrl = s(form, 'sourceUrl');
    if (title.length < 5) throw new StudioError('Give the upload a descriptive title.');
    if (!/^https:\/\//.test(sourceUrl)) throw new StudioError('Give the original source URL (https).');
    if (form.get('authorized') !== 'on') throw new StudioError('Confirm that you are authorised to upload this material.');
    const sha = createHash('sha256').update(bytes).digest('hex');
    const db = await getDb();
    id = await db.tx(async (q) => {
      await q.query(`insert into blobs (sha256, bytes, mime, byte_size) values ($1, $2, $3, $4) on conflict (sha256) do nothing`, [sha, bytes, mime, bytes.length]);
      const [r] = await q.query<{ id: string }>(
        `insert into records (content_kind, title, description, source_id, external_id, canonical_url, visibility, catalog_status, archival, created_by, india_specific)
         values ($1, $2, $3, 'upload', $4, $5, 'internal', 'pending', 'archived', $6, $7) returning id`,
        [kind, title, s(form, 'description') || null, `sha256:${sha}`, sourceUrl, actor.id, form.get('india') === 'on'],
      );
      await q.query(
        `insert into rights_decisions (record_id, status, metadata_public, rationale, decided_by) values ($1, 'unknown', false, 'Contributor upload awaiting curator rights review. The contributor confirmed authorisation, but nothing is public or processed until a curator decides.', $2)`,
        [r.id, actor.id],
      );
      await q.query(`insert into source_versions (record_id, version_label, content_hash, blob_sha256, mime, byte_size, retrieval_url, retrieved_at, status) values ($1, 'contributor upload', $2, $3, $4, $5, $6, now(), 'active')`, [r.id, sha, sha, mime, bytes.length, sourceUrl]);
      await audit(q, actor.id, 'upload.create', 'record', r.id, { mime, bytes: bytes.length, authorizedByContributor: true });
      return r.id;
    });
  } catch (e) {
    back('/workspace/catalog', { error: friendly(e) });
  }
  redirect(`/workspace/catalog/${id}`);
}

export async function rebuildPackAction() {
  let msg = '';
  try {
    const actor = await requireActor('admin');
    const db = await getDb();
    const m = await db.tx((q) => buildMuseumPack(q));
    await audit(db, actor.id, 'pack.build', 'offline_pack', m.slug, { version: m.packVersion });
    msg = `Pack built: version ${m.packVersion}, ${m.items.length} items, ${m.excluded.length} excluded.`;
  } catch (e) {
    back('/workspace/ingest', { error: friendly(e) });
  }
  back('/workspace/ingest', { ok: msg });
}
