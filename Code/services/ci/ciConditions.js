'use strict';

const EXPRESSION_RE = /\$\{\{([\s\S]*?)\}\}/g;
const KNOWN_EXPRESSION_RE = /^(?:(?:env|secrets)\.[A-Za-z_][A-Za-z0-9_]*|github\.(?:workspace|sha))$/;
const SIMPLE_CONDITION_RE = /^(?:success\(\)|always\(\)|failure\(\)|cancelled\(\)|true|false)$/;

function analyzeCondition(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return { result: 'run', review: false };

  const normalized = text.replace(/^\$\{\{\s*|\s*\}\}$/g, '').trim();
  if (!SIMPLE_CONDITION_RE.test(normalized)) {
    return { result: 'review', review: true };
  }

  if (normalized === 'false') return { result: 'skip', review: false };
  if (normalized === 'failure()' || normalized === 'cancelled()') {
    return { result: 'runtime', review: false };
  }

  return { result: 'run', review: false };
}

function analyzeExpressions(value) {
  const envNames = new Set();
  const secretNames = new Set();
  const unknown = [];

  for (const match of String(value || '').matchAll(EXPRESSION_RE)) {
    const expression = match[1].trim();
    if (!KNOWN_EXPRESSION_RE.test(expression)) {
      if (!unknown.includes(expression)) unknown.push(expression);
      continue;
    }
    if (expression.startsWith('env.')) envNames.add(expression.slice(4));
    if (expression.startsWith('secrets.')) secretNames.add(expression.slice(8));
  }

  return {
    envNames: [...envNames],
    secretNames: [...secretNames],
    unknown,
    review: unknown.length > 0,
  };
}

module.exports = { analyzeCondition, analyzeExpressions };