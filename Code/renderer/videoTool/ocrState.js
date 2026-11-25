export const OCR_LANGS = [
  { id: 'eng',     label: 'English' },
  { id: 'spa',     label: 'Spanish' },
  { id: 'fra',     label: 'French' },
  { id: 'deu',     label: 'German' },
  { id: 'ita',     label: 'Italian' },
  { id: 'por',     label: 'Portuguese' },
  { id: 'rus',     label: 'Russian' },
  { id: 'jpn',     label: 'Japanese' },
  { id: 'kor',     label: 'Korean' },
  { id: 'chi_sim', label: 'Chinese (Simplified)' },
  { id: 'chi_tra', label: 'Chinese (Traditional)' },
  { id: 'ara',     label: 'Arabic' },
  { id: 'hin',     label: 'Hindi' },
];

export const OCR_IMAGE_REGEX = /\.(png|jpe?g|jfif|webp|gif|avif|tiff?|svg)$/i;

export default class OcrState {
  constructor() {
    this.inputPaths   = [];
    this.inputMetas   = [];
    this.outputFolder = null;
    this.lang         = 'eng';
    this.status       = 'idle';
    this.progress     = null;
    this.result       = null;
    this.error        = null;
    this.activeIndex  = 0;
    this.copied       = null;
  }

  get langLabel() {
    const l = OCR_LANGS.find((x) => x.id === this.lang);
    return l ? l.label : this.lang;
  }

  get isBusy() {
    return this.status === 'extracting';
  }

  get activeEntry() {
    if (!this.result || !this.result.results) return null;
    return this.result.results[this.activeIndex] || this.result.results[0] || null;
  }

  get combinedText() {
    if (!this.result || !this.result.results) return '';
    const ok = this.result.results.filter((r) => !r.error);
    if (ok.length === 1) return ok[0].text || '';
    return ok
      .map((r) => '===== ' + String(r.inputPath).split(/[\\/]/).pop() + ' =====\n' + (r.text || ''))
      .join('\n\n');
  }

  reset() {
    this.inputPaths  = [];
    this.inputMetas  = [];
    this.status      = 'idle';
    this.progress    = null;
    this.result      = null;
    this.error       = null;
    this.activeIndex = 0;
    this.copied      = null;
  }
}