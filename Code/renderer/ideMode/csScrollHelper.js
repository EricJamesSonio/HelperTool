import { getTerminalInstances } from '../codeswampUI/terminalManager.js';

const PAGE_SEQ = {
  up: '\x1b[5~',
  down: '\x1b[6~',
};

const BUTTONS = [
  { act: 'top', title: 'Jump to top', path: 'M4 3.5h8M8 12.5v-7M5 8l3-3 3 3' },
  { act: 'up', title: 'Scroll up (hold to repeat)', path: 'M4 10l4-4 4 4' },
  { act: 'down', title: 'Scroll down (hold to repeat)', path: 'M4 6l4 4 4-4' },
  { act: 'bottom', title: 'Jump to latest', path: 'M4 12.5h8M8 3.5v7M5 8l3 3 3-3' },
];

const seen = new WeakSet();
let globalBound = false;
let holdDelay = 0;
let holdTick = 0;

function findInstance(div) {
  const all = getTerminalInstances();
  for (const key of Object.keys(all)) {
    const inst = all[key];
    if (inst && inst.div === div) return inst;
  }
  return null;
}

function homeEndSeq(term, act) {
  const app = !!(term.modes && term.modes.applicationCursorKeysMode);
  if (act === 'top') return app ? '\x1bOH' : '\x1b[H';
  return app ? '\x1bOF' : '\x1b[F';
}

function perform(div, act) {
  const inst = findInstance(div);
  if (!inst || !inst.terminal) return;
  const term = inst.terminal;
  if (term.buffer.active.type === 'alternate') {
    const seq = act === 'up' || act === 'down' ? PAGE_SEQ[act] : homeEndSeq(term, act);
    term.input(seq, true);
    return;
  }
  if (act === 'top') {
    term.scrollToTop();
    return;
  }
  if (act === 'bottom') {
    term.scrollToBottom();
    return;
  }
  const step = Math.max(3, Math.floor(term.rows / 2));
  term.scrollLines(act === 'up' ? -step : step);
}

function stopHold() {
  clearTimeout(holdDelay);
  clearInterval(holdTick);
  holdDelay = 0;
  holdTick = 0;
}

function startHold(div, act) {
  stopHold();
  holdDelay = setTimeout(() => {
    holdTick = setInterval(() => perform(div, act), 90);
  }, 380);
}

function buildRail(div) {
  const rail = document.createElement('div');
  rail.className = 'ide-cs-rail';
  let html = '';
  for (let i = 0; i < BUTTONS.length; i++) {
    const b = BUTTONS[i];
    if (i === 1 || i === 3) html += '<span class="ide-cs-rail-sep"></span>';
    html += '<button type="button" class="ide-cs-rail-btn" data-act="' + b.act + '" title="' + b.title + '"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="' + b.path + '"/></svg></button>';
  }
  rail.innerHTML = html;
  rail.addEventListener('mousedown', (e) => e.preventDefault());
  rail.addEventListener('click', (e) => e.stopPropagation());
  rail.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('.ide-cs-rail-btn');
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    const act = target.dataset.act;
    perform(div, act);
    if (act === 'up' || act === 'down') startHold(div, act);
  });
  return rail;
}

function scan(container) {
  const nodes = container.querySelectorAll('.oc-term-instance');
  nodes.forEach((div) => {
    if (seen.has(div)) return;
    seen.add(div);
    div.appendChild(buildRail(div));
  });
}

export function attach(container) {
  if (!container || container.dataset.csRail === '1') return;
  container.dataset.csRail = '1';
  if (!globalBound) {
    globalBound = true;
    document.addEventListener('pointerup', stopHold);
    document.addEventListener('pointercancel', stopHold);
  }
  scan(container);
  new MutationObserver(() => scan(container)).observe(container, { childList: true });
}