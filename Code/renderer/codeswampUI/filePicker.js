const MAX_DISPLAY = 30;

let _treeCache = null;
let _repoPath = null;
let _filtered = [];
let _selectedIndex = 0;
let _open = false;
let _pickerEl = null;

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
  const q = query.toLowerCase();
  _filtered = _treeCache.filter(f => f.path.toLowerCase().includes(q)).slice(0, MAX_DISPLAY);
  if (!_filtered.length) { close(); return; }
  _selectedIndex = 0;
  _open = true;
  if (!_pickerEl) _pickerEl = createPickerElement();
  const existing = document.getElementById('ocFilePickerList');
  if (existing) existing.innerHTML = renderList();
  const parent = inputEl.parentElement;
  if (_pickerEl.parentElement !== parent) parent.appendChild(_pickerEl);
  _pickerEl.style.display = 'block';
}

export function close() {
  _open = false;
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
  const atIdx = val.lastIndexOf('@');
  if (atIdx === -1) return;
  const before = val.slice(0, atIdx);
  const spaceAfter = val.indexOf(' ', atIdx);
  const after = spaceAfter === -1 ? '' : val.slice(spaceAfter);
  inputEl.value = before + selected.path + after;
  inputEl.selectionStart = inputEl.selectionEnd = (before + selected.path).length;
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  close();
  inputEl.focus();
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
