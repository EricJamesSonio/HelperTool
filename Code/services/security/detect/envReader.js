'use strict';

const path = require('path');
const { parseEnvFile } = require('../../consoleEnv');

function schemeOf(value) {
  const m = /^([a-z][a-z0-9+.-]*):\/\//i.exec(String(value || ''));
  return m ? m[1].toLowerCase() : null;
}

function readEnv(repoPath) {
  const files = ['.env', '.env.local', '.env.development', '.env.production'];
  const keysPresent = [];
  const schemes = {};
  const publicPrefixKeys = [];
  const seen = new Set();

  for (const name of files) {
    const map = parseEnvFile(path.join(repoPath, name));
    if (!map) continue;
    for (const key of Object.keys(map)) {
      if (!seen.has(key)) {
        seen.add(key);
        keysPresent.push(key);
      }
      const scheme = schemeOf(map[key]);
      if (scheme) schemes[key] = scheme;
      if (/^(NEXT_PUBLIC_|VITE_|REACT_APP_|NUXT_PUBLIC_|PUBLIC_)/.test(key)) {
        publicPrefixKeys.push(key);
      }
    }
  }

  return { keysPresent, schemes, publicPrefixKeys };
}

module.exports = { readEnv, schemeOf };