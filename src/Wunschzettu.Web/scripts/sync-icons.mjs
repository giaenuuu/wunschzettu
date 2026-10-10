// Copies the Material Symbols the app uses into public/icons, so no icon font (4 MB) and no CDN is needed.
// An icon is "used" when it appears as <ui-icon name="x">, as a quoted 'x' inside a <ui-icon [name]="…"> binding,
// or as icon: 'x' in TypeScript (for lists rendered with [name]="item.icon").
// Runs before `start` and `build`; just write <ui-icon name="some_icon" /> in a template.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const source = 'node_modules/@material-symbols/svg-400/rounded';
const target = 'public/icons';

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (path.endsWith('.ts') || path.endsWith('.html')) yield path;
  }
}

const used = new Set();
for (const file of files('src')) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/<ui-icon\b[^>]*?\sname="([\w-]+)"/g)) used.add(m[1]);
  for (const m of text.matchAll(/\bicon:\s*'([\w-]+)'/g)) used.add(m[1]);
  for (const m of text.matchAll(/<ui-icon\b[^>]*?\[name\]="([^"]+)"/g))
    for (const q of m[1].matchAll(/'([\w-]+)'/g)) used.add(q[1]);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
const missing = [];
for (const name of [...used].sort()) {
  const file = join(source, `${name}.svg`);
  if (existsSync(file)) copyFileSync(file, join(target, `${name}.svg`));
  else missing.push(name);
}
console.log(`icons: ${used.size - missing.length} copied`);
if (missing.length) {
  console.error(`icons: unknown names ${missing.join(', ')} (see https://fonts.google.com/icons, use "-fill" for filled)`);
  process.exit(1);
}
