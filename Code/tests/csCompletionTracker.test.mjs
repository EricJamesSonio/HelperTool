import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { CompletionTracker, stripAnsi } = require('../ipc/csCompletionTracker.js');

function makeClock() {
  let now = 0;
  let seq = 0;
  let timers = [];
  return {
    now: () => now,
    setTimer: (fn, ms) => {
      const timer = { n: ++seq, at: now + Math.max(0, ms || 0), fn };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      timers = timers.filter((t) => t !== timer);
    },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const due = timers[0];
        if (!due || due.at > target) break;
        timers.shift();
        now = due.at;
        due.fn();
      }
      now = target;
    },
  };
}

function makeTracker(opts = {}) {
  const clock = makeClock();
  const calls = [];
  const tracker = new CompletionTracker({
    idleMs: 1000,
    minOutputChars: 0,
    minElapsedMs: 0,
    ...opts,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onDone: (info) => calls.push(info),
  });
  return { tracker, clock, calls };
}

test('notifies after the output goes idle', () => {
  const { tracker, clock, calls } = makeTracker();
  tracker.submit();
  tracker.data('done');
  clock.advance(999);
  assert.equal(calls.length, 0);
  clock.advance(1);
  assert.equal(calls.length, 1);
  assert.equal(tracker.busy, false);
});

test('a submit with no output never notifies', () => {
  const { tracker, clock, calls } = makeTracker();
  tracker.submit();
  clock.advance(60000);
  assert.equal(calls.length, 0);
});

test('new output resets the idle timer', () => {
  const { tracker, clock, calls } = makeTracker();
  tracker.submit();
  clock.advance(500);
  tracker.data('still working');
  clock.advance(999);
  assert.equal(calls.length, 0);
  clock.advance(1);
  assert.equal(calls.length, 1);
});

test('ignores output before a submit', () => {
  const { tracker, clock, calls } = makeTracker();
  tracker.data('background noise');
  clock.advance(5000);
  assert.equal(calls.length, 0);
});

test('notifies only once per submit', () => {
  const { tracker, clock, calls } = makeTracker();
  tracker.submit();
  tracker.data('answer');
  clock.advance(1000);
  assert.equal(calls.length, 1);
  tracker.data('late trailing output');
  clock.advance(10000);
  assert.equal(calls.length, 1);
});

test('ANSI-only output does not satisfy the minimum output threshold', () => {
  const { tracker, clock, calls } = makeTracker({ minOutputChars: 5, minElapsedMs: 100000 });
  tracker.submit();
  tracker.data('\x1b[31m\x1b[0m');
  clock.advance(1000);
  assert.equal(calls.length, 0);
});

test('suppresses notifications while a confirmation prompt is waiting', () => {
  const { tracker, clock, calls } = makeTracker();
  tracker.submit();
  tracker.data('Continue? (y/n)');
  clock.advance(5000);
  assert.equal(calls.length, 0);
  tracker.data('running now');
  clock.advance(1000);
  assert.equal(calls.length, 1);
});

test('a submit while busy continues the current cycle without resetting output', () => {
  const { tracker, clock, calls } = makeTracker({ minOutputChars: 10, minElapsedMs: 100000 });
  tracker.submit();
  tracker.data('abcdefghij');
  assert.equal(tracker.submit(), false);
  clock.advance(1000);
  assert.equal(calls.length, 1);
});

test('dispose prevents further notifications', () => {
  const { tracker, clock, calls } = makeTracker();
  tracker.submit();
  tracker.dispose();
  clock.advance(5000);
  assert.equal(calls.length, 0);
});

test('stripAnsi removes color sequences', () => {
  assert.equal(stripAnsi('\x1b[31mred\x1b[0m'), 'red');
});
