export default class GifState {
  constructor() {
    this.inputPath    = null;
    this.inputMeta    = null;
    this.outputFolder = null;
    this.suggestions  = [];
    this.previews     = [];
    this.selectedClipId = null;
    this.settings     = {
      startTime: 0,
      endTime: 3,
      speed: 1,
      preset: 'balanced',
    };
    this.status       = 'idle';
    this.progress     = null;
    this.result       = null;
    this.error        = null;
  }

  reset() {
    this.inputPath    = null;
    this.inputMeta    = null;
    this.outputFolder = null;
    this.suggestions  = [];
    this.previews     = [];
    this.selectedClipId = null;
    this.settings     = { startTime: 0, endTime: 3, speed: 1, preset: 'balanced' };
    this.status       = 'idle';
    this.progress     = null;
    this.result       = null;
    this.error        = null;
  }

  get selectedClip() {
    return this.previews.find(p => p.id === this.selectedClipId) || null;
  }
}
