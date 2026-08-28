# Global Seeder — AI Output Rule

Copy the block below into your AI's system / project instructions. It forces output to match the parser exactly (no prose bleed, no glued tokens).

---

## SYSTEM RULE: HelperTool Global Seeder format (MUST FOLLOW)

You are generating files for **HelperTool Global Seeder**. Follow this format **exactly** — the parser is strict.

### 1) CONTENT MODE (Structure + Content) — preferred for code

For every file, output **exactly**:

````
<posix-rel-path>
```<lang>
<file content>
````

````

Rules:
- `posix-rel-path` on **its own line** with no decoration. Example: `components/sheet-builder/SharePanel.tsx` . No backticks, no quotes, no trailing ` — update ...`, no colon.
- Do **NOT** glue the language to the path (`SharePanel.module.csscss` is WRONG). Always newline before ```.
- Opening fence must be triple backticks + language (`css`, `tsx`, `ts`, `py`, `json`, etc.) on its own line.
- Closing fence triple backticks on its own line.
- **No prose between path and fence.** Put explanations BEFORE the block or AFTER all blocks, never between.
- One blank line between files is allowed.
- Use **posixed forward slashes** (`/`), lowercase extensions.

**GOOD:**
````

components/sheet-builder/SharePanel.module.css

```css
.panel {
  margin-top: 20px;
}
```

components/sheet-builder/SharePanel.tsx

```tsx
"use client";
import Button from "@/components/ui/Button";
export default function SharePanel() {
  return null;
}
```

hooks/useFormConfig.ts

```ts
export type { FieldType } from "@/lib/formConfig";
```

```

**BAD (parser will drop/wrong):**
```

components/sheet-builder/SharePanel.module.csscss // glued lang
components/sheet-builder/SharePanel.module.css — this is the panel // prose on path line
components/sheet-builder/SharePanel.tsx tsx // lang not fenced
components/sheet-builder/SharePanel.tsx // missing fence, raw code without ```

```

### 2) STRUCTURE MODE (empty files, folders only)
When the user asks for structure only, output a **box-drawing tree** rooted at repo root:

```

Frontend/
├── app.py
├── templates/
│ └── index.html
└── static/
├── css/
│ └── style.css
└── js/
└── form.js

```

- First line is the root folder with trailing `/`.
- Folders end with `/`, files have extensions.
- Existing folders at repo root are skipped, missing ones are created incrementally.

### 3) Never add
- `hooks/useFormConfig.ts — update the type exports` (em-dash notes on path line)
- `Replace the ...` / `And update the ...` sentences inside the fence
- Wrapped paths like `` `components/.../Foo.tsx` `` (backticks unnecessary, but tolerated)

If you must explain changes, write them as a separate markdown section **above** the file blocks, not interleaved.

### 4) Partial / surgical edits — skip
If you are showing only a **fragment** of a file (not a full replacement), append ` (Partial)` to the path line:

```
app/admin/sheet-builder/page.tsx (Partial)
```tsx
// only the updated imports — not the whole file
export type { FieldType } from "@/lib/formConfig";
```
```

The seeder will **skip** any path with ` (Partial)` entirely — no file will be created or overwritten. Use it for `// update this function` snippets you will apply by hand. Only full file replacements **without** `(Partial)` are seeded.

---

## How the seeder uses this

- **Structure mode**: creates at repo root; if `First-Automation` exists it skips and creates children.
- **Content mode**: smart-anchored. `components/...` is resolved to the nearest `components` folder found by BFS (skips `node_modules/.git/.next/dist/build`). If duplicates exist, UI shows a selector — user picks target. If no match, falls back to `repo/<path>`. Existing files are **overwritten** with pasted content. Fenced file-tree blocks (e.g. ```` ``` … lib/... ``` ````) are **ignored** — only path lines **outside** fences trigger seeding. Any path line with ` (Partial)` is also ignored.

Force this format on every generation that targets HelperTool.
```
