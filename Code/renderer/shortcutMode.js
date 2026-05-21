/**
 * shortcutMode.js
 * Handles shortcut mode for batch file selection from pasted content
 * Uses fuzzy matching with Levenshtein distance to extract filenames
 */

import { state } from './app_manager/appState.js';
import { onSelectionChange, updateGenerateState } from './app_manager/generateManager.js';
import { displayTree } from './app_manager/viewManager.js';
import { getFlatList } from './searchManager.js';

// ── Configurable file extensions ────────────────────────────────────────

export const FILE_EXTENSIONS = [
  // JavaScript/TypeScript
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  // Python
  '.py', '.pyw', '.pyi',
  // PHP
  '.php', '.phtml',
  // Web
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  // C/C++
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',
  // C#
  '.cs',
  // Java
  '.java', '.jar', '.class',
  // Go
  '.go',
  // Rust
  '.rs',
  // Ruby
  '.rb',
  // Swift
  '.swift',
  // Kotlin
  '.kt', '.kts',
  // Dart
  '.dart',
  // Shell/Batch
  '.sh', '.bash', '.zsh', '.bat', '.cmd', '.ps1',
  // Config/Data
  '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  // Text/Docs
  '.txt', '.md', '.markdown', '.rst',
  // Other common
  '.sql', '.r', '.m', '.lua', '.pl', '.pm', '.tcl'
];

// ── Levenshtein distance algorithm ──────────────────────────────────────

function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

// ── Filename extraction from pasted content ─────────────────────────────

function extractPotentialFilenames(text) {
  const potentialFiles = new Set();
  
  // Remove common markdown and emoji patterns
  const cleanedText = text
    .replace(/[^\w\s\.\-\/\\]/g, ' ')  // Replace special chars with space
    .replace(/\s+/g, ' ')               // Normalize whitespace
    .trim();

  // Split by common delimiters
  const parts = cleanedText.split(/[\s,;\n\r\t]+/);

  for (const part of parts) {
    if (!part) continue;

    // Check if it has a file extension
    const hasExtension = FILE_EXTENSIONS.some(ext => 
      part.toLowerCase().endsWith(ext)
    );

    if (hasExtension) {
      potentialFiles.add(part);
    } else {
      // Try to find extension-like patterns within the string
      for (const ext of FILE_EXTENSIONS) {
        const extIndex = part.toLowerCase().indexOf(ext);
        if (extIndex !== -1) {
          // Extract the filename ending with this extension
          const filename = part.substring(0, extIndex + ext.length);
          // Clean it up - remove leading special chars
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

// ── Fuzzy matching against tree files ────────────────────────────────────

function findBestMatch(potentialFile, flatList) {
  const potentialLower = potentialFile.toLowerCase();
  let bestMatch = null;
  let bestDistance = Infinity;
  let bestSimilarity = 0;

  for (const node of flatList) {
    if (node.type !== 'file') continue;

    const nameLower = node.name.toLowerCase();
    const displayPathLower = node.displayPath.toLowerCase();

    // Direct match
    if (nameLower === potentialLower || displayPathLower === potentialLower) {
      return { node, matchType: 'exact', similarity: 1 };
    }

    // Calculate similarity using Levenshtein distance
    const nameDistance = levenshteinDistance(potentialLower, nameLower);
    const pathDistance = levenshteinDistance(potentialLower, displayPathLower);
    const minDistance = Math.min(nameDistance, pathDistance);

    const maxLength = Math.max(potentialLower.length, nameLower.length);
    const similarity = 1 - (minDistance / maxLength);

    // Only consider matches with reasonable similarity (>= 0.5)
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

// ── Process shortcut input and select files ─────────────────────────────

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

  // Update UI if any files were selected
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

// ── Modal management ─────────────────────────────────────────────────────

const shortcutInputModal = document.getElementById('shortcutInputModal');
const shortcutResultsModal = document.getElementById('shortcutResultsModal');
const shortcutInputTextarea = document.getElementById('shortcutInputTextarea');
const shortcutResultsSummary = document.getElementById('shortcutResultsSummary');
const shortcutResultsList = document.getElementById('shortcutResultsList');

export function openShortcutInputModal() {
  shortcutInputTextarea.value = '';
  shortcutInputModal.classList.add('open');
  shortcutInputTextarea.focus();
}

export function closeShortcutInputModal() {
  shortcutInputModal.classList.remove('open');
}

export function openShortcutResultsModal(results) {
  // Update summary
  const { total, newlySelected, alreadySelected, notFound } = results.summary;
  shortcutResultsSummary.innerHTML = `
    <strong>${total}</strong> filenames extracted from input<br>
    <span style="color: var(--green)">✓ ${newlySelected} newly selected</span>
    ${alreadySelected > 0 ? `<span style="color: var(--text-muted)">• ${alreadySelected} already selected</span>` : ''}
    ${notFound > 0 ? `<span style="color: var(--red)">• ${notFound} not found</span>` : ''}
  `;

  // Update results list
  shortcutResultsList.innerHTML = '';
  results.results.forEach(result => {
    const item = document.createElement('div');
    item.className = `result-item ${result.found ? 'found' : 'not-found'}`;
    
    const icon = result.found ? '📄' : '❌';
    const status = result.found 
      ? (result.alreadySelected ? 'Already selected' : `${result.matchType} (${Math.round(result.similarity * 100)}%)`)
      : 'Not found';

    item.innerHTML = `
      <span class="result-item-icon">${icon}</span>
      <span class="result-item-name">${result.original}</span>
      <span class="result-item-status">${status}</span>
    `;

    if (result.found && result.matched) {
      item.title = `Matched: ${result.matched}\nPath: ${result.path}`;
    }

    shortcutResultsList.appendChild(item);
  });

  shortcutResultsModal.classList.add('open');
}

export function closeShortcutResultsModal() {
  shortcutResultsModal.classList.remove('open');
}

// ── Event handlers ───────────────────────────────────────────────────────

export function initShortcutMode() {
  const shortcutModeBtn = document.getElementById('shortcutModeBtn');
  const shortcutInputCloseBtn = document.getElementById('shortcutInputCloseBtn');
  const shortcutProcessBtn = document.getElementById('shortcutProcessBtn');
  const shortcutCancelBtn = document.getElementById('shortcutCancelBtn');
  const shortcutResultsCloseBtn = document.getElementById('shortcutResultsCloseBtn');
  const shortcutResultsCloseBtn2 = document.getElementById('shortcutResultsCloseBtn2');

  // Open input modal
  shortcutModeBtn.addEventListener('click', () => {
    openShortcutInputModal();
  });

  // Close input modal
  shortcutInputCloseBtn.addEventListener('click', closeShortcutInputModal);
  shortcutCancelBtn.addEventListener('click', closeShortcutInputModal);

  // Process input
  shortcutProcessBtn.addEventListener('click', () => {
    const inputText = shortcutInputTextarea.value.trim();
    if (!inputText) {
      alert('Please paste some content first');
      return;
    }

    const result = processShortcutInput(inputText);
    
    if (result.success) {
      closeShortcutInputModal();
      openShortcutResultsModal(result);
    } else {
      alert(result.message);
    }
  });

  // Close results modal
  shortcutResultsCloseBtn.addEventListener('click', closeShortcutResultsModal);
  shortcutResultsCloseBtn2.addEventListener('click', closeShortcutResultsModal);

  // Close modals on overlay click
  shortcutInputModal.addEventListener('click', (e) => {
    if (e.target === shortcutInputModal) closeShortcutInputModal();
  });

  shortcutResultsModal.addEventListener('click', (e) => {
    if (e.target === shortcutResultsModal) closeShortcutResultsModal();
  });

  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeShortcutInputModal();
      closeShortcutResultsModal();
    }
  });
}
