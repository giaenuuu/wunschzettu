// Browser check of the newer features: invitation links, custom emoji, cropping, languages.
// Same setup as smoke.mjs (BASE_URL, WZ_DB, SCREENSHOTS).
import { mkdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';

const base = process.env.BASE_URL ?? 'http://localhost:4200';
const dbPath = process.env.WZ_DB ?? '../Wunschzettu.Api/.data/wunschzettu.db';
const screenshots = process.env.SCREENSHOTS;
const run = Date.now().toString(36);
const email = (name) => `${name}.${run}@example.com`;
const errors = [];
const assert = (condition, message) => {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
};

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

const browser = await chromium.launch();
if (screenshots) mkdirSync(screenshots, { recursive: true });
async function page(name, options = {}) {
  const context = await browser.newContext({ viewport: { width: 412, height: 900 }, locale: 'de-CH', ...options });
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !/status of 4\d\d/.test(m.text()) && errors.push(`${name}: ${m.text()}`));
  return p;
}
const shot = async (p, name) => {
  if (!screenshots) return;
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.screenshot({ path: `${screenshots}/${name}.png`, fullPage: true });
};
const step = (text) => console.log(`✓ ${text}`);

async function signIn(p, who) {
  await p.goto(`${base}/login`);
  await p.getByLabel('E-Mail').fill(email(who));
  await p.getByRole('button', { name: 'Code senden' }).click();
  await p.getByLabel('Code').fill(codeIn(await mailTo(email(who))));
  await p.getByText('Meine Wunschlisten').waitFor();
}

try {
  const owner = await page('owner');
  await signIn(owner, 'owner');
  await owner.getByRole('button', { name: 'Neue Liste' }).first().click();
  await owner.getByLabel('Titel').fill('Lenas Fest');
  // Custom emoji: type one into the "+" field.
  await owner.getByLabel('Eigenes Emoji').fill('🦄x');
  assert((await owner.getByLabel('Eigenes Emoji').inputValue()) === '🦄', 'only the emoji is kept');
  await shot(owner, 'f1-create-emoji');
  await owner.getByRole('switch', { name: 'Die Liste ist für mich' }).click();
  await owner.getByLabel('Für wen?').fill('Lena');
  await owner.getByRole('button', { name: 'Erstellen' }).click();
  await owner.waitForURL(/\/lists\/.+\/edit/);
  const listId = owner.url().split('/')[4];
  const detail = await owner.evaluate((id) => fetch(`/api/wishlists/${id}`).then((r) => r.json()), listId);
  assert(detail.theme.emoji === '🦄', `custom emoji saved (${detail.theme.emoji})`);
  step('custom emoji');

  // A wish with an uploaded picture, then cropped.
  await owner.setContent('<p style="margin:0;width:800px;height:600px;background:linear-gradient(90deg,#d32f2f 50%,#1976d2 50%)"></p>');
  const imagePath = `${screenshots ?? '/tmp'}/wz-e2e-crop.png`;
  writeFileSync(imagePath, await owner.locator('p').screenshot());
  await owner.goto(`${base}/lists/${listId}/edit`);
  await owner.getByRole('button', { name: 'Wunsch hinzufügen' }).first().click();
  const dialog = owner.getByRole('dialog');
  await dialog.getByRole('button', { name: /Selbst ausfüllen/ }).click();
  await dialog.getByLabel('Was wünschst du dir?').fill('Fahne');
  await dialog.locator('input[type=file]').setInputFiles(imagePath);
  // Crop the pending picture (before saving): square, zoomed in.
  await dialog.getByRole('button', { name: 'Bild zuschneiden' }).first().click();
  const cropper = owner.getByRole('dialog', { name: 'Bild zuschneiden' });
  await cropper.getByRole('radio', { name: 'Quadrat' }).click();
  await cropper.locator('input[type=range]').fill('2');
  await shot(owner, 'f2-cropper');
  await cropper.getByRole('button', { name: 'Übernehmen' }).click();
  await cropper.waitFor({ state: 'detached' });
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await dialog.waitFor({ state: 'detached' });
  await owner.getByRole('heading', { name: 'Fahne' }).waitFor();
  const saved = await owner.evaluate((id) => fetch(`/api/wishlists/${id}`).then((r) => r.json()), listId);
  const img = saved.wishes[0].images[0];
  const size = await owner.evaluate(
    (url) => new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.src = url; }),
    img.url,
  );
  assert(size[0] === size[1], `cropped picture is square (${size})`);
  step('crop a new picture');

  // Crop a saved picture: wish dialog, crop button on the stored image.
  await owner.getByRole('button', { name: 'Bearbeiten' }).first().click();
  const edit = owner.getByRole('dialog');
  await edit.getByRole('button', { name: 'Bild zuschneiden' }).first().click();
  const cropper2 = owner.getByRole('dialog', { name: 'Bild zuschneiden' });
  await cropper2.getByRole('radio', { name: 'Querformat' }).click();
  await cropper2.getByRole('button', { name: 'Übernehmen' }).click();
  await cropper2.waitFor({ state: 'detached' });
  await edit.getByRole('button', { name: 'Speichern' }).click();
  await edit.waitFor({ state: 'detached' });
  const saved2 = await owner.evaluate((id) => fetch(`/api/wishlists/${id}`).then((r) => r.json()), listId);
  const img2 = saved2.wishes[0].images[0];
  assert(img2.id === img.id && img2.url !== img.url, 'same picture, new file');
  const size2 = await owner.evaluate(
    (url) => new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.src = url; }),
    img2.url,
  );
  assert(Math.abs(size2[0] / size2[1] - 4 / 3) < 0.02, `cropped to 4:3 (${size2})`);
  step('crop a saved picture');

  // Link preview choice: the switch is there and the choice sticks (no logo to fetch offline).
  await owner.getByRole('button', { name: 'Bearbeiten' }).first().click();
  const linkDialog = owner.getByRole('dialog');
  await linkDialog.getByRole('button', { name: 'Online-Shop' }).click();
  await linkDialog.getByLabel('Link', { exact: true }).fill('https://shop.invalid/fahne');
  await linkDialog.getByRole('radio', { name: 'Shop-Logo' }).click();
  await shot(owner, 'f3-link-picture');
  await linkDialog.getByRole('button', { name: 'Speichern' }).click();
  await linkDialog.waitFor({ state: 'detached' });
  const saved3 = await owner.evaluate((id) => fetch(`/api/wishlists/${id}`).then((r) => r.json()), listId);
  assert(saved3.wishes[0].links[0].useLogo === true, 'logo choice saved');
  step('link: logo or product picture');

  // Invitation link: create, open as a stranger, sign in, accept.
  await owner.getByText('Personen', { exact: true }).click();
  await owner.getByRole('button', { name: 'Einladungslink erstellen' }).click();
  const link = await owner.getByLabel('Einladungslink').inputValue();
  assert(link.includes('/invite/'), `invitation link (${link})`);
  await shot(owner, 'f4-members-link');
  const papa = await page('papa');
  await papa.goto(link.replace(/^https?:\/\/[^/]+/, base));
  await papa.getByRole('heading', { name: /lädt dich ein|hat eine Liste für dich/ }).waitFor();
  await papa.getByText('Sehen, wer was schenkt').waitFor();
  await shot(papa, 'f5-invite-page');
  await papa.getByRole('link', { name: 'Anmelden und annehmen' }).click();
  await papa.getByLabel('E-Mail').fill(email('papa'));
  await papa.getByRole('button', { name: 'Code senden' }).click();
  await papa.getByLabel('Code').fill(codeIn(await mailTo(email('papa'))));
  await papa.getByRole('button', { name: 'Einladung annehmen' }).click();
  await papa.waitForURL(/\/lists\/.+\/edit/);
  const papaDetail = await papa.evaluate((id) => fetch(`/api/wishlists/${id}`).then((r) => r.json()), listId);
  assert(papaDetail.isManager, 'the invited person manages the list');
  await papa.goto(link.replace(/^https?:\/\/[^/]+/, base));
  await papa.getByRole('heading', { name: 'Diese Einladung gilt nicht mehr' }).waitFor();
  step('invitation link: explained, signed in, accepted once');

  // Languages: flags in the menu, French UI, date format, pt-PT vocabulary, de-DE spelling.
  const fr = await page('fr', { locale: 'fr-CH' });
  await fr.goto(base);
  await fr.getByRole('link', { name: 'Créer une liste de souhaits' }).first().waitFor();
  await fr.getByRole('button', { name: /Langue et affichage/ }).click();
  await fr.getByRole('menuitem', { name: 'Langue' }).focus();
  await fr.keyboard.press('ArrowRight');
  await fr.getByRole('menuitemradio').first().waitFor();
  await shot(fr, 'f6-language-menu');
  assert((await fr.locator('app-flag').count()) >= 8, `a flag for every language (${await fr.locator('app-flag').count()})`);
  await shot(fr, 'f6-language-menu');
  await fr.keyboard.press('Escape');
  await shot(fr, 'f7-landing-fr');
  for (const [lang, text] of [['es', 'Crear una lista de deseos'], ['pt-BR', 'Criar lista de desejos'], ['pt-PT', 'Partilhe desejos.'], ['de-DE', 'Wünsche teilen.'], ['en', 'Create a wishlist']]) {
    await fr.evaluate((l) => localStorage.setItem('wz.lang', l), lang);
    await fr.goto(base);
    await fr.getByText(text).first().waitFor();
    assert((await fr.evaluate(() => document.documentElement.lang)) === lang, `html lang ${lang}`);
    await shot(fr, `f8-landing-${lang}`);
  }
  step('languages');
  assert(errors.length === 0, `no browser errors:\n${errors.join('\n')}`);
  console.log('\nAll good.');
} catch (e) {
  console.error(e);
  console.error(errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
