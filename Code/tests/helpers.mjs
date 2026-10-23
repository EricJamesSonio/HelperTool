import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gs-test-'));
}
export function rmRf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}
export function exists(p) { return fs.existsSync(p); }
export function read(p) { return fs.readFileSync(p, 'utf-8'); }

let _parsers = null;

// Write via a temp file + rename so a parallel test process never imports a
// half-written module.
function writeAtomic(dest, content) {
  const tmp = `${dest}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, dest);
}

export async function loadParsers() {
  if (_parsers) return _parsers;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Per-process names so parallel test files never clobber each other.
  const stamp = process.pid;
  const src1 = path.join(__dirname, '../renderer/fileSeederTool/parser.js');
  const dest1 = path.join(__dirname, `./fileSeederParser.${stamp}.mjs`);
  const src3 = path.join(__dirname, '../renderer/globalSeeder/blockFormat.js');
  const dest3 = path.join(__dirname, `./blockFormat.${stamp}.mjs`);
  const src2 = path.join(__dirname, '../renderer/globalSeeder/parser.js');
  const dest2 = path.join(__dirname, `./globalSeederParser.${stamp}.mjs`);
  // Always regenerate — the committed copies used to drift from the source.
  writeAtomic(dest1, fs.readFileSync(src1, 'utf-8'));
  writeAtomic(dest3, fs.readFileSync(src3, 'utf-8'));
  let parserCode = fs.readFileSync(src2, 'utf-8');
  parserCode = parserCode.replace(
    `export { parseInput } from '../fileSeederTool/parser.js';`,
    `import { parseInput } from './fileSeederParser.${stamp}.mjs';\nexport { parseInput };`
  );
  parserCode = parserCode.replace(
    `from './blockFormat.js'`,
    `from './blockFormat.${stamp}.mjs'`
  );
  writeAtomic(dest2, parserCode);
  // Remove the generated copies when this process exits
  const cleanup = () => {
    for (const f of [dest1, dest3, dest2]) {
      try { fs.unlinkSync(f); } catch (_) {}
    }
  };
  process.on('exit', cleanup);
  // bust cache for fresh import
  const mod = await import(`./globalSeederParser.${stamp}.mjs?cache=${Date.now()}`);
  _parsers = {
    parseInput: mod.parseInput,
    parseContentBlocks: mod.parseContentBlocks,
    hasExplicitBlocks: mod.hasExplicitBlocks,
  };
  return _parsers;
}

let _selectResolve = null;
// Copy any self-contained renderer ESM module to .mjs so node can import it
// from a commonjs package.
export async function loadModuleCopy(relPath) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const stamp = `${process.pid}.${Math.random().toString(36).slice(2, 7)}`;
  const src = path.join(__dirname, '..', relPath);
  const base = path.basename(relPath, '.js');
  const dest = path.join(__dirname, `./${base}.${stamp}.mjs`);
  writeAtomic(dest, fs.readFileSync(src, 'utf-8'));
  process.on('exit', () => { try { fs.unlinkSync(dest); } catch (_) {} });
  return import(`./${base}.${stamp}.mjs?cache=${Date.now()}`);
}

export async function loadSelectResolve() {
  if (_selectResolve) return _selectResolve;
  _selectResolve = await loadModuleCopy('renderer/selectShortcuts/resolve.js');
  return _selectResolve;
}
