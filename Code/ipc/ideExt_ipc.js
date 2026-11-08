const { ipcMain } = require('electron');
const fs = require('fs');
const stack = require('../services/ideStack.js');
const diagnostics = require('../services/ideDiagnostics.js');

const KNOWN = new Set(['js', 'python', 'nestjs', 'nextjs', 'php', 'laravel', 'cpp']);
const DETECT_TTL = 30000;
const DETECT_MAX = 8;
const detectCache = new Map();
const inflight = new Map();

async function detectCached(root, force) {
  const hit = detectCache.get(root);
  if (!force && hit && Date.now() - hit.at < DETECT_TTL) return hit.stacks;
  const st = await fs.promises.stat(root);
  if (!st.isDirectory()) throw new Error('Not a folder');
  const stacks = await stack.detectStack(root);
  detectCache.delete(root);
  detectCache.set(root, { at: Date.now(), stacks });
  if (detectCache.size > DETECT_MAX) detectCache.delete(detectCache.keys().next().value);
  return stacks;
}

function detectShared(root, force) {
  const pending = inflight.get(root);
  if (pending) return pending;
  const p = detectCached(root, force).finally(() => inflight.delete(root));
  inflight.set(root, p);
  return p;
}

function register() {
  ipcMain.handle('ideExt:detect', async (_event, arg) => {
    try {
      const isObj = !!arg && typeof arg === 'object';
      const root = isObj ? arg.root : arg;
      const force = isObj && !!arg.force;
      if (typeof root !== 'string' || !root) return { success: false, error: 'No folder opened' };
      const stacks = await detectShared(root, force);
      return { success: true, stacks };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('ideExt:diagnose', async (_event, args) => {
    try {
      if (!args || typeof args.file !== 'string' || typeof args.text !== 'string') {
        return { success: false, error: 'Invalid arguments' };
      }
      const exts = Array.isArray(args.exts) ? args.exts.filter((x) => KNOWN.has(x)) : [];
      if (!exts.length) return { success: true, diags: [] };
      const diags = await diagnostics.diagnose({ file: args.file, text: args.text, exts });
      return { success: true, diags };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { register };