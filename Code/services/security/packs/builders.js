'use strict';

const { grep } = require('../fileScanner');
const { pass, fail } = require('../result');

function base(def) {
  return {
    id: def.id,
    title: def.title,
    category: def.category,
    level: def.level,
    severity: def.severity,
    kind: 'static',
    owasp: def.owasp || '',
    applies: def.applies || null,
  };
}

function summarize(hits, def) {
  return hits.length + ' place' + (hits.length === 1 ? '' : 's') + ' found. ' + (def.failText || '');
}

function lineCheck(def) {
  return Object.assign(base(def), {
    run(ctx) {
      const hits = grep(ctx.files, def.re, { filter: def.filter, fileRe: def.fileRe });
      if (!hits.length) return pass(def.okText);
      return fail(summarize(hits, def), def.fix, hits.slice(0, 25));
    },
  });
}

function windowCheck(def) {
  const span = def.span || 4;
  const whenPresent = def.report === 'whenPresent';
  return Object.assign(base(def), {
    run(ctx) {
      const hits = grep(ctx.files, def.start, {
        fileRe: def.fileRe,
        filter: (line, lines, i) => {
          const found = def.test.test(lines.slice(i, i + span).join('\n'));
          return whenPresent ? found : !found;
        },
      });
      if (!hits.length) return pass(def.okText);
      return fail(summarize(hits, def), def.fix, hits.slice(0, 25));
    },
  });
}

module.exports = { lineCheck, windowCheck };