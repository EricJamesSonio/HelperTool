import { esc } from './highlight.js';

const IMAGE = new Set('png jpg jpeg jfif gif webp bmp ico avif apng'.split(' '));
const VIDEO = new Set('mp4 m4v webm ogv mov mkv avi'.split(' '));
const AUDIO = new Set('mp3 wav ogg oga m4a aac flac opus weba'.split(' '));
const FONT = new Set('ttf otf woff woff2'.split(' '));
const LABEL = { image: 'Image', video: 'Video', audio: 'Audio', pdf: 'PDF', font: 'Font' };
const ZOOMS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];
const FONT_SIZES = [12, 16, 24, 36, 56];

let root = null;
let onInfo = null;
let cleanup = null;
let gen = 0;

function extOf(name) {
  const lower = String(name || '').toLowerCase();
  const i = lower.lastIndexOf('.');
  return i < 0 ? '' : lower.slice(i + 1);
}

export function mediaKind(name) {
  const e = extOf(name);
  if (IMAGE.has(e)) return 'image';
  if (VIDEO.has(e)) return 'video';
  if (AUDIO.has(e)) return 'audio';
  if (FONT.has(e)) return 'font';
  if (e === 'pdf') return 'pdf';
  return null;
}

export function labelFor(kind) {
  return LABEL[kind] || 'File';
}

function toFileUrl(p) {
  let n = String(p).replace(/\\/g, '/');
  if (n.charAt(0) !== '/') n = '/' + n;
  return 'file://' + n.split('/').map(encodeURIComponent).join('/').replace(/^\/([A-Za-z])%3A/, '/$1:');
}

function info(text) {
  if (onInfo) onInfo(text || '');
}

function fmtTime(s) {
  if (!isFinite(s)) return '';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function message(text) {
  root.innerHTML = '<div class="ide-mv-msg">' + esc(text) + '</div>';
  info('');
}

function showImage(url, my) {
  root.innerHTML =
    '<div class="ide-mv-bar">' +
      '<button type="button" class="ide-mv-btn" data-z="out" title="Zoom out">-</button>' +
      '<span class="ide-mv-zoom">Fit</span>' +
      '<button type="button" class="ide-mv-btn" data-z="in" title="Zoom in">+</button>' +
      '<button type="button" class="ide-mv-btn" data-z="fit" title="Fit to window">Fit</button>' +
      '<button type="button" class="ide-mv-btn" data-z="actual" title="Actual size">100%</button>' +
    '</div>' +
    '<div class="ide-mv-stage ide-mv-checker"><img class="ide-mv-img fit" alt="" draggable="false"></div>';
  const bar = root.querySelector('.ide-mv-bar');
  const stage = root.querySelector('.ide-mv-stage');
  const img = root.querySelector('.ide-mv-img');
  const label = root.querySelector('.ide-mv-zoom');
  let zoom = 0;

  const shown = () => (img.naturalWidth ? img.clientWidth / img.naturalWidth : 1);

  const apply = () => {
    if (!zoom) {
      img.classList.add('fit');
      img.style.width = '';
      img.style.height = '';
      label.textContent = 'Fit';
    } else {
      img.classList.remove('fit');
      img.style.width = Math.round(img.naturalWidth * zoom) + 'px';
      img.style.height = 'auto';
      label.textContent = Math.round(zoom * 100) + '%';
    }
    img.classList.toggle('pix', zoom > 1);
  };

  const step = (dir) => {
    const base = zoom || shown();
    if (dir > 0) {
      zoom = ZOOMS.find((z) => z > base + 0.001) || ZOOMS[ZOOMS.length - 1];
    } else {
      zoom = ZOOMS.slice().reverse().find((z) => z < base - 0.001) || ZOOMS[0];
    }
    apply();
  };

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('.ide-mv-btn');
    if (!btn) return;
    const z = btn.dataset.z;
    if (z === 'in') step(1);
    else if (z === 'out') step(-1);
    else if (z === 'fit') {
      zoom = 0;
      apply();
    } else if (z === 'actual') {
      zoom = 1;
      apply();
    }
  });
  stage.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    step(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  stage.addEventListener('dblclick', () => {
    zoom = zoom ? 0 : 1;
    apply();
  });
  img.addEventListener('load', () => {
    if (my !== gen) return;
    info(img.naturalWidth + ' x ' + img.naturalHeight);
  });
  img.addEventListener('error', () => {
    if (my !== gen) return;
    message('Cannot display this image.');
  });
  img.src = url + '?v=' + Date.now();
}

function showVideo(url, my) {
  root.innerHTML = '<div class="ide-mv-stage ide-mv-center"><video class="ide-mv-video" controls preload="metadata"></video></div>';
  const v = root.querySelector('video');
  v.addEventListener('loadedmetadata', () => {
    if (my !== gen) return;
    info(v.videoWidth + ' x ' + v.videoHeight + ' - ' + fmtTime(v.duration));
  });
  v.addEventListener('error', () => {
    if (my !== gen) return;
    message('Cannot play this video format in the built-in player.');
  });
  v.src = url;
  cleanup = () => {
    try { v.pause(); } catch (_) {}
    v.removeAttribute('src');
    try { v.load(); } catch (_) {}
  };
}

function showAudio(url, name, my) {
  root.innerHTML =
    '<div class="ide-mv-stage ide-mv-center">' +
      '<div class="ide-mv-audio"><div class="ide-mv-audio-name"></div><audio controls preload="metadata"></audio></div>' +
    '</div>';
  root.querySelector('.ide-mv-audio-name').textContent = name;
  const a = root.querySelector('audio');
  a.addEventListener('loadedmetadata', () => {
    if (my !== gen) return;
    info(fmtTime(a.duration));
  });
  a.addEventListener('error', () => {
    if (my !== gen) return;
    message('Cannot play this audio format in the built-in player.');
  });
  a.src = url;
  cleanup = () => {
    try { a.pause(); } catch (_) {}
    a.removeAttribute('src');
    try { a.load(); } catch (_) {}
  };
}

function showPdf(url) {
  root.innerHTML = '<div class="ide-mv-stage"><iframe class="ide-mv-pdf" title="PDF preview"></iframe></div>';
  const frame = root.querySelector('.ide-mv-pdf');
  frame.src = url;
  cleanup = () => {
    try { frame.src = 'about:blank'; } catch (_) {}
  };
}

function showFont(url, name, my) {
  const family = 'idepv' + my;
  root.innerHTML = '<div class="ide-mv-stage ide-mv-font"><div class="ide-mv-font-body">Loading...</div></div>';
  const body = root.querySelector('.ide-mv-font-body');
  const face = new FontFace(family, 'url("' + url + '")');
  face.load().then(() => {
    if (my !== gen) return;
    document.fonts.add(face);
    body.innerHTML =
      '<div class="ide-mv-fname">' + esc(name) + '</div>' +
      FONT_SIZES.map((s) => '<div class="ide-mv-sample" style="font-size:' + s + 'px;font-family:' + family + '">The quick brown fox jumps over the lazy dog 0123456789</div>').join('');
  }).catch(() => {
    if (my !== gen) return;
    message('Cannot load this font.');
  });
  cleanup = () => {
    try { document.fonts.delete(face); } catch (_) {}
  };
}

export function hide() {
  gen++;
  if (cleanup) {
    try { cleanup(); } catch (_) {}
    cleanup = null;
  }
  if (root) root.innerHTML = '';
}

export function show(spec) {
  if (!root || !spec) return;
  hide();
  const my = gen;
  const url = toFileUrl(spec.path);
  if (spec.kind === 'image') showImage(url, my);
  else if (spec.kind === 'video') showVideo(url, my);
  else if (spec.kind === 'audio') showAudio(url, spec.name, my);
  else if (spec.kind === 'pdf') showPdf(url);
  else if (spec.kind === 'font') showFont(url, spec.name, my);
  else message('No preview available for this file.');
}

export function mount(el, opts) {
  root = el;
  onInfo = (opts && opts.onInfo) || null;
}