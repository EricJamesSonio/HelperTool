import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const src = path.join(__dirname, '../renderer/fileSeederTool/parser.js');
const dest = path.join(__dirname, './fileSeederParser.mjs');
fs.copyFileSync(src, dest);
const { parseInput } = await import('./fileSeederParser.mjs');
fs.unlinkSync(dest);

const raw = `First-Automation/
├── app.py
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── style.css
    └── js/
        └── form.js`;

// Debug indentUnit detection
const lines = raw.split('\n');
const spacings = lines
    .map(l => { const m = l.match(/^(\s+)/); return m ? m[1].length : 0; })
    .filter(len => len > 0);
console.log('Spacings:', spacings);
console.log('Detected indentUnit:', Math.min(...spacings));

// Test what indentLevel produces for each line
const BOX_CHARS = /[│├└─\|+\\]/g;
function indentLevelOld(rawLine, indentUnit) {
    const boxMatches = rawLine.match(/(?:│\s*|[├└]──\s*)/g);
    if (boxMatches) return boxMatches.length;
    const spaces = rawLine.match(/^(\s+)/)?.[1] ?? '';
    const tabs = (spaces.match(/\t/g) ?? []).length;
    if (tabs > 0) return tabs;
    return Math.floor(spaces.length / indentUnit);
}

function indentLevelNew(rawLine, indentUnit) {
    const branchMatch = rawLine.match(/^( *[│ ]*)[├└]──/);
    if (branchMatch) {
        const prefix = branchMatch[1];
        const pipes = (prefix.match(/│/g) || []).length;
        return 1 + pipes;
    }
    const spaces = rawLine.match(/^(\s+)/)?.[1] ?? '';
    const tabs = (spaces.match(/\t/g) ?? []).length;
    if (tabs > 0) return tabs;
    return Math.floor(spaces.length / indentUnit);
}

const indentUnit = Math.min(...spacings);
lines.forEach((l, i) => {
    console.log(`Line ${i}: OLD=${indentLevelOld(l, indentUnit)} NEW=${indentLevelNew(l, indentUnit)} [${l.trimStart()}]`);
});
