const shortcutInputModal = document.getElementById('shortcutInputModal');
const shortcutResultsModal = document.getElementById('shortcutResultsModal');
const shortcutInputTextarea = document.getElementById('shortcutInputTextarea');
const shortcutResultsSummary = document.getElementById('shortcutResultsSummary');
const shortcutResultsList = document.getElementById('shortcutResultsList');

export function getShortcutInputTextarea() {
  return shortcutInputTextarea;
}

export function openShortcutInputModal() {
  shortcutInputTextarea.value = '';
  shortcutInputModal.classList.add('open');
  shortcutInputTextarea.focus();
}

export function closeShortcutInputModal() {
  shortcutInputModal.classList.remove('open');
}

export function openShortcutResultsModal(results) {
  const { total, newlySelected, alreadySelected, notFound } = results.summary;
  shortcutResultsSummary.innerHTML = `
    <strong>${total}</strong> filenames extracted from input<br>
    <span style="color: var(--green)">\u2713 ${newlySelected} newly selected</span>
    ${alreadySelected > 0 ? `<span style="color: var(--text-muted)">\u2022 ${alreadySelected} already selected</span>` : ''}
    ${notFound > 0 ? `<span style="color: var(--red)">\u2022 ${notFound} not found</span>` : ''}
  `;

  shortcutResultsList.innerHTML = '';
  results.results.forEach(result => {
    const item = document.createElement('div');
    item.className = `result-item ${result.found ? 'found' : 'not-found'}`;

    const icon = result.found ? '\u{1F4C4}' : '\u274C';
    const status = result.found
      ? (result.alreadySelected ? 'Already selected' : `${result.matchType} (${Math.round(result.similarity * 100)}%)`)
      : 'Not found';

    if (result.found) {
      // Show the full matched path as primary text
      const matchedPath = result.path || result.original;
      item.innerHTML = `
        <span class="result-item-icon">${icon}</span>
        <span class="result-item-name">${matchedPath}</span>
        <span class="result-item-status">${status}</span>
      `;
      item.title = `Searched: ${result.original}`;
    } else {
      item.innerHTML = `
        <span class="result-item-icon">${icon}</span>
        <span class="result-item-name">${result.original}</span>
        <span class="result-item-status">${status}</span>
      `;
    }

    shortcutResultsList.appendChild(item);
  });

  shortcutResultsModal.classList.add('open');
}

export function closeShortcutResultsModal() {
  shortcutResultsModal.classList.remove('open');
}

export {
  shortcutInputModal,
  shortcutResultsModal,
  shortcutResultsSummary,
  shortcutResultsList,
};
