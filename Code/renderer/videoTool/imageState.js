export default class ImageState {
  constructor() {
    this.inputPath    = null;
    this.inputMeta    = null;
    this.outputFolder = null;
    this.status       = 'idle';
    this.progress     = null;
    this.result       = null;
    this.error        = null;
    this.warning      = null;
  }

  reset() {
    this.inputPath    = null;
    this.inputMeta    = null;
    this.status       = 'idle';
    this.progress     = null;
    this.result       = null;
    this.error        = null;
    this.warning      = null;
  }
}