const { readConfig } = require('../config/config.js');

function detectProject(cwd) {
  try {
    const cfg = readConfig();
    if (cfg && cfg.activeProject) return cfg.activeProject.split(/[\\/]/).pop() || 'Unknown';
  } catch {}
  if (cwd) return cwd.split(/[\\/]/).pop() || 'Terminal';
  return 'Terminal';
}

function detectCommand(line) {
  if (!line) return '';
  return line.trim().split(/\s+/).slice(0, 4).join(' ');
}

module.exports = { detectProject, detectCommand };
