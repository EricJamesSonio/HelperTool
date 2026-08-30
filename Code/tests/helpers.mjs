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
export async function loadParsers() {
  if (_parsers) return _parsers;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const src1 = path.join(__dirname, '../renderer/fileSeederTool/parser.js');
  const dest1 = path.join(__dirname, './fileSeederParser.mjs');
  const src2 = path.join(__dirname, '../renderer/globalSeeder/parser.js');
  const dest2 = path.join(__dirname, './globalSeederParser.mjs');
  if (!fs.existsSync(dest1)) fs.copyFileSync(src1, dest1);
  let parserCode = fs.readFileSync(src2, 'utf-8');
  parserCode = parserCode.replace(
    `export { parseInput } from '../fileSeederTool/parser.js';`,
    `import { parseInput } from './fileSeederParser.mjs';\nexport { parseInput };`
  );
  fs.writeFileSync(dest2, parserCode, 'utf-8');
  // bust cache for fresh import
  const mod = await import(`./globalSeederParser.mjs?cache=${Date.now()}`);
  _parsers = { parseInput: mod.parseInput, parseContentBlocks: mod.parseContentBlocks };
  return _parsers;
}
