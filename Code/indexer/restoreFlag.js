const fs = require('fs');
const path = require('path');

function flagPath(userDataPath) {
  return path.join(userDataPath, 'symbol-index', '.restore-flags.json');
}

function readFlags(userDataPath) {
  const fp = flagPath(userDataPath);
  try {
    if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch (_) {}
  return {};
}

function writeFlags(userDataPath, flags) {
  const fp = flagPath(userDataPath);
  const dir = path.dirname(fp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(flags), 'utf-8');
}

function setFlag(userDataPath, repoPath, value) {
  const flags = readFlags(userDataPath);
  if (value === true) {
    delete flags[repoPath];
  } else {
    flags[repoPath] = false;
  }
  writeFlags(userDataPath, flags);
}

module.exports = { readFlags, setFlag };
