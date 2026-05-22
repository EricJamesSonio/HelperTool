# TODO — Prompt Tool (v10)

## Step 0 — Repo audit (done)

- Confirm generator flow uses `state.actionType` = `code|structure`.
- Confirm IPC entrypoint is `Code/ipc/generate_ipc.js`.
- Confirm no existing prompt system.

## Step 1 — Persistence layer

- [x] Add `Code/utils/promptStore.js` to persist `categories` + `prompts` into `userData/prompts.json`.
- [x] Support supports: `code|structure|both`, favorites, pinning.

## Step 2 — IPC endpoints

- [x] Add `Code/ipc/prompts_ipc.js` with CRUD + load + applicable filtering.
- [x] Register module in `Code/main.js`.

## Step 3 — Renderer Prompt Tool UI

- [ ] Add `Code/renderer/promptTool.js` (modal/panel UI to manage categories + prompts).
- [ ] Add new tools entry in `Code/renderer/app_manager/toolsManager.js`.

## Step 4 — Generator prompt picker

- [ ] Update `Code/renderer/index.html` with a “Prompt” button + prompt selection modal container.
- [ ] Update `Code/renderer/app_manager/generateManager.js` to open picker and store selected prompt IDs/text.

## Step 5 — Bridge + IPC generate extension

- [ ] Update `Code/preload/generate_bridge.js` to pass selected prompt text/ids to main.
- [ ] Update `Code/ipc/generate_ipc.js` signature.

## Step 6 — Prepend prompt into output

- [ ] Update `Code/utils/codeOps.js` to prepend prompt text block.
- [ ] Update `Code/utils/fileOps.js` to prepend prompt text block.

## Step 7 — Validate

- [ ] Manual test: switching Code/Structure filters prompts correctly.
- [ ] Manual test: selecting prompt changes generated output.
- [ ] Manual test: CRUD persists across restart.
