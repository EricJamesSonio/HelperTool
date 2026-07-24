'use strict';

const { log } = require('../constants');
const { processChunk } = require('./log-adapter');
const session = require('../session');

const _captures = new Map();

function attach(sessionId, term) {
  if (!sessionId || !term) return { success: false, error: 'sessionId and term required' };

  let watcherSession = session.getSession(sessionId);
  if (!watcherSession) {
    session.createSession(sessionId, { source: 'terminal' });
  }

  const onData = (data) => {
    processChunk(data, sessionId, (sid, events) => {
      session.pushEvents(sid, events);
    });
  };

  const onExit = () => {
    detach(sessionId);
  };

  term.on('data', onData);
  term.on('exit', onExit);

  _captures.set(sessionId, { term, onData, onExit });
  log('Capture attached to session', sessionId);
  return { success: true, sessionId };
}

function detach(sessionId) {
  const cap = _captures.get(sessionId);
  if (!cap) return false;

  try { cap.term.off('data', cap.onData); } catch (e) { log('off data error:', e.message); }
  try { cap.term.off('exit', cap.onExit); } catch (e) { log('off exit error:', e.message); }

  _captures.delete(sessionId);
  log('Capture detached from session', sessionId);
  return true;
}

function detachAll() {
  for (const [id] of _captures) {
    detach(id);
  }
}

function getAttachedCount() {
  return _captures.size;
}

module.exports = {
  attach,
  detach,
  detachAll,
  getAttachedCount,
};
