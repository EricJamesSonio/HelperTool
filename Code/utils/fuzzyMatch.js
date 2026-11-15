'use strict';

const SEPARATORS = '/\\._- ';
const MAX_TARGET = 300;
const NEG = -1e9;

const MATCH = 16;
const BOUNDARY = 10;
const CONSECUTIVE = 8;
const FIRST_CHAR = 8;
const GAP_START = 3;
const GAP_EXTEND = 1;
const LEAD_PENALTY = 1;
const LEAD_PENALTY_MAX = 6;

const BASE_MIN = 0.25;
const PATH_MIN = 0.4;
const TYPO_BASE = 84;
const SEGMENT_PENALTY = 8;
const MIN_SEGMENT = 3;

function isUpper(code) {
  return code >= 65 && code <= 90;
}

function isLower(code) {
  return code >= 97 && code <= 122;
}

function isDigit(code) {
  return code >= 48 && code <= 57;
}

function isBoundaryAt(text, i) {
  if (i <= 0) return true;
  const prev = text.charCodeAt(i - 1);
  const cur = text.charCodeAt(i);
  if (SEPARATORS.indexOf(text[i - 1]) !== -1) return true;
  if (isLower(prev) && isUpper(cur)) return true;
  return !isDigit(prev) && isDigit(cur);
}

function tolFor(length) {
  if (length < 4) return 0;
  if (length < 8) return 1;
  if (length < 13) return 2;
  return 3;
}

function editDistance(a, b, max) {
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  let prev2 = null;
  let prev = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      const swapped = i > 1 && j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1);
      if (swapped) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[bl];
}

function isSubsequence(q, t) {
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function mergeMarks(marks) {
  const sorted = marks.slice().sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  const out = [];
  for (const m of sorted) {
    const last = out[out.length - 1];
    if (last && m[0] <= last[1]) {
      if (m[1] > last[1]) last[1] = m[1];
    } else {
      out.push([m[0], m[1]]);
    }
  }
  return out;
}

function marksFromPositions(positions) {
  const marks = [];
  for (const p of positions) {
    const last = marks[marks.length - 1];
    if (last && last[1] === p) last[1] = p + 1;
    else marks.push([p, p + 1]);
  }
  return marks;
}

function baseMarks(marks, baseStart) {
  const out = [];
  for (const m of marks) {
    if (m[1] <= baseStart) continue;
    out.push([Math.max(m[0], baseStart) - baseStart, m[1] - baseStart]);
  }
  return out;
}

function fuzzyAlign(q, orig) {
  const m = q.length;
  const n = orig.length;
  if (!m || n < m || n > MAX_TARGET) return null;
  const t = orig.toLowerCase();
  if (!isSubsequence(q, t)) return null;

  const bonus = new Array(n);
  for (let j = 0; j < n; j++) {
    bonus[j] = MATCH + (isBoundaryAt(orig, j) ? BOUNDARY : 0);
  }

  let prev = new Array(n).fill(NEG);
  for (let j = 0; j < n; j++) {
    if (t[j] !== q[0]) continue;
    prev[j] = bonus[j] + (j === 0 ? FIRST_CHAR : 0) - Math.min(j * LEAD_PENALTY, LEAD_PENALTY_MAX);
  }
  const parents = [null];

  for (let i = 1; i < m; i++) {
    const cur = new Array(n).fill(NEG);
    const par = new Int32Array(n).fill(-1);
    let gap = NEG;
    let gapFrom = -1;
    for (let j = 0; j < n; j++) {
      if (j >= 2) {
        gap -= GAP_EXTEND;
        const cand = prev[j - 2] - GAP_START;
        if (cand > gap) {
          gap = cand;
          gapFrom = j - 2;
        }
      }
      if (t[j] !== q[i]) continue;
      let best = NEG;
      let from = -1;
      if (j >= 1 && prev[j - 1] > NEG / 2) {
        best = prev[j - 1] + CONSECUTIVE;
        from = j - 1;
      }
      if (gap > NEG / 2 && gap > best) {
        best = gap;
        from = gapFrom;
      }
      if (from === -1) continue;
      cur[j] = best + bonus[j];
      par[j] = from;
    }
    parents.push(par);
    prev = cur;
  }

  let bestScore = NEG;
  let bestEnd = -1;
  for (let j = 0; j < n; j++) {
    if (prev[j] > bestScore) {
      bestScore = prev[j];
      bestEnd = j;
    }
  }
  if (bestEnd === -1 || bestScore <= NEG / 2) return null;

  const positions = new Array(m);
  let at = bestEnd;
  for (let i = m - 1; i >= 0; i--) {
    positions[i] = at;
    if (i > 0) at = parents[i][at];
  }
  const maxRaw = m * (MATCH + BOUNDARY + CONSECUTIVE) + FIRST_CHAR;
  return { raw: bestScore, maxRaw, marks: marksFromPositions(positions) };
}

function segmentsOf(orig) {
  const out = [];
  let start = -1;
  for (let i = 0; i <= orig.length; i++) {
    const isEnd = i === orig.length;
    const isSep = isEnd || SEPARATORS.indexOf(orig[i]) !== -1;
    if (isSep) {
      if (start !== -1) {
        out.push({ text: orig.slice(start, i).toLowerCase(), start });
        start = -1;
      }
      continue;
    }
    if (start === -1) {
      start = i;
      continue;
    }
    if (isBoundaryAt(orig, i)) {
      out.push({ text: orig.slice(start, i).toLowerCase(), start });
      start = i;
    }
  }
  return out;
}

function typoOnName(token, baseOrig) {
  const tol = tolFor(token.length);
  if (!tol) return null;
  const lower = baseOrig.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const stemLen = dot > 0 ? dot : lower.length;
  const stem = lower.slice(0, stemLen);
  const cands = [{ text: stem, start: 0, penalty: 0 }];
  for (const seg of segmentsOf(baseOrig.slice(0, stemLen))) {
    if (seg.text.length >= MIN_SEGMENT && seg.text !== stem) {
      cands.push({ text: seg.text, start: seg.start, penalty: SEGMENT_PENALTY });
    }
  }
  let best = null;
  for (const c of cands) {
    if (Math.abs(c.text.length - token.length) > tol) continue;
    const d = editDistance(c.text, token, tol);
    if (d > tol) continue;
    const score = TYPO_BASE * (1 - d / Math.max(c.text.length, token.length)) - c.penalty;
    if (!best || score > best.score) {
      best = { score, marks: [[c.start, c.start + c.text.length]], approx: true };
    }
  }
  return best;
}

function exactScore(token, base, baseOrig, bi) {
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  let score = 100;
  if (base === token || stem === token) score = 130;
  else if (bi === 0) score = 115;
  else if (isBoundaryAt(baseOrig, bi)) score = 106;
  return score;
}

function scoreToken(token, rel, rl, baseStart) {
  const base = rl.slice(baseStart);
  const baseOrig = rel.slice(baseStart);
  const bi = base.indexOf(token);
  if (bi !== -1) {
    return {
      score: exactScore(token, base, baseOrig, bi),
      marks: [[bi, bi + token.length]],
      approx: false,
    };
  }
  if (rl.indexOf(token) !== -1) return { score: 80, marks: [], approx: false };

  let best = typoOnName(token, baseOrig);

  const onBase = fuzzyAlign(token, baseOrig);
  if (onBase) {
    const n = Math.min(1, onBase.raw / onBase.maxRaw);
    if (n >= BASE_MIN) {
      const cand = { score: 20 + 38 * n, marks: onBase.marks, approx: true };
      if (!best || cand.score > best.score) best = cand;
    }
  }

  if (!best && token.length >= 3) {
    const onPath = fuzzyAlign(token, rel);
    if (onPath) {
      const n = Math.min(1, onPath.raw / onPath.maxRaw);
      if (n >= PATH_MIN) {
        best = { score: 12 + 30 * n, marks: baseMarks(onPath.marks, baseStart), approx: true };
      }
    }
  }
  return best;
}

function countSlashes(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '/') n++;
  }
  return n;
}

function scorePath(rel, tokens) {
  if (!tokens || !tokens.length) return null;
  const rl = rel.toLowerCase();
  const baseStart = rl.lastIndexOf('/') + 1;
  let total = 0;
  let approx = false;
  let marks = [];
  for (const token of tokens) {
    const r = scoreToken(token, rel, rl, baseStart);
    if (!r) return null;
    total += r.score;
    if (r.approx) approx = true;
    marks = marks.concat(r.marks);
  }
  const score = total / tokens.length -
    Math.min(20, rel.length / 40) -
    Math.min(10, countSlashes(rel) * 1.5);
  return { score, marks: mergeMarks(marks), approx };
}

function nearWord(q, word) {
  const tol = tolFor(q.length);
  const lw = word.toLowerCase();
  if (tol && Math.abs(lw.length - q.length) <= tol) {
    const d = editDistance(lw, q, tol);
    if (d <= tol) return { score: 62 - d * 8, off: 0, len: word.length, kind: 'near' };
  }
  if (tol) {
    let best = null;
    for (const seg of segmentsOf(word)) {
      if (seg.text.length < MIN_SEGMENT || seg.text === lw) continue;
      if (Math.abs(seg.text.length - q.length) > tol) continue;
      const d = editDistance(seg.text, q, tol);
      if (d > tol) continue;
      const score = 56 - d * 8;
      if (!best || score > best.score) {
        best = { score, off: seg.start, len: seg.text.length, kind: 'near' };
      }
    }
    if (best) return best;
  }
  if (q.length >= 3 && lw.length > q.length && lw[0] === q[0] && isSubsequence(q, lw)) {
    return { score: 38 - Math.min(15, lw.length - q.length), off: 0, len: word.length, kind: 'fuzzy' };
  }
  return null;
}

module.exports = { scorePath, nearWord };