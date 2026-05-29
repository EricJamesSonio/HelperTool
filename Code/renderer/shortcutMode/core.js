// ===== File: Code\renderer\shortcutMode\core.js =====
import { state } from '../app_manager/appState.js';
import { onSelectionChange, updateGenerateState } from '../app_manager/generateManager.js';
import { displayTree } from '../app_manager/viewManager.js';
import { getFlatList } from '../searchManager.js';
import { FILE_EXTENSIONS } from './constants.js';
import { levenshteinDistance } from './levenshtein.js';

// ── Extraction ────────────────────────────────────────────────────────────────

/**
 * Given raw pasted text, return an array of candidate strings.
 * Each candidate is either:
 *   - a plain filename:       "page.tsx"
 *   - a partial path:         "grades/page.tsx"  ← NEW: path context preserved
 *
 * We keep up to the last 3 path segments so matching has enough context
 * without being polluted by dynamic route segments like [classId].
 */
function extractPotentialFilenames(text) {
  const potentialFiles = new Set();

  // Normalise separators, collapse whitespace, drop brackets (dynamic segments)
  // but keep slashes so path context survives.
  const cleanedText = text
    .replace(/\[.*?\]/g, '')          // strip [classId], [id] etc.
    .replace(/['"*!?@]/g, '')         // stray punctuation
    .replace(/\\/g, '/')              // backslash → forward slash
    .replace(/\s+/g, ' ')
    .trim();

  // Split on whitespace and commas only — NOT on slashes, so paths stay intact
  const parts = cleanedText.split(/[\s,;\n\r\t]+/);

  for (const part of parts) {
    if (!part) continue;

    // Does any extension appear in this token?
    const hasExtension = FILE_EXTENSIONS.some(ext =>
      part.toLowerCase().endsWith(ext)
    );

    if (hasExtension) {
      // Keep the full token (may be "grades/page.tsx" or just "page.tsx")
      // Strip leading slashes
      const clean = part.replace(/^\/+/, '');

      // Limit to last 3 path segments to avoid deep absolute paths
      const segments = clean.split('/').filter(Boolean);
      const candidate = segments.slice(-3).join('/');

      if (candidate) potentialFiles.add(candidate);
    } else {
      // Extension appears mid-token — extract up to end of extension
      for (const ext of FILE_EXTENSIONS) {
        const extIndex = part.toLowerCase().indexOf(ext);
        if (extIndex !== -1) {
          const raw     = part.substring(0, extIndex + ext.length).replace(/^\/+/, '');
          const segs    = raw.split('/').filter(Boolean);
          const cleaned = segs.slice(-3).join('/');
          if (cleaned.endsWith(ext) && cleaned.length > ext.length) {
            potentialFiles.add(cleaned);
          }
        }
      }
    }
  }

  return Array.from(potentialFiles);
}

// ── Matching ──────────────────────────────────────────────────────────────────

/**
 * Find the best matching node for a candidate string.
 *
 * Match priority (highest wins):
 *  1. displayPath ends with candidate (exact path-suffix match)
 *  2. name === last segment of candidate (exact name match)
 *  3. Fuzzy on name OR displayPath — only if similarity ≥ 0.75
 *     (raised from 0.5 to prevent wrong-file fuzzy wins)
 *
 * Raising the fuzzy threshold means short ambiguous filenames like "page.tsx"
 * won't match "grade.api.ts" at 56% anymore.
 */
function findBestMatch(candidate, flatList) {
  const candidateLower   = candidate.toLowerCase();
  const segments         = candidateLower.split('/');
  const lastName         = segments[segments.length - 1]; // e.g. "page.tsx"
  const hasPathContext   = segments.length > 1;            // e.g. "grades/page.tsx"

  // ── Pass 1: exact path-suffix match ────────────────────────────────────────
  // "grades/page.tsx" must match a node whose displayPath ends with "grades/page.tsx"
  if (hasPathContext) {
    for (const node of flatList) {
      if (node.type !== 'file') continue;
      const dp = node.displayPath.toLowerCase().replace(/\\/g, '/').replace(/\/\[[^\]]*\]/g, '');
      if (dp === candidateLower || dp.endsWith('/' + candidateLower)) {
        return { node, matchType: 'exact', similarity: 1 };
      }
    }
  }

  // ── Pass 2: exact name match ────────────────────────────────────────────────
  for (const node of flatList) {
    if (node.type !== 'file') continue;
    if (node.name.toLowerCase() === lastName) {
      return { node, matchType: 'exact', similarity: 1 };
    }
  }

  // ── Pass 3: fuzzy — higher threshold to avoid wrong-file matches ────────────
  // Only run fuzzy when there is NO path context (bare filename like "page.tsx").
  // With path context we already tried exact suffix above; if that failed the
  // file genuinely isn't in the tree, so fuzzy would just pick the wrong file.
  if (hasPathContext) return null;

  const FUZZY_THRESHOLD = 0.75; // raised from 0.5

  let bestMatch      = null;
  let bestSimilarity = 0;

  for (const node of flatList) {
    if (node.type !== 'file') continue;

    const nameLower        = node.name.toLowerCase();
    const displayPathLower = node.displayPath.toLowerCase();

    const nameDistance = levenshteinDistance(lastName, nameLower);
    const pathDistance = levenshteinDistance(lastName, displayPathLower);
    const minDistance  = Math.min(nameDistance, pathDistance);
    const maxLength    = Math.max(lastName.length, nameLower.length);
    const similarity   = 1 - (minDistance / maxLength);

    if (similarity >= FUZZY_THRESHOLD && similarity > bestSimilarity) {
      bestMatch      = node;
      bestSimilarity = similarity;
    }
  }

  if (bestMatch) {
    return { node: bestMatch, matchType: 'fuzzy', similarity: bestSimilarity };
  }

  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function processShortcutInput(inputText) {
  const flatList = getFlatList();
  if (!flatList || flatList.length === 0) {
    return { success: false, message: 'No files available in current tree' };
  }

  const potentialFiles = extractPotentialFilenames(inputText);
  if (potentialFiles.length === 0) {
    return { success: false, message: 'No filenames found in pasted content' };
  }

  const results      = [];
  const newlySelected = [];

  for (const potentialFile of potentialFiles) {
    const match = findBestMatch(potentialFile, flatList);

    if (match) {
      const normPath        = match.node.path.replace(/\\/g, '/');
      const alreadySelected = state.selectedItems.some(
        item => item.replace(/\\/g, '/') === normPath
      );

      if (!alreadySelected) {
        state.selectedItems.push(match.node.path);
        newlySelected.push(match.node);
      }

      results.push({
        original:        potentialFile,
        matched:         match.node.name,
        path:            match.node.displayPath,
        found:           true,
        matchType:       match.matchType,
        similarity:      match.similarity,
        alreadySelected,
      });
    } else {
      results.push({
        original:        potentialFile,
        matched:         null,
        path:            null,
        found:           false,
        matchType:       null,
        similarity:      0,
        alreadySelected: false,
      });
    }
  }

  if (newlySelected.length > 0) {
    onSelectionChange();
    updateGenerateState();
    displayTree();
  }

  const foundCount           = results.filter(r => r.found && !r.alreadySelected).length;
  const alreadySelectedCount = results.filter(r => r.found && r.alreadySelected).length;
  const notFoundCount        = results.filter(r => !r.found).length;

  return {
    success: true,
    results,
    summary: {
      total:           results.length,
      newlySelected:   foundCount,
      alreadySelected: alreadySelectedCount,
      notFound:        notFoundCount,
    },
  };
}