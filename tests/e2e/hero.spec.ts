// Browser E2E of the hero sequence on a real server + fresh database built from
// the real snapshot: F2 compute → F1/F4 studio with rights → F7 bilingual drafts
// → F10 review/publish/receipt/QR/ZIP → F3 withdrawal → F9 offline pack.
import { test, expect, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

const PW = 'correct horse battery staple';
const invites = () => JSON.parse(readFileSync('.data/e2e-invites.json', 'utf8')) as Record<'admin' | 'author' | 'reviewer', string>;
const state: { en?: string; hi?: string; title?: string; slug?: string; pubId?: string } = {};

async function as(browser: Browser, email: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/workspace/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  return page;
}

test.describe.serial('hero sequence', () => {
  test('invitations create accounts (invite-only access)', async ({ page }) => {
    const inv = invites();
    for (const [role, name] of [['admin', 'E2E Admin'], ['author', 'E2E Author'], ['reviewer', 'E2E Reviewer']] as const) {
      await page.goto(`/workspace/invite/${inv[role]}`);
      await page.getByLabel(/Display name/).fill(name);
      await page.getByLabel(/Password/).fill(PW);
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page).toHaveURL(/\/workspace\/login/);
    }
    await page.goto(`/workspace/invite/${inv.admin}`);
    await expect(page.getByText(/invalid, expired or already used/)).toBeVisible();
  });

  test('anonymous visitors cannot reach the workspace or drafts', async ({ page, request }) => {
    await page.goto('/workspace/studio');
    await expect(page).toHaveURL(/\/workspace\/login/);
    const r = await request.get('/api/exports/00000000-0000-4000-8000-000000000000');
    expect(r.status()).toBe(404);
  });

  test('author builds bilingual drafts from a calculation, evidence and a permitted photo', async ({ browser }) => {
    const page = await as(browser, 'e2e-author@example.org');
    await page.goto('/workspace/studio');
    const preset = page.getByLabel('Preset calculation');
    const value = await preset.locator('option', { hasText: 'N-monthly-extent, September' }).first().getAttribute('value');
    await preset.selectOption(value!);
    await page.getByRole('button', { name: /Compute & save/ }).click();
    await expect(page).toHaveURL(/calc=/);
    await page.getByLabel('Search evidence').fill('Arctic sea ice decline September minimum');
    await page.getByRole('button', { name: 'Search evidence' }).click();
    await page.locator('li:has-text("quote allowed") input[name="span"]').first().check();
    await page.locator('li:has-text("Maitri"):not(:has-text("not republishable")):not(:has-text("Minister")) input[name="media"]').first().check();
    await page.getByLabel('Output').selectOption('article');
    await page.getByLabel('Audience').selectOption('school');
    await page.getByRole('button', { name: 'Generate traceable drafts' }).click();
    await expect(page).toHaveURL(/\/workspace\/drafts\//);
    state.en = page.url().split('/').pop()!.split('?')[0];
    await expect(page.getByText('machine checks pass')).toBeVisible();
    await expect(page.getByText(/Fact-difference panel/)).toBeVisible();
    await expect(page.locator('td >> text=preserved').first()).toBeVisible();
    await expect(page.locator('td >> text=changed')).toHaveCount(0);
    state.title = (await page.locator('h1').innerText()).trim();
    await page.getByRole('button', { name: 'Submit for review' }).click();
    await expect(page.getByText('Submitted for review.')).toBeVisible();
    await page.getByRole('link', { name: /Open the Hindi variant/ }).click();
    await page.waitForURL((u) => !u.pathname.endsWith(state.en!));
    state.hi = page.url().split('/').pop()!.split('?')[0];
    expect(state.hi).not.toBe(state.en);
    await expect(page.getByText('language: machine unreviewed')).toBeVisible();
    await page.getByRole('button', { name: 'Submit for review' }).click();
    await expect(page.getByText('Submitted for review.')).toBeVisible();
  });

  test('rights: a people-identifiable photo is refused with permitted alternatives', async ({ browser }) => {
    const page = await as(browser, 'e2e-author@example.org');
    await page.goto('/workspace/studio');
    await page.locator('li:has-text("Minister") input[name="media"]').first().check();
    await page.locator('input[name="calc"]').first().check();
    await page.getByRole('button', { name: 'Generate traceable drafts' }).click();
    await expect(page.getByText('Can we publish this?')).toBeVisible();
    await expect(page.getByText(/identifiable people/).first()).toBeVisible();
    await expect(page.getByText(/Same place \(Maitri/).first()).toBeVisible();
  });

  test('an edited number fails the machine checks', async ({ browser }) => {
    const page = await as(browser, 'e2e-author@example.org');
    await page.goto('/workspace/studio');
    await page.locator('input[name="calc"]').first().check();
    await page.getByLabel('Output').selectOption('caption');
    await page.getByRole('button', { name: 'Generate traceable drafts' }).click();
    await expect(page.getByText('machine checks pass')).toBeVisible();
    const box = page.locator('textarea[name="block-0"]');
    const text = await box.inputValue();
    await box.fill(text.replace(/(\d+)\.(\d\d)/, (_m, a, b) => `${a}.${String((Number(b) + 7) % 100).padStart(2, '0')}`));
    await page.getByRole('button', { name: 'Save as new version' }).click();
    await expect(page.getByText('machine checks fail')).toBeVisible();
    await expect(page.getByText(/not supported by any cited claim/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit for review' })).toBeDisabled();
  });

  test('reviewer approves both languages and publishes', async ({ browser }) => {
    const page = await as(browser, 'e2e-reviewer@example.org');
    await page.goto(`/workspace/drafts/${state.en}`);
    await page.getByLabel('Review notes').fill('Checked numbers against the calculation recipe.');
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Review recorded.')).toBeVisible();
    await page.getByRole('button', { name: 'Publish to website' }).click();
    await expect(page.getByText('Published to the website.')).toBeVisible();
    const receipt = page.getByRole('link', { name: 'evidence receipt' });
    state.pubId = (await receipt.getAttribute('href'))!.split('/').pop();
    state.slug = (await page.getByRole('link', { name: /^\/stories\// }).innerText()).replace('/stories/', '');
    await page.goto(`/workspace/drafts/${state.hi}`);
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Review recorded.')).toBeVisible();
    await expect(page.getByText(/Hindi language review: pending/)).toBeVisible();
    await page.getByLabel('Review type').selectOption('language');
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.getByRole('button', { name: 'Publish to website' }).click();
    await expect(page.getByText('Published to the website.')).toBeVisible();
  });

  test('public story, evidence receipt with a decodable QR, and a real outreach ZIP', async ({ page, request }) => {
    await page.goto('/stories');
    await expect(page.getByRole('link', { name: state.title! })).toBeVisible();
    await page.goto(`/stories/${state.slug}`);
    await expect(page.getByText('Scientific review: team reviewer')).toBeVisible();
    await page.goto(`/evidence/${state.pubId}`);
    await expect(page.getByText('quote verified against stored text').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /calculation [0-9a-f]{8}/ }).first()).toBeVisible();
    const qr = page.getByRole('img', { name: /QR code linking to/ });
    const png = PNG.sync.read(await qr.screenshot());
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded?.data).toBe(`http://localhost:3100/evidence/${state.pubId}`);
    const zipRes = await request.get(`/api/exports/${state.en}`);
    expect(zipRes.status()).toBe(200);
    const zip = await JSZip.loadAsync(await zipRes.body());
    const names = Object.keys(zip.files);
    expect(names).toEqual(expect.arrayContaining(['slides/slide-01.png', 'caption-en.txt', 'alt-text.txt', 'attribution.txt', 'evidence-receipt-qr.png', 'article-en.html']));
    expect(names.some((n) => /^data\/calc-.*-rows\.csv$/.test(n))).toBe(true);
    const slide = await zip.file('slides/slide-01.png')!.async('nodebuffer');
    expect(slide.subarray(1, 4).toString()).toBe('PNG');
    const qrPng = PNG.sync.read(await zip.file('evidence-receipt-qr.png')!.async('nodebuffer'));
    expect(jsQR(new Uint8ClampedArray(qrPng.data), qrPng.width, qrPng.height)?.data).toBe(`http://localhost:3100/evidence/${state.pubId}`);
  });

  test('curator withdrawal propagates to the published story', async ({ browser, page }) => {
    const admin = await as(browser, 'e2e-admin@example.org');
    await admin.goto('/workspace/corrections?q=Northern');
    await admin.getByLabel('Source version').selectOption({ index: 0 });
    await admin.getByLabel('Reason').fill('E2E: curator withdrawal to demonstrate propagation');
    await admin.getByRole('button', { name: 'Withdraw and propagate' }).click();
    await expect(admin.getByText(/2 public notice\(s\)/)).toBeVisible();
    await page.goto(`/stories/${state.slug}`);
    await expect(page.getByText('Correction notice')).toBeVisible();
    await expect(page.getByText(/local editorial action/).first()).toBeVisible();
  });

  test('offline pack works without a connection and reports corrections on reconnect', async ({ browser }) => {
    const admin = await as(browser, 'e2e-admin@example.org');
    await admin.goto('/workspace/ingest');
    await admin.getByRole('button', { name: /Build \/ rebuild/ }).click();
    await expect(admin.getByText(/Pack built: version/)).toBeVisible();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/offline/india-in-antarctica');
    await expect(page.getByText('Not saved on this device.')).toBeVisible();
    await page.getByRole('button', { name: 'Save pack for offline use' }).click();
    await expect(page.getByText(/Saved on this device: pack version/)).toBeVisible({ timeout: 30_000 });
    const exhibit = await page.getByRole('link', { name: 'Open exhibit' }).getAttribute('href');
    await ctx.setOffline(true);
    await page.goto(exhibit!);
    await expect(page.getByText(/You are offline/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Pocket Polar Museum/ })).toBeVisible();

    // A curator withdraws one of the pack's sources while this device is offline.
    await admin.goto('/workspace/corrections?q=Dakshin');
    await admin.getByLabel('Source version').selectOption({ index: 0 });
    await admin.getByLabel('Reason').fill('E2E: withdraw a pack source while a device is offline');
    await admin.getByRole('button', { name: 'Withdraw and propagate' }).click();
    await expect(admin.getByText(/offline pack\(s\) marked stale/)).toBeVisible();

    await ctx.setOffline(false);
    await page.reload();
    await expect(page.getByText(/Correction: a source in this pack is now withdrawn/)).toBeVisible();
    // Cache removal works.
    await page.goto('/offline/india-in-antarctica');
    await page.getByRole('button', { name: 'Remove from this device' }).click();
    await expect(page.getByText('Not saved on this device.')).toBeVisible();
  });
});
