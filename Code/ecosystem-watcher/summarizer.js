'use strict';

const MAX_INPUT = 200;

function summarize(events) {
  if (!events || !events.length) {
    return { summary: 'No events to summarize.', keyEvents: [], metrics: {} };
  }

  const sample = events.slice(-MAX_INPUT);
  const levels = {};
  const types = {};
  const errors = [];
  const warnings = [];
  const timelines = [];

  for (let i = 0; i < sample.length; i++) {
    const e = sample[i];
    const lvl = e.level || 'info';
    const typ = e.type || 'unknown';
    levels[lvl] = (levels[lvl] || 0) + 1;
    types[typ] = (types[typ] || 0) + 1;

    if (lvl === 'error') {
      const msg = e.data && e.data.raw ? e.data.raw.slice(0, 150) : (e.data ? JSON.stringify(e.data).slice(0, 150) : '');
      errors.push({ message: msg, time: e.timestamp });
    }
    if (lvl === 'warn') {
      const msg = e.data && e.data.raw ? e.data.raw.slice(0, 120) : '';
      warnings.push({ message: msg, time: e.timestamp });
    }
    timelines.push({ type: typ, level: lvl, time: e.timestamp });
  }

  const keyEvents = [];
  for (let i = 0; i < Math.min(errors.length, 5); i++) {
    keyEvents.push('error:' + errors[i].message);
  }
  for (let i = 0; i < Math.min(warnings.length, 3); i++) {
    keyEvents.push('warn:' + warnings[i].message);
  }
  if (keyEvents.length === 0) {
    keyEvents.push('info:no issues detected');
  }

  let summary = '';
  if (errors.length > 0) {
    summary = errors.length + ' error(s) in last ' + sample.length + ' events. ';
    summary += 'Most recent: ' + errors[errors.length - 1].message;
  } else if (warnings.length > 0) {
    summary = warnings.length + ' warning(s) in last ' + sample.length + ' events. No errors.';
  } else {
    summary = 'No errors or warnings in last ' + sample.length + ' events.';
  }

  return {
    summary: summary,
    keyEvents: keyEvents,
    metrics: {
      sampled: sample.length,
      totalAvailable: events.length,
      byLevel: levels,
      byType: types,
      errorCount: errors.length,
      warnCount: warnings.length,
    },
    timeline: timelines.slice(-10),
  };
}

module.exports = { summarize };
