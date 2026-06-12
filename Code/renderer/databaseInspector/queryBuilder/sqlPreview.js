import { state } from './state.js';
import { highlightSql, highlightMongo } from './utils.js';

export function render(container) {
  if (!container) return;
  const query = state.builtQuery;
  if (!query) {
    container.innerHTML = '';
    return;
  }

  const isMongo = state.dbType === 'mongodb';
  const highlighted = isMongo ? highlightMongo(query) : highlightSql(query);

  container.innerHTML = `
    <div class="qb-preview">
      <div class="qb-preview-label">Preview</div>
      <pre class="qb-preview-code">${highlighted}</pre>
    </div>
  `;
}
