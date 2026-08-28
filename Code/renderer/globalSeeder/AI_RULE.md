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
- **No code comments inside the fence** — do NOT include `// ...`, `/* ... */`, or `# ...` comments in the file content. The parser treats `//` + `—` lines as prose and will **truncate the file** after that comment (e.g. `// Sheet write already succeeded — …` cuts off the `try` block). If you must explain, put it outside the fence as markdown.
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
app/api/public/submit/route.ts with `// Sheet write already succeeded — …` comment inside the fence // comment truncates file after that line
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
- `//` or `/* */` comments inside the fence — put explanations outside the fence instead (they can contain `—` and will be mis-detected as prose, truncating the file)
- Wrapped paths like `` `components/.../Foo.tsx` `` (backticks unnecessary, but tolerated)

If you must explain changes, write them as a separate markdown section **above** the file blocks, not interleaved.

### 4) Surgical edits — add / remove / replace (AST-patched, not overwritten)

For small, targeted changes you don't need to paste the whole file. Use a verb on the path line and paste **the full new node** (not a diff):

```
utils.js (Add after: imports)
```js
import { formatCurrency } from './helpers';
```

utils.js (Replace: calculateTotal)
```js
function calculateTotal(items) {
  return items.reduce((total, item) => total + item.price, 0);
}
```

utils.js (Remove: formatDate)
```

* Verbs:
  * ` (Replace: <target>)` — alias ` (Update: <target>)` — replace the whole node named `<target>` with the fenced block. **Always paste the full function / class / rule**, never ` -` / `+` diff lines.
  * ` (Add after: <target>)` / ` (Add before: <target>)` — insert the fenced block **after / before** `<target>`. Use `imports` to add an import after the last import, or `end` to append at EOF. The seeder adds one blank line so the result is clean.
  * ` (Remove: <target>)` — delete the node named `<target>` entirely (leaves one blank line).
* `<target>` is:
  * a **CSS selector** for `.css`/`.scss` (e.g. `.content`, `#nav .item`)
  * a **function/class/const/component name** for `.js`/`.jsx`/`.ts`/`.tsx`/`.py`/`.php`/`.vue` (e.g. `calculateTotal`, `AppShell`, `getUser`) — `tsx` and `python` were already supported, `php` and `vue` now work via the same AST (php/vue use string fallback if wasm missing, still surgical)
  * `imports` or `end` for file edges
  * a **dot-path** for `.json` (e.g. `scripts.build`)
* **Multiple surgical blocks for the same file are a batch** — paste them in top-to-bottom order (e.g. `Add after: imports` first, then `Replace: calculateTotal` near bottom). Each is applied sequentially, so offsets stay correct. The file is read fresh after each patch.
* If a target isn't found or the file doesn't exist, that one patch falls back to a full create/overwrite with a warning — it never silently drops, and the other patches in the batch still run.
* `(Partial)` still means "fragment shown for you to apply by hand — skip entirely." Don't combine `(Partial)` with a surgical verb.

---

## How the seeder uses this

- **Structure mode**: creates at repo root; if `First-Automation` exists it skips and creates children.
- **Content mode (full)**: smart-anchored. `components/...` is resolved to the nearest `components` folder found by BFS (skips `node_modules/.git/.next/dist/build`). If duplicates exist, UI shows a selector — user picks target. If no match, falls back to `repo/<path>`. Existing files are **overwritten** with pasted content.
- **Content mode (surgical)**: same anchoring, but ` (Replace: X)` / ` (Add after: X)` / ` (Remove: X)` are **patches** — preview shows `🩹 add after: X` etc., seed does AST byte-range splice via `tree-sitter` (`grammars/`), leaving the rest of the file untouched. Multiple surgical blocks with the same path are applied in pasted order (top→bottom). Fenced file-tree blocks (e.g. ```` ``` … lib/... ``` ````) are **ignored** — only path lines **outside** fences trigger seeding. Any path line with ` (Partial)` is also ignored.

Force this format on every generation that targets HelperTool.
`````
