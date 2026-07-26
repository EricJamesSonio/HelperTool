'use strict';

const MAX = 1000;

const _buffers = {
  logs: [],
  network: [],
  console: [],
  errors: [],
};

let _seq = 0;

function push(type, event) {
  const buf = _buffers[type];
  if (!buf) return;
  _seq++;
  event.seq = _seq;
  buf.push(event);
  if (buf.length > MAX) buf.shift();
}

function feed(type, cursor) {
  const buf = _buffers[type];
  if (!buf || buf.length === 0) return { events: [], cursor: null, hasMore: false, total: 0 };

  const total = buf.length;

  if (cursor == null) {
    const events = buf.slice(-20);
    const newCursor = events.length > 0 ? events[0].seq : null;
    const hasMore = newCursor !== null && buf[0].seq < newCursor;
    return { events, cursor: newCursor, hasMore, total };
  }

  const idx = buf.findIndex(function (e) { return e.seq === cursor; });
  if (idx <= 0) return { events: [], cursor: null, hasMore: false, total };

  const start = Math.max(0, idx - 20);
  const events = buf.slice(start, idx);
  const newCursor = events.length > 0 ? events[0].seq : null;
  const hasMore = newCursor !== null && buf[0].seq < newCursor;
  return { events, cursor: newCursor, hasMore, total };
}

function clear(type) {
  if (type) {
    _buffers[type] = [];
  } else {
    for (const k of Object.keys(_buffers)) _buffers[k] = [];
  }
}

module.exports = { push, feed, clear };
