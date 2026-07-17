const MAX_DISPLAY = 30;

let _treeCache = null;
let _repoPath = null;
let _filtered = [];
let _selectedIndex = 0;
let _open = false;
let _pickerEl = null;
let _inputEl = null;

function flattenTree(nodes) {
  const files = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      files.push({ name: node.name, path: node.path });
    } else if (node.type === 'folder' && node.children) {
      files.push(...flattenTree(node.children));
    }
  }
  return files;
}

function createPickerElement() {
  const el = document.createElement('div');
  el.className = 'oc-file-picker';
  el.innerHTML = '<div class="oc-file-picker-list" id="ocFilePickerList"></div>';
  el.style.display = 'none';
  return el;
}

export function isOpen() {
  return _open;
}

export async function ensureTreeLoaded(repoPath) {
  if (_repoPath === repoPath && _treeCache) return _treeCache;
  _repoPath = repoPath;
  try {
    const tree = await window.electronAPI.getFolderTree(repoPath);
    _treeCache = flattenTree(tree || []);
  } catch {
    _treeCache = [];
  }
  return _treeCache;
}

export function getCachedFiles() {
  return _treeCache || [];
}

export function clearCache() {
  _treeCache = null;
  _repoPath = null;
}

export function open(query, inputEl) {
  if (!_treeCache || !_treeCache.length) return;
  _inputEl = inputEl;
  const q = query.toLowerCase();
  const scored = [];
  for (const f of _treeCache) {
    const name = f.name.toLowerCase();
    const pathLc = f.path.toLowerCase();
    if (!pathLc.includes(q)) continue;
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else if (pathLc.includes('/' + q) || pathLc.includes('\\' + q)) score = 40;
    else score = 20;
    scored.push({ file: f, score });
  }
  scored.sort((a, b) => b.score - a.score || a.file.name.localeCompare(b.file.name));
  _filtered = scored.slice(0, MAX_DISPLAY).map(s => s.file);
  if (!_filtered.length) { close(); return; }
  _selectedIndex = 0;
  _open = true;
  if (!_pickerEl) {
    _pickerEl = createPickerElement();
    _pickerEl.addEventListener('click', onPickerClick);
  }
  const existing = document.getElementById('ocFilePickerList');
  if (existing) existing.innerHTML = renderList();
  if (_pickerEl.parentElement !== document.body) {
    document.body.appendChild(_pickerEl);
  }
  _pickerEl.style.display = 'block';

  requestAnimationFrame(() => {
    const inputRect = inputEl.getBoundingClientRect();
    const margin = 4;
    const spaceBelow = window.innerHeight - inputRect.bottom;
    const pickerH = _pickerEl.offsetHeight;
    const maxWidth = Math.min(inputRect.width, 480);

    let left = inputRect.left;
    if (left + maxWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - maxWidth - margin);
    }

    _pickerEl.style.left = left + 'px';
    _pickerEl.style.width = maxWidth + 'px';
    _pickerEl.style.right = 'auto';

    if (spaceBelow >= pickerH + margin * 2) {
      _pickerEl.style.top = (inputRect.bottom + margin) + 'px';
      _pickerEl.style.bottom = 'auto';
      _pickerEl.classList.remove('oc-file-picker--above');
    } else {
      _pickerEl.style.top = 'auto';
      _pickerEl.style.bottom = (window.innerHeight - inputRect.top + margin) + 'px';
      _pickerEl.classList.add('oc-file-picker--above');
    }
  });
}

export function close() {
  _open = false;
  _inputEl = null;
  if (_pickerEl) _pickerEl.style.display = 'none';
}

export function selectNext() {
  if (!_open || !_filtered.length) return;
  _selectedIndex = (_selectedIndex + 1) % _filtered.length;
  updateHighlight();
}

export function selectPrev() {
  if (!_open || !_filtered.length) return;
  _selectedIndex = (_selectedIndex - 1 + _filtered.length) % _filtered.length;
  updateHighlight();
}

export function confirmSelection(inputEl) {
  if (!_open || !_filtered.length) return;
  const selected = _filtered[_selectedIndex];
  if (!selected) return;
  const val = inputEl.value;
  const cursorPos = inputEl.selectionStart;
  const atIdx = val.lastIndexOf('@', cursorPos);
  if (atIdx === -1 || atIdx < val.lastIndexOf(' ', cursorPos)) return;
  const before = val.slice(0, atIdx);
  const after = val.slice(cursorPos);
  inputEl.value = before + selected.path + after;
  inputEl.selectionStart = inputEl.selectionEnd = (before + selected.path).length;
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  close();
  inputEl.focus();
}

function onPickerClick(e) {
  const item = e.target.closest('.oc-picker-item');
  if (!item || !_inputEl) return;
  const path = item.dataset.path;
  const idx = _filtered.findIndex(f => f.path === path);
  if (idx === -1) return;
  _selectedIndex = idx;
  confirmSelection(_inputEl);
}

export function destroy() {
  close();
  if (_pickerEl && _pickerEl.parentElement) _pickerEl.parentElement.removeChild(_pickerEl);
  _pickerEl = null;
  _treeCache = null;
  _repoPath = null;
}

function renderList() {
  return _filtered.map((f, i) => {
    const active = i === _selectedIndex ? ' oc-picker-item--active' : '';
    const name = f.path.split(/[/\\]/).pop();
    const dir = f.path.substring(0, f.path.length - name.length).replace(/[/\\]$/, '');
    return `<div class="oc-picker-item${active}" data-path="${f.path}">
      <span class="oc-picker-name">${name}</span>
      <span class="oc-picker-dir">${dir}</span>
    </div>`;
  }).join('');
}

function updateHighlight() {
  const list = document.getElementById('ocFilePickerList');
  if (!list) return;
  const items = list.querySelectorAll('.oc-picker-item');
  items.forEach((el, i) => el.classList.toggle('oc-picker-item--active', i === _selectedIndex));
  const active = items[_selectedIndex];
  if (active) active.scrollIntoView({ block: 'nearest' });
}
