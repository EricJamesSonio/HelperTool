# 06 — Security and Risk Assessment (Proposed)

**Evidence status:** Items marked **CONFIRMED** are directly verified in source code at commit `60c9531`. Items marked **INFERRED**
or **PROPOSED** are derived from code analysis and threat modeling. This is a read-only risk assessment; no source code was
modified. Risks are prioritized Critical → High → Medium → Low.

---

## 1. Existing Electron security controls (CONFIRMED)

| Control | Status | Notes |
|---------|--------|-------|
| `nodeIntegration: false` | CONFIRMED | main.js:385; renderer has no Node.js access |
| `contextIsolation: true` | CONFIRMED | main.js:386; preload bridge isolated |
| `devTools` disabled in production | CONFIRMED | main.js:390 |
| `disable-gpu-sandbox` CLI switch | CONFIRMED | main.js:69 |
| Webview guests sandboxed (will-attach-webview) | CONFIRMED | main.js:396-405; separate from main window |
| Console output filter (`[Main]`, `[Tray]`, etc.) | CONFIRMED | utils/log.js installed at main start |
| `shell:openExternal` only http(s) | CONFIRMED | main.js:358 |
| Single-instance lock | CONFIRMED | main.js:85-96 |
| Tray hide-on-close (never quits) | CONFIRMED | main.js:436-440 |
| IPC response envelopes per module | CONFIRMED | Each `ipcMain.handle` returns its own shape |
---

## 2. Existing weaknesses (CONFIRMED / INFERRED)

| Weakness | Source | Risk to Document Studio |
|----------|--------|------------------------|
| No sender validation on IPC | main.js:227-363; most handlers ignore event.sender | Malicious renderer could forge requests |
| Global progress listener (`workerProxy.onProgress`) | workerProxy.js:192-198 | Not request-scoped; concurrent jobs clobber progress |
| 120s default request timeout | workerProxy.js:112 | OCR/PDF jobs will exceed timeout |
| `asarUnpack` exposes node_modules/* | main.js:28-35 | If Document Studio sidecar path is inside ASAR, could be exposed |
| Dialogs (`pickFile`, `pickOutputFolder`) in main process | video_ipc.js, image_ipc.js | Renderer receives paths but never validates them |
| No path traversal / symlink protection in file ops | config.js, utils/fileOps.js | Unvalidated paths could escape intended directories |
| No file size limits or malware scanning | no central validation observed | Large/embedded PDFs could cause resource exhaustion |
| AGPL v3 risk if PyMuPDF used | 04-DEPENDENCY-AND-LIBRARY-RESEARCH.md | Distribution licensing conflict |

### INFERRED: Document Studio-specific risks

- **Untrusted PDF content:** PDFs may contain embedded JS, launch actions, or embedded files that execute outside intended scope. If the sidecar processes PDFs without sandboxing, host risks apply (INFERRED).
- **OCR resource consumption:** Tesseract/OPT on large or malformed images can consume CPU/memory; no timeout or size limits currently exist (INFERRED).
- **Python sidecar escape:** If `child_process.spawn` uses shell interpolation or escapes are not handled, a crafted payload could lead to shell injection (INFERRED — must use `spawn` without shell, as in videoCompress.js).
- **Progress clobbering:** The existing global progress listener pattern means two concurrent Document Studio jobs would overwrite each other's progress data (CONFIRMED from workerProxy.js analysis).
- **Temp file reuse:** If Document Studio reuses OS temp directories without unique prefixes, concurrent jobs could read/write each other's files (INFERRED — must use isolated job directories).
---

## 3. Future security requirements (PROPOSED — Document Studio)

### 3.1 Untrusted document handling

1. **Never execute commands originating from document contents.**
2. **Never interpret document instructions as shell commands.**
3. **Validate every IPC request.**
4. **Restrict filesystem operations to authorized application paths and user-selected files.**
5. **Avoid arbitrary executable invocation.**
6. **Spawn child processes without shell interpolation.**
7. **Apply processing limits.**
8. **Use isolated job directories.**
9. **Validate paths and reject traversal.**
10. **Handle malformed and potentially malicious PDFs safely.**
11. **Prevent untrusted document content from reaching privileged Electron APIs.**
12. **Keep all document processing offline.**

### 3.2 IPC security

1. **Validate every IPC request.**
2. **Sender validation (best effort).**
3. **Response envelope standardization.**

### 3.3 Sidecar process security

1. **Stdin/stdout protocol only.**
2. **stderr for diagnostics only.**
3. **No persistent state between invocations beyond job files.**
4. **Crash recovery.**

### 3.4 Resource limits (PROPOSED)

| Resource | Limit | Rationale |
|----------|-------|-----------|
| PDF file size | ≤ 500 MB | Prevents OOM |
| OCR image resolution | ≤ 300 DPI equivalent | Limits processing time/memory |
| Max concurrent jobs | 3 (configurable) | Prevents resource exhaustion |
| Job timeout | 30 min per job (configurable) | Prevents hung jobs |
| Temp dir size per job | ≤ 500 MB | Prevents disk fill |

### 3.5 Packaging risks (PROPOSED)

- **Antivirus false positives:** PyInstaller-frozen executables frequently flagged. Mitigation: installer whitelist, notify user, valid signatures.
- **Tesseract bundled data size:** traineddata files for multiple languages can add 100+ MB. Mitigation: ship only required languages; make OCR optional.
- **ASAR / PyInstaller interaction:** If sidecar path is inside Electron ASAR, `spawn` may fail unless `asarUnpack` used. Mitigation: ship sidecar outside ASAR via `extraResources`.
- **Dependency vulnerabilities:** Regular `pip install --upgrade` cycle; use `pip-compile` + `pip-safety check`.

---

## 4. Prioritized risk matrix (PROPOSED)

| ID | Risk | Priority | Mitigation |
|----|------|----------|------------|
| R1 | AGPL v3 licensing conflict if PyMuPDF used | Critical | Resolve licensing before MVP |
| R2 | Shared worker progress clobbering if document processing reuses worker | Critical | Offload to dedicated Python sidecar |
| R3 | PDF/OCR resource exhaustion (unbounded size/memory) | High | Enforce file size caps, resolution caps, max concurrent jobs |
| R4 | Shell injection via unvalidated payloads sent to sidecar | High | Use `child_process.spawn` no-shell; validate all payloads |
| R5 | Untrusted PDF content execution (embedded actions/JS) | High | Sidecar processes PDFs without invoking embedded actions |
| R6 | Temp file collision / shared temp dirs | Medium | Use isolated job dirs per jobId |
| R7 | Antivirus false positives blocking sidecar launch | Medium | Sign executables; add installer whitelist |
| R8 | Tesseract traineddata bundle size | Medium | Ship only required languages; make OCR optional |
| R8 | Tesseract / OpenCV native CVE risks | Low | Keep deps updated; use `pip-compile` + safety checks |
| R9 | ASAR / PyInstaller path resolution failures | Low | Test packaging; use onedir; ensure sidecar outside ASAR |
| R10 | Dependency supply-chain attacks (malicious pip/package) | Low | Pin versions; use `pip-compile` + safety checks |
---

## 5. Security checklist for Document Studio implementers

- [ ] IPC payload validated on every handler entry (filePath, jobId, percent, all fields)
- [ ] `child_process.spawn` used without shell (`shell: false`) for sidecar
- [ ] Isolated job directories per job (`<jobId>/` under `<userData>/document-studio/jobs/`)
- [ ] PDF size limit enforced (configurable, default 500 MB)
- [ ] OCR resolution cap enforced (configurable, default 300 DPI equivalent)
- [ ] Max concurrent jobs limit (configurable, default 3)
- [ ] Job timeout enforced (configurable, default 30 min)
- [ ] OCR optional behind feature flag; default OFF
- [ ] PyMuPDF licensing verified (or alternative selected)
- [ ] PyInstaller bundle ships outside Electron ASAR
- [ ] Sidecar stderr separated from stdout protocol
- [ ] All `dialog.showOpenDialog` / `dialog.showSaveDialog` used; renderer never calls Node fs directly
- [ ] Path traversal rejection: `..`, absolute non-user paths, symlinks outside allowed dirs
- [ ] Progress events request-scoped (not global listener)
- [ ] Cancel handling: renderer → main → sidecar → cleanup → job status `cancelled`
- [ ] Antivirus test: verify sidecar .exe launches; add installer whitelist if needed
- [ ] Linting / safety checks on Python dependencies (`pip-safety check`)
- [ ] No cloud APIs or internet-dependent features for core Document Studio functionality
| No centralized sender validation | NOT PRESENT | Most handlers ignore event.sender |