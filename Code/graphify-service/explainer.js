/**
 * graphify-service/explainer.js
 * Generates a 1-2 sentence human-readable explanation of why files were selected.
 * Pure logic — no AI call. Can be upgraded later.
 */

'use strict';

function explain(query, keywords, files) {
  if (!files || files.length === 0) {
    return `No relevant files found for "${query}".`;
  }

  // Get short basenames for the top 3 files
  const topNames = files
    .slice(0, 3)
    .map(f => f.split('/').pop().replace(/\.[^.]+$/, ''));

  const keywordStr = keywords.slice(0, 3).join(', ');
  const fileCount  = files.length;
  const plural     = fileCount === 1 ? 'file' : 'files';

  if (fileCount === 1) {
    return `Found 1 file directly matching "${keywordStr}": ${topNames[0]}.`;
  }

  const topList = topNames.join(', ');
  const rest    = fileCount > 3 ? ` and ${fileCount - 3} more via import graph` : '';

  return `Found ${fileCount} ${plural} related to "${keywordStr}". Core: ${topList}${rest}.`;
}

module.exports = { explain };