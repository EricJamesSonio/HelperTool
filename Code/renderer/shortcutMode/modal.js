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

export function openShortcutResultsModal(results, mode = 'find') {
  const { total, newlySelected, alreadySelected, notFound, removed, errors, cancelled } = results.summary;

  if (mode === 'remove') {
    if (cancelled) {
      shortcutResultsSummary.innerHTML = `<strong>Cancelled</strong> — no files were deleted.`;
    } else {
      shortcutResultsSummary.innerHTML = `
        <strong>${total}</strong> filenames extracted from input<br>
        <span style="color: var(--green)">\u2713 ${removed} removed</span>
        ${notFound > 0 ? `<span style="color: var(--red)">\u2022 ${notFound} not found</span>` : ''}
        ${errors?.length > 0 ? `<span style="color: var(--red)">\u2022 ${errors.length} failed</span>` : ''}
      `;
    }
  } else {
    shortcutResultsSummary.innerHTML = `
      <strong>${total}</strong> filenames extracted from input<br>
      <span style="color: var(--green)">\u2713 ${newlySelected} newly selected</span>
      ${alreadySelected > 0 ? `<span style="color: var(--text-muted)">\u2022 ${alreadySelected} already selected</span>` : ''}
      ${notFound > 0 ? `<span style="color: var(--red)">\u2022 ${notFound} not found</span>` : ''}
    `;
  }

  shortcutResultsList.innerHTML = '';
  results.results.forEach(result => {
    const item = document.createElement('div');
    item.className = `result-item ${result.found ? 'found' : 'not-found'}`;

    const isRemoved = mode === 'remove' && result.found && !cancelled;
    const icon = isRemoved ? '\u2717' : (result.found ? '\u{1F4C4}' : '\u274C');
    const status = isRemoved
      ? 'Removed'
      : (result.found
        ? (result.alreadySelected ? 'Already selected' : `${result.matchType} (${Math.round(result.similarity * 100)}%)`)
        : 'Not found');

    item.dataset.path = result.filePath || result.path || result.original;
    if (result.found && !isRemoved) {
      const matchedPath = result.path || result.original;
      const unselectBtn = document.createElement('button');
      unselectBtn.className = 'result-unselect-btn';
      unselectBtn.textContent = '\u2716';
      unselectBtn.title = 'Remove from selection';
      unselectBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const { unselectMatchedFile } = await import('./core.js');
        unselectMatchedFile(item.dataset.path);
        item.classList.add('unselected');
        unselectBtn.disabled = true;
        item.querySelector('.result-item-status').textContent = 'Unselected';
      });

      item.innerHTML = `
        <span class="result-item-icon">${icon}</span>
        <span class="result-item-name">${matchedPath}</span>
        <span class="result-item-status">${status}</span>
      `;
      item.title = `Searched: ${result.original}`;
      item.appendChild(unselectBtn);
    } else {
      const displayName = result.found ? (result.path || result.original) : result.original;
      item.innerHTML = `
        <span class="result-item-icon">${icon}</span>
        <span class="result-item-name">${displayName}</span>
        <span class="result-item-status">${status}</span>
      `;
      item.title = result.found ? `Searched: ${result.original}` : '';
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
