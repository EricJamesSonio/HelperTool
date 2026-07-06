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

    this.compressInputPaths = [];
    this.compressInputMetas = [];
    this.compressPreset     = 'balanced';
    this.compressFormat     = 'auto';
    this.compressStatus     = 'idle';
    this.compressProgress   = null;
    this.compressResult     = null;
    this.compressError      = null;
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

  resetCompress() {
    this.compressInputPaths = [];
    this.compressInputMetas = [];
    this.compressStatus     = 'idle';
    this.compressProgress   = null;
    this.compressResult     = null;
    this.compressError      = null;
  }
}