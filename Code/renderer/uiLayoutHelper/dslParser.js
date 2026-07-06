import { renderLayout } from './layoutEngine.js';

function tryParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    try {
      return eval('(' + str + ')');
    } catch {
      return null;
    }
  }
}

export function parseAndRender(dsl) {
  if (typeof dsl === 'string') {
    const parsed = tryParse(dsl);
    if (!parsed) {
      return { valid: false, error: 'Invalid JSON or object literal' };
    }
    dsl = parsed;
  }

  if (!dsl || typeof dsl !== 'object') {
    return { valid: false, error: 'Layout must be an object' };
  }

  const errors = validate(dsl);
  if (errors.length > 0) {
    return { valid: false, error: errors.join('; ') };
  }

  const normalized = normalize(dsl);

  let output;
  try {
    output = renderLayout(normalized);
  } catch (err) {
    return { valid: false, error: 'Rendering failed: ' + err.message };
  }

  return { valid: true, ast: normalized, output };
}

function validate(node, path) {
  const errors = [];
  const p = path || 'root';

  if (!node.type) {
    errors.push(`${p}: missing "type"`);
    return errors;
  }

  const validTypes = ['box', 'hsplit', 'vsplit', 'spacer', 'label'];
  if (!validTypes.includes(node.type)) {
    errors.push(`${p}: unknown type "${node.type}"`);
  }

  if (node.type === 'box') {
    if (node.border && !['single', 'double', 'rounded', 'thick', 'none'].includes(node.border)) {
      errors.push(`${p}: unknown border style "${node.border}"`);
    }
    if (node.children && !Array.isArray(node.children)) {
      errors.push(`${p}: "children" must be an array`);
    }
  }

  if ((node.type === 'hsplit' || node.type === 'vsplit') && node.children) {
    if (!Array.isArray(node.children)) {
      errors.push(`${p}: "children" must be an array`);
    } else if (node.children.length < 1) {
      errors.push(`${p}: must have at least 1 child`);
    } else {
      if (node.ratio) {
        if (!Array.isArray(node.ratio)) {
          errors.push(`${p}: "ratio" must be an array`);
        } else if (node.ratio.length !== node.children.length) {
          errors.push(`${p}: "ratio" length must match children count`);
        }
      }
      node.children.forEach((child, i) => {
        errors.push(...validate(child, `${p}.children[${i}]`));
      });
    }
  }

  if (node.type === 'spacer') {
    if (node.width !== undefined && (typeof node.width !== 'number' || node.width < 0)) {
      errors.push(`${p}: "width" must be a non-negative number`);
    }
    if (node.height !== undefined && (typeof node.height !== 'number' || node.height < 1)) {
      errors.push(`${p}: "height" must be a positive number`);
    }
  }

  return errors;
}

function normalize(node) {
  if (!node || typeof node !== 'object') return node;
  const n = { ...node };

  if (n.type === 'box') {
    if (!n.border) n.border = 'single';
    if (!n.minWidth) n.minWidth = 20;
    if (n.children) {
      n.children = n.children.map(c => normalize(c));
    }
  }

  if (n.type === 'hsplit') {
    n._gap = n.gap ?? 1;
    if (n.children) {
      n.children = n.children.map(c => normalize(c));
    }
  }

  if (n.type === 'vsplit') {
    if (n.children) {
      n.children = n.children.map(c => normalize(c));
    }
  }

  return n;
}


