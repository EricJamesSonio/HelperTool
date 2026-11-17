'use strict';

const ROLES = [
  { id: 'frontend', label: 'Frontend' },
  { id: 'backend', label: 'Backend' },
  { id: 'database', label: 'Database' },
  { id: 'images', label: 'Images' },
];

function p(id, name, url, roles, keywords) {
  return { id, name, url, roles, keywords: keywords || '' };
}

const PROVIDERS = [
  p('vercel', 'Vercel', 'https://vercel.com/dashboard', ['frontend', 'backend'], 'next nextjs serverless edge'),
  p('netlify', 'Netlify', 'https://app.netlify.com', ['frontend'], 'jamstack static'),
  p('cloudflare', 'Cloudflare', 'https://dash.cloudflare.com', ['frontend', 'backend', 'images', 'database'], 'pages workers r2 d1 dns cdn'),
  p('render', 'Render', 'https://dashboard.render.com', ['backend', 'frontend', 'database'], 'web service postgres static'),
  p('railway', 'Railway', 'https://railway.com/dashboard', ['backend', 'database', 'frontend'], 'railway app'),
  p('fly', 'Fly.io', 'https://fly.io/dashboard', ['backend', 'database'], 'flyio machines'),
  p('heroku', 'Heroku', 'https://dashboard.heroku.com', ['backend', 'database'], 'dyno procfile'),
  p('hostinger', 'Hostinger', 'https://hpanel.hostinger.com', ['frontend', 'backend', 'database'], 'hpanel shared vps php wordpress domain'),
  p('digitalocean', 'DigitalOcean', 'https://cloud.digitalocean.com', ['backend', 'database', 'frontend', 'images'], 'droplet app platform spaces'),
  p('aws', 'AWS', 'https://console.aws.amazon.com', ['frontend', 'backend', 'database', 'images'], 'amazon s3 ec2 lambda amplify rds cloudfront'),
  p('gcloud', 'Google Cloud', 'https://console.cloud.google.com', ['backend', 'database', 'frontend', 'images'], 'gcp cloud run storage'),
  p('azure', 'Microsoft Azure', 'https://portal.azure.com', ['backend', 'database', 'frontend'], 'app service sql'),
  p('firebase', 'Firebase', 'https://console.firebase.google.com', ['frontend', 'database', 'images', 'backend'], 'firestore hosting storage google'),
  p('github', 'GitHub', 'https://github.com', ['frontend'], 'pages actions repo git'),
  p('gitlab', 'GitLab', 'https://gitlab.com', ['frontend'], 'pages ci'),
  p('koyeb', 'Koyeb', 'https://app.koyeb.com', ['backend'], 'serverless containers'),
  p('northflank', 'Northflank', 'https://app.northflank.com', ['backend', 'database'], 'containers'),
  p('hetzner', 'Hetzner', 'https://console.hetzner.cloud', ['backend', 'database'], 'vps cloud server'),
  p('vultr', 'Vultr', 'https://my.vultr.com', ['backend', 'database'], 'vps cloud server'),
  p('linode', 'Linode (Akamai)', 'https://cloud.linode.com', ['backend', 'database'], 'akamai vps'),
  p('pythonanywhere', 'PythonAnywhere', 'https://www.pythonanywhere.com/user', ['backend'], 'python flask django'),
  p('namecheap', 'Namecheap', 'https://ap.www.namecheap.com', ['frontend'], 'domain dns hosting'),
  p('godaddy', 'GoDaddy', 'https://account.godaddy.com', ['frontend'], 'domain dns hosting'),
  p('aiven', 'Aiven', 'https://console.aiven.io', ['database'], 'postgres postgresql mysql redis kafka'),
  p('supabase', 'Supabase', 'https://supabase.com/dashboard', ['database', 'images', 'backend'], 'postgres storage auth'),
  p('neon', 'Neon', 'https://console.neon.tech', ['database'], 'postgres serverless'),
  p('planetscale', 'PlanetScale', 'https://app.planetscale.com', ['database'], 'mysql vitess'),
  p('mongodb-atlas', 'MongoDB Atlas', 'https://cloud.mongodb.com', ['database'], 'mongo mongodb'),
  p('upstash', 'Upstash', 'https://console.upstash.com', ['database'], 'redis kafka serverless'),
  p('redis-cloud', 'Redis Cloud', 'https://app.redislabs.com', ['database'], 'redis'),
  p('turso', 'Turso', 'https://turso.tech/app', ['database'], 'sqlite libsql'),
  p('cockroach', 'CockroachDB Cloud', 'https://cockroachlabs.cloud', ['database'], 'cockroach postgres'),
  p('xata', 'Xata', 'https://app.xata.io', ['database'], 'postgres'),
  p('appwrite', 'Appwrite', 'https://cloud.appwrite.io', ['database', 'backend', 'images'], 'baas storage auth'),
  p('convex', 'Convex', 'https://dashboard.convex.dev', ['database', 'backend'], 'realtime'),
  p('cloudinary', 'Cloudinary', 'https://console.cloudinary.com', ['images'], 'image video cdn media'),
  p('imagekit', 'ImageKit', 'https://imagekit.io/dashboard', ['images'], 'image cdn'),
  p('uploadthing', 'UploadThing', 'https://uploadthing.com/dashboard', ['images'], 'upload files'),
  p('uploadcare', 'Uploadcare', 'https://app.uploadcare.com', ['images'], 'upload files cdn'),
  p('bunny', 'Bunny.net', 'https://dash.bunny.net', ['images', 'frontend'], 'cdn storage'),
  p('backblaze', 'Backblaze B2', 'https://secure.backblaze.com', ['images'], 'b2 storage s3'),
  p('imgix', 'imgix', 'https://dashboard.imgix.com', ['images'], 'image cdn'),
];

const BY_ID = new Map(PROVIDERS.map((x) => [x.id, x]));

function getProvider(id) {
  return BY_ID.get(String(id || '')) || null;
}

function tokenScore(prov, token) {
  const name = prov.name.toLowerCase();
  if (name === token) return 100;
  if (name.startsWith(token)) return 80;
  if (name.includes(token)) return 60;
  if (prov.id.includes(token)) return 55;
  if (prov.keywords.includes(token)) return 40;
  return -1;
}

function searchProviders(query, role) {
  const tokens = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const scored = [];
  for (const prov of PROVIDERS) {
    let score = 10;
    if (tokens.length) {
      score = 0;
      let miss = false;
      for (const token of tokens) {
        const s = tokenScore(prov, token);
        if (s < 0) {
          miss = true;
          break;
        }
        score += s;
      }
      if (miss) continue;
    }
    if (role && prov.roles.indexOf(role) !== -1) score += 15;
    scored.push({ prov, score });
  }
  scored.sort((a, b) => (b.score - a.score) || a.prov.name.localeCompare(b.prov.name));
  return scored.map((s) => s.prov);
}

function normalizeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const withScheme = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '';
  } catch (_) {
    return '';
  }
}

function toNavigableUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return normalizeUrl(raw);
  const local = /^localhost(:\d+)?(\/|$)/i.test(raw) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(raw);
  if (!/\s/.test(raw) && local) return normalizeUrl('http://' + raw);
  if (!/\s/.test(raw) && /^[^\s/]+\.[^\s/]+/.test(raw)) return normalizeUrl('https://' + raw);
  return 'https://www.google.com/search?q=' + encodeURIComponent(raw);
}

module.exports = { ROLES, PROVIDERS, getProvider, searchProviders, normalizeUrl, toNavigableUrl };