import { esc, num, ago, dateLong, sizeKb, langColor, initial } from './format.js';

const SV = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">';

export const ICON = {
  repo: SV + '<path d="M4 3h9a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2V3z"/><path d="M4 15a2 2 0 0 1 2-2h9"/></svg>',
  star: SV + '<path d="M10 2.5l2.3 4.8 5.2.7-3.8 3.7.9 5.2L10 14.4l-4.6 2.5.9-5.2L2.5 8l5.2-.7L10 2.5z"/></svg>',
  fork: SV + '<circle cx="5" cy="4" r="2"/><circle cx="15" cy="4" r="2"/><circle cx="10" cy="16" r="2"/><path d="M5 6v2a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6"/><path d="M10 10v4"/></svg>',
  eye: SV + '<path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10z"/><circle cx="10" cy="10" r="2.5"/></svg>',
  issue: SV + '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="1" fill="currentColor"/></svg>',
  people: SV + '<circle cx="7.5" cy="7" r="3"/><path d="M2 17c.5-3 2.8-4.5 5.5-4.5S12.5 14 13 17"/><circle cx="14" cy="7.5" r="2.3"/><path d="M14.5 12.5c2 .2 3.2 1.5 3.5 4"/></svg>',
  disk: SV + '<ellipse cx="10" cy="5" rx="6.5" ry="2.5"/><path d="M3.5 5v10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V5"/></svg>',
  open: SV + '<path d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5V12"/><path d="M11 4h5v5M16 4l-6 6"/></svg>',
  copy: SV + '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13H7"/></svg>',
  branch: SV + '<circle cx="5" cy="4" r="2"/><circle cx="5" cy="16" r="2"/><circle cx="15" cy="7" r="2"/><path d="M5 6v8"/><path d="M15 9c0 3-5 2-9.5 5"/></svg>',
  folder: SV + '<path d="M2 7v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H9L7 4H4a2 2 0 0 0-2 2v1z"/></svg>',
  commit: SV + '<circle cx="10" cy="10" r="3"/><path d="M2 10h5M13 10h5"/></svg>',
  link: SV + '<path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-1 1"/><path d="M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l1-1"/></svg>',
};

function avatar(url, name, cls) {
  let img = '';
  if (url) {
    const sep = url.indexOf('?') === -1 ? '?' : '&';
    img = '<img src="' + esc(url + sep + 's=96') + '" alt="" referrerpolicy="no-referrer">';
  }
  return '<span class="rd-av ' + (cls || '') + '"><span class="rd-av-l">' + esc(initial(name)) + '</span>' + img + '</span>';
}

function linkBtn(url, label, icon, cls) {
  if (!url) return '';
  return '<button type="button" class="rd-act ' + (cls || '') + '" data-url="' + esc(url) + '">' + icon + '<span>' + esc(label) + '</span></button>';
}

function stat(icon, value, label, tone) {
  return '<div class="rd-stat ' + (tone || '') + '">' +
    '<span class="rd-stat-ic">' + icon + '</span>' +
    '<span class="rd-stat-v">' + esc(value) + '</span>' +
    '<span class="rd-stat-l">' + esc(label) + '</span>' +
  '</div>';
}

function row(label, valueHtml) {
  return '<div class="rd-row"><span class="rd-row-k">' + esc(label) + '</span><span class="rd-row-v">' + valueHtml + '</span></div>';
}

function card(title, icon, bodyHtml, extra) {
  return '<section class="rd-card">' +
    '<div class="rd-card-h"><span class="rd-card-t">' + icon + '<span>' + esc(title) + '</span></span>' + (extra || '') + '</div>' +
    '<div class="rd-card-b">' + bodyHtml + '</div>' +
  '</section>';
}

function localCard(local) {
  if (!local) return '';
  let body = '';
  body += row('Folder', '<span class="rd-mono" title="' + esc(local.path) + '">' + esc(local.path) + '</span>');
  if (local.isRepo) {
    body += row('Branch', local.branch ? '<span class="rd-mono">' + esc(local.branch) + '</span>' : '-');
    body += row('Origin', local.remote ? '<span class="rd-mono" title="' + esc(local.remote) + '">' + esc(local.remote) + '</span>' : 'none');
    body += row('Local commits', local.commitCount != null ? esc(num(local.commitCount)) : '-');
  } else {
    body += row('Git', 'Not a git repository');
  }
  return card('This copy on your PC', ICON.folder, body);
}

function contributorsCard(d) {
  const list = d.contributors || [];
  if (!list.length) {
    return card('Contributors', ICON.people, '<div class="rd-empty">No contributor data available.</div>');
  }
  const max = list[0].contributions || 1;
  let body = '<div class="rd-contribs">';
  list.forEach((c, i) => {
    const pct = Math.max(3, Math.round((c.contributions / max) * 100));
    body += '<div class="rd-contrib" data-url="' + esc(c.htmlUrl) + '" title="Open ' + esc(c.login) + ' on GitHub">' +
      '<span class="rd-contrib-rank">' + (i + 1) + '</span>' +
      avatar(c.avatarUrl, c.login, 'rd-av-md') +
      '<div class="rd-contrib-info">' +
        '<div class="rd-contrib-name">' + esc(c.login) + (c.type === 'Bot' ? ' <span class="rd-tag">bot</span>' : '') + '</div>' +
        '<div class="rd-contrib-bar"><span style="width:' + pct + '%"></span></div>' +
      '</div>' +
      '<span class="rd-contrib-n">' + esc(num(c.contributions)) + '</span>' +
    '</div>';
  });
  body += '</div>';
  const extra = '<span class="rd-count">' + list.length + (d.contributorsMore ? '+' : '') + '</span>';
  return card('Contributors', ICON.people, body, extra);
}

function commitsCard(d) {
  const list = d.commits || [];
  if (!list.length) {
    return card('Recent commits', ICON.commit, '<div class="rd-empty">No commits found.</div>');
  }
  let body = '<div class="rd-commits">';
  for (const c of list) {
    body += '<div class="rd-commit" data-url="' + esc(c.htmlUrl) + '" title="Open this commit on GitHub">' +
      avatar(c.avatarUrl, c.login || c.author, 'rd-av-sm') +
      '<div class="rd-commit-info">' +
        '<div class="rd-commit-msg">' + esc(c.message) + '</div>' +
        '<div class="rd-commit-meta">' + esc(c.login || c.author) + ' &middot; ' + esc(ago(c.date)) + '</div>' +
      '</div>' +
      '<span class="rd-sha">' + esc(String(c.sha || '').slice(0, 7)) + '</span>' +
    '</div>';
  }
  body += '</div>';
  return card('Recent commits', ICON.commit, body);
}

function languagesCard(d) {
  const list = d.languages || [];
  if (!list.length) return '';
  let bar = '<div class="rd-lang-bar">';
  let legend = '<div class="rd-lang-legend">';
  for (const l of list) {
    const color = langColor(l.name);
    bar += '<span style="width:' + l.pct + '%;background:' + color + '" title="' + esc(l.name) + ' ' + l.pct + '%"></span>';
    legend += '<span class="rd-lang"><i style="background:' + color + '"></i>' + esc(l.name) + '<b>' + l.pct + '%</b></span>';
  }
  bar += '</div>';
  legend += '</div>';
  return card('Languages', ICON.disk, bar + legend);
}

function aboutCard(r) {
  let body = '';
  body += row('Owner', '<span class="rd-link" data-url="' + esc(r.owner.htmlUrl) + '">' + esc(r.owner.login) + '</span> <span class="rd-tag">' + esc(r.owner.type) + '</span>');
  body += row('Visibility', esc(r.visibility));
  body += row('License', r.license ? esc(r.license) : 'None detected');
  body += row('Default branch', '<span class="rd-mono">' + esc(r.defaultBranch) + '</span>');
  body += row('Main language', r.language ? esc(r.language) : '-');
  body += row('Created', esc(dateLong(r.createdAt)));
  body += row('Last push', esc(dateLong(r.pushedAt)) + ' <span class="rd-dim">(' + esc(ago(r.pushedAt)) + ')</span>');
  if (r.parent) {
    body += row('Forked from', '<span class="rd-link" data-url="' + esc(r.parent.htmlUrl) + '">' + esc(r.parent.fullName) + '</span>');
  }
  return card('About', ICON.repo, body);
}

function linksCard(r) {
  const base = r.htmlUrl;
  const items = [
    ['Issues', '/issues'],
    ['Pull requests', '/pulls'],
    ['Actions', '/actions'],
    ['Releases', '/releases'],
    ['Branches', '/branches'],
    ['Insights', '/pulse'],
  ];
  let body = '<div class="rd-links">';
  for (const it of items) {
    body += '<button type="button" class="rd-link-btn" data-url="' + esc(base + it[1]) + '">' + ICON.open + '<span>' + esc(it[0]) + '</span></button>';
  }
  body += '</div>';
  return card('Jump to', ICON.link, body);
}

function heroHtml(r) {
  const badges = [];
  badges.push('<span class="rd-badge ' + (r.private ? 'priv' : 'pub') + '">' + esc(r.visibility) + '</span>');
  if (r.fork) badges.push('<span class="rd-badge">Fork</span>');
  if (r.archived) badges.push('<span class="rd-badge warn">Archived</span>');
  const topics = (r.topics || []).map((t) => '<span class="rd-topic">' + esc(t) + '</span>').join('');
  return '<section class="rd-hero">' +
    avatar(r.owner.avatarUrl, r.owner.login, 'rd-av-xl') +
    '<div class="rd-hero-main">' +
      '<div class="rd-title">' +
        '<span class="rd-owner" data-url="' + esc(r.owner.htmlUrl) + '">' + esc(r.owner.login) + '</span>' +
        '<span class="rd-slash">/</span>' +
        '<span class="rd-name">' + esc(r.name) + '</span>' +
        badges.join('') +
      '</div>' +
      '<p class="rd-desc">' + (r.description ? esc(r.description) : '<span class="rd-dim">No description provided.</span>') + '</p>' +
      (topics ? '<div class="rd-topics">' + topics + '</div>' : '') +
      '<div class="rd-actions">' +
        linkBtn(r.htmlUrl, 'Open on GitHub', ICON.open, 'primary') +
        linkBtn(r.owner.htmlUrl, 'Owner profile', ICON.people, '') +
        linkBtn(r.homepage, 'Homepage', ICON.link, '') +
        '<button type="button" class="rd-act" data-copy="' + esc(r.cloneUrl) + '">' + ICON.copy + '<span>Copy clone URL</span></button>' +
      '</div>' +
    '</div>' +
  '</section>';
}

function statsHtml(d) {
  const r = d.repo;
  const contribs = (d.contributors || []).length + (d.contributorsMore ? '+' : '');
  return '<div class="rd-stats">' +
    stat(ICON.star, num(r.stars), 'Stars', 'yellow') +
    stat(ICON.fork, num(r.forks), 'Forks', 'blue') +
    stat(ICON.eye, num(r.watchers), 'Watchers', 'purple') +
    stat(ICON.issue, num(r.openIssues), 'Issues & PRs', 'green') +
    stat(ICON.people, contribs, 'Contributors', 'accent') +
    stat(ICON.disk, sizeKb(r.size), 'Repo size', '') +
  '</div>';
}

export function renderLoading() {
  return '<div class="rd-wrap">' +
    '<div class="rd-skel rd-skel-hero"></div>' +
    '<div class="rd-skel-row"><div class="rd-skel"></div><div class="rd-skel"></div><div class="rd-skel"></div><div class="rd-skel"></div><div class="rd-skel"></div><div class="rd-skel"></div></div>' +
    '<div class="rd-skel rd-skel-block"></div>' +
  '</div>';
}

export function renderMessage(title, text) {
  return '<div class="rd-wrap"><div class="rd-msg">' +
    '<div class="rd-msg-t">' + esc(title) + '</div>' +
    '<div class="rd-msg-x">' + esc(text) + '</div>' +
  '</div></div>';
}

const REASONS = {
  'not-repo': 'This folder is not a git repository, so there is no GitHub page to show.',
  'no-remote': 'This repository has no remote named origin. Add one (git remote add origin <url>) to see its GitHub details here.',
  'not-github': 'The origin remote of this repository is not on GitHub, so only local details are shown.',
};

function renderNoRemote(d) {
  const text = d.reason === 'error' ? d.error : (REASONS[d.reason] || 'No GitHub details are available for this repository.');
  const title = d.reason === 'error' ? 'GitHub details unavailable' : 'No GitHub page for this repo';
  let actions = '';
  if (d.ref && d.ref.htmlUrl) {
    actions = '<div class="rd-actions rd-actions-c">' + linkBtn(d.ref.htmlUrl, 'Try opening on GitHub', ICON.open, 'primary') + '</div>';
  }
  return '<div class="rd-wrap">' +
    '<div class="rd-msg"><div class="rd-msg-t">' + esc(title) + '</div><div class="rd-msg-x">' + esc(text) + '</div>' + actions + '</div>' +
    localCard(d.local) +
  '</div>';
}

export function renderDetails(d) {
  if (!d || !d.repo) return renderNoRemote(d || {});
  const notes = (d.notes || []).map((n) => '<div class="rd-note">' + esc(n) + '</div>').join('');
  return '<div class="rd-wrap">' +
    heroHtml(d.repo) +
    notes +
    statsHtml(d) +
    '<div class="rd-grid">' +
      '<div class="rd-col">' + contributorsCard(d) + commitsCard(d) + '</div>' +
      '<div class="rd-col">' + aboutCard(d.repo) + languagesCard(d) + linksCard(d.repo) + localCard(d.local) + '</div>' +
    '</div>' +
  '</div>';
}