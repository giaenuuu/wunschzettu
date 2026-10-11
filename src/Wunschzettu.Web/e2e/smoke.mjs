// End-to-end smoke test of the main flows, in a real browser against the running dev servers.
//
//   1. Start the API and the UI (VS Code task "dev").
//   2. Once per machine: npx playwright install --with-deps chromium-headless-shell
//   3. npm run e2e                      (SCREENSHOTS=some/dir npm run e2e to keep screenshots)
//
// Login codes and mail links are read from the outbox table of the dev database, so no SMTP is needed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';

const base = process.env.BASE_URL ?? 'http://localhost:4200';
const dbPath = process.env.WZ_DB ?? '../Wunschzettu.Api/.data/wunschzettu.db';
const screenshots = process.env.SCREENSHOTS;
const run = Date.now().toString(36);
const email = (name) => `${name}.${run}@example.com`;
const errors = [];

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function mailTo(to, test = () => true) {
  for (let i = 0; i < 50; i++) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const row = db.prepare('select TextBody from Outbox where ToEmail = ? order by CreatedAt desc, Id desc limit 1').get(to);
    db.close();
    if (row && test(row.TextBody)) return row.TextBody;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`No mail to ${to}`);
}
const codeIn = (text) => text.match(/^\d{6}$/m)[0];
const linkTokenIn = (text) => text.match(/token=([^&\s]+)/)[1];

const browser = await chromium.launch();
if (screenshots) mkdirSync(screenshots, { recursive: true });

const pages = {};
async function page(name, options = {}) {
  const context = await browser.newContext({ viewport: { width: 412, height: 900 }, locale: 'de-CH', ...options });
  const p = await context.newPage();
  pages[name] = p;
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !/status of 4\d\d/.test(m.text()) && errors.push(`${name}: ${m.text()}`));
  return p;
}
async function shot(p, name) {
  if (!screenshots) return;
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.screenshot({ path: `${screenshots}/${name}.png`, fullPage: true });
}
const step = (text) => console.log(`✓ ${text}`);

try {
  // A manager signs in with an email code and creates a list for someone else.
  const owner = await page('owner');
  await owner.goto(base);
  await shot(owner, '01-landing');
  await owner.getByRole('link', { name: 'Wunschliste erstellen' }).first().click();
  await owner.getByLabel('E-Mail').fill(email('owner'));
  await owner.getByRole('button', { name: 'Code senden' }).click();
  await owner.getByLabel('Code').fill(codeIn(await mailTo(email('owner'))));
  await owner.getByRole('button', { name: 'Neue Liste' }).first().waitFor();
  step('sign in with email code');

  await owner.getByRole('button', { name: 'Neue Liste' }).first().click();
  await owner.getByLabel('Titel').fill('Lenas Geburtstag');
  await owner.getByRole('switch', { name: 'Die Liste ist für mich' }).click();
  await owner.getByLabel('Für wen?').fill('Lena');
  await owner.getByRole('button', { name: 'Erstellen' }).click();
  await owner.waitForURL(/\/lists\/.+\/edit/);
  const listId = owner.url().split('/')[4];
  step('create a list');

  // An image to upload: a screenshot of a coloured box.
  await owner.setContent('<p style="margin:0;width:640px;height:480px;background:linear-gradient(135deg,#f9a825,#e91e63)"></p>');
  const imagePath = `${screenshots ?? '/tmp'}/wz-e2e-image.png`;
  writeFileSync(imagePath, await owner.locator('p').screenshot());
  await owner.goto(`${base}/lists/${listId}/edit`);

  const addWish = async (name, extra) => {
    await owner.getByRole('button', { name: /Wunsch hinzufügen|Ersten Wunsch/ }).first().click();
    const dialog = owner.getByRole('dialog');
    await dialog.getByRole('button', { name: /Selbst ausfüllen/ }).click();
    await dialog.getByLabel('Was wünschst du dir?').fill(name);
    if (extra) await extra(dialog);
    await dialog.getByRole('button', { name: 'Speichern' }).click();
    await dialog.waitFor({ state: 'detached' });
    await owner.getByRole('heading', { name }).waitFor();
  };
  await addWish('Laufrad', async (d) => {
    await d.getByLabel('Preis ca. (optional)').fill('129');
    await d.locator('input[type=file]').setInputFiles(imagePath);
  });
  await addWish('Kindervelo', async (d) => {
    await d.getByLabel('Preis ca. (optional)').fill('300');
    await d.getByRole('switch', { name: 'Gemeinsam schenken erlaubt' }).click();
    await d.getByRole('button', { name: 'Laden' }).click();
    await d.getByLabel('Laden', { exact: true }).fill('Velo Bern');
  });
  const detail = await owner.evaluate((id) => fetch(`/api/wishlists/${id}`).then((r) => r.json()), listId);
  assert(detail.wishes[0].images.length === 1, 'image uploaded');
  const token = detail.shareToken;
  await shot(owner, '02-editor');
  step('add wishes with image');

  // A guest opens the link without an account, reserves one wish and starts a group gift.
  const anna = await page('anna');
  await anna.goto(`${base}/l/${token}`);
  // Signed out, nobody sees what's taken before saying they want to give something.
  await anna.getByRole('heading', { name: 'Möchtest du etwas schenken?' }).waitFor();
  assert((await anna.locator('app-gift-status').count()) === 0, 'no gift state before choosing to give');
  await shot(anna, '03a-guest-gate');
  await anna.getByRole('button', { name: 'Ich möchte etwas schenken' }).click();
  const laufrad = anna.locator('app-wish-card', { hasText: 'Laufrad' });
  await laufrad.getByRole('button', { name: 'Ich schenke das' }).click();
  await anna.getByLabel('Dein Name').fill('Anna');
  await anna.getByLabel('Deine E-Mail').fill(email('anna'));
  await anna.getByRole('button', { name: 'Reservieren' }).click();
  await laufrad.getByText('Du schenkst das').waitFor();
  const velo = anna.locator('app-wish-card', { hasText: 'Kindervelo' });
  await velo.getByRole('button', { name: 'Gemeinsam schenken' }).click();
  await anna.getByLabel('Dein Beitrag (optional)').fill('100');
  await anna.getByRole('button', { name: 'Starten' }).click();
  await velo.getByText('Ihr schenkt das gemeinsam').waitFor();
  await shot(anna, '03-guest');
  step('guest reserves and starts a group gift');

  // A second guest (English, dark) sees it taken and joins the group.
  const ben = await page('ben', { locale: 'en-US', colorScheme: 'dark' });
  await ben.goto(`${base}/l/${token}`);
  await ben.getByRole('button', { name: "I'd like to give something" }).click();
  await ben.locator('app-wish-card', { hasText: 'Laufrad' }).getByText('Already taken').waitFor();
  await ben.locator('app-wish-card', { hasText: 'Kindervelo' }).getByRole('button', { name: 'Join' }).click();
  await ben.getByLabel('Your name').fill('Ben');
  await ben.getByLabel('Your email').fill(email('ben'));
  await ben.getByRole('dialog').getByRole('button', { name: 'Join' }).click();
  await ben.locator('app-wish-card', { hasText: 'Kindervelo' }).getByText('pledged').waitFor();
  await shot(ben, '04-guest-en-dark');
  step('second guest sees taken and joins');

  // Ben confirms through the link in his mail and finds his gifts on the dashboard.
  await ben.goto(`${base}/confirm?token=${linkTokenIn(await mailTo(email('ben'), (t) => t.includes('token=')))}&returnUrl=/`);
  await ben.getByText("What I'm giving").waitFor();
  step('confirm by mail link');

  // The manager (not the recipient) sees who gives what.
  await owner.goto(`${base}/lists/${listId}/edit`);
  await owner.locator('app-gift-summary', { hasText: 'Anna' }).first().waitFor();
  step('manager sees gifts');

  // Lena is invited as recipient: she must never see any gift state.
  await owner.getByText('Personen', { exact: true }).click();
  await owner.getByLabel('E-Mail-Adresse').fill(email('lena'));
  await owner.getByRole('radio', { name: 'Beschenkt' }).click();
  await owner.getByRole('button', { name: 'Einladen', exact: true }).click();
  await owner.getByText('Einladung verschickt').waitFor();
  const lena = await page('lena');
  await lena.goto(`${base}/confirm?token=${linkTokenIn(await mailTo(email('lena')))}&returnUrl=/l/${token}`);
  await lena.getByText('Das ist deine Liste').waitFor();
  await lena.getByRole('heading', { name: 'Kindervelo' }).waitFor();
  assert((await lena.locator('app-gift-status').count()) === 0, 'recipient sees no gift status');
  assert(!(await lena.content()).includes('Anna'), 'recipient sees no giver names');
  await shot(lena, '05-recipient');
  step('recipient sees no gift state');

  // Signed out on the same device, her list asks her to sign in instead of showing what's taken.
  await lena.context().clearCookies();
  await lena.goto(`${base}/l/${token}`);
  await lena.getByRole('heading', { name: 'Das ist deine Wunschliste' }).waitFor();
  await lena.getByRole('heading', { name: 'Kindervelo' }).waitFor();
  assert((await lena.locator('app-gift-status').count()) === 0, 'signed-out recipient sees no gift status');
  await shot(lena, '05a-recipient-signed-out');
  step('signed-out recipient is asked to sign in');

  // Legal pages and unknown addresses.
  await lena.goto(`${base}/datenschutz`);
  await lena.getByRole('heading', { name: 'Datenschutzerklärung' }).waitFor();
  await lena.goto(`${base}/gibt-es-nicht`);
  await lena.getByText('Diese Seite gibt es nicht').waitFor();
  step('legal pages and 404');

  // The manager sets a password and signs in with it instead of a code.
  await owner.goto(`${base}/profile`);
  await owner.getByRole('textbox', { name: 'Passwort', exact: true }).fill('ein ganzer Satz als Passwort');
  await owner.getByLabel('Passwort wiederholen').fill('ein ganzer Satz als Passwort');
  await owner.getByRole('button', { name: 'Passwort setzen' }).click();
  await owner.getByText('Passwort gesetzt').waitFor();
  await owner.getByRole('button', { name: 'Konto und Einstellungen' }).click();
  await owner.getByRole('menuitem', { name: 'Abmelden' }).click();
  await owner.goto(`${base}/login`);
  await owner.getByRole('radio', { name: 'Passwort' }).click();
  await owner.getByLabel('E-Mail').fill(email('owner'));
  await owner.getByRole('textbox', { name: 'Passwort', exact: true }).fill('ein ganzer Satz als Passwort');
  await owner.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await owner.getByText('Meine Wunschlisten').waitFor();
  await shot(owner, '06-overview');
  step('password login');

  assert(errors.length === 0, `no browser errors:\n${errors.join('\n')}`);
  console.log('\nAll good.');
} catch (e) {
  // Show where each browser was when it failed.
  if (screenshots) for (const [name, p] of Object.entries(pages)) await p.screenshot({ path: `${screenshots}/failed-${name}.png` }).catch(() => {});
  throw e;
} finally {
  await browser.close();
}
