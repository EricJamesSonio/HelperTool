// ===== File: Code\renderer\shortcutMode\core.js =====
import { state } from '../app_manager/appState.js';
import { onSelectionChange, updateGenerateState } from '../app_manager/generateManager.js';
import { displayTree } from '../app_manager/viewManager.js';
import { getFlatList } from '../searchManager.js';
import { FILE_EXTENSIONS } from './constants.js';
import { levenshteinDistance } from './levenshtein.js';
import { confirmDialog } from '../utils/confirmDialog.js';

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
    .replace(/['"*!?@`\u2018\u2019\u201C\u201D\u2013\u2014]/g, '')
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

export function unselectMatchedFile(filePath) {
  const idx = state.selectedItems.findIndex(item => item.replace(/\\/g, '/') === filePath.replace(/\\/g, '/'));
  if (idx !== -1) {
    state.selectedItems.splice(idx, 1);
    onSelectionChange();
    updateGenerateState();
    displayTree();
  }
}

export async function processShortcutInput(inputText, mode = 'find') {
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
  const bestMatchByPath = new Map(); // normPath -> { result, match }
  const initiallySelectedPaths = new Set(
    state.selectedItems.map(p => p.replace(/\\/g, '/'))
  );
  const exactMatchedPaths = [];    // full paths with 100% exact match – skip shorter sub-candidates

  for (const potentialFile of potentialFiles) {
    // Skip if this candidate is a suffix of an already exact-matched path
    if (exactMatchedPaths.some(p => p.endsWith('/' + potentialFile))) continue;

    const match = findBestMatch(potentialFile, flatList);

    if (match) {
      const normPath = match.node.path.replace(/\\/g, '/');

      // Remember full paths that matched exactly so shorter suffixes get skipped
      if (match.similarity === 1) {
        exactMatchedPaths.push(normPath);
      }

      const existing = bestMatchByPath.get(normPath);

      // Skip if we already have a match for this file that's at least as good
      if (existing && match.similarity <= existing.match.similarity) continue;

      // This is a new file or a better match — add to state if first time
      if (!existing && !initiallySelectedPaths.has(normPath)) {
        state.selectedItems.push(match.node.path);
        newlySelected.push(match.node);
      }

      bestMatchByPath.set(normPath, {
        result: {
          original:        potentialFile,
          matched:         match.node.name,
          path:            match.node.displayPath,
          filePath:        match.node.path,
          found:           true,
          matchType:       match.matchType,
          similarity:      match.similarity,
          alreadySelected: initiallySelectedPaths.has(normPath),
        },
        match,
      });
    } else {
      results.push({
        original:        potentialFile,
        matched:         null,
        path:            null,
        filePath:        null,
        found:           false,
        matchType:       null,
        similarity:      0,
        alreadySelected: false,
      });
    }
  }

  // Emit best result per unique file
  for (const { result } of bestMatchByPath.values()) {
    results.push(result);
  }

  const foundResults = results.filter(r => r.found);
  const foundCount = foundResults.filter(r => !r.alreadySelected).length;
  const alreadySelectedCount = foundResults.filter(r => r.alreadySelected).length;
  const notFoundCount = results.filter(r => !r.found).length;

  // ── Remove mode ────────────────────────────────────────────────────────────
  if (mode === 'remove' && foundResults.length > 0) {
    const fileList = foundResults.map(r => r.path || r.original).join('<br>');
    const ok = await confirmDialog(
      `Delete <strong>${foundResults.length}</strong> matched file(s)?<br><br>` +
      `<div style="max-height:200px;overflow-y:auto;font-size:12px;font-family:var(--font-mono);color:var(--text-secondary);line-height:1.6;border:1px solid var(--border-subtle);border-radius:6px;padding:8px 12px;background:var(--bg-raised)">${fileList}</div>` +
      `<br>This cannot be undone.`
    );
    if (!ok) {
      return { success: true, results, summary: { total: results.length, newlySelected: 0, alreadySelected: 0, notFound: notFoundCount, removed: 0, cancelled: true } };
    }

    let removed = 0;
    const errors = [];
    for (const r of foundResults) {
      try {
        const res = await window.electronAPI.deleteFile(r.filePath);
        if (res.success) {
          removed++;
          // Remove from selectedItems if it was selected
          const idx = state.selectedItems.findIndex(p => p.replace(/\\/g, '/') === r.filePath.replace(/\\/g, '/'));
          if (idx !== -1) state.selectedItems.splice(idx, 1);
        } else {
          errors.push({ path: r.path, error: res.error });
        }
      } catch (err) {
        errors.push({ path: r.path, error: err.message });
      }
    }

    if (removed > 0) {
      onSelectionChange();
      updateGenerateState();
      displayTree();
      // Also trigger app tree refresh
      document.getElementById('refreshBtn')?.click();
    }

    return {
      success: true,
      results,
      summary: {
        total: results.length,
        newlySelected: 0,
        alreadySelected: 0,
        notFound: notFoundCount,
        removed,
        errors,
      },
    };
  }

  // ── Find mode (default) ────────────────────────────────────────────────────
  if (newlySelected.length > 0) {
    onSelectionChange();
    updateGenerateState();
    displayTree();
  }

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