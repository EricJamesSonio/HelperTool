let _instance = null;

export function getLoadingController() {
  if (!_instance) {
    _instance = new LoadingController();
  }
  return _instance;
}

class LoadingController {
  constructor() {
    this._overlay = null;
    this._bar = null;
    this._labelEl = null;
    this._current = 0;
    this._animFrame = null;
  }

  _resolveEls() {
    if (this._overlay) return;
    this._overlay = document.getElementById('ocLoadingOverlay');
    this._bar = document.getElementById('ocLoadingBar');
    this._labelEl = document.getElementById('ocLoadingLabel');
  }

  start(initialLabel = 'Starting...') {
    this._resolveEls();
    if (!this._overlay) return;
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    this._current = 0.05;
    this._setLabel(initialLabel);
    this._updateBar(0.05);
    this._overlay.classList.add('active');
  }

  setProgress(label, value) {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    this._resolveEls();
    this._setLabel(label);
    this._current = value;
    this._updateBar(value);
  }

  advanceTo(label, target, duration = 500) {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    this._resolveEls();
    this._setLabel(label);
    return this._animateTo(target, duration);
  }

  finish(label = 'Ready', duration = 2000) {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    this._resolveEls();
    this._setLabel(label);
    return this._animateTo(1, duration).then(() => this.hide());
  }

  hide() {
    this._resolveEls();
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    this._animFrame = null;
    if (this._overlay) this._overlay.classList.remove('active');
    this._current = 0;
  }

  _setLabel(text) {
    if (this._labelEl) this._labelEl.textContent = text;
  }

  _updateBar(value) {
    if (this._bar) this._bar.style.width = (value * 100) + '%';
  }

  _animateTo(target, duration) {
    return new Promise(resolve => {
      const start = this._current;
      if (start >= target) { resolve(); return; }
      const startTime = performance.now();
      const step = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        this._current = start + (target - start) * eased;
        this._updateBar(this._current);
        if (t < 1) {
          this._animFrame = requestAnimationFrame(step);
        } else {
          this._current = target;
          this._updateBar(this._current);
          this._animFrame = null;
          resolve();
        }
      };
      this._animFrame = requestAnimationFrame(step);
    });
  }
}
