'use strict';

const { grep } = require('../fileScanner');
const { pass, fail } = require('../result');
const { lineCheck } = require('./builders');

const LP = '\\x28';
const RP = '\\x29';

function rx(source, flags) {
  return new RegExp(source, flags || '');
}

const DANGEROUS_HTML = rx('dangerouslySetInnerHTML');
const V_HTML = rx('\\bv-html\\s*=');
const SVELTE_HTML = rx('[{]@html\\s');

const FRAMEWORK_RE = {
  react: DANGEROUS_HTML,
  nextjs: DANGEROUS_HTML,
  vue: V_HTML,
  nuxt: V_HTML,
  svelte: SVELTE_HTML,
  sveltekit: SVELTE_HTML,
  angular: rx('bypassSecurityTrust(?:Html|Script|Url|ResourceUrl|Style)\\s*' + LP + '|\\x5binnerHTML\\x5d\\s*='),
  laravel: rx('[{][!][!].+[!][!][}]'),
};

const SAFE_HTML = rx('DOMPurify|sanitize' + LP + '|__html\\s*:\\s*[\\x22\\x27\\x60][^$\\x22\\x27\\x60]*[\\x22\\x27\\x60]');
const CSRF_OK = rx('@csrf|csrf_field' + LP + RP);
const FORM_POST = rx('<form[^>]*method\\s*=\\s*[\\x22\\x27]post[\\x22\\x27]', 'i');
const BLADE_FILE = rx('[.]blade[.]php$');
const SECRETISH_ENV = /(SECRET|PRIVATE|PASSWORD|PASSWD|TOKEN|SERVICE_ROLE|DATABASE_URL|DB_URL|CLIENT_SECRET)/i;

const unsafeHtml = {
  id: 'unsafe-html-framework',
  title: 'No unescaped HTML in the framework templates',
  category: 'Frontend',
  level: 'basic',
  severity: 'high',
  kind: 'static',
  owasp: 'A03:2021 Injection',
  applies: (profile) => !!FRAMEWORK_RE[profile.frontend.framework],
  run(ctx) {
    const framework = ctx.profile.frontend.framework;
    const hits = grep(ctx.files, FRAMEWORK_RE[framework], {
      fileRe: framework === 'laravel' ? BLADE_FILE : null,
      filter: (line) => !SAFE_HTML.test(line),
    });
    if (!hits.length) return pass('No unescaped HTML bindings were found for ' + framework + '.');
    return fail(
      hits.length + ' unescaped HTML binding(s). Make sure the data is trusted or sanitized.',
      'Render text normally so the framework escapes it. If HTML is needed, sanitize it with DOMPurify first.',
      hits.slice(0, 25)
    );
  },
};

const publicEnv = {
  id: 'public-env-secrets',
  title: 'No secret-looking values in public environment variables',
  category: 'Secrets',
  level: 'basic',
  severity: 'high',
  kind: 'static',
  owasp: 'A02:2021 Cryptographic Failures',
  applies: null,
  run(ctx) {
    const keys = (ctx.profile.env.publicPrefixKeys || []).filter((k) => SECRETISH_ENV.test(k));
    if (!keys.length) return pass('No public-prefixed environment key looks like a secret.');
    return fail(
      keys.length + ' public variable name(s) look like secrets. Anything with a public prefix is shipped to the browser.',
      'Remove the public prefix and read the value only on the server. Rotate it because it may already be exposed.',
      keys.map((k) => ({ file: '.env', line: 0, text: k }))
    );
  },
};

const laravelCsrf = {
  id: 'laravel-csrf',
  title: 'Laravel POST forms include @csrf',
  category: 'Frontend',
  level: 'basic',
  severity: 'medium',
  kind: 'static',
  owasp: 'A01:2021 Broken Access Control',
  applies: (profile) => profile.frontend.framework === 'laravel',
  run(ctx) {
    const evidence = [];
    for (const f of ctx.files) {
      if (!BLADE_FILE.test(f.rel)) continue;
      if (CSRF_OK.test(f.text)) continue;
      const m = FORM_POST.exec(f.text);
      if (!m) continue;
      const line = f.text.slice(0, m.index).split(/\r?\n/).length;
      evidence.push({ file: f.rel, line, text: 'form with method post and no @csrf in this file' });
    }
    if (!evidence.length) return pass('Every POST form file includes @csrf.');
    return fail(evidence.length + ' form(s) without CSRF protection.', 'Add @csrf inside each POST form.', evidence.slice(0, 25));
  },
};

const sri = lineCheck({
  id: 'sri-missing',
  title: 'CDN scripts use Subresource Integrity',
  category: 'Frontend',
  level: 'medium',
  severity: 'low',
  owasp: 'A08:2021 Software and Data Integrity Failures',
  fileRe: rx('[.](?:html|htm|php|vue)$', 'i'),
  re: rx('<script\\b[^>]*\\bsrc=[\\x22\\x27]https?:[/][/][^\\x22\\x27]+[\\x22\\x27][^>]*>', 'i'),
  filter: (line) => !/integrity=/i.test(line),
  okText: 'All external scripts carry an integrity attribute (or none are used).',
  failText: 'If the CDN is compromised, the script can be swapped.',
  fix: 'Add integrity="sha384-..." and crossorigin="anonymous" to external scripts, or self-host them.',
});

const checks = [unsafeHtml, publicEnv, laravelCsrf, sri];

module.exports = { checks };