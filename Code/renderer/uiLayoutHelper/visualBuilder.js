let _idCounter = 0;
function _uid() { return 'vb_' + (++_idCounter); }

const TYPE_META = {
  box:    { label: 'Box',     color: '#60a5fa', icon: '▣' },
  hsplit: { label: 'HSplit',  color: '#34d399', icon: '⇔' },
  vsplit: { label: 'VSplit',  color: '#a78bfa', icon: '⇕' },
  label:  { label: 'Label',   color: '#fbbf24', icon: 'Aa' },
  spacer: { label: 'Spacer',  color: '#6b7280', icon: '⋯' },
};

const CHILD_TYPES = { hsplit: true, vsplit: true, box: true };

let _tree = null;
let _onChange = null;
let _container = null;

export function getTree() { return _tree; }
export function setOnChange(fn) { _onChange = fn; }

function _find(id, node) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const c of (node.children || [])) {
    const f = _find(id, c);
    if (f) return f;
  }
  return null;
}

function _findParent(id, node, par) {
  if (!node) return null;
  if (node.children && node.children.some(c => c.id === id)) return { parent: node };
  for (const c of (node.children || [])) {
    const f = _findParent(id, c, node);
    if (f) return f;
  }
  return null;
}

function _remove(id, parent) {
  if (!parent || !parent.children) return false;
  const idx = parent.children.findIndex(c => c.id === id);
  if (idx >= 0) { parent.children.splice(idx, 1); return true; }
  for (const c of parent.children) {
    if (_remove(id, c)) return true;
  }
  return false;
}

function _mkNode(type, props) {
  return { id: _uid(), type, ...props, children: CHILD_TYPES[type] ? [] : undefined };
}

const DEFAULTS = {
  box:    { label: 'Box', border: 'single', minWidth: 30, minHeight: 3 },
  hsplit: { label: 'Split', ratio: [1, 1], gap: 1 },
  vsplit: { label: 'Stack', gap: 1 },
  label:  { text: 'text here' },
  spacer: { width: 2, height: 1 },
};

export function addNode(type, parentId, index) {
  const node = _mkNode(type, DEFAULTS[type] || {});
  if (parentId && _tree) {
    const p = _find(parentId, _tree);
    if (p && p.children) {
      p.children.splice(index !== undefined ? Math.min(index, p.children.length) : p.children.length, 0, node);
    } else { return; }
  } else {
    if (!_tree) { _tree = node; }
    else if (_tree.children) { _tree.children.push(node); }
    else { return; }
  }
  _render(); _onChange?.();
}

export function removeNode(id) {
  if (!_tree) return;
  if (_tree.id === id) { _tree = null; }
  else { _remove(id, _tree); }
  _render(); _onChange?.();
}

export function updateNode(id, props) {
  const n = _find(id, _tree);
  if (!n) return;
  Object.assign(n, props);
  _render(); _onChange?.();
}

export function moveNode(id, newParentId, newIndex) {
  const node = _find(id, _tree);
  if (!node) return;
  const old = _findParent(id, _tree, null);
  if (old) {
    const i = old.parent.children.findIndex(c => c.id === id);
    if (i >= 0) old.parent.children.splice(i, 1);
  } else if (_tree && _tree.id === id) { return; }
  const np = newParentId ? _find(newParentId, _tree) : _tree;
  if (!np || !np.children) return;
  np.children.splice(Math.min(newIndex || 0, np.children.length), 0, node);
  _render(); _onChange?.();
}

export function toDSL(node) {
  const n = node || _tree;
  if (!n) return null;
  const d = { type: n.type };
  if (n.label && n.type !== 'spacer') d.label = n.label;
  if (n.border && n.type === 'box') d.border = n.border;
  if (n.minWidth && n.type === 'box') d.minWidth = n.minWidth;
  if (n.minHeight && n.type === 'box') d.minHeight = n.minHeight;
  if (n.text && n.type === 'label') d.text = n.text;
  if (n.width && n.type === 'spacer') d.width = n.width;
  if (n.height && n.type === 'spacer') d.height = n.height;
  if (n.ratio && (n.type === 'hsplit' || n.type === 'vsplit')) d.ratio = n.ratio;
  if (n.gap && (n.type === 'hsplit' || n.type === 'vsplit')) d.gap = n.gap;
  if (n.children?.length) d.children = n.children.map(c => toDSL(c));
  return d;
}

export function loadDSL(dsl) {
  function _from(d) {
    const n = { id: _uid(), type: d.type };
    ['label','border','text','ratio','gap','minWidth','minHeight','width','height'].forEach(k => { if (d[k] !== undefined) n[k] = d[k]; });
    if (d.children?.length) { n.children = d.children.map(c => _from(c)); }
    else if (CHILD_TYPES[d.type]) { n.children = []; }
    return n;
  }
  _tree = dsl ? _from(dsl) : null;
  _render(); _onChange?.();
}

export function startPaletteDrag(type, e) {
  e.dataTransfer.setData('text/plain', JSON.stringify({ type }));
  e.dataTransfer.effectAllowed = 'copy';
}

export function renderVisualBuilder(container) {
  _container = container;
  _render();
}

/* ─── Border style map ─── */

const BORDER_STYLES = {
  single:  '1px solid rgba(160,180,220,0.5)',
  double:  '3px double rgba(160,180,220,0.5)',
  rounded: '1px solid rgba(160,180,220,0.5)',
  thick:   '2px solid rgba(160,180,220,0.5)',
  none:    'none',
};
const BORDER_RADII = { single: 0, double: 0, rounded: 6, thick: 0, none: 0 };

/* ─── Render ─── */

function _render() {
  if (!_container) return;
  _container.innerHTML = '';

  const canvas = document.createElement('div');
  canvas.className = 'vb-canvas';
  canvas.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; canvas.classList.add('vb-drop'); });
  canvas.addEventListener('dragleave', () => canvas.classList.remove('vb-drop'));
  canvas.addEventListener('drop', e => {
    e.preventDefault(); canvas.classList.remove('vb-drop');
    _canvasDrop(e);
  });

  if (!_tree) {
    const empty = document.createElement('div');
    empty.className = 'vb-empty';
    empty.innerHTML = `
      <div class="vb-empty-icon">▣  ⇔  ⇕  Aa  ⋯</div>
      <div class="vb-empty-text">Drag a component here or click one in the sidebar</div>
    `;
    canvas.appendChild(empty);
  } else {
    const view = document.createElement('div');
    view.className = 'vb-view';
    _renderShape(_tree, view, 0);
    canvas.appendChild(view);
  }
  _container.appendChild(canvas);
}

function _canvasDrop(e) {
  try {
    const d = JSON.parse(e.dataTransfer.getData('text/plain'));
    if (d.type) addNode(d.type, null, 0);
  } catch {}
}

/* ─── Render one shape (WYSIWYG) ─── */

function _renderShape(node, parentEl, depth) {
  const el = document.createElement('div');
  el.className = 'vb-shape';
  el.dataset.nid = node.id;

  if (node.type === 'spacer') {
    el.className += ' vb-shape--spacer';
    el.innerHTML = `<div class="vb-spacer-line"></div>`;
    _wire(el, node);
    parentEl.appendChild(el);
    return;
  }

  if (node.type === 'label') {
    el.className += ' vb-shape--label';
    el.textContent = node.text || 'text';
    _wire(el, node);
    parentEl.appendChild(el);
    return;
  }

  // Box / HSplit / VSplit — render as a shaped container
  const isBox = node.type === 'box';
  const isH = node.type === 'hsplit';
  const isV = node.type === 'vsplit';

  const bStyle = BORDER_STYLES[node.border] || BORDER_STYLES.single;
  const bRad = BORDER_RADII[node.border] || 0;

  el.style.border = bStyle;
  if (bRad) el.style.borderRadius = bRad + 'px';
  if (isH) el.className += ' vb-shape--h';
  if (isV) el.className += ' vb-shape--v';

  // Label ribbon
  if (isBox) {
    const ribbon = document.createElement('div');
    ribbon.className = 'vb-ribbon';
    ribbon.textContent = node.label || 'Box';
    el.appendChild(ribbon);
  } else {
    const ribbon = document.createElement('div');
    ribbon.className = 'vb-ribbon vb-ribbon--split';
    const meta = TYPE_META[node.type];
    ribbon.innerHTML = `<span style="color:${meta.color}">${meta.icon}</span> ${_esc(node.label || meta.label)}`;
    el.appendChild(ribbon);
  }

  // Children area (only for containers)
  const zone = document.createElement('div');
  zone.className = 'vb-zone' + (isH ? ' vb-zone--h' : '') + (isV ? ' vb-zone--v' : '');

  if (!node.children || node.children.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'vb-zone-hint';
    hint.textContent = isH ? 'drop →' : 'drop ↓';
    zone.appendChild(hint);
  } else {
    for (let i = 0; i < node.children.length; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'vb-wrap';
      wrap.dataset.ci = i;
      _renderShape(node.children[i], wrap, depth + 1);
      _wireWrap(wrap, node, i);
      zone.appendChild(wrap);
    }
  }

  // Drop on zone (append at end)
  zone.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; zone.classList.add('vb-zone--over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('vb-zone--over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('vb-zone--over');
    _zoneDrop(e, node.id, node.children?.length || 0);
  });

  el.appendChild(zone);
  _wire(el, node);
  parentEl.appendChild(el);
}

/* ─── Wire shape (selection + controls) ─── */

function _wire(el, node) {
  const ctrl = document.createElement('div');
  ctrl.className = 'vb-ctrl';

  const del = document.createElement('button');
  del.className = 'vb-ctrl-btn';
  del.textContent = '✕';
  del.title = 'Delete';
  del.addEventListener('click', e => { e.stopPropagation(); removeNode(node.id); });
  ctrl.appendChild(del);

  const edit = document.createElement('button');
  edit.className = 'vb-ctrl-btn';
  edit.textContent = '✎';
  edit.title = 'Edit';
  edit.addEventListener('click', e => { e.stopPropagation(); _editNode(node); });
  ctrl.appendChild(edit);

  if (CHILD_TYPES[node.type]) {
    const add = document.createElement('button');
    add.className = 'vb-ctrl-btn';
    add.textContent = '+';
    add.title = 'Add child';
    add.addEventListener('click', e => { e.stopPropagation(); _addMenu(node, add); });
    ctrl.appendChild(add);
  }

  el.appendChild(ctrl);

  // Click to select
  el.addEventListener('click', e => {
    document.querySelectorAll('.vb-shape--sel').forEach(s => s.classList.remove('vb-shape--sel'));
    el.classList.add('vb-shape--sel');
  });
}

/* ─── Wrap (draggable child item) ─── */

function _wireWrap(el, parentNode, childIndex) {
  el.draggable = true;

  el.addEventListener('dragstart', e => {
    const cid = el.querySelector('.vb-shape')?.dataset?.nid;
    if (!cid) return;
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: cid, fromPid: parentNode.id }));
    e.dataTransfer.effectAllowed = 'move';
  });

  el.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('vb-wrap--over');
  });

  el.addEventListener('dragleave', () => el.classList.remove('vb-wrap--over'));

  el.addEventListener('drop', e => {
    e.preventDefault();
    el.classList.remove('vb-wrap--over');
    try {
      const d = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (d.type) addNode(d.type, parentNode.id, childIndex);
      else if (d.id) moveNode(d.id, parentNode.id, childIndex);
    } catch {}
  });
}

/* ─── Zone drop (append at end of parent) ─── */

function _zoneDrop(e, parentId, idx) {
  try {
    const d = JSON.parse(e.dataTransfer.getData('text/plain'));
    if (d.type) addNode(d.type, parentId, idx);
    else if (d.id) moveNode(d.id, parentId, idx);
  } catch {}
}

/* ─── Edit modal ─── */

function _editNode(node) {
  const fields = [];
  const meta = node.type;
  if (meta === 'box') {
    fields.push({ k: 'label', l: 'Label', v: node.label || '' });
    fields.push({ k: 'border', l: 'Border', v: node.border || 'single', opts: ['single','double','rounded','thick','none'] });
    fields.push({ k: 'minWidth', l: 'Min Width', v: node.minWidth || 30, t: 'n' });
    fields.push({ k: 'minHeight', l: 'Min Height', v: node.minHeight || 3, t: 'n' });
  } else if (meta === 'hsplit' || meta === 'vsplit') {
    fields.push({ k: 'label', l: 'Label', v: node.label || '' });
    fields.push({ k: 'ratio', l: 'Ratios', v: (node.ratio || []).join(','), d: 'comma-sep, e.g. 1,3' });
    fields.push({ k: 'gap', l: 'Gap', v: node.gap || 1, t: 'n' });
  } else if (meta === 'label') {
    fields.push({ k: 'text', l: 'Text', v: node.text || '' });
  } else if (meta === 'spacer') {
    fields.push({ k: 'width', l: 'Width', v: node.width || 2, t: 'n' });
    fields.push({ k: 'height', l: 'Height', v: node.height || 1, t: 'n' });
  }

  const html = fields.map(f => {
    if (f.opts) {
      return `<label class="vb-fl"><span>${f.l}</span><select id="ve_${f.k}">${f.opts.map(o => `<option ${o === f.v ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
    }
    const inp = `<input id="ve_${f.k}" value="${_esc(String(f.v))}"${f.t === 'n' ? ' type="number"' : ''}${f.d ? ` title="${_esc(f.d)}"` : ''} />`;
    return `<label class="vb-fl"><span>${f.l}</span>${inp}</label>`;
  }).join('');

  const ov = document.createElement('div');
  ov.className = 'vb-overlay';
  ov.innerHTML = `
    <div class="vb-modal">
      <div class="vb-mh">Edit ${TYPE_META[node.type]?.label || node.type}</div>
      <div class="vb-mb">${html}</div>
      <div class="vb-ma"><button class="ulh-btn ulh-btn-sm" id="vec">Cancel</button><button class="ulh-btn ulh-btn-sm ulh-btn-primary" id="ves">Save</button></div>
    </div>`;
  document.body.appendChild(ov);

  ov.querySelector('#vec').addEventListener('click', () => ov.remove());
  ov.querySelector('#ves').addEventListener('click', () => {
    const p = {};
    for (const f of fields) {
      const e = document.getElementById('ve_' + f.k);
      if (!e) continue;
      let v = e.value;
      if (f.k === 'ratio') v = v.split(',').map(Number).filter(x => !isNaN(x));
      else if (f.t === 'n') v = Number(v);
      p[f.k] = v;
    }
    updateNode(node.id, p);
    ov.remove();
  });
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
}

/* ─── Add child popup ─── */

function _addMenu(node, anchor) {
  document.querySelector('.vb-addm')?.remove();
  const m = document.createElement('div');
  m.className = 'vb-addm';
  const r = anchor.getBoundingClientRect();
  m.style.top = r.bottom + 'px';
  m.style.left = r.left + 'px';

  for (const t of ['box','hsplit','vsplit','label','spacer']) {
    const b = document.createElement('button');
    b.className = 'vb-addm-i';
    const mt = TYPE_META[t];
    b.style.setProperty('--c', mt.color);
    b.innerHTML = `<span>${mt.icon}</span> ${mt.label}`;
    b.addEventListener('click', e => { e.stopPropagation(); m.remove(); addNode(t, node.id); });
    m.appendChild(b);
  }
  document.body.appendChild(m);
  setTimeout(() => {
    const cl = (e) => { if (!m.contains(e.target) && e.target !== anchor) { m.remove(); document.removeEventListener('click', cl); } };
    document.addEventListener('click', cl);
  }, 0);
}

function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
