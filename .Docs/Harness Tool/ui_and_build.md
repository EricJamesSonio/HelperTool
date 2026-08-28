# Harness Tool V1 — Frontend (Electron IPC Version)

## 🧠 Overview

The Harness Tool frontend is a **real-time control + execution viewer** built inside Electron.

Unlike web apps:

* ❌ No backend server
* ❌ No WebSocket
* ✅ Uses Electron IPC (Renderer ↔ Main)

---

# 🧱 Architecture (Electron)

```text

Renderer (React UI)
        ↓ IPC
Electron Main Process
        ↓
Harness Runner (Node logic)
        ↓
opencode / test commands
```

---

# 🎯 Frontend Goals (V1)

* Simple configuration UI
* Real-time logs (via IPC)
* Clear attempt-by-attempt feedback
* Minimal complexity

---

# 🧩 UI Layout

## 🔲 3 Panel Layout

```text
+----------------+----------------------+----------------------+
| CONFIG         | LIVE OUTPUT          | RESULTS              |
| (Left)         | (Center)             | (Right)              |
+----------------+----------------------+----------------------+
```

---

## 🧩 1. CONFIG PANEL (Left)

### Purpose:

Define how the harness runs

### Components:

* Prompt (textarea)
* Validation Type (dropdown)

  * JSON
  * Keyword
  * Exit
* Keyword input (if needed)
* Max Retries (number)
* Test Command (optional)
* Run Button

---

## 🧩 2. LIVE OUTPUT (Center)

### Purpose:

Show streaming logs per attempt

### Example:

```
[Attempt 1]
name: John

[Attempt 2]
{ "name": "John" }
```

---

## 🧩 3. RESULTS PANEL (Right)

### Purpose:

Summarize execution

### Example:

```
Attempt 1 → ❌ Invalid JSON
Attempt 2 → ✅ Passed

Final: SUCCESS
```

---

# ⚙️ State Structure (Renderer)

```ts
type HarnessState = {
  config: {
    prompt: string
    validationType: "json" | "keyword" | "exit"
    keyword?: string
    maxRetries: number
    testCommand?: string
  }

  isRunning: boolean

  logs: {
    attempt: number
    content: string
  }[]

  results: {
    attempt: number
    passed: boolean
    reason?: string
  }[]

  finalResult: {
    success: boolean
    attempts: number
    output: string
  } | null
}
```

---

# 🔌 IPC Communication Design

## Renderer → Main

Start harness:

```ts
window.electron.invoke("harness:run", config)
```

---

## Main → Renderer (Streaming Events)

Events sent from main process:

### Log Event

```json
{
  "type": "log",
  "attempt": 1,
  "message": "..."
}
```

---

### Result Event

```json
{
  "type": "result",
  "attempt": 1,
  "passed": false,
  "reason": "Invalid JSON"
}
```

---

### Final Event

```json
{
  "type": "final",
  "success": true,
  "attempts": 2,
  "output": "..."
}
```

---

## Renderer Listener

```ts
window.electron.on("harness:event", (data) => {
  if (data.type === "log") addLog(data)
  if (data.type === "result") addResult(data)
  if (data.type === "final") setFinal(data)
})
```

---

# 🔁 Frontend Flow

## 1. User clicks RUN

```ts
setIsRunning(true)
clearLogs()
clearResults()
clearFinal()
```

---

## 2. Invoke harness

```ts
await window.electron.invoke("harness:run", config)
```

---

## 3. Receive events

* logs stream live
* results update per attempt
* final result ends execution

---

## 4. Update UI

* append logs
* update results
* display final output

---

# 🛠️ How to Build (Step-by-Step)

---

## 🥇 Step 1 — Setup Layout

```jsx
<div className="grid grid-cols-3 h-screen">
  <ConfigPanel />
  <OutputPanel />
  <ResultsPanel />
</div>
```

---

## 🥈 Step 2 — Config Panel

```jsx
<textarea value={prompt} onChange={...} />

<select value={validationType}>
  <option value="json">JSON</option>
  <option value="keyword">Keyword</option>
  <option value="exit">Exit Code</option>
</select>

<input type="number" value={maxRetries} />

<button onClick={runHarness}>Run</button>
```

---

## 🥉 Step 3 — Output Panel

```jsx
logs.map((log, i) => (
  <div key={i}>
    <strong>Attempt {log.attempt}</strong>
    <pre>{log.content}</pre>
  </div>
))
```

---

## 🏅 Step 4 — Results Panel

```jsx
results.map((r, i) => (
  <div key={i}>
    Attempt {r.attempt} → {r.passed ? "✅" : "❌"}
    {!r.passed && <span>{r.reason}</span>}
  </div>
))
```

---

## 🧠 Step 5 — IPC Bridge (Preload)

Expose safe API:

```js
contextBridge.exposeInMainWorld("electron", {
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  on: (channel, callback) => ipcRenderer.on(channel, (_, data) => callback(data))
})
```

---

## 🧠 Step 6 — Run Button Logic

```ts
async function runHarness() {
  setIsRunning(true)

  await window.electron.invoke("harness:run", config)
}
```

---

# 🎨 UX Rules

* Disable RUN while running
* Auto-scroll logs
* Highlight failures clearly
* Keep UI minimal

---

# ⚠️ Common Mistakes

## ❌ Running logic in renderer

Never run opencode in UI

---

## ❌ Not streaming logs

Must be real-time

---

## ❌ Overcomplicating UI

Keep it dev-focused

---

# 🚀 Future Upgrades (NOT V1)

* Save/load configs
* Multi-test runs
* Visualization charts
* Integration with Ecosystem Watcher

---

# ✅ Done Criteria

* Can configure harness
* Can run via IPC
* Logs stream live
* Results update per attempt
* Final output displayed

---

# 🧠 Summary

The frontend is a **real-time visualization layer** powered by IPC.

It:

* sends commands to main process
* receives streamed execution data
* renders attempts + results clearly

---
