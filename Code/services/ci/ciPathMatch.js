'use strict';

const MAX_PATTERN_CHARS = 300;
const MAX_WILDCARDS = 8;
const MAX_CACHE = 500;
const cache = new Map();

function literal(ch) {
  return ch.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function build(pattern) {
  const atoms = [];
  let wild = 0;
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern.charAt(i);

    if (ch === '*') {
      wild += 1;
      if (pattern.charAt(i + 1) === '*') {
        if (pattern.charAt(i + 2) === '/') {
          atoms.push({ src: '(?:.*/)?', quantified: true });
          i += 3;
        } else {
          atoms.push({ src: '.*', quantified: true });
          i += 2;
        }
      } else {
        atoms.push({ src: '[^/]*', quantified: true });
        i += 1;
      }
      continue;
    }

    if (ch === '?' || ch === '+') {
      const last = atoms[atoms.length - 1];
      if (!last) {
        atoms.push({ src: literal(ch), quantified: false });
      } else if (!last.quantified) {
        last.src = '(?:' + last.src + ')' + ch;
        last.quantified = true;
      }
      i += 1;
      continue;
    }

    if (ch === '[') {
      const close = pattern.indexOf(']', i + 2);
      if (close > i + 1) {
        const body = pattern.slice(i + 1, close).replace(/[\\[\]^]/g, '\\$&');
        atoms.push({ src: '[' + body + ']', quantified: false });
        i = close + 1;
        continue;
      }
      atoms.push({ src: literal(ch), quantified: false });
      i += 1;
      continue;
    }

    if (ch === '\\') {
      const next = pattern.charAt(i + 1);
      if (next) {
        atoms.push({ src: literal(next), quantified: false });
        i += 2;
      } else {
        atoms.push({ src: '\\\\', quantified: false });
        i += 1;
      }
      continue;
    }

    atoms.push({ src: literal(ch), quantified: false });
    i += 1;
  }

  if (wild > MAX_WILDCARDS) return null;

  try {
    return new RegExp('^' + atoms.map((a) => a.src).join('') + '$', 's');
  } catch (e) {
    return null;
  }
}

function compile(pattern) {
  if (typeof pattern !== 'string' || !pattern || pattern.length > MAX_PATTERN_CHARS) return null;
  if (cache.has(pattern)) return cache.get(pattern);
  if (cache.size >= MAX_CACHE) cache.clear();
  const regex = build(pattern);
  cache.set(pattern, regex);
  return regex;
}

function matches(pattern, file) {
  const regex = compile(pattern);
  return regex ? regex.test(String(file)) : false;
}

function isValid(pattern) {
  return compile(pattern) !== null;
}

function outcome(kind, matched, warning) {
  return { outcome: kind, matched: matched || [], warning: warning || '' };
}

function compileList(patterns) {
  return patterns.map((pattern) => {
    const negated = pattern.startsWith('!');
    const body = negated ? pattern.slice(1) : pattern;
    return { pattern, negated, regex: body ? compile(body) : null };
  });
}

function textList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item);
}

function evaluatePathFilter(files, filter) {
  const list = Array.isArray(files) ? files : [];
  const paths = textList(filter && filter.paths);
  const ignore = textList(filter && filter.pathsIgnore);

  if (!paths.length && !ignore.length) return outcome('unfiltered');
  if (paths.length && ignore.length) {
    return outcome('unknown', [], 'Both paths and paths-ignore are set, which GitHub does not allow, so every changed file counts.');
  }

  const compiled = compileList(paths.length ? paths : ignore);
  const broken = compiled.find((c) => !c.regex);
  if (broken) {
    return outcome('unknown', [], 'The pattern "' + broken.pattern + '" is not supported by the local matcher, so every changed file counts.');
  }
  if (!paths.length && compiled.some((c) => c.negated)) {
    return outcome('unknown', [], 'paths-ignore does not support "!" patterns, so every changed file counts.');
  }

  if (paths.length) {
    const matched = list.filter((file) => {
      let included = false;
      for (const c of compiled) {
        if (c.regex.test(file)) included = !c.negated;
      }
      return included;
    });
    return outcome(matched.length ? 'matched' : 'ignored', matched);
  }

  const kept = list.filter((file) => !compiled.some((c) => c.regex.test(file)));
  return outcome(kept.length ? 'matched' : 'ignored', kept);
}

module.exports = { matches, isValid, evaluatePathFilter };