import fs from 'fs/promises';
import path from 'path';

const root = path.resolve(process.cwd(), 'tests');
const patterns = [
  {
    // async () => {  -> async (): Promise<void> => {
    re: /(^\s*(?:it|test|describe|beforeEach|afterEach|beforeAll|afterAll)\([^,)]*,\s*)async\s*\(\s*\)\s*=>\s*\{/gm,
    repl: '$1async (): Promise<void> => {'
  },
  {
    // () => { -> (): void => {
    re: /(^\s*(?:it|test|describe|beforeEach|afterEach|beforeAll|afterAll)\([^,)]*,\s*)\(\s*\)\s*=>\s*\{/gm,
    repl: '$1(): void => {'
  },
  {
    // function() { -> function(): void {
    re: /(^\s*(?:it|test|describe|beforeEach|afterEach|beforeAll|afterAll)\([^,)]*,\s*)function\s*\(\s*\)\s*\{/gm,
    repl: '$1function(): void {'
  }
];

async function* walk(dir) {
  for await (const d of await fs.opendir(dir)) {
    const entry = path.join(dir, d.name);
    if (d.isDirectory()) yield* walk(entry);
    else if (d.isFile() && entry.endsWith('.ts')) yield entry;
  }
}

(async () => {
  const changed = [];
  try {
    for await (const file of walk(root)) {
      let src = await fs.readFile(file, 'utf8');
      let out = src;
      for (const p of patterns) out = out.replace(p.re, p.repl);
      if (out !== src) {
        await fs.writeFile(file, out, 'utf8');
        changed.push(file.replace(process.cwd() + path.sep, ''));
      }
    }

    console.log(`Annotated ${changed.length} files`);
    if (changed.length) console.log(changed.join('\n'));
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
