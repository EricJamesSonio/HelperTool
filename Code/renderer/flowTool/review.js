const MAX_CELLS = 4000000;
const CONTEXT = 3;

function splitLines(text) {
  const s = String(text == null ? '' : text);
  if (s === '') return [];
  const lines = s.replace(/\r\n/g, '\n').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function diffLines(a, b) {
  const x = splitLines(a);
  const y = splitLines(b);
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start += 1;
  let endX = x.length;
  let endY = y.length;
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX -= 1;
    endY -= 1;
  }
  const head = x.slice(0, start).map((text) => ({ t: ' ', text }));
  const tail = x.slice(endX).map((text) => ({ t: ' ', text }));
  const mx = x.slice(start, endX);
  const my = y.slice(start, endY);
  let mid = [];
  if (mx.length * my.length > MAX_CELLS) {
    mid = mx.map((text) => ({ t: '-', text })).concat(my.map((text) => ({ t: '+', text })));
  } else if (mx.length === 0) {
    mid = my.map((text) => ({ t: '+', text }));
  } else if (my.length === 0) {
    mid = mx.map((text) => ({ t: '-', text }));
  } else {
    const n = mx.length;
    const m = my.length;
    const w = m + 1;
    const table = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        if (mx[i] === my[j]) {
          table[i * w + j] = table[(i + 1) * w + j + 1] + 1;
        } else {
          const down = table[(i + 1) * w + j];
          const right = table[i * w + j + 1];
          table[i * w + j] = down >= right ? down : right;
        }
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (mx[i] === my[j]) {
        mid.push({ t: ' ', text: mx[i] });
        i += 1;
        j += 1;
      } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) {
        mid.push({ t: '-', text: mx[i] });
        i += 1;
      } else {
        mid.push({ t: '+', text: my[j] });
        j += 1;
      }
    }
    while (i < n) {
      mid.push({ t: '-', text: mx[i] });
      i += 1;
    }
    while (j < m) {
      mid.push({ t: '+', text: my[j] });
      j += 1;
    }
  }
  const ops = head.concat(mid, tail);
  let ox = 0;
  let oy = 0;
  for (const op of ops) {
    if (op.t === ' ') {
      ox += 1;
      oy += 1;
      op.a = ox;
      op.b = oy;
    } else if (op.t === '-') {
      ox += 1;
      op.a = ox;
    } else {
      oy += 1;
      op.b = oy;
    }
  }
  return ops;
}

export function collapseDiff(ops, context = CONTEXT) {
  const keep = new Array(ops.length).fill(false);
  for (let i = 0; i < ops.length; i += 1) {
    if (ops[i].t !== ' ') {
      for (let k = Math.max(0, i - context); k <= Math.min(ops.length - 1, i + context); k += 1) keep[k] = true;
    }
  }
  const out = [];
  let hidden = 0;
  for (let i = 0; i < ops.length; i += 1) {
    if (keep[i]) {
      if (hidden) {
        out.push({ t: '...', text: hidden + ' unchanged line(s)' });
        hidden = 0;
      }
      out.push(ops[i]);
    } else {
      hidden += 1;
    }
  }
  if (hidden) out.push({ t: '...', text: hidden + ' unchanged line(s)' });
  return out;
}

export function diffStats(ops) {
  let add = 0;
  let del = 0;
  for (const op of ops) {
    if (op.t === '+') add += 1;
    else if (op.t === '-') del += 1;
  }
  return { add, del };
}

export function entryKind(e) {
  if (e.applied) return 'applied';
  if (e.invalid) return 'invalid';
  if (e.mode && e.mode !== 'full') return 'patch';
  return e.exists ? 'overwrite' : 'new';
}
export function isMulti(e) {
  return !!(e.ambiguous && e.candidates && e.candidates.length > 1);
}


export function candidateLabel(e, cand) {
  if (cand === '') return 'Root (repo root/' + String(e.relPath).split('/').pop() + ')';
  return cand;
}


export function candidateResolved(e, cand) {
  const rel = String(e.relPath);
  if (!rel.includes('/')) return cand === '' ? rel : cand;
  if (cand === '') return rel;
  const rest = rel.split('/').slice(1).join('/');
  return rest ? cand + '/' + rest : cand;
}


export function currentCandidate(e) {
  const list = e.candidates || [];
  const hit = list.find((c) => candidateResolved(e, c) === e.resolved);
  return hit === undefined ? null : hit;
}

export function isMulti(e) {
  return !!(e.ambiguous && e.candidates && e.candidates.length > 1);
}


export function candidateLabel(e, cand) {
  if (cand === '') return 'Root (repo root/' + String(e.relPath).split('/').pop() + ')';
  return cand;
}


export function candidateResolved(e, cand) {
  const rel = String(e.relPath);
  if (!rel.includes('/')) return cand === '' ? rel : cand;
  if (cand === '') return rel;
  const rest = rel.split('/').slice(1).join('/');
  return rest ? cand + '/' + rest : cand;
}


export function currentCandidate(e) {
  const list = e.candidates || [];
  const hit = list.find((c) => candidateResolved(e, c) === e.resolved);
  return hit === undefined ? null : hit;
}

export function isActive(e) {
  if (e.applied || e.skipped) return false;
  if (e.invalid && !e.allowInvalid) return false;
  return true;
}

export function toPayload(e) {
  return {
    relPath: e.relPath,
    content: e.content,
    resolved: e.resolved,
    mode: e.mode,
    target: e.target,
    allowInvalid: e.allowInvalid === true,
  };
}

function toWire(e) {
  return {
    relPath: e.relPath,
    content: e.content,
    resolved: e.resolved,
    candidates: e.candidates,
    ambiguous: e.ambiguous,
    mode: e.mode,
    target: e.target,
    repairs: e.repairs,
    invalid: e.invalid,
    allowInvalid: e.allowInvalid,
    skipped: e.skipped,
  };
}

export async function buildReview(basePath, seederText, api) {
  const parsed = api.parse(seederText) || [];
  if (!parsed.length) return { basePath, entries: [], error: 'No file blocks found in the reply.' };
  const preview = await api.previewContent(basePath, parsed);
  if (!preview || preview.error) {
    return { basePath, entries: [], error: (preview && preview.error) || 'Dry run failed.' };
  }
  const details = preview.details || [];
  const entries = parsed.map((p, i) => {
    const d = details[i] || {};
    const invalid = !!d.invalid;
    return {
      relPath: p.relPath,
      content: d.content != null ? d.content : p.content,
      resolved: d.resolved || p.relPath,
      candidates: d.candidates || [],
      ambiguous: !!d.ambiguous,
      mode: p.mode || 'full',
      target: p.target || null,
      repairs: d.repairs || [],
      invalid,
      allowInvalid: false,
      skipped: invalid,
      exists: !!d.exists,
      warning: d.warning || '',
      parseWarning: d.parseWarning || '',
      applied: false,
      diff: null,
      diffError: '',
      syntaxError: '',
      result: '',
    };
  });
  return { basePath, entries, error: '' };
}

export async function loadDiff(review, index, api) {
  const e = review.entries[index];
  if (!e || e.diff) return e;
  try {
    const res = await api.getPatchedPreview(review.basePath, e.resolved, review.entries.map(toWire));
    if (!res || res.error) {
      e.diffError = (res && res.error) || 'No preview available.';
      e.diff = [];
      return e;
    }
    const left = res.left == null ? '' : res.left;
    const right = res.right == null ? '' : res.right;
    e.syntaxError = res.syntaxError || '';
    e.exists = e.exists || left !== '';
    e.original = left;
    e.final = right;
    e.diff = diffLines(left, right);
    e.stats = diffStats(e.diff);
  } catch (err) {
    e.diffError = (err && err.message) || String(err);
    e.diff = [];
  }
  return e;
}

export function chooseCandidate(review, index, cand) {
  const e = review.entries[index];
  if (!e) return;
  e.resolved = candidateResolved(e, cand);
  e.diff = null;
  e.diffError = '';
}

export function summarize(review) {
  const counts = { new: 0, overwrite: 0, patch: 0, invalid: 0, applied: 0, skip: 0, multi: 0 };
  for (const e of review.entries) {
    const k = entryKind(e);
    if (k === 'applied') counts.applied += 1;
    else if (k === 'invalid') counts.invalid += 1;
    else if (!isActive(e)) counts.skip += 1;
    else counts[k] = (counts[k] || 0) + 1;
    if (isMulti(e) && !e.applied) counts.multi += 1;
  }
  return counts;
}

export async function applyReview(review, api) {
  const active = review.entries.filter(isActive);
  if (!active.length) return { error: 'Nothing selected to apply.' };
  const res = await api.seedContent(review.basePath, active.map(toPayload));
  if (!res || res.error) return { error: (res && res.error) || 'Seed failed.' };
  const failed = new Set((res.errors || []).map((x) => (x && (x.path || x.relPath || x.file)) || ''));
  for (const e of active) {
    const bad = failed.has(e.resolved) || failed.has(e.relPath);
    if (!bad) e.applied = true;
  }
  return {
    created: res.created || [],
    overwritten: res.overwritten || [],
    patched: res.patched || [],
    errors: res.errors || [],
    count: active.length,
  };
}