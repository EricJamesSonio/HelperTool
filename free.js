import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --------------------
// ESM __dirname fix
// --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root (where this script lives)
const projectRoot = __dirname;

// --------------------
// Config
// --------------------
const IGNORE_FOLDERS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build'
]);

const CODE_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx',
  '.json', '.sql', '.env', '.md',
  '.yml', '.yaml',
  '.graphql',
  '.txt',
  '.prisma',
  '.py',
  '.java',
  '.go'
]);

// 🎯 TARGETS (ADD AS MANY AS YOU WANT)
const targets = [
  {
    path: './Code/config',
    output: 'configCode.txt'
  },
  {
    path: './Code/utils',
    output: 'UtilsCodes.txt'
  },
  {
    path: './Code/renderer',
    output: 'rendererCodes.txt'
  },
  {
    path: './Code',
    output: 'Allcodes.txt'
  }
];

// --------------------
// Recursive processor
// --------------------
function processFolder(folderPath, baseFolder) {
  let content = '';

  const items = fs.readdirSync(folderPath, { withFileTypes: true });

  for (const item of items) {
    if (IGNORE_FOLDERS.has(item.name)) continue;

    const fullPath = path.join(folderPath, item.name);

    if (item.isDirectory()) {
      content += processFolder(fullPath, baseFolder);
      continue;
    }

    const ext = path.extname(item.name);
    if (!CODE_EXTENSIONS.has(ext)) continue;

    const relativePath = path.relative(baseFolder, fullPath);
    const fileContent = fs.readFileSync(fullPath, 'utf-8');

    content += `------------------------------\n`;
    content += `FILE: ${relativePath}\n\n`;
    content += `${fileContent}\n\n`;
  }

  return content;
}

// --------------------
// Run
// --------------------
for (const target of targets) {
  const absoluteTargetPath = path.resolve(projectRoot, target.path);
  const outputPath = path.join(projectRoot, target.output);

  if (!fs.existsSync(absoluteTargetPath)) {
    console.warn(`⚠️ Target not found: ${absoluteTargetPath}`);
    continue;
  }

  const result = processFolder(absoluteTargetPath, absoluteTargetPath);
  fs.writeFileSync(outputPath, result);

  console.log(`✅ Exported ${target.path} → ${target.output}`);
}
