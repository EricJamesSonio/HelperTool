function listUrls(tracker) {
  if (!tracker) return [];
  return tracker.getAll();
}

async function healthCheck(tracker, port) {
  if (!tracker) return { alive: false, error: 'URL tracker not available' };
  return tracker.healthCheck(port);
}

async function fetchTest(tracker, port) {
  if (!tracker) return { success: false, error: 'URL tracker not available' };
  return tracker.fetchTest(port);
}

async function waitForReady(tracker, port, timeout) {
  if (!tracker) return { alive: false, error: 'URL tracker not available' };
  return tracker.waitForReady(port, { timeout: timeout || 30000 });
}

module.exports = { listUrls, healthCheck, fetchTest, waitForReady };
