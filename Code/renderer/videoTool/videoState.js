export default class VideoState {
  constructor() {
    this.inputPath     = null;
    this.inputMeta     = null;
    this.outputFolder  = null;
    this.selectedPreset = 'balanced';
    this.status        = 'idle';
    this.progress      = null;
    this.result        = null;
    this.error         = null;
  }

  reset() {
    this.inputPath = null;
    this.inputMeta = null;
    this.status = 'idle';
    this.progress = null;
    this.result = null;
    this.error = null;
  }
}