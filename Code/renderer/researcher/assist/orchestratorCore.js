// Facade for the Researcher assist panel.
// handleReply(text) detects the marker in Claude's reply, runs the matching
// existing feature (tree, file contents, global seeder dry run) and returns
// plain data for the panel. All side effects come in through `deps`, so the
// flows are testable with mocks.

import {
  MARKERS,
  REMINDER,
  parseReply,
  stripSensitiveTreeLines,
  buildTreeReply,
  buildFilesReply,
  buildFixReply,
  formatChars,
} from './protocol.js';
import { resolveRequests } from './pathResolver.js';

const WARN_REPLY_CHARS = 120000;
const WARN_PATH_COUNT = 25;
const MAX_ATTACH_FILES = 5;

class CancelledError extends Error {}

const slash = (p) => String(p ?? '').replace(/\\/g, '/');
const trimTail = (p) => slash(p).replace(/\/+$/, '');
const baseName = (p) => trimTail(p).split('/').pop() || '';

function relativeTo(root, abs) {
  const r = trimTail(root);
  const a = slash(abs);
  return a.toLowerCase().startsWith(r.toLowerCase() + '/') ? a.slice(r.length + 1) : a;
}

function headersIn(content) {
  const re = /^\/\/ ===== File: (.+?) =====\s*$/gm;
  const found = new Set();
  let m;
  while ((m = re.exec(content)) !== null) found.add(slash(m[1]).toLowerCase());
  return found;
}

function createStepper(labels, onStep) {
  const steps = labels.map((label) => ({ label, state: 'pending', detail: '' }));
  const emit = () => onStep(steps.map((s) => ({ ...s })));
  const set = (i, state, detail) => {
    if (!steps[i]) return;
    steps[i].state = state;
    if (detail !== undefined) steps[i].detail = detail;
    emit();
  };
  emit();
  return {
    start: (i, detail) => set(i, 'active', detail),
    done: (i, detail) => set(i, 'done', detail),
    warn: (i, detail) => set(i, 'warn', detail),
    fail: (i, detail) => set(i, 'error', detail),
    failActive: (detail) => {
      const i = steps.findIndex((s) => s.state === 'active');
      if (i !== -1) set(i, 'error', detail);
    },
    snapshot: () => steps.map((s) => ({ ...s })),
  };
}

function previewText(text) {
  const raw = String(text ?? '');
  const head = raw.slice(0, 90).replace(/[^\x20-\x7e]/g, (c) =>
    c === '\n' ? '\\n' : c === '\r' ? '' : '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')
  );
  return 'Read ' + raw.length + ' chars. Starts with: "' + head + (raw.length > 90 ? '...' : '') + '"';
}
export function createOrchestrator(deps) {
  const session = { round: 0, sent: new Map() };

  function getSession() {
    return { round: session.round, sentCount: session.sent.size, sent: [...session.sent.entries()] };
  }

  function resetSession() {
    session.round = 0;
    session.sent.clear();
  }

  function makeResult(base, stepper) {
    return {
      marker: null,
      status: 'ready',
      title: '',
      lines: [],
      replyText: '',
      seederText: '',
      legacy: false,
      issues: [],
      finalStatus: null,
      steps: stepper ? stepper.snapshot() : [],
      round: session.round,
      sentCount: session.sent.size,
      ...base,
    };
  }

  function requireRepo() {
    const repo = deps.getRepoPath();
    if (!repo) throw new Error('No repo selected in the main window.');
    return repo;
  }

  async function readFilesText(repo, absPaths, name) {
    const file = await deps.tempFile(name);
    const res = await deps.generate('code', repo, absPaths, file, false, '');
    if (!res || !res.success) throw new Error('Could not read the requested files.');
    return res.content || '';
  }

  // -------------------------------------------------------------------------
  // provide-codebase
  // -------------------------------------------------------------------------
  async function provideCodebase(ctx) {
    const repo = requireRepo();
    const s = ctx.begin([
      'Marker detected',
      'Reading folder structure',
      'Hiding sensitive files',
      'Building reply',
    ]);
    s.done(0, MARKERS.PROVIDE_CODEBASE);

    s.start(1);
    const file = await deps.tempFile('structure.txt');
    ctx.guard();
    const res = await deps.generate('structure', repo, [repo], file, false, '');
    ctx.guard();
    if (!res || !res.success || !res.content) {
      s.fail(1, 'nothing returned');
      throw new Error('Could not read the folder structure.');
    }
    s.done(1, res.content.split('\n').length + ' lines');

    s.start(2);
    const { text: tree, removed } = stripSensitiveTreeLines(res.content);
    s.done(2, removed ? removed + ' hidden' : 'none found');

    s.start(3);
    const replyText = buildTreeReply({ repoName: baseName(repo), tree, removed });
    s.done(3, formatChars(replyText.length));

    const lines = [{ tone: 'ok', text: 'Folder structure ready (' + formatChars(replyText.length) + ').' }];
    if (removed) lines.push({ tone: 'info', text: removed + ' sensitive file(s) hidden from the tree.' });
    if (replyText.length > WARN_REPLY_CHARS) {
      lines.push({ tone: 'warn', text: 'Large tree. Add folders to .docignore if the chat rejects it.' });
    }
    return { status: 'ready', title: 'Folder structure', lines, replyText };
  }

  // -------------------------------------------------------------------------
  // send-file-contents
  // -------------------------------------------------------------------------
  async function sendFileContents(ctx) {
    const repo = requireRepo();
    const requests = ctx.parsed.paths || [];
    const s = ctx.begin([
      'Marker detected',
      'Reading requested paths',
      'Matching against the project tree',
      'Reading file contents',
      'Building reply',
    ]);
    s.done(0, MARKERS.SEND_FILE_CONTENTS);

    s.start(1);
    if (!requests.length) {
      s.fail(1, 'no paths after the marker');
      return {
        status: 'error',
        title: 'No file paths found',
        lines: [{ tone: 'error', text: 'Nothing that looks like a path came after the marker.' }],
        replyText: [
          'Your last reply used the file-request marker but I could not read any file paths from it.',
          'Resend it with ONE full repo-relative path per line right after the marker, nothing else.',
          '',
          REMINDER,
        ].join('\n'),
      };
    }
    s.done(1, requests.length + ' path(s)');

    s.start(2);
    const flat = deps.getFlatList() || [];
    if (!flat.length) {
      s.fail(2, 'tree not loaded');
      throw new Error('No files loaded. Open the repo in the main window first.');
    }
    const match = resolveRequests(requests, flat, { repoName: baseName(repo) });
    ctx.guard();
    const attention =
      match.missing.length + match.ambiguous.length + match.folders.length + match.blocked.length;
    if (attention) s.warn(2, match.resolved.length + ' found, ' + attention + ' need attention');
    else s.done(2, match.resolved.length + ' found');

    s.start(3);
    let contents = '';
    let kept = [];
    const blocked = match.blocked.map((b) => b.request + ' (' + b.reason + ')');
    const repeats = [];
    if (match.resolved.length) {
      contents = await readFilesText(repo, match.resolved.map((r) => r.path), 'files.txt');
      ctx.guard();
      const present = headersIn(contents);
      for (const r of match.resolved) {
        if (present.has(relativeTo(repo, r.path).toLowerCase())) kept.push(r);
        else blocked.push(r.request + ' (excluded by .docignore)');
      }
      for (const r of kept) {
        if (session.sent.has(r.display)) repeats.push(r.display + ' (round ' + session.sent.get(r.display) + ')');
        session.sent.set(r.display, session.round);
      }
    }
    s.done(3, kept.length + ' file(s)');

    s.start(4);
    const replyText = buildFilesReply({
      contents,
      missing: match.missing,
      ambiguous: match.ambiguous,
      folders: match.folders,
      blocked,
      repeats,
    });
    s.done(4, formatChars(replyText.length));

    const lines = [];
    lines.push({
      tone: kept.length ? 'ok' : 'warn',
      text: 'Prepared ' + kept.length + ' of ' + requests.length + ' file(s) (' + formatChars(replyText.length) + ').',
    });
    for (const m of match.missing) {
      const hint = m.suggestions.length ? ' (did you mean ' + m.suggestions.join(' or ') + '?)' : '';
      lines.push({ tone: 'warn', text: 'Not found: ' + m.request + hint });
    }
    for (const a of match.ambiguous) {
      lines.push({ tone: 'warn', text: 'Ambiguous: ' + a.request + ' -> ' + a.candidates.join(', ') });
    }
    for (const f of match.folders) {
      lines.push({ tone: 'warn', text: 'Folder, not a file: ' + f.request + ' (' + f.total + ' files inside)' });
    }
    for (const b of blocked) lines.push({ tone: 'warn', text: 'Blocked: ' + b });
    if (repeats.length) lines.push({ tone: 'info', text: 'Re-sent: ' + repeats.join(', ') });
    if (requests.length > WARN_PATH_COUNT) {
      lines.push({ tone: 'warn', text: 'Claude asked for ' + requests.length + ' files, which is a lot.' });
    }
    if (replyText.length > WARN_REPLY_CHARS) {
      lines.push({
        tone: 'warn',
        text: 'Large reply. It may not fit in one chat message; consider asking Claude for fewer files.',
      });
    }
    const hasWarn = lines.some((l) => l.tone === 'warn');
    return {
      status: hasWarn || !kept.length ? 'warning' : 'ready',
      title: 'File contents',
      lines,
      replyText,
    };
  }

  // -------------------------------------------------------------------------
  // output-results
  // -------------------------------------------------------------------------
  async function outputResults(ctx) {
    const { parsed } = ctx;
    const repo = requireRepo();
    const s = ctx.begin([
      'Marker detected',
      'Extracting code blocks',
      'Parsing blocks',
      'Dry run against your files',
      'Checking results',
    ]);
    s.done(0, parsed.implied ? 'implied by blocks' : MARKERS.OUTPUT_RESULTS);

    s.start(1);
    const container = parsed.container;
    if (!container) {
      s.fail(1, 'no <<<START blocks');
      const legacy = /^\s*(`{3,}|~{3,})/m.test(parsed.rest);
      return {
        status: 'error',
        title: 'No code blocks found',
        lines: [
          { tone: 'error', text: 'No <<<START / <<<END blocks in the reply, so the Global Seeder format was not followed.' },
        ],
        replyText: buildFixReply({ noBlocks: true }),
        seederText: legacy ? parsed.rest : '',
        legacy,
      };
    }
    if (container.missingEnd) s.warn(1, container.blocks + ' block(s), missing <<<END');
    else s.done(1, container.blocks + ' block(s)');

    s.start(2);
    const entries = deps.parseContentBlocks(container.text);
    ctx.guard();
    if (!entries || !entries.length) {
      s.fail(2, 'no usable entries');
      return {
        status: 'error',
        title: 'No usable file entries',
        lines: [{ tone: 'error', text: 'The blocks had no readable path lines above <<<START.' }],
        replyText: buildFixReply({ noBlocks: true }),
        seederText: container.text,
      };
    }
    s.done(2, entries.length + ' entr' + (entries.length === 1 ? 'y' : 'ies'));

    s.start(3);
    const preview = await deps.previewContent(repo, entries);
    ctx.guard();
    if (!preview || preview.error) {
      const why = (preview && preview.error) || 'no response';
      s.fail(3, why);
      throw new Error('Dry run failed: ' + why);
    }
    s.done(3, (preview.details || []).length + ' checked');

    s.start(4);
    const details = preview.details || [];
    const issues = [];
    const notes = [];
    const okPaths = [];
    const attach = [];
    const stats = { create: 0, overwrite: 0, patch: 0 };

    for (const d of details) {
      const surgical = !!(d.mode && d.mode !== 'full' && d.mode !== 'partial');
      const label = d.resolved || d.original;
      const warning = d.warning ? String(d.warning) : '';
      let bad = false;

      if (surgical) stats.patch += 1;
      else if (d.exists) stats.overwrite += 1;
      else stats.create += 1;

      if (d.invalid) {
        issues.push({ path: label, kind: 'syntax', reason: warning || 'invalid syntax' });
        bad = true;
      } else if (d.parseWarning) {
        issues.push({ path: label, kind: 'format', reason: d.parseWarning });
        bad = true;
      } else if (warning) {
        const kind = /syntax error/.test(warning) ? 'syntax' : surgical ? 'patch' : 'truncated';
        issues.push({ path: label, kind, reason: warning });
        bad = true;
        if (surgical && d.exists && kind === 'patch') attach.push(label);
      }

      if (!bad) okPaths.push(label);
      if (d.ambiguous && d.candidates && d.candidates.length > 2) {
        notes.push(label + ': ' + (d.candidates.length - 1) + ' possible target folders, check the target in the Global Seeder.');
      }
      if (d.repairs && d.repairs.length) notes.push(label + ': auto-fixed (' + d.repairs.join(', ') + ').');
    }

    let replyText = '';
    if (issues.length) {
      let currentFiles = '';
      const abs = [...new Set(attach)].slice(0, MAX_ATTACH_FILES).map((p) => trimTail(repo) + '/' + p);
      if (abs.length) {
        currentFiles = await readFilesText(repo, abs, 'current.txt');
        ctx.guard();
      }
      replyText = buildFixReply({ issues, okPaths, currentFiles });
    }
    s.done(4, issues.length ? issues.length + ' problem(s)' : 'all clear');

    const lines = [
      {
        tone: issues.length ? 'warn' : 'ok',
        text: '+' + stats.create + ' new | ~' + stats.overwrite + ' overwrite | ' + stats.patch + ' patch',
      },
    ];
    for (const it of issues) lines.push({ tone: 'error', text: it.path + ' - ' + it.reason });
    for (const n of notes) lines.push({ tone: 'info', text: n });
    if (container.missingEnd) lines.push({ tone: 'warn', text: 'A block has no <<<END, so it may be truncated.' });
    if (container.headerless) lines.push({ tone: 'warn', text: container.headerless + ' block(s) without a path line.' });
    if (parsed.finalStatus) {
      const done = parsed.finalStatus.marker === MARKERS.DONE;
      lines.push({
        tone: done ? 'ok' : 'warn',
        text: done ? 'Claude says: done, ready for review.' : 'Claude says: human review needed.',
      });
      if (parsed.finalStatus.note) {
        for (const n of parsed.finalStatus.note.split('\n').slice(0, 12)) {
          if (n.trim()) lines.push({ tone: 'info', text: n });
        }
      }
    }

    const status = issues.length ? (okPaths.length ? 'warning' : 'error') : 'ready';
    return {
      status,
      title: issues.length ? issues.length + ' problem(s) in the dry run' : 'Dry run OK: ' + details.length + ' file(s)',
      lines,
      replyText,
      seederText: container.text,
      issues,
      finalStatus: parsed.finalStatus || null,
    };
  }

  // -------------------------------------------------------------------------
  // human-review-needed / done-ready-review
  // -------------------------------------------------------------------------
  function statusOnly(ctx) {
    const done = ctx.parsed.marker === MARKERS.DONE;
    const s = ctx.begin(['Marker detected']);
    s.done(0, ctx.parsed.marker);
    const lines = [];
    for (const n of (ctx.parsed.notes || '').split('\n').slice(0, 15)) {
      if (n.trim()) lines.push({ tone: 'info', text: n });
    }
    return {
      status: done ? 'done' : 'review',
      title: done ? 'Done, ready for your review' : 'Human review needed',
      lines,
    };
  }

  // -------------------------------------------------------------------------
  // entry point
  // -------------------------------------------------------------------------
  async function handleReply(text, opts = {}) {
    const onStep = opts.onStep || (() => {});
    const isCancelled = opts.isCancelled || (() => false);

    const parsed = parseReply(text);
    if (!parsed) {
      return makeResult({
        status: 'unknown',
        title: 'No marker found',
        lines: [
          {
            tone: 'info',
            text: 'Expected ^|provide-codebase|^, ^|send-file-contents|^, ^|output-results|^, ^|human-review-needed|^ or ^|done-ready-review|^ on the first line.',
          },
          { tone: 'warn', text: previewText(text) },
        ],
      });
    }

    const ctx = {
      parsed,
      stepper: null,
      begin(labels) {
        ctx.stepper = createStepper(labels, onStep);
        return ctx.stepper;
      },
      guard() {
        if (isCancelled()) throw new CancelledError();
      },
    };

    session.round += 1;
    try {
      let res;
      switch (parsed.marker) {
        case MARKERS.PROVIDE_CODEBASE:
          res = await provideCodebase(ctx);
          break;
        case MARKERS.SEND_FILE_CONTENTS:
          res = await sendFileContents(ctx);
          break;
        case MARKERS.OUTPUT_RESULTS:
          res = await outputResults(ctx);
          break;
        default:
          res = statusOnly(ctx);
      }
      const extra = [];
      if (parsed.implied) {
        extra.push({ tone: 'info', text: 'No marker line found; treated as output-results because it has <<<START blocks.' });
      } else if (parsed.offFirstLine) {
        extra.push({ tone: 'info', text: 'The marker was not on the first line (accepted).' });
      }
      return makeResult({ ...res, marker: parsed.marker, lines: [...(res.lines || []), ...extra] }, ctx.stepper);
    } catch (err) {
      if (err instanceof CancelledError) {
        session.round = Math.max(0, session.round - 1);
        return makeResult({ marker: parsed.marker, status: 'cancelled', title: 'Cancelled' }, ctx.stepper);
      }
      const message = (err && err.message) || String(err);
      if (ctx.stepper) ctx.stepper.failActive(message);
      return makeResult(
        {
          marker: parsed.marker,
          status: 'error',
          title: 'Helper failed',
          lines: [{ tone: 'error', text: message }],
        },
        ctx.stepper
      );
    }
  }

  return { handleReply, getSession, resetSession };
}