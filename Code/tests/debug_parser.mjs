import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Load parsers via the shared helper (copies the ESM sources to .mjs)
const { loadParsers } = await import('./helpers.mjs');
const { parseInput } = await loadParsers();

const raw = `First-Automation/
├── app.py
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── style.css
    └── js/
        └── form.js`;
console.log(parseInput(raw));

const raw2 = `app.js
components/Button.tsx
app.js`;
console.log(parseInput(raw2));

const raw3 = `# comment
app.js

# another
lib/util.ts`;
console.log(parseInput(raw3));
