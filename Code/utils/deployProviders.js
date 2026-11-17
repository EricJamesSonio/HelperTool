'use strict';

const ROLES = [
  { id: 'database', label: 'Database' },
  { id: 'frontend', label: 'Frontend' },
  { id: 'backend', label: 'Backend' },
  { id: 'images', label: 'Images' },
];

function p(id, name, url, roles, keywords) {
  return { id, name, url, roles, keywords: keywords || '' };
}

const PROVIDERS = [
  p('vercel', 'Vercel', 'https://vercel.com/dashboard', ['frontend', 'backend'], 'next nextjs serverless edge blob'),
  p('netlify', 'Netlify', 'https://app.netlify.com', ['frontend'], 'jamstack static'),
  p('cloudflare', 'Cloudflare', 'https://dash.cloudflare.com', ['frontend', 'backend', 'images', 'database'], 'pages workers r2 d1 dns cdn domain'),
  p('render', 'Render', 'https://dashboard.render.com', ['backend', 'frontend', 'database'], 'web service postgres static'),
  p('railway', 'Railway', 'https://railway.com/dashboard', ['backend', 'database', 'frontend'], 'railway app'),
  p('fly', 'Fly.io', 'https://fly.io/dashboard', ['backend', 'database'], 'flyio machines'),
  p('heroku', 'Heroku', 'https://dashboard.heroku.com', ['backend', 'database'], 'dyno procfile'),
  p('hostinger', 'Hostinger', 'https://hpanel.hostinger.com', ['frontend', 'backend', 'database'], 'hpanel shared vps php wordpress domain'),
  p('digitalocean', 'DigitalOcean', 'https://cloud.digitalocean.com', ['backend', 'database', 'frontend', 'images'], 'droplet app platform spaces'),
  p('aws', 'AWS', 'https://console.aws.amazon.com', ['frontend', 'backend', 'database', 'images'], 'amazon s3 ec2 lambda amplify rds cloudfront'),
  p('gcloud', 'Google Cloud', 'https://console.cloud.google.com', ['backend', 'database', 'frontend', 'images'], 'gcp cloud run storage'),
  p('azure', 'Microsoft Azure', 'https://portal.azure.com', ['backend', 'database', 'frontend', 'images'], 'app service sql blob static web apps'),
  p('firebase', 'Firebase', 'https://console.firebase.google.com', ['frontend', 'database', 'images', 'backend'], 'firestore hosting storage google'),
  p('github', 'GitHub', 'https://github.com', ['frontend'], 'pages actions repo git'),
  p('gitlab', 'GitLab', 'https://gitlab.com', ['frontend'], 'pages ci'),
  p('bitbucket', 'Bitbucket', 'https://bitbucket.org/dashboard/overview', [], 'git pipelines repo'),
  p('circleci', 'CircleCI', 'https://app.circleci.com', [], 'ci pipelines'),
  p('dockerhub', 'Docker Hub', 'https://hub.docker.com', [], 'docker images registry containers'),
  p('koyeb', 'Koyeb', 'https://app.koyeb.com', ['backend'], 'serverless containers'),
  p('northflank', 'Northflank', 'https://app.northflank.com', ['backend', 'database'], 'containers'),
  p('hetzner', 'Hetzner', 'https://console.hetzner.cloud', ['backend', 'database'], 'vps cloud server'),
  p('vultr', 'Vultr', 'https://my.vultr.com', ['backend', 'database'], 'vps cloud server'),
  p('linode', 'Linode (Akamai)', 'https://cloud.linode.com', ['backend', 'database'], 'akamai vps'),
  p('scaleway', 'Scaleway', 'https://console.scaleway.com', ['backend', 'database', 'images'], 'cloud server object storage'),
  p('ovh', 'OVHcloud', 'https://www.ovh.com/manager', ['backend', 'database', 'frontend'], 'vps hosting domain'),
  p('oracle', 'Oracle Cloud', 'https://cloud.oracle.com', ['backend', 'database'], 'oci free tier vps'),
  p('ibm', 'IBM Cloud', 'https://cloud.ibm.com', ['backend', 'database'], 'ibm'),
  p('alibaba', 'Alibaba Cloud', 'https://home.console.alibabacloud.com', ['backend', 'database', 'images'], 'aliyun oss ecs'),
  p('contabo', 'Contabo', 'https://my.contabo.com', ['backend'], 'vps server'),
  p('upcloud', 'UpCloud', 'https://hub.upcloud.com', ['backend'], 'vps cloud server'),
  p('clever', 'Clever Cloud', 'https://console.clever-cloud.com', ['backend', 'database', 'frontend'], 'paas'),
  p('upsun', 'Upsun (Platform.sh)', 'https://console.upsun.com', ['backend', 'frontend'], 'platform sh paas'),
  p('zeabur', 'Zeabur', 'https://zeabur.com/dashboard', ['backend', 'frontend', 'database'], 'deploy'),
  p('sevalla', 'Sevalla', 'https://app.sevalla.com', ['backend', 'frontend', 'database'], 'kinsta paas'),
  p('qovery', 'Qovery', 'https://console.qovery.com', ['backend'], 'kubernetes'),
  p('deno', 'Deno Deploy', 'https://dash.deno.com', ['backend', 'frontend'], 'edge serverless'),
  p('replit', 'Replit', 'https://replit.com/~', ['backend', 'frontend'], 'deployments repl'),
  p('back4app', 'Back4App', 'https://dashboard.back4app.com', ['backend', 'database'], 'parse baas'),
  p('pythonanywhere', 'PythonAnywhere', 'https://www.pythonanywhere.com/user', ['backend'], 'python flask django'),
  p('bluehost', 'Bluehost', 'https://my.bluehost.com', ['frontend', 'backend'], 'shared wordpress php hosting'),
  p('siteground', 'SiteGround', 'https://my.siteground.com', ['frontend', 'backend'], 'shared wordpress php hosting'),
  p('ionos', 'IONOS', 'https://my.ionos.com', ['frontend', 'backend'], 'hosting domain vps'),
  p('hostgator', 'HostGator', 'https://portal.hostgator.com', ['frontend', 'backend'], 'shared hosting cpanel'),
  p('dreamhost', 'DreamHost', 'https://panel.dreamhost.com', ['frontend', 'backend'], 'shared hosting'),
  p('kinsta', 'Kinsta', 'https://my.kinsta.com', ['frontend', 'backend', 'database'], 'wordpress hosting'),
  p('wpengine', 'WP Engine', 'https://my.wpengine.com', ['frontend'], 'wordpress hosting'),
  p('cloudways', 'Cloudways', 'https://platform.cloudways.com', ['frontend', 'backend'], 'managed hosting'),
  p('namecheap', 'Namecheap', 'https://ap.www.namecheap.com', ['frontend'], 'domain dns hosting'),
  p('godaddy', 'GoDaddy', 'https://account.godaddy.com', ['frontend'], 'domain dns hosting'),
  p('porkbun', 'Porkbun', 'https://porkbun.com/account', [], 'domain dns registrar'),
  p('namecom', 'Name.com', 'https://www.name.com/account', [], 'domain dns registrar'),
  p('squarespace', 'Squarespace Domains', 'https://account.squarespace.com', [], 'domain dns google domains'),
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
  p('tidb', 'TiDB Cloud', 'https://tidbcloud.com', ['database'], 'mysql pingcap'),
  p('prisma', 'Prisma Data Platform', 'https://console.prisma.io', ['database'], 'orm postgres accelerate'),
  p('neo4j', 'Neo4j Aura', 'https://console.neo4j.io', ['database'], 'graph'),
  p('astra', 'DataStax Astra', 'https://astra.datastax.com', ['database'], 'cassandra'),
  p('singlestore', 'SingleStore', 'https://portal.singlestore.com', ['database'], 'sql'),
  p('timescale', 'Timescale', 'https://console.cloud.timescale.com', ['database'], 'postgres time series'),
  p('couchbase', 'Couchbase Capella', 'https://cloud.couchbase.com', ['database'], 'nosql'),
  p('clickhouse', 'ClickHouse Cloud', 'https://console.clickhouse.cloud', ['database'], 'analytics olap'),
  p('pinecone', 'Pinecone', 'https://app.pinecone.io', ['database'], 'vector embeddings'),
  p('qdrant', 'Qdrant Cloud', 'https://cloud.qdrant.io', ['database'], 'vector embeddings'),
  p('weaviate', 'Weaviate Cloud', 'https://console.weaviate.cloud', ['database'], 'vector embeddings'),
  p('nhost', 'Nhost', 'https://app.nhost.io', ['database', 'backend'], 'postgres graphql'),
  p('hasura', 'Hasura Cloud', 'https://cloud.hasura.io', ['database', 'backend'], 'graphql'),
  p('directus', 'Directus Cloud', 'https://directus.cloud', ['database', 'backend'], 'cms headless'),
  p('appwrite', 'Appwrite', 'https://cloud.appwrite.io', ['database', 'backend', 'images'], 'baas storage auth'),
  p('convex', 'Convex', 'https://dashboard.convex.dev', ['database', 'backend'], 'realtime'),
  p('cloudinary', 'Cloudinary', 'https://console.cloudinary.com', ['images'], 'image video cdn media'),
  p('imagekit', 'ImageKit', 'https://imagekit.io/dashboard', ['images'], 'image cdn'),
  p('uploadthing', 'UploadThing', 'https://uploadthing.com/dashboard', ['images'], 'upload files'),
  p('uploadcare', 'Uploadcare', 'https://app.uploadcare.com', ['images'], 'upload files cdn'),
  p('bunny', 'Bunny.net', 'https://dash.bunny.net', ['images', 'frontend'], 'cdn storage'),
  p('backblaze', 'Backblaze B2', 'https://secure.backblaze.com', ['images'], 'b2 storage s3'),
  p('imgix', 'imgix', 'https://dashboard.imgix.com', ['images'], 'image cdn'),
  p('wasabi', 'Wasabi', 'https://console.wasabisys.com', ['images'], 's3 storage'),
  p('mux', 'Mux', 'https://dashboard.mux.com', ['images'], 'video streaming'),
  p('sirv', 'Sirv', 'https://my.sirv.com', ['images'], 'image cdn'),
  p('filestack', 'Filestack', 'https://dev.filestack.com', ['images'], 'upload files'),
  p('transloadit', 'Transloadit', 'https://transloadit.com/c', ['images'], 'upload files encoding'),
  p('storj', 'Storj', 'https://us1.storj.io', ['images'], 'storage s3'),
  p('cloudimage', 'Cloudimage', 'https://admin.cloudimage.io', ['images'], 'image cdn'),
  p('stripe', 'Stripe', 'https://dashboard.stripe.com', [], 'payments billing'),
  p('sentry', 'Sentry', 'https://sentry.io', [], 'errors monitoring'),
  p('datadog', 'Datadog', 'https://app.datadoghq.com', [], 'monitoring logs apm'),
  p('grafana', 'Grafana Cloud', 'https://grafana.com/orgs', [], 'monitoring metrics'),
  p('betterstack', 'Better Stack', 'https://betterstack.com/team', [], 'uptime logs monitoring'),
  p('posthog', 'PostHog', 'https://app.posthog.com', [], 'analytics'),
  p('resend', 'Resend', 'https://resend.com/overview', [], 'email transactional'),
  p('sendgrid', 'SendGrid', 'https://app.sendgrid.com', [], 'email transactional'),
  p('mailgun', 'Mailgun', 'https://login.mailgun.com', [], 'email transactional'),
  p('twilio', 'Twilio', 'https://console.twilio.com', [], 'sms voice'),
  p('clerk', 'Clerk', 'https://dashboard.clerk.com', [], 'auth users'),
  p('auth0', 'Auth0', 'https://manage.auth0.com', [], 'auth login users'),
  p('expo', 'Expo', 'https://expo.dev', [], 'eas mobile react native'),
  p('strapi', 'Strapi Cloud', 'https://cloud.strapi.io', [], 'cms headless'),
  p('sanity', 'Sanity', 'https://www.sanity.io/manage', [], 'cms headless'),
  p('contentful', 'Contentful', 'https://app.contentful.com', [], 'cms headless'),
  p('custom', 'Custom link', 'https://www.google.com', [], 'other any website url own'),
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
    if (prov.id === 'custom') score -= 5;
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