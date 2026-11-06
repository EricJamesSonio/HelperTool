'use strict';

const items = [
  { level: 'basic', title: 'Protected routes return 401 or 403 without credentials', why: 'Route discovery only finds file names so far, not full URLs and methods.' },
  { level: 'basic', title: 'Login does not reveal whether a user exists', why: 'Needs the login endpoint and test accounts.' },
  { level: 'basic', title: 'SQL injection probes against live endpoints (error and boolean based)', why: 'Needs real endpoint paths and parameters from discovery.' },
  { level: 'medium', title: 'Time-based blind SQL injection and JSON body injection', why: 'Needs endpoint discovery and per-dialect payloads.' },
  { level: 'medium', title: 'NoSQL operator injection against live endpoints', why: 'Needs endpoint discovery.' },
  { level: 'medium', title: 'Rate limit on login and password reset', why: 'Needs the login endpoint. Burst requests also need safe mode on a dev target.' },
  { level: 'medium', title: 'Session invalidated on logout', why: 'Needs a test account.' },
  { level: 'medium', title: 'CSRF protection on state-changing routes', why: 'Needs discovered POST routes and a session.' },
  { level: 'medium', title: 'IDOR check with two test users', why: 'Needs test credentials stored in the secret holder.' },
  { level: 'medium', title: 'Stored XSS canary through forms', why: 'Needs discovered forms and a write-safe target.' },
  { level: 'medium', title: 'Supabase row level security, Firebase rules, Redis exposure', why: 'Provider specific probes are not written yet.' },
  { level: 'medium', title: 'TLS version, mixed content and certificate expiry', why: 'Needs an https target.' },
  { level: 'advanced', title: 'JWT attacks (alg none, tampered claims, expired token accepted)', why: 'Needs a login flow and token location.' },
  { level: 'advanced', title: 'Refresh token rotation and reuse detection', why: 'Needs a login flow.' },
  { level: 'advanced', title: 'Auth bypass tricks (path variants, verb tampering, method override headers)', why: 'Needs the protected route list.' },
  { level: 'advanced', title: 'Timing-based user enumeration and race conditions', why: 'Needs the login endpoint. Race tests need safe mode on a dev target.' },
  { level: 'advanced', title: 'Rate limit bypass (X-Forwarded-For rotation)', why: 'Needs the login endpoint.' },
  { level: 'advanced', title: 'CSP bypass candidates, postMessage origin checks, prototype pollution', why: 'Needs deeper page analysis.' },
  { level: 'advanced', title: 'Secret scan across git history', why: 'Only the current files and tracked file names are checked.' },
  { level: 'advanced', title: 'SSRF and file upload checks', why: 'Needs discovered endpoints that fetch URLs or accept files.' },
];

module.exports = { items };