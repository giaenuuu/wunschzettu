// Checks public/i18n/*.json against the extracted German source texts (run `npm run i18n:extract` first).
// - en, fr, es, pt-BR are complete translations: every source key must exist, no stale ones.
// - de-DE, de-AT and pt-PT only override a base language: they may leave keys out, but must not hold stale ones.
import { readFileSync } from 'node:fs';

const source = Object.keys(JSON.parse(readFileSync('src/locale/messages.json', 'utf8')).translations);
const complete = ['en', 'fr', 'es', 'pt-BR'];
const overrides = ['de-DE', 'de-AT', 'pt-PT'];
let failed = false;

for (const name of [...complete, ...overrides]) {
  const keys = Object.keys(JSON.parse(readFileSync(`public/i18n/${name}.json`, 'utf8')).translations);
  const missing = complete.includes(name) ? source.filter((k) => !keys.includes(k)) : [];
  const stale = keys.filter((k) => !source.includes(k));
  if (missing.length) console.error(`Missing in ${name}.json:`, missing);
  if (stale.length) console.error(`Stale in ${name}.json:`, stale);
  failed ||= missing.length > 0 || stale.length > 0;
}
process.exit(failed ? 1 : 0);
