const { getActiveProject } = require('../config/config.js');

function detectProject(cwd) {
  const active = getActiveProject();
  if (active) return active.split(/[\\/]/).pop() || 'Unknown';
  if (cwd) return cwd.split(/[\\/]/).pop() || 'Terminal';
  return 'Terminal';
}

function detectCommand(line) {
  if (!line) return '';
  return line.trim().split(/\s+/).slice(0, 4).join(' ');
}

module.exports = { detectProject, detectCommand };
