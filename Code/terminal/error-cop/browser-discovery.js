const FRAMEWORK_PATTERNS = [
  { pattern: /Vite|vite/i, name: 'Vite' },
  { pattern: /CRA|Create React App|react-scripts/i, name: 'React CRA' },
  { pattern: /Next\.js|next\.js/i, name: 'Next.js' },
  { pattern: /Nuxt|nuxt/i, name: 'Nuxt' },
  { pattern: /Angular|ng serve/i, name: 'Angular' },
  { pattern: /Vue|vue-cli-service/i, name: 'Vue' },
  { pattern: /webpack-dev-server/i, name: 'Webpack Dev Server' },
  { pattern: /Parcel/i, name: 'Parcel' },
  { pattern: /Express|express/i, name: 'Express' },
  { pattern: /Django/i, name: 'Django' },
  { pattern: /Flask/i, name: 'Flask' },
  { pattern: /Rails|puma/i, name: 'Rails' },
  { pattern: /webpack/i, name: 'Webpack' },
];

const ANSI_RE = /[\x1b\x9b][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\x07)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

function stripAnsi(str) {
  if (!str) return '';
  return str.replace(ANSI_RE, '');
}

class BrowserDiscovery {
  constructor() {
    this._discovered = new Set();
  }

  scanLine(line, sessionId, outputAccumulator) {
    const clean = stripAnsi(line);
    const urlMatch = clean.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/i);
    if (!urlMatch) return null;

    const port = parseInt(urlMatch[1], 10);
    if (this._discovered.has(port)) return null;
    this._discovered.add(port);

    const url = urlMatch[0];
    const context = stripAnsi(outputAccumulator.join('\n'));
    let framework = 'Unknown';

    for (const fp of FRAMEWORK_PATTERNS) {
      if (fp.pattern.test(context) || fp.pattern.test(clean)) {
        framework = fp.name;
        break;
      }
    }

    return { port, framework, url };
  }

  reset() {
    this._discovered.clear();
  }
}

module.exports = { BrowserDiscovery };
