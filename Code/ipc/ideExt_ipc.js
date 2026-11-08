const { ipcMain } = require('electron');
const fs = require('fs');
const stack = require('../services/ideStack.js');
const diagnostics = require('../services/ideDiagnostics.js');

const KNOWN = new Set(['js', 'python', 'nestjs', 'nextjs', 'php', 'laravel', 'cpp']);

function register() {
  ipcMain.handle('ideExt:detect', async (_event, root) => {
    try {
      if (typeof root !== 'string' || !root) return { success: false, error: 'No folder opened' };
      const st = await fs.promises.stat(root);
      if (!st.isDirectory()) return { success: false, error: 'Not a folder' };
      const stacks = await stack.detectStack(root);
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