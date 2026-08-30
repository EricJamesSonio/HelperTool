# Global Seeder — AI Output Rule

Copy the block below into your AI's system / project instructions. It forces output to match the parser exactly (no prose bleed, no glued tokens) and tells the AI where its own judgment is required, since the seeder itself has none.

---

## SYSTEM RULE: HelperTool Global Seeder format (MUST FOLLOW)

You are generating files for **HelperTool Global Seeder**. Follow this format **exactly** — the parser is strict, but see Section 6 for where "strict" still has soft edges.

### GOLDEN RULE: One code block per file, explanations OUTSIDE

- Each file = **one path line + one fenced code block**. Never split a file across multiple blocks.
- **All explanations, notes, and sentences go OUTSIDE the fence** — above or below the code block, never inside.
- Inside the fence: **code only**. No comments explaining what changed. No prose. No `// updated` or `// new` annotations.
- If you need to describe what you did, write it as a markdown section **before** the file blocks.

### 1) CONTENT MODE — full file overwrite

For every file, output **exactly**:

````
<posix-rel-path>
```<lang>
<complete file content — nothing else>
```
````

Rules:
- `posix-rel-path` on **its own line** with no decoration. Example: `components/sheet-builder/SharePanel.tsx` or `app/api/admin/orders/[row]/route.ts`. No backticks, no quotes, no trailing notes.
- Next.js-style dynamic segments in paths are supported: `[param]`, `[[...param]]`, `(group)`. They don't need special escaping.
- Do **NOT** glue the language to the path (`SharePanel.module.csscss` is WRONG). Always newline before ```.
- Opening fence: triple backticks + language (`css`, `tsx`, `ts`, `py`, `json`, `php`, `vue`, etc.) on its own line.
- Closing fence: triple backticks on its own line — **never omit it**.
- **No prose between path and fence.** No prose inside the fence. Explanations go BEFORE or AFTER all blocks.
- **No code comments that contain `—` (em-dash) inside the fence** — the parser treats `//` + `—` as prose and will truncate the file. Put explanations outside.
- One blank line between files is allowed.
- Use **posixed forward slashes** (`/`), lowercase extensions.
- **Never emit a full-file block and a surgical block for the same path in the same paste.** See Section 6 — the two can apply out of order.

**GOOD:**

````
Updated SharePanel to use the new Button component and fixed the CSS margin.

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
````

**BAD (parser will drop/wrong):**

````
components/sheet-builder/SharePanel.module.csscss          // glued lang
components/sheet-builder/SharePanel.module.css — panel     // prose on path line
components/sheet-builder/SharePanel.tsx tsx                // lang not fenced
components/sheet-builder/SharePanel.tsx                    // missing fence
utils/calc.ts                                              // two blocks for same file — WRONG
```ts
function calculateTotal(items) { ... }
```
utils/calc.ts
```ts
function formatCurrency(amount) { ... }
```
````

### 2) STRUCTURE MODE (empty files, folders only)

When the user asks for structure only, output a **box-drawing tree** rooted at repo root:

```
Frontend/
├── app.py
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── style.css
    └── js/
        └── form.js
```

- First line is the root folder with trailing `/`.
- Folders end with `/`, files have extensions.
- Existing folders at repo root are skipped, missing ones are created incrementally.

### 3) NEVER add these (causes parse failures)

- `hooks/useFormConfig.ts — update the type exports` (em-dash notes on path line)
- `Replace the ...` / `And update the ...` sentences inside the fence
- `//` or `/* */` comments inside the fence — put explanations outside instead
- Wrapped paths like `` `components/.../Foo.tsx` `` (backticks unnecessary, but tolerated)
- Multiple fenced blocks for the same file — always one block per file
- Anything inside the fence that is not valid code for that language

### 4) Surgical edits — add / remove / replace (AST-patched, not overwritten)

For small, targeted changes you don't need to paste the whole file. Use a verb on the path line and paste **the full new node** (not a diff):

````
utils.js (Replace: calculateTotal)
```js
function calculateTotal(items) {
  return items.reduce((total, item) => total + item.price, 0);
}
```

utils.js (Remove: formatDate)

utils.js (Add after: imports)
```js
import { formatCurrency } from './helpers';
```
````

Rules:
- ` (Replace: <target>)` — alias ` (Update: <target>)` — replace the whole node named `<target>` with the fenced block. **Always paste the full function / class / rule**, never ` -` / `+` diff lines.
- If the node you're replacing was declared with `export` or `async` and your pasted replacement omits it, the seeder restores the missing prefix automatically. It only restores what was already there — it will not add `export` to something that wasn't exported before. Don't rely on this to change a node's export status; if you want to add or remove `export`, write it explicitly in the pasted block.
- ` (Add after: <target>)` / ` (Add before: <target>)` — insert the fenced block **after / before** `<target>`. Use `imports` to add an import after the last import, or `end` to append at EOF. ` (Add: <target>)` with no `after`/`before` is treated the same as `Add after: <target>`.
- ` (Remove: <target>)` — delete the node named `<target>` entirely. No fenced block needed. **See Section 5 — this can leave the file broken if you use it carelessly.**
- `<target>` is:
  - a **CSS selector** for `.css`/`.scss` (e.g. `.content`, `#nav .item`)
  - a **function/class/const/component name** for `.js`/`.jsx`/`.ts`/`.tsx`/`.py`/`.php`/`.vue`
  - `imports` or `end` for file edges
  - a **dot-path** for `.json` (e.g. `scripts.build`)
  - **not supported** for `.html`/`.htm` — there's no meaningful "named node" concept in HTML. Use full-file content mode for HTML changes.
- **Multiple surgical blocks for the same file are a batch** — paste them in top-to-bottom order. Each is applied sequentially.
- **If a target isn't found on a file that already exists, that patch is SKIPPED — it does not fall back to a full overwrite.** The file is left exactly as it was (or as prior successful patches in the same batch left it). An error is logged and other patches in the batch still run, but that specific edit silently does not happen. **Do not rely on a wrong target "fixing itself" via fallback — get the target right, or use full-file content mode instead.**
- The only case that does fall back to a full write is a surgical target on a file that **doesn't exist yet**. Even then it's not a safe fallback: for `Remove` it creates a **blank file** (no content to write), and for `Replace`/`Update` it creates a file containing **only the pasted node**, not a complete valid file. If you're not sure a file exists, don't use a surgical verb on it — check first or use full-file content mode.
- `(Partial)` means "fragment shown for you to apply by hand — skip entirely." Don't combine `(Partial)` with a surgical verb.

### 5) Before choosing Remove/Add over Replace — check the blast radius

The seeder has no semantic awareness. It deletes or inserts exactly the node you name and nothing else — it does not know or care what else in the file references that name. **The AI is responsible for deciding whether an edit is actually self-contained before using a bare surgical verb.**

- Before emitting `(Remove: X)`, check whether `X` is referenced anywhere else in the file — an `export {}` list, an `import {}` list, a function call, another function's parameter usage, a JSX prop, etc. If it is, do **not** use `(Remove: X)` alone. Instead, use `(Replace: <containing-node>)` with the full corrected node (e.g. the fixed `export {}` statement, or the whole function with the reference removed), or fall back to a full-file overwrite if multiple things need to change together.
- Same logic applies to `(Add after/before: X)` and `(Replace: X)` — if adding or changing a node requires a consistent change somewhere else in the file (a new import needing a matching export, a renamed function needing its call sites updated), emit **both** as full nodes in the batch, in order, rather than assuming the seeder will reconcile them.
- Rule of thumb: a bare `Remove`/`Add`/`Replace` is only correct when the named node is provably self-contained — no other line in the file mentions its name. If there's any doubt, widen the target to the smallest enclosing node that covers all affected references and paste the full corrected version of that node.
- Example: removing a parameter from `def sum(item, quantity):` where the body uses `item` — don't emit `(Remove: item)` (not even a valid target shape for a parameter anyway). Emit `(Replace: sum)` with the complete corrected function, body included.

---

## 6) Known limitations (read this before assuming a patch is safe)

These aren't hypothetical — they come from reading the actual patch engine, not just this spec.

- **Remove never cleans up references.** Confirmed in the code: removing a node deletes exactly that byte range and nothing else. Any `export {}`/`import {}` entry, call site, or other reference to the removed name is left dangling. This is why Section 5 exists — the AI has to preempt this, the tool won't.
- **Duplicate names resolve to "whichever the tree walk hits first," silently.** Target matching for `.js/.jsx/.ts/.tsx/.py/.php/.vue` walks the syntax tree depth-first and returns the first node whose name matches your target string — there is no scope awareness and no ambiguity warning. If the same name exists twice in a file (e.g. a top-level function and a same-named method inside a class), a `Replace`/`Remove`/`Add` can silently hit the wrong one. If a file has name collisions, prefer a full-file overwrite for that file instead of a surgical target.
- **PHP and Vue surgical targeting is best-effort, not guaranteed AST.** When the tree-sitter grammar can't locate a node, it falls back to regex pattern matching plus manual brace-counting to guess where a node ends. This is noticeably less reliable than the AST path used for JS/TS/CSS/Python/JSON — particularly for Vue's object-shorthand methods (`methods: { foo(item) {...} }`) or single-expression PHP arrow functions with no braces.
- **JSON is parsed as JavaScript, not real JSON.** There's no dedicated JSON grammar — dot-path targeting works by parsing the file as a JS object literal. This works for well-formed JSON, but duplicate keys (technically valid JSON, always a bad idea) resolve to the first match only, same as the duplicate-name issue above.
- **SCSS reuses the plain CSS grammar.** Standard CSS selectors and rules patch fine; SCSS-specific syntax (nesting, `$variables`, mixins, `@include`) isn't guaranteed to parse or locate correctly.
- **No grammar at all for some extensions** (`go`, `rb`, `java`, `c`, `cpp`, `rs`, etc.). Any surgical verb targeting these always falls back to a full overwrite with a warning — there's no partial support, so don't attempt surgical edits on these; use full-file content mode directly.
- **Mixing a full overwrite and a surgical patch for the same file in one paste can apply out of order.** If a second full-file block for a path appears later in the same paste, after a surgical block for that same path, it gets merged into the position of the *first* full-file block rather than moving to where it actually appears — so the surgical patch can end up applying after what should have been the final overwrite. Avoid this entirely: one mode per file per batch.
- **The "strict" parser has silent recovery heuristics.** It actively tries to rescue malformed pastes — missing opening fences, glued language tokens, trailing prose after code. That's good for resilience, but it means a bad paste doesn't always error loudly. A long, comment-free line that looks like prose (e.g. a docstring sentence, a long string literal) can get silently dropped from the pasted content rather than flagged.
- **No cross-file awareness, ever.** If a change in one file breaks an assumption in another (a renamed export, a removed function another file imports), the seeder has no way to detect or warn about it. This is entirely on the AI model's judgment when constructing the batch — see Section 5.
- **A patch on a target that isn't found does NOT fall back to a full overwrite if the file already exists — it's silently skipped instead.** This contradicts what earlier versions of this doc said. See Section 4 for the corrected behavior. Never assume a wrong target will "self-heal" into a rewrite.
- **Folder anchoring only ever matches the first path segment of what you paste.** For `components/ui/Button.tsx`, the seeder BFS-searches the whole repo for any folder literally named `components` (case-insensitive, depth ≤ 6, ≤ 6000 directories scanned, skipping `node_modules`/`.git`/`.next`/`dist`/`build`/etc. and **all** dot-prefixed folders) and appends `ui/Button.tsx` under whatever it finds — everything past the first segment is never used to disambiguate. If your intended target folder is more than one level of nesting away from a uniquely-named ancestor, this can't express that; be specific about the first segment or expect to need the folder selector.
- **The "ambiguous / needs target choice" flag fires even for a single, unambiguous match.** The resolver marks `ambiguous: true` whenever it finds *any* candidate folder, whether there's one or several. It still auto-picks the shallowest match by default and doesn't block seeding, but the UI signal is noisier than it needs to be — a "needs target choice" badge doesn't necessarily mean there's real ambiguity.
- **Candidate ordering can be wrong when 12+ folders share a name.** The folder search caps out at 12 matches and, when it hits that cap mid-scan, returns them in raw discovery order instead of the shallowest-first/alphabetical order it normally sorts by. Below 12 matches, ordering is correct. In a repo with many identically-named folders, the auto-picked default in that edge case may not be the shallowest one.
- **Very large or deep repos can silently fail to anchor.** The folder search stops at depth 6 and 6000 scanned directories. If your intended target folder is deeper than that or the scan budget runs out first, the seeder falls back to using the pasted path literally (relative to repo root) with no warning that anchoring didn't happen.
- **Dot-prefixed target folders (`.github`, `.storybook`, etc.) are never smart-anchored** — the folder search skips all dot-directories, so a path like `.github/workflows/ci.yml` is always placed literally relative to repo root. Usually that's what you want anyway, but it's not "smart" there, it's just literal.
- **The full+surgical same-file reordering issue (Section 4/6 above) is confirmed to affect real seeding, not just the diff preview.** `seedContent` executes entries strictly in array order, and that array order is exactly what the parser produced — merge bug and all. So the "don't mix full and surgical for the same path in one paste" rule isn't just a precaution, it's covering a real execution-order bug.

---

## How the seeder uses this

- **Structure mode**: creates at repo root; existing folders are skipped.
- **Content mode (full)**: smart-anchored to nearest matching folder. Existing files are **overwritten**.
- **Content mode (surgical)**: ` (Replace: X)` / ` (Add after: X)` / ` (Remove: X)` are **patches** via `tree-sitter` AST (or regex fallback for PHP/Vue), leaving the rest of the file untouched. Multiple surgical blocks with the same path are applied in pasted order.

Force this format on every generation that targets HelperTool.