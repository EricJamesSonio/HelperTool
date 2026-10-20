export const CONVERT_FORMATS = [
  { id: 'png',  label: 'PNG',  supportsQuality: true },
  { id: 'jpeg', label: 'JPG',  supportsQuality: true },
  { id: 'webp', label: 'WebP', supportsQuality: true },
  { id: 'ico',  label: 'ICO',  supportsQuality: false },
  { id: 'svg',  label: 'SVG',  supportsQuality: false },
];

export const QUALITY_PRESETS = [
  { id: 'lossless', label: 'Lossless', desc: 'Maximum quality, larger file', icon: 'max' },
  { id: 'high',     label: 'High',     desc: '90% quality, great balance',  icon: 'high' },
  { id: 'balanced', label: 'Balanced', desc: '75% quality, recommended',    icon: 'bal' },
  { id: 'small',    label: 'Small',    desc: '50% quality, smallest file',  icon: 'min' },
];

export default class ImageState {
  constructor() {
    this.inputPaths    = [];
    this.inputMetas    = [];
    this.outputFolder  = null;
    this.format        = 'png';
    this.preset        = 'balanced';
    this.status        = 'idle';
    this.progress      = null;
    this.result        = null;
    this.error         = null;
    this.warning       = null;
  }

  get formatLabel() {
    const f = CONVERT_FORMATS.find(x => x.id === this.format);
    return f ? f.label : this.format.toUpperCase();
  }

  get supportsQuality() {
    const f = CONVERT_FORMATS.find(x => x.id === this.format);
    return f ? f.supportsQuality : false;
  }

  get isBusy() {
    return this.status === 'converting';
  }

  reset() {
    this.inputPaths = [];
    this.inputMetas = [];
    this.status     = 'idle';
    this.progress   = null;
    this.result     = null;
    this.error      = null;
    this.warning    = null;
  }
}
