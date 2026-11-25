import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const engineDir = path.join(root, 'pdf-master', 'engine');
const distDir = path.join(root, 'pdf-master', 'dist');
const workDir = path.join(root, 'pdf-master', 'build');
const exeName = process.platform === 'win32' ? 'pdf-master-engine.exe' : 'pdf-master-engine';

const options = process.platform === 'win32'
  ? [['py', ['-3']], ['python', []]]
  : [['python3', []], ['python', []]];

function findPython() {
  for (const [cmd, pre] of options) {
    const res = spawnSync(cmd, [...pre, '--version'], { encoding: 'utf8' });
    if (res.status === 0) return { cmd, pre };
  }
  return null;
}

function run(cmd, args) {
  console.log('> ' + cmd + ' ' + args.join(' '));
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: root });
  if (res.status !== 0) {
    console.error('Command failed with code ' + res.status);
    process.exit(res.status || 1);
  }
}

const python = findPython();
if (!python) {
  console.error('Python 3 was not found. Install Python 3.9 or newer to build the PDF engine.');
  process.exit(1);
}

const requirements = path.join(engineDir, 'requirements.txt');
run(python.cmd, [...python.pre, '-m', 'pip', 'install', '-r', requirements, 'pyinstaller']);

fs.rmSync(path.join(distDir, 'pdf-master-engine'), { recursive: true, force: true });

run(python.cmd, [
  ...python.pre,
  '-m', 'PyInstaller',
  '--noconfirm',
  '--clean',
  '--onedir',
  '--name', 'pdf-master-engine',
  '--distpath', distDir,
  '--workpath', workDir,
  '--specpath', workDir,
  '--paths', engineDir,
  '--hidden-import', 'pdf_writer',
  '--hidden-import', 'journal',
  '--hidden-import', 'converter',
  '--hidden-import', 'inspector',
  '--hidden-import', 'errors',
  '--collect-all', 'pypdfium2',
  '--collect-all', 'pypdfium2_raw',
  '--collect-data', 'docx',
  '--collect-data', 'reportlab',
  path.join(engineDir, 'main.py'),
]);

const built = path.join(distDir, 'pdf-master-engine', exeName);
if (!fs.existsSync(built)) {
  console.error('Build finished but ' + built + ' was not found.');
  process.exit(1);
}
console.log('PDF engine built: ' + built);