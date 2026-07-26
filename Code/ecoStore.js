'use strict';

var MAX = 200;

var _buffers = {
  consoleLogs: [],
  apiCalls: [],
  terminalErrors: [],
  browserErrors: [],
};

var _seq = 0;

function push(type, event) {
  var buf = _buffers[type];
  if (!buf) return;
  _seq++;
  event.seq = _seq;
  buf.push(event);
  if (buf.length > MAX) buf.shift();
}

function feed(type, cursor) {
  var buf = _buffers[type];
  if (!buf || buf.length === 0) return { events: [], cursor: null, hasMore: false, total: 0 };

  var total = buf.length;

  if (cursor == null) {
    var events = buf.slice(-20);
    var newCursor = events.length > 0 ? events[0].seq : null;
    var hasMore = newCursor !== null && buf[0].seq < newCursor;
    return { events: events, cursor: newCursor, hasMore: hasMore, total: total };
  }

  var idx = buf.findIndex(function (e) { return e.seq === cursor; });
  if (idx <= 0) return { events: [], cursor: null, hasMore: false, total: total };

  var start = Math.max(0, idx - 20);
  var events = buf.slice(start, idx);
  var newCursor = events.length > 0 ? events[0].seq : null;
  var hasMore = newCursor !== null && buf[0].seq < newCursor;
  return { events: events, cursor: newCursor, hasMore: hasMore, total: total };
}

function clear(type) {
  if (type) {
    _buffers[type] = [];
  } else {
    for (var k in _buffers) _buffers[k] = [];
  }
}

module.exports = { push: push, feed: feed, clear: clear };
