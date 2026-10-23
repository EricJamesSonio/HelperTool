# Global Seeder — AI Output Rule

Copy the block below into your AI's system / project instructions. It forces output to match the parser exactly (no prose bleed, no glued tokens) and tells the AI where its own judgment is required, since the seeder itself has none.

---

## SYSTEM RULE: HelperTool Global Seeder format (MUST FOLLOW)

You are generating files for **HelperTool Global Seeder**. Follow this format **exactly** — the parser is strict, but see Section 7 for where "strict" still has soft edges.

### GOLDEN RULE: ONE code container for the whole batch, one explicit block per file

- The **entire batch goes into a SINGLE fenced code container** (one ```` ``` ```` … ```` ``` ```` pair for everything). Not one container per file — the user wants to copy the whole thing in one click.
- Inside that container, each file is **one path line + `<<<START` + the code + `<<<END`**. Never split a file across multiple blocks.
- **All explanations, notes, and sentences go OUTSIDE the container** — above or below it, never inside.
- Inside a block: **code only**. No comments explaining what changed. No prose. No `// updated` or `// new` annotations.
- If you need to describe what you did, write it as a markdown section **before** the container.

### 1) CONTENT MODE — full file overwrite

Put **everything** into one code container:

````
```text
<posix-rel-path>
<<<START
<complete file content — nothing else>
<<<END

<posix-rel-path>
<<<START
<complete file content — nothing else>
<<<END
```
````

Rules:
- **ONE container for the whole response.** The language tag on the container is irrelevant — use `text`. Only the `<<<START` / `<<<END` markers matter.
- `posix-rel-path` on **its own line** with no decoration. Example: `components/sheet-builder/SharePanel.tsx` or `app/api/admin/orders/[row]/route.ts`. No backticks, no quotes, no trailing notes.
- `<<<START` and `<<<END` each on **their own line**. They are the block delimiters — the seeder takes everything between them **verbatim**, so nothing inside can be mistaken for a path, an import or the end of the file.
- Next.js-style dynamic segments in paths are supported: `[param]`, `[[...param]]`, `(group)`. They don't need special escaping.
- Do **NOT** glue the language to the path (`SharePanel.module.csscss` is WRONG). The path line must be alone.
- **No prose between the path and `<<<START`.** No prose inside a block. Explanations go BEFORE or AFTER the container.
- **Never close a block early.** A `` ``` `` inside the code (markdown examples, template literals) is fine — only `<<<END` ends a block.
- One blank line between files is allowed.
- Use **posixed forward slashes** (`/`), lowercase extensions.
- **Never emit a full-file block and a surgical block for the same path in the same paste.** See Section 7 — the two can apply out of order.

**GOOD:**

````
Updated SharePanel to use the new Button component and fixed the CSS margin.

```text
components/sheet-builder/SharePanel.module.css
<<<START
.panel {
  margin-top: 20px;
}
<<<END

components/sheet-builder/SharePanel.tsx
<<<START
"use client";
import Button from "@/components/ui/Button";
export default function SharePanel() {
  return null;
}
<<<END
```
````

**BAD (parser will drop/wrong):**

````
```text
components/sheet-builder/SharePanel.module.csscss          // glued lang
components/sheet-builder/SharePanel.module.css — panel     // prose on path line
components/sheet-builder/SharePanel.tsx                    // missing <<<START
utils/calc.ts                                              // two blocks for same file — WRONG
utils/calc.ts
<<<START
function calculateTotal(items) { ... }
<<<END
utils/calc.ts
<<<START
function formatCurrency(amount) { ... }
<<<END
```
````

### 2) PHP RULES (Laravel and plain PHP)

- Start the file with `<?php` on its own line, then `namespace App\...;`, then the `use ...;` imports, then the class. That order is enforced by PHP itself.
- **PSR-12 brace placement**: the `{` of a class/interface/trait/enum goes on its **own line**.
- Every statement ends with `;`. `namespace` and `use` statements are single lines.
- Laravel-specific files are just PHP — `routes/web.php`, `app/Http/Controllers/...`, `app/Models/...`, `database/migrations/...`.
- Blade templates (`*.blade.php`) are also PHP files for the seeder: emit the whole template inside one block.

**GOOD (inside the single container):**

````
```text
server/app/Http/Controllers/ResortController.php
<<<START
<?php

namespace App\Http\Controllers;

use App\Models\Resort;
use Illuminate\Http\Request;

class ResortController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return Resort::query()->paginate();
    }
}
<<<END
```
````

### 3) VUE RULES (single file components)

- A `.vue` file is **one block** containing the whole SFC: `<template>`, then `<script setup>`, then `<style scoped>`. Keep that order.
- The seeder parses the `<script>` block with the real JavaScript/TypeScript parser, so a `.vue` file supports surgical edits on functions, consts and imports exactly like a `.ts` file.
- `import` statements in a Vue SFC usually have **no semicolons** — that is fine and expected.
- `<script setup>` is the default for a new component. Use `<script setup lang="ts">` for TypeScript.
- A Vue template may reference component paths in attributes (`<ResortCard />`, `import X from '@/components/...'`). Inside an explicit block that is never a problem — which is exactly why the explicit format is mandatory.

**GOOD (inside the single container):**

````
```text
client/src/components/resort/ResortCard.vue
<<<START
<template>
  <div class="resort-card">
    <h2>{{ resort.name }}</h2>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { usePublicResort } from '@/composables/useQuery/usePublicResort'

const props = defineProps({ resort: { type: Object, required: true } })
const name = computed(() => props.resort.name)
</script>

<style scoped>
.resort-card {
  padding: 16px;
}
</style>
<<<END
```
````

### 4) STRUCTURE MODE (empty files, folders only)

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

### 5) NEVER add these (causes parse failures)

- `hooks/useFormConfig.ts — update the type exports` (em-dash notes on path line)
- `Replace the ...` / `And update the ...` sentences inside a block
- `//` or `/* */` comments explaining changes inside a block — put explanations outside instead
- Wrapped paths like `` `components/.../Foo.tsx` `` (backticks unnecessary, but tolerated)
- Multiple blocks for the same file — always one block per file
- Anything inside a block that is not valid code for that language
- Code compressed onto a single line, or typographic quotes — see Section 5b

### 5b) LINE STRUCTURE AND QUOTES (the seeder verifies every full-file block)

The seeder parses every full-file block before writing it. A block that fails the syntax check is **flagged and skipped**, so a file that merely *looks* right in chat costs a whole round-trip.

- **Never collapse a file onto one line.** One statement per line, one SFC section per line. Adjacent statements (`const a = 1 const b = 2`) and adjacent `import`s without a line break are a hard JavaScript syntax error.
- **Keep `<template>`, `<script>` and `<style>` on their own lines** in a `.vue` file. Never inline the whole SFC.
- **ASCII quotes only in code.** Write `'` and `"` — never `‘` `’` `“` `”`. Typographic quotes are fine in the prose *outside* the container, but `emit(‘confirm’)` inside a block is broken Vue/JS and will not compile. Correct: `emit('confirm')`.
- **Never truncate.** Do not end a block with `...`, `// rest unchanged`, `// same as before` or `<!-- etc -->`. Emit the complete file, or use a surgical block (Section 6).
- Indentation must be real spaces/tabs, not alignment tricks, and the block must be self-contained: no `{{ placeholder }}` where code belongs.

The seeder auto-repairs two specific mistakes: a whole file collapsed onto one line, and paired smart quotes. Everything else that is genuinely malformed is blocked — the user can force it through, but that is not the outcome you want.

**BAD — whole SFC squeezed onto one line (invalid, block will be rejected):**

```
<template><div>{{ label }}</div></template><script setup>import { computed } from 'vue' import BaseButton from './BaseButton.vue' const props = defineProps({ label: String })</script>
```

**GOOD — same file, one section and one statement per line:**

```
<template>
  <div>{{ label }}</div>
</template>

<script setup>
import { computed } from 'vue'
import BaseButton from './BaseButton.vue'

const props = defineProps({ label: String })
</script>
```

**BAD quotes:** `@click="emit(‘confirm’)"`  →  **GOOD:** `@click="emit('confirm')"`

### 6) Surgical edits — add / remove / replace (AST-patched, not overwritten)

For small, targeted changes you don't need to paste the whole file. Use a verb on the path line and paste **the full new node** (not a diff) — inside the same single container:

````
```text
utils.js (Replace: calculateTotal)
<<<START
function calculateTotal(items) {
  return items.reduce((total, item) => total + item.price, 0);
}
<<<END

utils.js (Remove: formatDate)
<<<START
<<<END

utils.js (Add after: imports)
<<<START
import { formatCurrency } from './helpers';
<<<END
```
````

Rules:
- ` (Replace: <target>)` — alias ` (Update: <target>)` — replace the whole node named `<target>` with the block. **Always paste the full function / class / rule**, never ` -` / `+` diff lines.
- If the node you're replacing was declared with `export` or `async` and your pasted replacement omits it, the seeder restores the missing prefix automatically. It only restores what was already there — it will not add `export` to something that wasn't exported before. Don't rely on this to change a node's export status; if you want to add or remove `export`, write it explicitly in the pasted block.
- ` (Add after: <target>)` / ` (Add before: <target>)` — insert the block **after / before** `<target>`. Use `imports` to add an import after the last import, or `end` to append at EOF. ` (Add: <target>)` with no `after`/`before` is treated the same as `Add after: <target>`.
  - For **PHP**, `imports` means "after the last `use ...;` statement" (never before the `namespace`).
  - For **Vue**, `imports` means "after the last import inside the `<script>` block".
- ` (Remove: <target>)` — delete the node named `<target>` entirely. The block may be empty. **See Section 7 — this can leave the file broken if you use it carelessly.**
- `<target>` is:
  - a **CSS selector** for `.css`/`.scss` (e.g. `.content`, `#nav .item`) — and for a `<style>` block inside a `.vue` file
  - a **function/class/const/component name** for `.js`/`.jsx`/`.ts`/`.tsx`/`.py`/`.php`/`.vue` (inside the Vue `<script>` block)
  - an **element tag name or CSS class** for the `<template>` block of a `.vue` file (e.g. `resort-card`, `ResortCard`)
  - `imports` or `end` for file edges
  - a **dot-path** for `.json` (e.g. `scripts.build`)
  - **not supported** for `.html`/`.htm` — there's no meaningful "named node" concept in HTML. Use full-file content mode for HTML changes.
- **Paste the node as it appears in the file, with its own indentation.** The seeder re-aligns the block to the target position, so a node copied out of a file keeps its shape and a node written at column 0 is indented for you.
- **Multiple surgical blocks for the same file are a batch** — paste them in top-to-bottom order. Each is applied sequentially.
- **If a target isn't found on a file that already exists, that patch is SKIPPED — it does not fall back to a full overwrite.** The file is left exactly as it was (or as prior successful patches in the same batch left it). An error is logged and other patches in the batch still run, but that specific edit silently does not happen. **Do not rely on a wrong target "fixing itself" via fallback — get the target right, or use full-file content mode instead.**
- The only case that does fall back to a full write is a surgical target on a file that **doesn't exist yet**. Even then it's not a safe fallback: for `Remove` it creates a **blank file** (no content to write), and for `Replace`/`Update` it creates a file containing **only the pasted node**, not a complete valid file. If you're not sure a file exists, don't use a surgical verb on it — check first or use full-file content mode.
- `(Partial)` means "fragment shown for you to apply by hand — skip entirely." Don't combine `(Partial)` with a surgical verb.

### 7) Before choosing Remove/Add over Replace — check the blast radius

The seeder has no semantic awareness. It deletes or inserts exactly the node you name and nothing else — it does not know or care what else in the file references that name. **The AI is responsible for deciding whether an edit is actually self-contained before using a bare surgical verb.**

- Before emitting `(Remove: X)`, check whether `X` is referenced anywhere else in the file — an `export {}` list, an `import {}` list, a function call, another function's parameter usage, a JSX prop, etc. If it is, do **not** use `(Remove: X)` alone. Instead, use `(Replace: <containing-node>)` with the full corrected node (e.g. the fixed `export {}` statement, or the whole function with the reference removed), or fall back to a full-file overwrite if multiple things need to change together.
- Same logic applies to `(Add after/before: X)` and `(Replace: X)` — if adding or changing a node requires a consistent change somewhere else in the file (a new import needing a matching export, a renamed function needing its call sites updated), emit **both** as full nodes in the batch, in order, rather than assuming the seeder will reconcile them.
- Rule of thumb: a bare `Remove`/`Add`/`Replace` is only correct when the named node is provably self-contained — no other line in the file mentions its name. If there's any doubt, widen the target to the smallest enclosing node that covers all affected references and paste the full corrected version of that node.
- Example: removing a parameter from `def sum(item, quantity):` where the body uses `item` — don't emit `(Remove: item)` (not even a valid target shape for a parameter anyway). Emit `(Replace: sum)` with the complete corrected function, body included.

---

## 8) Known limitations (read this before assuming a patch is safe)

These aren't hypothetical — they come from reading the actual patch engine, not just this spec.

- **Remove never cleans up references.** Confirmed in the code: removing a node deletes exactly that byte range and nothing else. Any `export {}`/`import {}` entry, call site, or other reference to the removed name is left dangling. This is why Section 7 exists — the AI has to preempt this, the tool won't.
- **Duplicate names resolve to "whichever the tree walk hits first," silently.** Target matching walks the syntax tree depth-first and returns the first node whose name matches your target string — there is no scope awareness and no ambiguity warning. If the same name exists twice in a file (e.g. a top-level function and a same-named method inside a class), a `Replace`/`Remove`/`Add` can silently hit the wrong one. If a file has name collisions, prefer a full-file overwrite for that file instead of a surgical target.
- **JSON is parsed as JavaScript, not real JSON.** There's no dedicated JSON grammar — dot-path targeting works by parsing the file as a JS object literal. This works for well-formed JSON, but duplicate keys (technically valid JSON, always a bad idea) resolve to the first match only, same as the duplicate-name issue above.
- **SCSS reuses the plain CSS grammar.** Standard CSS selectors and rules patch fine; SCSS-specific syntax (nesting, `$variables`, mixins, `@include`) isn't guaranteed to parse or locate correctly.
- **No grammar at all for some extensions** (`go`, `rb`, `java`, `c`, `cpp`, `rs`, etc.). Any surgical verb targeting these always falls back to a full overwrite with a warning — there's no partial support, so don't attempt surgical edits on these; use full-file content mode directly.
- **Mixing a full overwrite and a surgical patch for the same file in one paste can apply out of order.** If a second full-file block for a path appears later in the same paste, after a surgical block for that same path, it gets merged into the position of the *first* full-file block rather than moving to where it actually appears — so the surgical patch can end up applying after what should have been the final overwrite. Avoid this entirely: one mode per file per batch.
- **No cross-file awareness, ever.** If a change in one file breaks an assumption in another (a renamed export, a removed function another file imports), the seeder has no way to detect or warn about it. This is entirely on the AI model's judgment when constructing the batch — see Section 7.
- **A patch on a target that isn't found does NOT fall back to a full overwrite if the file already exists — it's silently skipped instead.** See Section 6 for the corrected behavior. Never assume a wrong target will "self-heal" into a rewrite.
- **Folder anchoring only ever matches the first path segment of what you paste.** For `components/ui/Button.tsx`, the seeder BFS-searches the whole repo for any folder literally named `components` (case-insensitive, depth ≤ 6, ≤ 6000 directories scanned, skipping `node_modules`/`.git`/`.next`/`dist`/`build`/etc. and **all** dot-prefixed folders) and appends `ui/Button.tsx` under whatever it finds — everything past the first segment is never used to disambiguate. If your intended target folder is more than one level of nesting away from a uniquely-named ancestor, this can't express that; be specific about the first segment or expect to need the folder selector.
- **The "ambiguous / needs target choice" flag fires even for a single, unambiguous match.** The resolver marks `ambiguous: true` whenever it finds *any* candidate folder, whether there's one or several. It still auto-picks the shallowest match by default and doesn't block seeding, but the UI signal is noisier than it needs to be — a "needs target choice" badge doesn't necessarily mean there's real ambiguity.
- **Candidate ordering can be wrong when 12+ folders share a name.** The folder search caps out at 12 matches and, when it hits that cap mid-scan, returns them in raw discovery order instead of the shallowest-first/alphabetical order it normally sorts by. Below 12 matches, ordering is correct. In a repo with many identically-named folders, the auto-picked default in that edge case may not be the shallowest one.
- **Very large or deep repos can silently fail to anchor.** The folder search stops at depth 6 and 6000 scanned directories. If your intended target folder is deeper than that or the scan budget runs out first, the seeder falls back to using the pasted path literally (relative to repo root) with no warning that anchoring didn't happen.
- **Dot-prefixed target folders (`.github`, `.storybook`, etc.) are never smart-anchored** — the folder search skips all dot-directories, so a path like `.github/workflows/ci.yml` is always placed literally relative to repo root. Usually that's what you want anyway, but it's not "smart" there, it's just literal.
- **The full+surgical same-file reordering issue (Section 6/8 above) is confirmed to affect real seeding, not just the diff preview.** `seedContent` executes entries strictly in array order, and that array order is exactly what the parser produced — merge bug and all. So the "don't mix full and surgical for the same path in one paste" rule isn't just a precaution, it's covering a real execution-order bug.
- **A missing `<<<END` marker is detected and reported** (the preview row shows `parse: no END marker — content may be truncated`), but the content is still taken up to the next path line, so a truncated block is possible. Always close your blocks.

---

## How the seeder uses this

- **Structure mode**: creates at repo root; existing folders are skipped.
- **Content mode (full)**: smart-anchored to nearest matching folder. Existing files are **overwritten**.
- **Content mode (surgical)**: ` (Replace: X)` / ` (Add after: X)` / ` (Remove: X)` are **patches** via `tree-sitter` AST, leaving the rest of the file untouched. Multiple surgical blocks with the same path are applied in pasted order.
- **Invalid code is not written**: every full-file block is syntax-checked (JS/TS/JSX/TSX/Vue/PHP/CSS/HTML/JSON). A one-line collapse and paired smart quotes are auto-repaired; anything still broken is skipped unless the user explicitly opts that row back in.

### Legacy format (still parsed, but do not emit it)

Older pastes used a fenced code block **per file**:

````
components/sheet-builder/SharePanel.tsx
```tsx
"use client";
```
````

That still parses, but the parser has to *guess* where the code ends. It can mistake a long `class Foo extends Bar` line for prose and cut the file there, and it can mistake a path-looking line for the next file header. The explicit `<<<START` / `<<<END` format removes the guesswork entirely — always use it.

The whole batch in **one** container is the point: the user copies the entire code once and pastes it straight into the seeder.

Force this format on every generation that targets HelperTool.
