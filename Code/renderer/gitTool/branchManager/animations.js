import { isAnimated } from './utils.js';

export function animateMergeDiagram(svgEl, onComplete) {
  if (!isAnimated()) { onComplete(); return; }
  const path = svgEl.querySelector('.bm-merge-arrow');
  if (!path) { onComplete(); return; }
  path.style.transition = 'stroke-dashoffset 0.8s ease-in-out';
  path.style.strokeDashoffset = '0';
  setTimeout(onComplete, 800);
}

export function flashSuccess(el) {
  if (!isAnimated()) return;
  el.classList.add('bm-anim-flash');
  setTimeout(() => el.classList.remove('bm-anim-flash'), 600);
}

export function slideIn(el) {
  if (!isAnimated()) { el.style.opacity = '1'; return; }
  el.classList.add('bm-anim-slide');
}

export function fadeOut(el, onComplete) {
  if (!isAnimated()) { onComplete(); return; }
  el.style.transition = 'opacity 0.2s';
  el.style.opacity = '0';
  setTimeout(onComplete, 200);
}
