# Harness Tool V1 — Project Plan

## 🧠 Overview

The Harness Tool is a **controlled execution system for AI agents (opencode)**.

Instead of running the AI once and manually fixing errors, the Harness Tool:

* runs the AI
* validates the output
* retries automatically with feedback
* stops when the output is correct or retries are exhausted

This transforms AI usage from:

> manual trial-and-error
> into
> automated, testable, repeatable executions

---

## 🎯 Goals (V1)

* Prove that **retry + validation improves AI output quality**
* Build a **minimal, deterministic harness system**
* Keep everything **simple, debuggable, and fast**

---

## ❌ Non-Goals (V1)

* No AI-based evaluation (no LLM judging)
* No complex guardrails
* No multi-agent orchestration
* No dataset testing
* No deep integration with other tools (yet)

---

## 🧱 Core Concepts

### 1. Runner

Executes the AI agent (`opencode`) and captures output.

### 2. Validation

Checks if output meets required conditions (hardcoded logic).

### 3. Loop (Retry Engine)

Retries execution when validation fails.

### 4. Prompt Feedback

Improves prompt dynamically using failure reason.

### 5. Optional Test Command

Runs real project tests (e.g., `npm test`) after validation passes.

---

## 🔁 Execution Flow

```
Input Prompt
     ↓
Run AI (opencode)
     ↓
Validate Output
     ↓
   ┌───────────────┐
   │ Valid?        │
   └───────┬───────┘
           ↓
         NO → Improve Prompt → Retry
           ↓
         YES
           ↓
   Run Test Command (optional)
           ↓
   ┌───────────────┐
   │ Tests Pass?   │
   └───────┬───────┘
           ↓
         NO → Improve Prompt → Retry
           ↓
         YES
           ↓
        SUCCESS
```

---

## ⚙️ Core Components

### 1. `runner.js`

Responsible for executing `opencode`.

**Responsibilities:**

* spawn process
* capture stdout/stderr
* track exit code
* measure duration

**Output:**

```json
{
  "output": "...",
  "error": "...",
  "exitCode": 0,
  "duration": 1200
}
```

---

### 2. `validator.js`

Handles validation logic.

**Supported validations (V1):**

* JSON validity
* keyword presence
* exit code success
* optional regex match

**Example:**

```js
validate(output, config) → { pass: boolean, reason: string }
```

---

### 3. `loop.js`

Controls retry behavior.

**Responsibilities:**

* run attempts
* stop on success
* retry on failure
* enforce max retries

---

### 4. `promptFixer.js`

Improves prompt after failure.

**Strategy (V1):**
Append feedback to original prompt.

```text
<original prompt>

Your previous output failed.
Error: <reason>

Fix it and return correct result.
```

---

### 5. `testRunner.js` (optional)

Executes real project tests.

**Examples:**

```bash
npm test
pytest
```

Runs only after validation passes.

---

### 6. `config.json`

Defines harness behavior.

```json
{
  "prompt": "Return valid JSON with name and age",
  "validation": {
    "type": "json"
  },
  "maxRetries": 3,
  "testCommand": "npm test"
}
```

---

## 🔁 Retry Logic (Core Engine)

```js
let prompt = basePrompt

for (let i = 0; i < maxRetries; i++) {
  const result = runOpencode(prompt)

  const validation = validate(result)

  if (!validation.pass) {
    prompt = improvePrompt(prompt, validation.reason)
    continue
  }

  if (testCommand) {
    const testResult = runTest(testCommand)

    if (!testResult.pass) {
      prompt = improvePrompt(prompt, "Tests failed")
      continue
    }
  }

  return success
}

return failure
```

---

## 🧪 Example Scenario

### Input:

* Prompt: “Return valid JSON”
* Validation: JSON
* Retries: 3

### Execution:

**Attempt 1**

```
name: John
```

❌ Invalid JSON

**Attempt 2**

```
{ "name": "John" }
```

✅ Valid JSON

→ SUCCESS

---

## 🖥️ Minimal UI

### Left Panel — Config

* Prompt input
* Validation type
* Retry count
* Test command (optional)

### Center — Output

* Live logs per attempt

### Right — Results

* Attempt history
* Pass/Fail per attempt
* Final output

---

## 📊 Data Structure (Execution Log)

```json
[
  {
    "attempt": 1,
    "output": "...",
    "passed": false,
    "reason": "Invalid JSON"
  },
  {
    "attempt": 2,
    "output": "...",
    "passed": true
  }
]
```

---

## 🧠 Key Design Principles

* **Deterministic first** (no AI validation)
* **Simple loop > complex logic**
* **One improvement strategy only**
* **Config-driven, not hardcoded logic**
* **Transparent execution (logs matter)**

---

## 🚀 Future Enhancements (NOT V1)

* AI-based evaluations (quality scoring)
* smarter prompt rewriting
* multiple test cases (dataset)
* parallel runs
* integration with Ecosystem Watcher
* deeper code execution analysis

---

## ✅ Success Criteria (V1)

The tool is successful if:

* It retries automatically on failure
* It improves outputs across attempts
* It produces correct results more often than single runs
* It is easy to debug and extend

---

## 🧠 Summary

Harness Tool V1 is a **self-correcting execution loop** for AI agents.

It introduces:

* structure
* validation
* feedback
* retry logic

This is the foundation for building **reliable AI systems** instead of one-shot tools.

---
