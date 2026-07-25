import { state } from '../state.js';
import { getResearcher } from '../template.js';
import { openSplitView } from './splitView.js';

export function initHome() {
  const grid = document.getElementById('rsResearcherGrid');
  if (!grid) return;

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.rs-researcher-card');
    if (!card) return;
    const id = card.dataset.id;
    const researcher = getResearcher(id);
    if (!researcher) return;

    state.selectedResearcher = researcher;
    openSplitView(researcher);
  });
}