import { h, fmtDate, statusLabel } from './state.js';

const MAX_SHOWN = 20;

function location(e) {
  if (!e.file) return '';
  return e.file + (e.line ? ':' + e.line + (e.col ? ':' + e.col : '') : '');
}

function errorLine(e) {
  const where = location(e);
  const message = String(e.message || '').split(/\r?\n/)[0].slice(0, 200);
  return h(
    'div',
    { class: 'rc-err' },
    h(
      'div',
      { class: 'rc-err-head' },
      h('span', { class: 'rc-chip ' + (e.level === 'warning' ? 'skipped' : 'failed'), text: e.level }),
      h('b', { class: 'rc-err-title', text: e.title }),
      where ? h('span', { class: 'rc-where rc-mono', text: where }) : null
    ),
    message ? h('div', { class: 'rc-where', text: message }) : null
  );
}

function errorGroup(title, list) {
  if (!list.length) return null;
  const shown = list.slice(0, MAX_SHOWN);
  return h(
    'div',
    null,
    h('div', { class: 'rc-group-title', text: title + ' (' + list.length + ')' }),
    ...shown.map(errorLine),
    list.length > shown.length ? h('div', { class: 'rc-where', text: 'And ' + (list.length - shown.length) + ' more.' }) : null
  );
}

export function compareBlock(compare) {
  if (!compare) return null;
  if (!compare.previous) {
    return h('div', { class: 'rc-where', text: 'No earlier finished run of this workflow to compare with.' });
  }

  const previous = compare.previous;
  const newErrors = compare.newErrors || [];
  const fixedErrors = compare.fixedErrors || [];
  const stepChanges = compare.stepChanges || [];

  const chips = h(
    'div',
    { class: 'rc-row' },
    h('span', { class: 'rc-chip ' + (newErrors.length ? 'failed' : 'done'), text: 'New: ' + newErrors.length }),
    h('span', { class: 'rc-chip ' + (fixedErrors.length ? 'done' : 'skipped'), text: 'Fixed: ' + fixedErrors.length }),
    h('span', { class: 'rc-chip skipped', text: 'Still failing: ' + (compare.persisting || 0) })
  );

  return h(
    'div',
    null,
    h('h4', { text: 'Compared with the previous run' }),
    h('div', { class: 'rc-where', text: statusLabel(previous.status) + ' / ' + fmtDate(previous.startedAt) }),
    chips,
    stepChanges.length
      ? h(
          'div',
          null,
          h('div', { class: 'rc-group-title', text: 'Step results that changed' }),
          ...stepChanges.map((c) => h('div', { class: 'rc-where', text: c.title + ': ' + statusLabel(c.from) + ' to ' + statusLabel(c.to) }))
        )
      : null,
    errorGroup('New errors', newErrors),
    errorGroup('Fixed errors', fixedErrors)
  );
}