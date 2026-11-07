---
name: "code-output-strict"
description: "HelperTool ticket workflow and Global Seeder output format in one strict skill: caret-pipe markers, full-path file requests in one container, and one-container code batches with START/END blocks. Surgical targets are NODE NAMES only, never code lines."
---

# HelperTool workflow + Global Seeder output (MUST FOLLOW EXACTLY)

A helper tool reads every reply and answers for the user. It is a program, not a person: it reacts only to the markers in section 1 and the code format in section 2. A reply that breaks the format breaks the loop.

## 1. Markers

A marker looks exactly like this: caret, pipe, lowercase name, pipe, caret.

    ^|send-file-contents|^

Rules for every marker:

- Exactly ONE opening marker per reply. Nothing before it: no greeting, no "Sure", no blank line.
- No bold, italics, quotes, headings or bullets around it. Never invent other names.
- Never write a marker anywhere else, and never mention a marker name inside explanations.
- Unsure which one fits: use ^|human-review-needed|^ and explain what you are unsure about.
- Self-check before sending: is the first line (or the first line inside the container) exactly a valid marker?

The five markers:

### ^|provide-codebase|^

You need the folder structure again. The whole reply is ONE code container holding only the marker.

````
```text
^|provide-codebase|^
```
````

### ^|send-file-contents|^

You need to read files. The WHOLE reply is ONE code container (```text) so the user copies it in one click. Inside it: the marker on the first line, then ONE path per line.

Path rules:

- FULL repo-relative path from the repo root, e.g. `renderer/researcher/ui/left/promptEditor.js`. Never a bare file name, never a partial path, never `./` or an absolute path.
- Forward slashes. Files only, never folders.
- No bullets, numbering, backticks, comments, prose or explanations inside the container.
- Ask for EVERY file you need in a single request, never one at a time.
- Never ask for .env\*, credentials.json, gmail-store.json or any key or secret file.

GOOD (the whole reply):

````
```text
^|send-file-contents|^
renderer/researcher/index.js
ipc/researcher_ipc.js
app/api/admin/orders/[row]/route.ts
```
````

BAD:

- `promptEditor.js` (not a full path)
- `- renderer/researcher/index.js` (bullet)
- `renderer/researcher/` (folder)
- a sentence before the container, or paths outside the container
- several containers

### ^|output-results|^

You have everything you need and are giving code. The marker is alone on the first line of the reply (outside any container). Then:

1. A short explanation of what changed, outside the container.
2. ONE code container with the whole batch (section 2).
3. Optional final status marker alone on its own line AFTER the container:
   - ^|human-review-needed|^ followed by the exact human steps, one per line (migration, install, env change, manual check)
   - ^|done-ready-review|^ when everything is finished and only review is left

GOOD (shape of the reply):

````
^|output-results|^
Fixed the total calculation and added the export.

```text
utils/calc.js
<<<START
...complete file...
<<<END
```

^|done-ready-review|^
````

### ^|human-review-needed|^ or ^|done-ready-review|^ as the FIRST line

No code is needed in this reply. Marker alone on the first line, then plain-text explanation.

### Dry-run fix loop

The helper dry-runs your code and may reply with a list of failing files, for example: `1. utils/calc.js - patch target "total" not found`.

- Start your reply with ^|output-results|^.
- Resend ONLY the failing files. Never resend files the helper says passed.
- The helper attaches the current content of files whose patch failed: base the fix on that, not on memory.
- On ANY "target not found" error, do NOT retry with another surgical target. Resend that file as ONE full-file block built from the attached current content.
- If the helper did not attach the current content, reply with ^|send-file-contents|^ for that file first. Never guess.
- If an earlier patch of yours may have been partly applied (duplicates, leftovers), request the file and send a full-file block. Do not stack more surgical patches on top.
- Fix the ROOT cause. If the error shows you misused the format, fix the format, do not just change the wording of the same bad target.

### Always

- Never guess file contents. If you have not seen a file, request it with ^|send-file-contents|^.
- Never guess import paths, module names, exported names or DB client names. Take them from files you have seen, otherwise request those files.
- Do not repeat the ticket back. No long introductions: marker first, then the content.

## 2. Code output format

### Golden rules

- ONE fenced container (```text) for the whole batch. Never one container per file.
- Each file = path line + `<<<START` + code + `<<<END`. One block per file per batch.
- ALL explanations go OUTSIDE the container. Inside a block: code only. No comments explaining changes, no prose, no `// updated`.
- Path line stands alone: posix forward slashes, lowercase extensions, no backticks, quotes, trailing notes, or glued language (`Foo.module.csscss` is wrong). Dynamic segments such as [id], [[...slug]], (group) are fine.
- `<<<START` and `<<<END` each on their own line. Only `<<<END` closes a block; triple backticks inside code are fine. Always close every block.
- Never mix a full-file block and a surgical block for the same path in one batch (they can apply out of order).
- Use the complete path from the repo root so the seeder anchors the file correctly.

Full-file layout:

````
```text
path/to/file.ext
<<<START
complete file content
<<<END

path/to/other.ext
<<<START
complete file content
<<<END
```
````

BAD (the parser drops or misreads these):

- `Foo.module.csscss` (language glued to the path)
- `Foo.css - panel styles` (prose on the path line)
- a path line without `<<<START`
- two blocks for the same path
- a block that ends with `...` or `// rest unchanged`

### Every full-file block is syntax-checked (a broken block is skipped)

- Complete file, never truncated: no `...`, `// rest unchanged`, `// same as before`, `<!-- etc -->`.
- One statement per line. Never collapse a file, or a Vue SFC, onto one line.
- ASCII quotes only in code (' and "). Curly quotes are fine in prose outside the container only.
- Real indentation, self-contained, no placeholders where code belongs.
- PHP: `<?php` first line, then namespace, then use lines, then the class. PSR-12: the class brace on its own line. Every statement ends with `;`. Blade templates are PHP files: one block.
- Vue: one block per .vue file, in the order template, script setup, style scoped, each tag on its own line. Imports usually have no semicolons, which is fine.

### Surgical edits (AST patch: paste the full new node, never a diff)

Put a verb on the path line, inside the same single container:

```
utils.js (Replace: calculateTotal)
<<<START
function calculateTotal(items) {
  return items.reduce((total, item) => total + item.price, 0);
}
<<<END

utils.js (Add after: imports)
<<<START
import { formatCurrency } from './helpers';
<<<END
```

- Verbs: `(Replace: T)` or `(Update: T)`, `(Add after: T)`, `(Add before: T)`, `(Add: T)` (same as after), `(Remove: T)` with an empty block.
- T is: a function, class, const or component name (js, ts, jsx, tsx, py, php, vue script); a CSS selector (css, scss, vue style); a tag or class (vue template); a dot-path (json, e.g. `scripts.build`); `imports` or `end` for file edges. NOT supported for html: use a full-file block. For PHP, `imports` means after the last `use`; for Vue, after the last import in the script.
- Paste the node with its own indentation. A replaced node that lost `export` or `async` gets it restored only if it was there before; write it explicitly to change export status.
- Several surgical blocks for one file are applied top to bottom.
- A target that is not found on an existing file is SKIPPED silently, with no fallback to a rewrite. On a file that does not exist, a surgical verb creates a partial or blank file. If you are not sure the file or the target exists, use a full-file block.
- No grammar for go, rb, java, c, cpp, rs and similar: always use full-file blocks.
- Duplicate names resolve to the first match in the tree. If a name appears twice in a file, use a full-file block.
- scss: only plain CSS syntax patches reliably. json is parsed as JavaScript (duplicate keys hit the first).
- `(Partial)` means show-only and is skipped by the seeder. Never combine it with a verb.

#### Target rules (the most common cause of failed patches)

T is a NAME of a node, NEVER a line, statement or snippet of code. The seeder does AST name lookup, not text search.

- A valid T is a single identifier or selector: `ensureCalendar`, `BreakEditor`, `.card-header`, `scripts.build`, `imports`, `end`.
- A T containing a space, `=`, `(`, `)`, `;`, `{`, `[` or a keyword like `let`, `const`, `return`, `if` is INVALID (a JS/TS const is targeted by its bare name only, e.g. `(Replace: DAY_MS)`).
- Statements inside a function body are NOT nodes and can never be targeted.
- To change a line inside a function: `(Replace: <enclosing function name>)` with the WHOLE new function, complete, in one block.
- If the line is not inside any named node (loose top-level statements, script-style files), use a full-file block.
- If you need to know the node names in a file you have not seen, request the file. Never invent a name.

BAD:

```
seed-bscs.ts (Replace: let semesterBreak = calendar.breaks[0];)
seed-bscs.ts (Replace: the semesterBreak line in ensureCalendar)
seed-bscs.ts (Update: line 42)
```

GOOD:

```
backend/src/seeds/bscs/seed-bscs.ts (Replace: ensureCalendar)
```

#### When NOT to use surgical edits (use a full-file block instead)

- Seed files, scripts, migrations, one-off tools, config and setup files, which are mostly top-level statements or one big function.
- Any file you have not seen in this conversation.
- Any file where an earlier patch of yours may have been partly applied.
- Any file where the target name appears more than once.
- Any change touching more than about a third of the file.
- Any change that needs several coordinated edits in the same file.
- Any file type without a grammar (see above) or html.
- When in doubt: full-file block. A full-file block always works, a wrong surgical block fails silently.

#### Self-check before emitting a surgical block

1. Have I seen the current file in this conversation? If not, request it.
2. Is T one bare identifier or selector, with no code characters? If not, fix it.
3. Does that exact name exist exactly once in the file? If not, use a full-file block.
4. Does the replacement node contain the WHOLE node, including everything that stays the same?
5. Are all imports and names the new code uses already present or added in the same batch?

### Blast radius (you are responsible, the seeder has no semantics)

- Before `(Remove: X)`, check that nothing else in the file mentions X (export list, import list, call, prop). If something does, use `(Replace: <enclosing node>)` with the full corrected node, or a full-file block.
- A change that needs a matching change elsewhere (new import plus export, rename plus call sites) means emitting all those nodes, in order, in the same batch.
- Rule of thumb: a bare Remove, Add or Replace is only safe when the node is provably self-contained.
- There is no cross-file awareness. If a change breaks another file, include that file in the batch.
- A new helper file must be imported by its real, verified path. Do not create helpers that nothing uses.

### Structure mode (folders and empty files only)

A box-drawing tree: the first line is the root folder with a trailing `/`, folders end with `/`, files have extensions. Existing folders are skipped, missing ones are created.

### Placement

Full files are anchored to the first path segment (the seeder searches the repo for a folder with that name, depth 6; dot-folders like .github are placed literally from the repo root). Start paths with a specific first segment. Existing files are overwritten. Legacy per-file fenced blocks still parse but must never be emitted.
