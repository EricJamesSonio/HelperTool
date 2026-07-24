'use strict';

const { MAX_EVENTS_PER_SESSION, SESSION_TTL_MS, log } = require('./constants');

function createRingBuffer(capacity) {
  const cap = capacity || MAX_EVENTS_PER_SESSION;
  const buf = new Array(cap);
  let head = 0;
  let count = 0;
  let dropped = 0;

  function push(event) {
    buf[head] = event;
    head = (head + 1) % cap;
    if (count < cap) {
      count++;
    } else {
      dropped++;
    }
  }

  function getRange(start, limit) {
    if (count === 0 || start >= count) return [];
    const actualStart = Math.max(0, start);
    const end = Math.min(count, actualStart + (limit || count));
    const result = [];
    const tail = head - count;
    for (let i = actualStart; i < end; i++) {
      const idx = (tail + i + cap) % cap;
      result.push(buf[idx]);
    }
    return result;
  }

  function getAll() {
    return getRange(0, count);
  }

  function getLast(n) {
    return getRange(Math.max(0, count - n), n);
  }

  function size() {
    return count;
  }

  function getDropped() {
    return dropped;
  }

  function removeRange(start, n) {
    if (start < 0 || n <= 0 || start >= count) return 0;
    const actualEnd = Math.min(count, start + n);
    const removed = actualEnd - start;
    count -= removed;
    return removed;
  }

  function clear() {
    head = 0;
    count = 0;
    dropped = 0;
  }

  function forEach(fn) {
    const tail = head - count;
    for (let i = 0; i < count; i++) {
      const idx = (tail + i + cap) % cap;
      fn(buf[idx], i);
    }
  }

  return { push, getRange, getAll, getLast, size, getDropped, removeRange, clear, forEach };
}

function createTTLBuffer(capacity, ttlMs) {
  const cap = capacity || MAX_EVENTS_PER_SESSION;
  const ttl = ttlMs || SESSION_TTL_MS;
  const buf = createRingBuffer(cap);
  let created = Date.now();

  function isExpired() {
    return Date.now() - created > ttl;
  }

  function resetTTL() {
    created = Date.now();
  }

  function push(event) {
    const evt = Object.assign({ _ts: Date.now() }, event);
    buf.push(evt);
  }

  function getValid() {
    if (isExpired()) {
      log('TTL buffer expired after', ttl, 'ms');
      buf.clear();
      return [];
    }
    return buf.getAll();
  }

  return {
    push,
    getRange: buf.getRange,
    getAll: buf.getAll,
    getLast: buf.getLast,
    getValid,
    size: buf.size,
    getDropped: buf.getDropped,
    removeRange: buf.removeRange,
    clear() { buf.clear(); created = Date.now(); },
    forEach: buf.forEach,
    isExpired,
    resetTTL,
  };
}

module.exports = { createRingBuffer, createTTLBuffer };
