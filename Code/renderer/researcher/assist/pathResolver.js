// Resolves the paths Claude asked for against the loaded project tree.
// Pure: takes the flat node list, returns plain data. No fuzzy auto-picking:
// near matches are only offered as suggestions.

import { levenshteinDistance } from '../../shortcutMode/levenshtein.js';
import { isSensitivePath } from './protocol.js';

const norm = (p) =>
  String(p ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

function isFile(node) {
  if (!node) return false;
  if (node.type === 'file') return true;
  if (node.type === 'folder') return false;
  return !(node.children && node.children.length);
}

function variantsOf(request, repoName) {
  const v = norm(request).toLowerCase();
  const out = [v];
  if (repoName && v.startsWith(repoName + '/')) out.push(v.slice(repoName.length + 1));
  return out;
}

function lookup(v, entries) {
  const exact = entries.filter((e) => e.key === v);
  if (exact.length) return exact;
  return entries.filter((e) => e.key.endsWith('/' + v));
}

function suggest(v, files) {
  const base = v.split('/').pop();
  const sameName = files.filter((f) => f.key.split('/').pop() === base).slice(0, 3);
  if (sameName.length) return sameName.map((f) => f.display);
  const scored = [];
  for (const f of files) {
    const dist = levenshteinDistance(v, f.key);
    const sim = 1 - dist / Math.max(v.length, f.key.length, 1);
    if (sim >= 0.7) scored.push({ sim, display: f.display });
  }
  scored.sort((a, b) => b.sim - a.sim);
  if (!scored.length) return [];
  const floor = scored[0].sim - 0.1;
  return scored.filter((s) => s.sim >= floor).slice(0, 3).map((s) => s.display);
}

export function resolveRequests(requests, flatList, { repoName = '' } = {}) {
  const repo = norm(repoName).toLowerCase();
  const files = [];
  const folders = [];
  for (const node of flatList || []) {
    const display = norm(node.displayPath || node.name);
    if (!display) continue;
    (isFile(node) ? files : folders).push({ node, display, key: display.toLowerCase() });
  }

  const result = { resolved: [], missing: [], ambiguous: [], folders: [], blocked: [] };
  const seen = new Set();

  for (const request of requests || []) {
    const variants = variantsOf(request, repo);

    let hits = [];
    for (const v of variants) {
      hits = lookup(v, files);
      if (hits.length) break;
    }

    if (hits.length === 1) {
      const { node, display } = hits[0];
      if (seen.has(node.path)) continue;
      seen.add(node.path);
      if (isSensitivePath(display)) result.blocked.push({ request, display, reason: 'sensitive file' });
      else result.resolved.push({ request, path: node.path, display });
      continue;
    }

    if (hits.length > 1) {
      result.ambiguous.push({ request, candidates: hits.slice(0, 6).map((h) => h.display) });
      continue;
    }

    let folderHits = [];
    for (const v of variants) {
      folderHits = lookup(v, folders);
      if (folderHits.length) break;
    }
    if (folderHits.length) {
      const folder = folderHits[0];
      const prefix = folder.key + '/';
      const inside = files.filter((f) => f.key.startsWith(prefix)).map((f) => f.display);
      result.folders.push({ request, display: folder.display, files: inside.slice(0, 40), total: inside.length });
      continue;
    }

    result.missing.push({ request, suggestions: suggest(variants[variants.length - 1], files) });
  }

  return result;
}