import { state } from '../app_manager/appState.js';
import { onSelectionChange, updateGenerateState } from '../app_manager/generateManager.js';
import { displayTree } from '../app_manager/viewManager.js';
import { getFlatList } from '../searchManager.js';
import { FILE_EXTENSIONS } from './constants.js';
import { levenshteinDistance } from './levenshtein.js';

function extractPotentialFilenames(text) {
  const potentialFiles = new Set();

  const cleanedText = text
    .replace(/[^\w\s\.\-\/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = cleanedText.split(/[\s,;\n\r\t]+/);

  for (const part of parts) {
    if (!part) continue;

    const hasExtension = FILE_EXTENSIONS.some(ext =>
      part.toLowerCase().endsWith(ext)
    );

    if (hasExtension) {
      potentialFiles.add(part);
    } else {
      for (const ext of FILE_EXTENSIONS) {
        const extIndex = part.toLowerCase().indexOf(ext);
        if (extIndex !== -1) {
          const filename = part.substring(0, extIndex + ext.length);
          const cleaned = filename.replace(/^[^\w]+/, '');
          if (cleaned.endsWith(ext) && cleaned.length > ext.length) {
            potentialFiles.add(cleaned);
          }
        }
      }
    }
  }

  return Array.from(potentialFiles);
}

function findBestMatch(potentialFile, flatList) {
  const potentialLower = potentialFile.toLowerCase();
  let bestMatch = null;
  let bestDistance = Infinity;
  let bestSimilarity = 0;

  for (const node of flatList) {
    if (node.type !== 'file') continue;

    const nameLower = node.name.toLowerCase();
    const displayPathLower = node.displayPath.toLowerCase();

    if (nameLower === potentialLower || displayPathLower === potentialLower) {
      return { node, matchType: 'exact', similarity: 1 };
    }

    const nameDistance = levenshteinDistance(potentialLower, nameLower);
    const pathDistance = levenshteinDistance(potentialLower, displayPathLower);
    const minDistance = Math.min(nameDistance, pathDistance);

    const maxLength = Math.max(potentialLower.length, nameLower.length);
    const similarity = 1 - (minDistance / maxLength);

    if (similarity >= 0.5 && similarity > bestSimilarity) {
      bestMatch = node;
      bestDistance = minDistance;
      bestSimilarity = similarity;
    }
  }

  if (bestMatch && bestSimilarity >= 0.5) {
    return { node: bestMatch, matchType: 'fuzzy', similarity: bestSimilarity };
  }

  return null;
}

export function processShortcutInput(inputText) {
  const flatList = getFlatList();
  if (!flatList || flatList.length === 0) {
    return { success: false, message: 'No files available in current tree' };
  }

  const potentialFiles = extractPotentialFilenames(inputText);
  if (potentialFiles.length === 0) {
    return { success: false, message: 'No filenames found in pasted content' };
  }

  const results = [];
  const newlySelected = [];

  for (const potentialFile of potentialFiles) {
    const match = findBestMatch(potentialFile, flatList);

    if (match) {
      const normPath = match.node.path.replace(/\\/g, '/');
      const alreadySelected = state.selectedItems.some(
        item => item.replace(/\\/g, '/') === normPath
      );

      if (!alreadySelected) {
        state.selectedItems.push(match.node.path);
        newlySelected.push(match.node);
      }

      results.push({
        original: potentialFile,
        matched: match.node.name,
        path: match.node.displayPath,
        found: true,
        matchType: match.matchType,
        similarity: match.similarity,
        alreadySelected
      });
    } else {
      results.push({
        original: potentialFile,
        matched: null,
        path: null,
        found: false,
        matchType: null,
        similarity: 0,
        alreadySelected: false
      });
    }
  }

  if (newlySelected.length > 0) {
    onSelectionChange();
    updateGenerateState();
    displayTree();
  }

  const foundCount = results.filter(r => r.found && !r.alreadySelected).length;
  const alreadySelectedCount = results.filter(r => r.found && r.alreadySelected).length;
  const notFoundCount = results.filter(r => !r.found).length;

  return {
    success: true,
    results,
    summary: {
      total: results.length,
      newlySelected: foundCount,
      alreadySelected: alreadySelectedCount,
      notFound: notFoundCount
    }
  };
}
