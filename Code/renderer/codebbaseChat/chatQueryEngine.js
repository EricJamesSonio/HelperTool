const QUERY_TYPES = {
  dependencies: 'dependencies',
  dependents: 'dependents',
  symbols: 'symbols',
  importChain: 'importChain',
  circularDeps: 'circularDeps',
};

function _fmtImportedSymbols(symbolsStr) {
  if (!symbolsStr) return '';
  try {
    const arr = JSON.parse(symbolsStr);
    if (!Array.isArray(arr) || arr.length === 0) return '';
    return ' (' + arr.join(', ') + ')';
  } catch { return ''; }
}

function _ext(filePath) {
  const idx = filePath.lastIndexOf('.');
  return idx >= 0 ? filePath.slice(idx + 1).toUpperCase() : '';
}

class ChatQueryEngine {
  constructor(ipc) {
    this.ipc = ipc;
  }

  async executeQuery(queryType, repoPath, filePath) {
    switch (queryType) {
      case QUERY_TYPES.dependencies:
        return this._getDependencies(repoPath, filePath);
      case QUERY_TYPES.dependents:
        return this._getDependents(repoPath, filePath);
      case QUERY_TYPES.symbols:
        return this._getSymbols(repoPath, filePath);
      case QUERY_TYPES.importChain:
        return this._getImportChain(repoPath, filePath);
      case QUERY_TYPES.circularDeps:
        return this._getCircularDeps(repoPath, filePath);
      default:
        return 'Unknown query type.';
    }
  }

  async _getDependencies(repoPath, filePath) {
    const deps = await this.ipc.getDependencies({ repoPath, filePath });
    if (!deps || deps.length === 0) {
      return `## Dependencies of ${filePath}\n\nNo dependencies found.`;
    }

    const resolved = deps.filter(d => d.resolved_path);
    const unresolved = deps.filter(d => !d.resolved_path);

    let md = `## Dependencies of ${filePath}\n\n`;
    if (resolved.length) {
      md += `**Direct imports (${resolved.length}):**\n`;
      for (const d of resolved) {
        const syms = _fmtImportedSymbols(d.imported_symbols);
        md += `• [${_ext(d.resolved_path)}] ${d.resolved_path}${syms}\n`;
      }
      md += '\n';
    }
    if (unresolved.length) {
      md += `**Unresolved imports (${unresolved.length}):**\n`;
      for (const d of unresolved) {
        const syms = _fmtImportedSymbols(d.imported_symbols);
        md += `• ${d.import_path}${syms}\n`;
      }
    }
    return md.trim();
  }

  async _getDependents(repoPath, filePath) {
    const deps = await this.ipc.getDependents({ repoPath, filePath });
    if (!deps || deps.length === 0) {
      return `## Files that import ${filePath}\n\nNo files import ${filePath} directly.\n\nThis is likely an entry point.`;
    }

    let md = `## Files that import ${filePath}\n\n`;
    md += `**${deps.length} file${deps.length !== 1 ? 's' : ''}:**\n`;
    for (const d of deps) {
      const syms = _fmtImportedSymbols(d.imported_symbols);
      md += `• [${_ext(d.path)}] ${d.path}${syms}\n`;
    }
    return md.trim();
  }

  async _getSymbols(repoPath, filePath) {
    const symbols = await this.ipc.getSymbols({ repoPath, filePath });
    if (!symbols || symbols.length === 0) {
      return `## Symbols in ${filePath}\n\nNo symbols indexed for this file.`;
    }

    const byType = {};
    for (const s of symbols) {
      const t = s.type || 'other';
      if (!byType[t]) byType[t] = [];
      byType[t].push(s);
    }

    const typeLabels = {
      function: 'Functions',
      method: 'Methods',
      class: 'Classes',
      variable: 'Variables',
      constant: 'Constants',
      interface: 'Interfaces',
      type: 'Types',
      enum: 'Enums',
      component: 'Components',
      other: 'Other',
    };

    let md = `## Symbols in ${filePath}\n\n`;
    for (const [type, items] of Object.entries(byType)) {
      const label = typeLabels[type] || type.charAt(0).toUpperCase() + type.slice(1) + 's';
      md += `**${label} (${items.length}):**\n`;
      for (const s of items) {
        const sig = s.signature ? ` \`${s.signature}\`` : '';
        md += `• ${s.name} — line ${s.line}${sig}\n`;
      }
      md += '\n';
    }
    return md.trim();
  }

  async _getImportChain(repoPath, filePath) {
    const tree = await this.ipc.getImportChain({ repoPath, filePath });
    if (!tree) {
      return `## Import Chain from ${filePath}\n\nNo import chain data available.`;
    }

    function renderNode(node, indent, seen) {
      const s = new Set(seen);
      let prefix = indent > 0 ? '│   '.repeat(indent - 1) + '├── ' : '';
      let line = prefix + node.path;
      if (s.has(node.path)) return line + ' _(already shown)_\n';
      s.add(node.path);
      let result = line + '\n';
      if (node.children && node.children.length) {
        for (const child of node.children) {
          result += renderNode(child, indent + 1, s);
        }
      } else if (indent < 6) {
        result += '│   '.repeat(indent) + '└── (no further imports)\n';
      }
      return result;
    }

    let md = `## Import Chain from ${filePath}\n\n`;
    md += '```\n' + renderNode(tree, 0, new Set()) + '```';
    return md.trim();
  }

  async _getCircularDeps(repoPath, filePath) {
    const cycles = await this.ipc.getCircularDeps({ repoPath, filePath });
    if (!cycles || cycles.length === 0) {
      return `## Circular Dependencies involving ${filePath}\n\n✅ No circular dependencies found.`;
    }

    let md = `## Circular Dependencies involving ${filePath}\n\n⚠️ ${cycles.length} cycle${cycles.length !== 1 ? 's' : ''} detected:\n\n`;
    for (let i = 0; i < cycles.length; i++) {
      md += `**Cycle ${i + 1}:**\n  ${cycles[i].join(' → ')}\n\n`;
    }
    return md.trim();
  }

  generateSummary(queryType, filePath, rawAnswer) {
    switch (queryType) {
      case 'dependencies': {
        const resolved = (rawAnswer.match(/• \[/g) || []).length;
        const unresolved = (rawAnswer.match(/• [^\[]/g) || []).filter(m => !m.includes('```')).length;
        const total = resolved + unresolved;
        if (total === 0) return null;
        const warns = unresolved > 0 ? `${unresolved} are unresolved` : 'all resolved';
        return `**Summary:** *${filePath.split(/[/\\]/).pop()} imports **${total}** thing${total !== 1 ? 's' : ''} — ${warns}.*`;
      }
      case 'dependents': {
        const count = (rawAnswer.match(/• /g) || []).length;
        if (count === 0) return null;
        const label = count > 5 ? ' — high coupling' : count > 1 ? ' — shared utility' : ' — lightly used';
        return `**Summary:** *${count} file${count !== 1 ? 's' : ''} depend on this${label}.*`;
      }
      case 'symbols': {
        if (!rawAnswer.includes('**')) return null;
        const funcs = rawAnswer.match(/\*\*Functions? \(\d+\):/);
        const classes = rawAnswer.match(/\*\*Classes? \(\d+\):/);
        const consts = rawAnswer.match(/\*\*Constants? \(\d+\):/);
        const vars = rawAnswer.match(/\*\*Variables? \(\d+\):/);
        const parts = [];
        if (funcs) parts.push(funcs[0].match(/\d+/)[0] + ' functions');
        if (classes) parts.push(classes[0].match(/\d+/)[0] + ' classes');
        if (consts) parts.push(consts[0].match(/\d+/)[0] + ' constants');
        if (vars) parts.push(vars[0].match(/\d+/)[0] + ' variables');
        const all = parts.length ? parts.join(', ') : 'various exports';
        return `**Summary:** *${all} defined in ${filePath.split(/[/\\]/).pop()}.*`;
      }
      case 'importChain': {
        const maxDepth = (rawAnswer.match(/├── /g) || []).length;
        const totalFiles = (rawAnswer.match(/└── /g) || []).length + maxDepth;
        if (totalFiles === 0) return null;
        return `**Summary:** *Chain spans **~${Math.max(1, maxDepth)}** levels deep, **${totalFiles}** files total.*`;
      }
      case 'circularDeps': {
        if (rawAnswer.includes('✅')) return `**Summary:** *No circular dependencies. Clean!*`;
        const match = rawAnswer.match(/⚠️ (\d+) cycle/);
        if (match) {
          const count = parseInt(match[1]);
          const severity = count > 2 ? '⚠️⚠️ significant' : '⚠️ minor';
          return `**Summary:** *${count} cycle${count !== 1 ? 's' : ''} found — ${severity} — could cause runtime issues.*`;
        }
        return null;
      }
      default:
        return null;
    }
  }

  formatAsPrompt(filePath, queryType, answer) {
    const typeLabels = {
      dependencies: 'Find Dependencies',
      dependents: 'Find Dependents',
      symbols: 'Find Symbols',
      importChain: 'Trace Import Chain',
      circularDeps: 'Find Circular Deps',
    };
    return `I need help with my codebase. Here is the context:

FILE: ${filePath}
QUERY: ${typeLabels[queryType] || queryType}

RESULT:
${answer}

---
Please help me understand this and suggest improvements.`;
  }
}

const EMAIL_SLASH_REGEX = /^\/(\S+@\S+\.\S+)\s+(.*)$/;
const EMAIL_ALL_REGEX = /^\/all\s+(.*)$/i;

export async function detectAndHandleEmailQuery(rawInput) {
  let match = rawInput.match(EMAIL_SLASH_REGEX);
  let targetEmail = null;
  let question = '';

  if (match) {
    targetEmail = match[1];
    question = match[2];
  } else {
    match = rawInput.match(EMAIL_ALL_REGEX);
    if (match) {
      targetEmail = 'all';
      question = match[1];
    }
  }

  if (!targetEmail) return null;

  const data = await window.electronAPI.chatGetEmailData(targetEmail, null, {});
  if (!data.success) {
    return { isEmailQuery: true, response: 'Could not load email data: ' + (data.error || 'unknown error') };
  }

  return { isEmailQuery: true, response: answerEmailQuestion(question, targetEmail, data) };
}

function answerEmailQuestion(question, targetEmail, data) {
  const q = question.toLowerCase().trim();

  if (targetEmail === 'all') {
    return answerAcrossAllAccounts(q, data.accounts);
  }

  const messages = data.messages || [];
  const unreadMessages = messages.filter(m => m.isUnread);

  if (q.includes('how many') && q.includes('unread')) {
    return `You have **${data.totalUnread}** unread email${data.totalUnread !== 1 ? 's' : ''} in ${targetEmail}.`;
  }

  if (q.includes('summarize') || q.includes('summary')) {
    return buildSummary(targetEmail, messages);
  }

  if (q.includes('latest') || q.includes('most recent') || q.includes('newest')) {
    if (!messages.length) return `No recent emails found for ${targetEmail}.`;
    const latest = messages[0];
    return `Latest email in ${targetEmail}:\n**${latest.from}** — ${latest.subject}\n_${latest.snippet}_\n${formatRelativeTime(latest.date)}`;
  }

  const fromMatch = q.match(/from\s+(.+)/);
  if (fromMatch) {
    const senderQuery = fromMatch[1].trim();
    const matches = messages.filter(m =>
      m.from.toLowerCase().includes(senderQuery)
    );
    if (!matches.length) {
      return `No emails found from "${senderQuery}" in ${targetEmail}.`;
    }
    return matches.map(m =>
      `**${m.from}** — ${m.subject}\n_${m.snippet}_\n${formatRelativeTime(m.date)}`
    ).join('\n\n');
  }

  return buildSummary(targetEmail, messages);
}

function buildSummary(email, messages) {
  if (!messages.length) return `No fetched emails for ${email} yet.`;
  const unread = messages.filter(m => m.isUnread).length;
  const lines = messages.slice(0, 10).map(m =>
    `${m.isUnread ? '●' : '○'} **${m.from}** — ${m.subject}`
  );
  return `**${email}** — ${unread} unread of ${messages.length} fetched:\n\n${lines.join('\n')}`;
}

function answerAcrossAllAccounts(q, accounts) {
  const entries = Object.entries(accounts);
  if (!entries.length) return 'No Gmail accounts connected yet.';

  if (q.includes('how many') && q.includes('unread')) {
    const total = entries.reduce((sum, [, d]) => sum + (d.totalUnread || 0), 0);
    const breakdown = entries.map(([email, d]) => `  • ${email}: ${d.totalUnread} unread`).join('\n');
    return `**${total}** total unread across all accounts:\n${breakdown}`;
  }

  if (q.includes('summarize') || q.includes('summary')) {
    return entries.map(([email, d]) => buildSummary(email, d.messages)).join('\n\n---\n\n');
  }

  const total = entries.reduce((sum, [, d]) => sum + (d.totalUnread || 0), 0);
  return `You have **${total}** unread emails across ${entries.length} connected account${entries.length !== 1 ? 's' : ''}.`;
}

function formatRelativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default ChatQueryEngine;
