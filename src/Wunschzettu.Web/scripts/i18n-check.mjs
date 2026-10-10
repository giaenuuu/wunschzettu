// Fails if public/i18n/en.json misses or has stale keys compared to the extracted German source texts.
// Run `npm run i18n:extract` first.
import { readFileSync } from 'node:fs';

const source = Object.keys(JSON.parse(readFileSync('src/locale/messages.json', 'utf8')).translations);
const en = Object.keys(JSON.parse(readFileSync('public/i18n/en.json', 'utf8')).translations);
const missing = source.filter((k) => !en.includes(k));
const stale = en.filter((k) => !source.includes(k));
if (missing.length) console.error('Missing in en.json:', missing);
if (stale.length) console.error('Stale in en.json:', stale);
process.exit(missing.length || stale.length ? 1 : 0);
