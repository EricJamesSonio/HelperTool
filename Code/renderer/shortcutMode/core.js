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
 * Each candidate is a potential file path at every depth level,
 * from the full path down to the bare filename.
 *
 * Candidates are sorted longest first so findBestMatch tries
 * the most specific (longest) path first.
 */
function extractPotentialFilenames(text) {
  const potentialFiles = new Set();

  const cleanedText = text
    .replace(/\[.*?\]/g, '')
    .replace(/['"*!?@]/g, '')
    .replace(/\\/g, '/')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = cleanedText.split(/[\s,;\n\r\t]+/);

  for (const part of parts) {
    if (!part) continue;

    const hasExtension = FILE_EXTENSIONS.some(ext =>
      part.toLowerCase().endsWith(ext)
    );

    let raw;
    if (hasExtension) {
      raw = part.replace(/^\/+/, '');
    } else {
      for (const ext of FILE_EXTENSIONS) {
        const extIndex = part.toLowerCase().indexOf(ext);
        if (extIndex !== -1) {
          raw = part.substring(0, extIndex + ext.length).replace(/^\/+/, '');
          break;
        }
      }
      if (!raw) continue;
    }

    const segments = raw.split('/').filter(Boolean);
    if (segments.length === 0) continue;

    // Generate candidates at every depth, from full path down to bare filename
    // This way the most specific (longest) candidate is tried first in matching
    for (let i = 0; i < segments.length; i++) {
      potentialFiles.add(segments.slice(i).join('/'));
    }
  }

  // Sort: longest (most specific) first so findBestMatch tries full paths first
  return Array.from(potentialFiles).sort((a, b) => b.length - a.length);
}

// ── Matching ──────────────────────────────────────────────────────────────────

function stripDynamicSegments(path) {
  return path.replace(/\/\[[^\]]*\]/g, '');
}

/**
 * Find the best matching node for a candidate string.
 *
 * Match priority (highest wins):
 *  1. Exact displayPath match (after stripping dynamic segments)
 *  2. displayPath ends with candidate (path-suffix match)
 *  3. name === last segment of candidate (exact name match)
 *  4. Fuzzy on name OR displayPath — only if similarity ≥ 0.75
 *  5. Fuzzy on full displayPath for path-context candidates
 */
function findBestMatch(candidate, flatList) {
  const candidateLower   = candidate.toLowerCase();
  const segments         = candidateLower.split('/');
  const lastName         = segments[segments.length - 1];
  const hasPathContext   = segments.length > 1;

  const cleanedCandidate = stripDynamicSegments(candidateLower);

  // ── Pass 1a: exact displayPath match ────────────────────────────────────────
  for (const node of flatList) {
    if (node.type !== 'file') continue;
    const dp = stripDynamicSegments(node.displayPath.toLowerCase().replace(/\\/g, '/'));
    if (dp === cleanedCandidate) {
      return { node, matchType: 'exact', similarity: 1 };
    }
  }

  // ── Pass 1b: exact path-suffix match ────────────────────────────────────────
  for (const node of flatList) {
    if (node.type !== 'file') continue;
    const dp = stripDynamicSegments(node.displayPath.toLowerCase().replace(/\\/g, '/'));
    if (dp.endsWith('/' + cleanedCandidate)) {
      return { node, matchType: 'exact', similarity: 1 };
    }
  }

  // ── Pass 2: exact name match ────────────────────────────────────────────────
  for (const node of flatList) {
    if (node.type !== 'file') continue;
    if (node.name.toLowerCase() === lastName) {
      return { node, matchType: 'exact', similarity: 1 };
    }
  }

  // ── Pass 3: fuzzy on name (high threshold) ───────────────────────────────────
  const FUZZY_THRESHOLD = 0.75;

  let bestMatch      = null;
  let bestSimilarity = 0;

  for (const node of flatList) {
    if (node.type !== 'file') continue;

    const nameLower = node.name.toLowerCase();
    const nameDistance = levenshteinDistance(lastName, nameLower);
    const maxLen = Math.max(lastName.length, nameLower.length);
    const similarity = 1 - (nameDistance / maxLen);

    if (similarity >= FUZZY_THRESHOLD && similarity > bestSimilarity) {
      bestMatch      = node;
      bestSimilarity = similarity;
    }
  }

  if (bestMatch) {
    return { node: bestMatch, matchType: 'fuzzy', similarity: bestSimilarity };
  }

  // ── Pass 4: fuzzy on full displayPath (for path-context candidates) ──────────
  // Only run when candidate has path context — try fuzzy against the full path
  if (hasPathContext) {
    for (const node of flatList) {
      if (node.type !== 'file') continue;

      const dp = stripDynamicSegments(node.displayPath.toLowerCase().replace(/\\/g, '/'));
      const distance = levenshteinDistance(cleanedCandidate, dp);
      const maxLen = Math.max(cleanedCandidate.length, dp.length);
      const similarity = 1 - (distance / maxLen);

      if (similarity >= FUZZY_THRESHOLD && similarity > bestSimilarity) {
        bestMatch      = node;
        bestSimilarity = similarity;
      }
    }

    if (bestMatch) {
      return { node: bestMatch, matchType: 'fuzzy', similarity: bestSimilarity };
    }
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
  const matchedPaths  = new Set(); // deduplicate matches pointing to the same file

  for (const potentialFile of potentialFiles) {
    const match = findBestMatch(potentialFile, flatList);

    if (match) {
      const normPath        = match.node.path.replace(/\\/g, '/');

      // Skip if this file was already matched by a longer (more specific) candidate
      if (matchedPaths.has(normPath)) continue;
      matchedPaths.add(normPath);

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