import { highlightRange } from './highlight.js';

const LH = 20;
const ROW = 3;
const CW = 1.5;
const PAD_X = 10;
const CHUNK = 256;
const DEBOUNCE = 90;

const CLS_VAR = {
  '': '--text-primary',
  't-c': '--text-muted',
  't-s': '--green',
  't-n': '--yellow',
  't-k': '--purple',
  't-f': '--blue',
  't-t': '--accent',
  't-p': '--blue',
  't-a': '--yellow',
};

const SEG = /<span class="([^"]*)">([^<]*)<\/span>|([^<]+)/g;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function unesc(s) {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function parse(html) {
  const out = [];
  SEG.lastIndex = 0;
  let m;
  while ((m = SEG.exec(html)) !== null) {
    if (m[1] !== undefined) out.push(m[1], unesc(m[2]));
    else out.push('', unesc(m[3]));
  }
  return out;
}

export function createMinimap(host, scroller) {
  let lines = [''];
  let lang = 'plain';
  let tints = null;
  let runs = [];
  let done = new Uint8Array(1);
  let colors = null;
  let raf = 0;
  let timer = 0;
  let drag = null;
  let ro = null;

  host.innerHTML = '<canvas class="ide-mm-canvas"></canvas><div class="ide-mm-slider"></div>';
  const canvas = host.querySelector('.ide-mm-canvas');
  const slider = host.querySelector('.ide-mm-slider');
  const ctx = canvas.getContext('2d');

  function loadColors() {
    const cs = getComputedStyle(host);
    const next = {};
    for (const cls in CLS_VAR) {
      next[cls] = cs.getPropertyValue(CLS_VAR[cls]).trim() || '#999999';
    }
    if (lang === 'html') {
      const red = cs.getPropertyValue('--red').trim();
      if (red) next['t-t'] = red;
    }
    next.add = cs.getPropertyValue('--green').trim() || '#34d399';
    next.del = cs.getPropertyValue('--red').trim() || '#f87171';
    colors = next;
  }

  function invalidate() {
    runs = new Array(lines.length);
    done = new Uint8Array(Math.ceil(lines.length / CHUNK) + 1);
  }

  function ensureChunk(c) {
    if (done[c]) return;
    done[c] = 1;
    const from = c * CHUNK;
    const to = Math.min(lines.length - 1, from + CHUNK - 1);
    if (from > to) return;
    const rows = highlightRange(lines, from, to, lang).split('\n');
    for (let i = 0; i < rows.length; i++) runs[from + i] = parse(rows[i]);
  }

  function metrics() {
    const H = host.clientHeight;
    const total = lines.length * ROW;
    const maxOff = Math.max(0, total - H);
    const maxS = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const ratio = maxS > 0 ? Math.min(1, scroller.scrollTop / maxS) : 0;
    const mmTop = ratio * maxOff;
    const sh = Math.max(12, Math.min(H, (scroller.clientHeight / LH) * ROW));
    const k = maxS > 0 ? ROW / LH - maxOff / maxS : 1;
    const sTop = clamp(k * scroller.scrollTop, 0, Math.max(0, H - sh));
    return { H, maxOff, maxS, mmTop, sh, k, sTop };
  }

  function place() {
    const m = metrics();
    if (!m.H) return m;
    if (m.maxS <= 0) {
      slider.style.display = 'none';
      return m;
    }
    slider.style.display = 'block';
    slider.style.height = m.sh + 'px';
    slider.style.transform = 'translateY(' + m.sTop + 'px)';
    return m;
  }

  function sizeCanvas(W, H) {
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(W * dpr);
    const ph = Math.round(H * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawLine(segs, y, maxCols) {
    let col = 0;
    const h = ROW - 0.8;
    for (let i = 0; i < segs.length && col < maxCols; i += 2) {
      ctx.fillStyle = colors[segs[i]] || colors[''];
      const t = segs[i + 1];
      let start = -1;
      for (let j = 0; j < t.length && col < maxCols; j++) {
        const c = t.charCodeAt(j);
        if (c === 32 || c === 9) {
          if (start >= 0) {
            ctx.fillRect(PAD_X + start * CW, y, (col - start) * CW, h);
            start = -1;
          }
          col += c === 9 ? 2 : 1;
        } else {
          if (start < 0) start = col;
          col++;
        }
      }
      if (start >= 0) ctx.fillRect(PAD_X + start * CW, y, (col - start) * CW, h);
    }
  }

  function draw() {
    raf = 0;
    const W = host.clientWidth;
    const H = host.clientHeight;
    if (!W || !H) return;
    sizeCanvas(W, H);
    ctx.clearRect(0, 0, W, H);
    if (!colors) loadColors();
    const m = metrics();
    const n = lines.length;
    const first = Math.max(0, Math.floor(m.mmTop / ROW));
    const last = Math.min(n - 1, Math.ceil((m.mmTop + H) / ROW));
    const maxCols = Math.floor((W - PAD_X * 2) / CW);
    if (tints) {
      ctx.globalAlpha = 0.28;
      for (let i = first; i <= last; i++) {
        const t = tints[i];
        if (!t) continue;
        ctx.fillStyle = t === 'add' ? colors.add : colors.del;
        ctx.fillRect(0, i * ROW - m.mmTop, W, ROW);
      }
    }
    ctx.globalAlpha = 0.8;
    for (let i = first; i <= last; i++) {
      ensureChunk(Math.floor(i / CHUNK));
      const segs = runs[i];
      if (segs && segs.length) drawLine(segs, i * ROW - m.mmTop, maxCols);
    }
    ctx.globalAlpha = 1;
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(draw);
  }

  function setContent(newLines, newLang, reset, newTints) {
    lines = newLines;
    tints = newTints || null;
    if (reset || newLang !== lang) {
      lang = newLang;
      colors = null;
    }
    invalidate();
    place();
    clearTimeout(timer);
    if (reset) {
      schedule();
      return;
    }
    timer = setTimeout(schedule, DEBOUNCE);
  }

  function sync() {
    const m = place();
    if (m && m.maxOff > 0) schedule();
  }

  function resize() {
    place();
    schedule();
  }

  function onDown(e) {
    if (e.button !== 0) return;
    const m = metrics();
    if (m.maxS <= 0 || !m.k) return;
    e.preventDefault();
    const y = e.clientY - host.getBoundingClientRect().top;
    const onSlider = y >= m.sTop && y <= m.sTop + m.sh;
    if (!onSlider) scroller.scrollTop = clamp((y - m.sh / 2) / m.k, 0, m.maxS);
    drag = { y0: e.clientY, s0: scroller.scrollTop };
    slider.classList.add('drag');
    try { host.setPointerCapture(e.pointerId); } catch (_) {}
  }

  function onMove(e) {
    if (!drag) return;
    const m = metrics();
    if (!m.k) return;
    scroller.scrollTop = clamp(drag.s0 + (e.clientY - drag.y0) / m.k, 0, m.maxS);
  }

  function onUp(e) {
    if (!drag) return;
    drag = null;
    slider.classList.remove('drag');
    try { host.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  function onWheel(e) {
    e.preventDefault();
    scroller.scrollTop += e.deltaMode === 1 ? e.deltaY * LH : e.deltaY;
  }

  function destroy() {
    clearTimeout(timer);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    host.removeEventListener('pointerdown', onDown);
    host.removeEventListener('pointermove', onMove);
    host.removeEventListener('pointerup', onUp);
    host.removeEventListener('pointercancel', onUp);
    host.removeEventListener('wheel', onWheel);
    if (ro) ro.disconnect();
    ro = null;
    host.innerHTML = '';
  }

  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerup', onUp);
  host.addEventListener('pointercancel', onUp);
  host.addEventListener('wheel', onWheel, { passive: false });
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => {
      place();
      schedule();
    });
    ro.observe(host);
  }

  return { setContent, sync, resize, destroy };
}

let main = null;

export function mount(hostEl, textarea) {
  if (main) main.destroy();
  main = createMinimap(hostEl, textarea);
}

export function setContent(newLines, newLang, reset) {
  if (main) main.setContent(newLines, newLang, reset);
}

export function sync() {
  if (main) main.sync();
}

export function resize() {
  if (main) main.resize();
}