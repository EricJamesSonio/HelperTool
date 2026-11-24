# 06 — Security, Privacy, and Reliability

## 1. Security objectives

- Process documents locally.
- Prevent untrusted documents from escaping the application's intended file boundaries.
- Keep renderer privileges narrow.
- Avoid arbitrary command execution.
- Bound resource consumption.
- Prevent one failed job from corrupting other jobs or projects.
- Preserve source files.
- Provide diagnosable errors without exposing sensitive document content unnecessarily.

## 2. Electron security

- Keep `nodeIntegration` disabled in renderer contexts.
- Keep context isolation enabled.
- Keep renderer sandboxing enabled where compatible with the existing application.
- Expose narrow preload methods rather than raw Electron or Node APIs.
- Validate every IPC request in the main process.
- Enforce feature availability in the main process, not only by hiding a UI entry.
- Do not allow the renderer to choose arbitrary executable paths or command-line arguments.
- Apply a restrictive Content Security Policy consistent with HelperTool's current architecture.

The actual Electron window configuration must be inspected before making claims about current security settings. Missing an explicit `sandbox` property alone does not establish that the renderer is unsandboxed; defaults and other WebPreferences matter.

## 3. Sidecar process security

- Launch a known packaged executable with fixed arguments.
- Use `shell: false`.
- Pass structured data through stdin rather than constructing shell commands.
- Validate operation names and payload schemas.
- Do not accept arbitrary Python code, shell commands, or plugin paths.
- Restrict filesystem operations to approved input, output, and managed directories.
- Treat all document-derived strings and metadata as untrusted.
- Separate protocol output on stdout from diagnostics on stderr.
- Apply process timeouts and controlled shutdown.
- Verify the executable and bundled resources are from the application's trusted package.

Using `shell: false` reduces shell-command injection risk, but does not remove path traversal, unsafe file handling, parser vulnerabilities, or resource-exhaustion risks.

## 4. Document input risks

PDF and image files are untrusted input. Consider:

- Malformed or adversarial files.
- Parser vulnerabilities in third-party libraries.
- Decompression bombs and extreme image dimensions.
- Huge page counts or embedded images.
- Encrypted or damaged documents.
- Unexpected embedded files, links, annotations, actions, or forms.
- Excessive OCR time or memory consumption.

The application should not execute embedded content or follow document links automatically.

## 5. Resource controls

Define configurable and tested limits for:

- Maximum input file size.
- Maximum page count.
- Maximum rendered page dimensions and DPI.
- Maximum image pixel count.
- OCR time per page and per job.
- Total job duration.
- Concurrent jobs.
- Temporary disk usage.
- Preview cache size.

Do not treat example limits as final until measured against supported hardware and real documents. Display a useful error when a limit is reached.

## 6. File-system safety

- Canonicalize and validate paths.
- Reject path traversal.
- Defend against symlink/reparse-point escapes where relevant on Windows.
- Use unique job directories.
- Avoid predictable temporary filenames.
- Use atomic writes or temporary output followed by a validated rename.
- Do not overwrite an existing output without explicit user approval.
- Verify deletion targets are within the managed storage root.

## 7. Privacy and offline operation

- No document content is uploaded to a cloud service.
- No required network requests for core processing.
- OCR and document libraries run locally.
- Do not include document contents in telemetry.
- Keep logs minimal and avoid recording full extracted text by default.
- Make any future optional online feature explicit and separately consented to.

Offline operation must be tested with network access disabled, not merely inferred from the architecture.

## 8. Reliability

- Keep source files immutable.
- Use job state transitions with explicit terminal states.
- Record enough job metadata to diagnose failures.
- Handle sidecar crash and unexpected exit.
- Fail pending jobs clearly if the sidecar becomes unavailable.
- Clean abandoned temporary work safely on next launch.
- Validate generated PDF and DOCX outputs before reporting success.
- Make cancellation semantics explicit; do not report cancellation until the operation has stopped or its output has been safely discarded.
- Do not let one job's progress events overwrite another job's progress.

## 9. Licensing and supply-chain review

Before bundling any dependency:

- Verify the exact version and license.
- Review transitive dependencies.
- Review redistribution and commercial-use requirements.
- Record required notices and attributions.
- Check whether OCR language packs have separate licenses.
- Pin tested dependency versions.
- Rebuild and test the sidecar from a reproducible dependency lock.
- Scan packaged artifacts and maintain an update process.

PyMuPDF licensing must be resolved before it is adopted in a distributed build.
