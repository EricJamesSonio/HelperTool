const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const RULES_DIR = app.isPackaged
  ? path.join(process.resourcesPath, '.Resources', 'Rules')
  : path.join(__dirname, '..', '..', '..', '.Resources', 'Rules');

function _displayName(key) {
  if (key === 'ddd') return 'DDD';
  if (key === 'ai') return 'AI';
  return key.split(/[_-]/).map(w => {
    if (w.length <= 2) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

function _extractTitle(content, fallback) {
  const heading = content.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  const lines = content.split('\n').map(l => l.trim()).filter(l => l);
  return lines.length ? lines[0].replace(/\r/g, '') : fallback;
}

function _extractSummary(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (lines.length < 2) return '';
  return lines[1].replace(/\*\*/g, '').replace(/\r/g, '').slice(0, 140);
}

function _buildTags(categoryKey, content) {
  const words = content.toLowerCase().split(/\s+/);
  const freq = {};
  const stopWords = new Set(['the','and','for','are','not','you','that','this','with',
    'from','your','each','will','which','their','have','been','use','can','all',
    'should','also','into','than','then','just','very','what','when','where','how']);
  for (const w of words) {
    const c = w.replace(/[^a-z0-9#]/g, '');
    if (c.length > 3 && !stopWords.has(c)) freq[c] = (freq[c] || 0) + 1;
  }
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
  return [categoryKey, ...top].join(', ');
}

function loadRulesData() {
  let files;
  try { files = fs.readdirSync(RULES_DIR).filter(f => f.endsWith('.md')); }
  catch { return { categories: [], blueprints: {} }; }

  const categories = [];
  const blueprints = {};
  const seenCat = new Set();

  for (const file of files.sort()) {
    const content = fs.readFileSync(path.join(RULES_DIR, file), 'utf-8');
    const key = file.replace(/\.md$/, '');
    const dotParts = key.split('.');
    let categoryKey, blueprintKey;
    if (dotParts.length >= 2) {
      categoryKey = dotParts[0];
      blueprintKey = dotParts.slice(1).join('.');
    } else {
      const h = key.indexOf('-');
      if (h > 0) { categoryKey = key.slice(0, h); blueprintKey = key.slice(h + 1); }
      else { categoryKey = key; blueprintKey = key; }
    }
    const categoryName = _displayName(categoryKey);
    const blueprintName = _displayName(blueprintKey);

    if (!seenCat.has(categoryName)) {
      seenCat.add(categoryName);
      const type = categoryKey === 'framework-setup' ? 'setup-steps' : 'code';
      categories.push({ name: categoryName, type });
    }
    if (!blueprints[categoryName]) blueprints[categoryName] = [];

    const title = _extractTitle(content, blueprintName);

    blueprints[categoryName].push({
      name: title,
      description: _extractSummary(content) || `Blueprint for ${blueprintName}`,
      pseudo_code: content,
      tags: _buildTags(categoryKey, content),
    });
  }

  return { categories, blueprints };
}

module.exports = { loadRulesData };
