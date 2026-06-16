import { NODE_TYPES } from '../nodes/nodeRegistry.js';

function iconSvg(path, color, size) {
  if (!path) return '';
  const isClosed = path.includes('z') || path.includes('Z');
  const fill = isClosed ? 'currentColor' : 'none';
  const stroke = isClosed ? 'none' : 'currentColor';
  const s = size || 14;
  return `<svg viewBox="0 0 16 16" width="${s}" height="${s}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:${color};vertical-align:middle;margin-right:4px">
    <path d="${path}"/>
  </svg>`;
}

export function renderInspector(state) {
  const node = state.selectedNode;
  if (!node) {
    return `<div class="as-inspector">
      <div class="as-inspector-empty">Select a node to inspect</div>
    </div>`;
  }

  const def = NODE_TYPES[node.type];
  if (!def) return '<div class="as-inspector"><div class="as-inspector-empty">Unknown node type</div></div>';

  const fieldsHtml = def.fields.map(f => {
    const val = node.fields[f] || '';
    return `<div class="as-ip-field">
      <label class="as-ip-label">${escapeHtml(f)}</label>
      <input class="as-ip-input" data-field="${escapeHtml(f)}" type="text" value="${escapeHtml(val)}" />
    </div>`;
  }).join('');

  return `<div class="as-inspector">
    <div class="as-inspector-title">Properties</div>
    <div class="as-ip-header" style="border-left:3px solid ${def.color}">
      <div class="as-ip-type">${iconSvg(def.iconPath, def.color, 12)}${def.label}</div>
      <div class="as-ip-id">${node.id}</div>
    </div>
    <div class="as-ip-body">
      <div class="as-ip-field">
        <label class="as-ip-label">Label</label>
        <input class="as-ip-input" id="asIpLabel" type="text" value="${escapeHtml(node.label)}" />
      </div>
      ${fieldsHtml}
      <div class="as-ip-field">
        <label class="as-ip-label">X</label>
        <input class="as-ip-input" id="asIpX" type="number" value="${Math.round(node.x)}" />
      </div>
      <div class="as-ip-field">
        <label class="as-ip-label">Y</label>
        <input class="as-ip-input" id="asIpY" type="number" value="${Math.round(node.y)}" />
      </div>
    </div>
  </div>`;
}

export function bindInspector(container, state, callbacks) {
  const labelInput = container.querySelector('#asIpLabel');
  if (labelInput) {
    labelInput.addEventListener('change', () => {
      const node = state.selectedNode;
      if (node) { node.label = labelInput.value; state.isDirty = true; callbacks.onChange?.(); }
    });
  }

  container.querySelectorAll('.as-ip-input[data-field]').forEach(input => {
    input.addEventListener('change', () => {
      const node = state.selectedNode;
      if (node) {
        state.updateNodeField(node.id, input.dataset.field, input.value);
        callbacks.onChange?.();
      }
    });
  });

  const xInput = container.querySelector('#asIpX');
  const yInput = container.querySelector('#asIpY');
  if (xInput) {
    xInput.addEventListener('change', () => {
      const node = state.selectedNode;
      if (node) { node.x = parseFloat(xInput.value) || 0; callbacks.onChange?.(); }
    });
  }
  if (yInput) {
    yInput.addEventListener('change', () => {
      const node = state.selectedNode;
      if (node) { node.y = parseFloat(yInput.value) || 0; callbacks.onChange?.(); }
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
