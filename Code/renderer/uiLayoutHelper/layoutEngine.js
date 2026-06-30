const BORDERS = {
  single: {
    tl: '┌', tr: '┐', bl: '└', br: '┘',
    h: '─', v: '│',
    jl: '┴', jr: '┬', ju: '├', jd: '┤', cross: '┼'
  },
  double: {
    tl: '╔', tr: '╗', bl: '╚', br: '╝',
    h: '═', v: '║',
    jl: '╩', jr: '╦', ju: '╠', jd: '╣', cross: '╬'
  },
  rounded: {
    tl: '╭', tr: '╮', bl: '╰', br: '╯',
    h: '─', v: '│',
    jl: '┴', jr: '┬', ju: '├', jd: '┤', cross: '┼'
  },
  thick: {
    tl: '┏', tr: '┓', bl: '┗', br: '┛',
    h: '━', v: '┃',
    jl: '┻', jr: '┳', ju: '┣', jd: '┫', cross: '╋'
  }
};

function getBorder(style) {
  return BORDERS[style] || BORDERS.single;
}

function repeat(char, n) {
  if (n <= 0) return '';
  return Array(n + 1).join(char);
}

function measure(str) {
  let w = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0) || 0;
    w += (code > 0x4e00 || (code >= 0x2500 && code <= 0x257f)) ? 2 : 1;
  }
  return w;
}

function padRight(str, width) {
  const current = measure(str);
  const needed = Math.max(0, width - current);
  return str + repeat(' ', needed);
}

function padCenter(str, width) {
  const current = measure(str);
  const needed = Math.max(0, width - current);
  const left = Math.floor(needed / 2);
  const right = needed - left;
  return repeat(' ', left) + str + repeat(' ', right);
}

function naturalContentWidth(node) {
  if (!node) return 0;
  if (node.type === 'box') {
    let w = measure(node.label || '') + 2;
    if (node.children && node.children.length > 0) {
      w = Math.max(w, ...node.children.map(c => naturalContentWidth(c)));
    }
    return Math.max(w, node.minWidth || 10);
  }
  if (node.type === 'hsplit') {
    const gap = node._gap || 1;
    const parts = (node.children || []).map(c => naturalContentWidth(c) + 2);
    return parts.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
  }
  if (node.type === 'vsplit') {
    return Math.max(0, ...(node.children || []).map(c => naturalContentWidth(c)));
  }
  if (node.type === 'label') return measure(node.text || '');
  if (node.type === 'spacer') return node.width || 0;
  return 0;
}

function renderNode(node, contentWidth) {
  if (!node) return [];
  if (typeof node === 'string') return [padRight(node, contentWidth)];
  if (node.type === 'box') return layoutBox(node, contentWidth);
  if (node.type === 'hsplit') return renderHSplit(node, contentWidth);
  if (node.type === 'vsplit') return renderVSplit(node, contentWidth);
  if (node.type === 'spacer') return renderSpacer(node, contentWidth);
  if (node.type === 'label') return [padCenter(node.text || '', contentWidth)];
  return [];
}

function computeChildHeights(node, contentWidth) {
  if (!node.children || node.children.length === 0) {
    const h = node.minHeight || 3;
    return [[], h];
  }

  if (node.children.length === 1 && node.children[0].type === 'vsplit') {
    const vsplit = node.children[0];
    const childLines = vsplit.children ? vsplit.children.map(c => renderNode(c, contentWidth)) : [];
    const totalH = childLines.reduce((s, l) => s + l.length, 0);
    return [childLines, Math.max(totalH + 2, node.minHeight || 3)];
  }

  if (node.children.length === 1 && node.children[0].type === 'hsplit') {
    const lines = renderNode(node.children[0], contentWidth);
    return [lines, Math.max(lines.length + 2, node.minHeight || 3)];
  }

  const allLines = [];
  for (const child of node.children) {
    const lines = renderNode(child, contentWidth);
    allLines.push(...lines);
  }
  return [allLines, Math.max(allLines.length + 2, node.minHeight || 3)];
}

function layoutBox(node, constrainedWidth) {
  const b = getBorder(node.border || 'single');
  const natural = naturalContentWidth(node);
  const contentWidth = Math.max(natural, constrainedWidth || 0);
  const label = node.label || '';

  const [childLines, boxH] = computeChildHeights(node, contentWidth);
  const h = node.height || boxH;

  const lines = [];

  let top = repeat(b.h, contentWidth);
  if (label) {
    const labelText = ` ${label} `;
    const pos = Math.max(0, Math.floor((contentWidth - measure(label)) / 2));
    top = repeat(b.h, pos) + labelText + repeat(b.h, Math.max(0, contentWidth - pos - measure(label)));
  }
  lines.push(b.tl + top + b.tr);

  if (childLines.length === 0) {
    for (let i = 1; i < h - 1; i++) {
      lines.push(b.v + repeat(' ', contentWidth) + b.v);
    }
  } else {
    const padLines = Math.max(0, h - 2 - childLines.length);
    const topPad = Math.floor(padLines / 2);
    const bottomPad = padLines - topPad;

    for (let i = 0; i < topPad; i++) {
      lines.push(b.v + repeat(' ', contentWidth) + b.v);
    }

    for (const line of childLines) {
      lines.push(b.v + padRight(line, contentWidth) + b.v);
    }

    for (let i = 0; i < bottomPad; i++) {
      lines.push(b.v + repeat(' ', contentWidth) + b.v);
    }
  }

  lines.push(b.bl + repeat(b.h, contentWidth) + b.br);
  return lines;
}

function renderHSplit(node, contentWidth) {
  const children = node.children || [];
  if (children.length === 0) return [];

  const gap = node._gap || 1;
  const ratios = node.ratio || children.map(() => 1);
  const ratioSum = ratios.reduce((a, b) => a + b, 0);
  const gapTotal = gap * (children.length - 1);
  const available = Math.max(0, contentWidth - gapTotal);

  const widths = [];
  let allocated = 0;
  for (let i = 0; i < children.length; i++) {
    const w = Math.floor(available * ratios[i] / ratioSum);
    widths.push(w);
    allocated += w;
  }
  const extra = available - allocated;
  if (extra > 0 && widths.length > 0) widths[widths.length - 1] += extra;

  const childLines = children.map((c, i) => renderNode(c, widths[i]));
  const maxH = Math.max(...childLines.map(l => l.length), 0);

  const result = [];
  for (let row = 0; row < maxH; row++) {
    let line = '';
    for (let i = 0; i < children.length; i++) {
      if (i > 0) line += repeat(' ', gap);
      line += padRight(childLines[i][row] || '', widths[i]);
    }
    result.push(line);
  }
  return result;
}

function renderVSplit(node, contentWidth) {
  const children = node.children || [];
  if (children.length === 0) return [];

  const result = [];
  for (const child of children) {
    const lines = renderNode(child, contentWidth);
    result.push(...lines);
  }
  return result;
}

function renderSpacer(node, contentWidth) {
  const h = node.height || 1;
  const lines = [];
  for (let i = 0; i < h; i++) {
    lines.push(repeat(' ', contentWidth));
  }
  return lines;
}

export function renderLayout(node) {
  const w = naturalContentWidth(node);
  const lines = renderNode(node, w);
  return lines.join('\n');
}
