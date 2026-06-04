import { getTableDetailHtml } from './template.js';

export function renderDetails(details) {
  const placeholder = document.getElementById('dbiDetailPlaceholder');
  const content = document.getElementById('dbiDetailContent');
  if (!placeholder || !content) return;

  placeholder.style.display = 'none';
  content.style.display = '';
  content.innerHTML = getTableDetailHtml(details);
}
