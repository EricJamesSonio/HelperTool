import VideoState from './videoTool/videoState.js';
import ImageState from './videoTool/imageState.js';
import GifState from './videoTool/gifState.js';
import VideoUI from './videoTool/videoUI.js';
import { DEFAULT_PRESET } from './videoTool/videoPresets.js';

export default class VideoTool {
  constructor() {
    this.state = new VideoState();
    this.imageState = new ImageState();
    this.gifState = new GifState();
    this.ui = null;
    this._container = null;
  }

  initialize() {
    return { success: true };
  }

  render(container) {
    this._container = container;
    this.ui = new VideoUI(this.state, this.imageState, this.gifState);
    this.ui.setCallbacks({
      onPickFile: (path) => this._handlePickFile(path),
      onRemoveFile: () => this._handleRemoveFile(),
      onPresetChange: (preset) => this._handlePresetChange(preset),
      onChangeOutput: () => this._handleChangeOutput(),
      onCompress: () => this._startCompress(),
      onRetry: () => this._handleRetry(),
      onOpenFile: () => this._handleOpenFile(),
      onOpenFolder: () => this._handleOpenFolder(),
      onCompressAnother: () => this._handleCompressAnother(),
      onImagePickFile: (path) => this._handleImagePickFile(path),
      onImageRemoveFile: () => this._handleImageRemoveFile(),
      onImageChangeOutput: () => this._handleImageChangeOutput(),
      onImageConvert: () => this._startImageConvert(),
      onImageRetry: () => this._handleImageRetry(),
      onImageOpenFile: () => this._handleImageOpenFile(),
      onImageOpenFolder: () => this._handleImageOpenFolder(),
      onImageConvertAnother: () => this._handleImageConvertAnother(),
      onGifPickFile: (path) => this._handleGifPickFile(path),
      onGifRemoveFile: () => this._handleGifRemoveFile(),
      onGifChangeOutput: () => this._handleGifChangeOutput(),
      onGifAddSegment: () => this._handleGifAddSegment(),
      onGifRemoveSegment: (segId) => this._handleGifRemoveSegment(segId),
      onGifUpdateSegment: (segId, props) => this._handleGifUpdateSegment(segId, props),
      onGifAddSuggestion: (start, end) => this._handleGifAddSuggestion(start, end),
      onGifSelectSegment: (segId) => this._handleGifSelectSegment(segId),
      onGifSplit: () => this._handleGifSplit(),
      onGifTimelineClick: (pct) => this._handleGifTimelineClick(pct),
      onGifPresetChange: (preset) => this._handleGifPresetChange(preset),
      onGifGenerate: () => this._startGifGenerate(),
      onGifRetry: () => this._handleGifRetry(),
      onGifOpenFile: () => this._handleGifOpenFile(),
      onGifOpenFolder: () => this._handleGifOpenFolder(),
      onGifNew: () => this._handleGifNew(),
      onTabChange: (tab) => this._handleTabChange(tab),
    });
    this.ui.render(container);
  }

  destroy() {
    window.electronAPI.video.onProgress(() => {});
    window.electronAPI.image.onProgress(() => {});
    window.electronAPI.video.onGifProgress(() => {});
    this.ui = null;
    this.state.reset();
    this.imageState.reset();
    this.gifState.reset();
    this._container = null;
  }

  // ── Video handlers ──

  async _handlePickFile(path) {
    if (!path) {
      const picked = await window.electronAPI.video.pickFile();
      if (!picked) return;
      path = picked;
    }
    this.state.status = 'loading-meta';
    if (this.ui) this.ui.update();
    const result = await window.electronAPI.video.getMetadata({ inputPath: path });
    if (!result.success) {
      this.state.status = 'error';
      this.state.error = result.error || 'Failed to read video metadata';
      if (this.ui) this.ui.update();
      return;
    }
    this.state.inputPath = path;
    this.state.inputMeta = result;
    this.state.status = 'idle';
    this.state.selectedPreset = DEFAULT_PRESET;
    this.state.activeSection = 'video';
    if (this.ui) this.ui.update();
  }

  _handleRemoveFile() {
    this.state.reset();
    if (this.ui) this.ui.update();
  }

  _handlePresetChange(preset) {
    this.state.selectedPreset = preset;
    if (this.ui) this.ui.update();
  }

  async _handleChangeOutput() {
    const folder = await window.electronAPI.video.pickOutputFolder();
    if (folder) {
      this.state.outputFolder = folder;
      if (this.ui) this.ui.update();
    }
  }

  async _startCompress() {
    if (!this.state.inputPath || this.state.status === 'compressing') return;
    this.state.status = 'compressing';
    this.state.progress = null;
    this.state.result = null;
    this.state.error = null;
    if (this.ui) this.ui.update();

    window.electronAPI.video.onProgress((data) => {
      this.state.progress = data;
      if (this.ui) this.ui.update();
    });

    const result = await window.electronAPI.video.compress({
      inputPath: this.state.inputPath,
      preset: this.state.selectedPreset,
      outputPath: this.state.outputFolder,
    });

    window.electronAPI.video.onProgress(() => {});

    if (result.success) {
      this.state.status = 'done';
      this.state.result = result;
    } else {
      this.state.status = 'error';
      this.state.error = result.error || 'Compression failed';
    }
    if (this.ui) this.ui.update();
  }

  _handleRetry() {
    this.state.status = 'idle';
    this.state.progress = null;
    this.state.error = null;
    if (this.ui) this.ui.update();
  }

  async _handleOpenFile() {
    if (this.state.result && this.state.result.outputPath) {
      await window.electronAPI.video.revealFile({ filePath: this.state.result.outputPath });
    }
  }

  async _handleOpenFolder() {
    if (this.state.result && this.state.result.outputPath) {
      await window.electronAPI.video.revealFile({ filePath: this.state.result.outputPath });
    }
  }

  _handleCompressAnother() {
    this.state.reset();
    if (this.ui) this.ui.update();
  }

  // ── Image to ICO handlers ──

  async _handleImagePickFile(path) {
    if (!path) {
      const picked = await window.electronAPI.image.pickFile();
      if (!picked) return;
      path = picked;
    }
    this.imageState.inputPath = path;
    this.imageState.status = 'loading';
    if (this.ui) this.ui.update();
    const meta = await window.electronAPI.image.getMetadata({ inputPath: path });
    this.imageState.inputMeta = meta.success ? { resolution: meta.resolution, fileSize: meta.fileSize } : { resolution: '?', fileSize: 0 };
    this.imageState.status = 'idle';
    this.state.activeSection = 'image';
    if (this.ui) this.ui.update();
  }

  _handleImageRemoveFile() {
    this.imageState.reset();
    if (this.ui) this.ui.update();
  }

  async _handleImageChangeOutput() {
    const folder = await window.electronAPI.image.pickOutputFolder();
    if (folder) {
      this.imageState.outputFolder = folder;
      if (this.ui) this.ui.update();
    }
  }

  async _startImageConvert() {
    if (!this.imageState.inputPath || this.imageState.status === 'converting') return;
    this.imageState.status = 'converting';
    this.imageState.progress = null;
    this.imageState.result = null;
    this.imageState.error = null;
    this.imageState.warning = null;
    if (this.ui) this.ui.update();

    window.electronAPI.image.onProgress((data) => {
      if (data.warning) {
        this.imageState.warning = data.message;
      }
      this.imageState.progress = data;
      if (this.ui) this.ui.update();
    });

    const result = await window.electronAPI.image.toIco({
      inputPath: this.imageState.inputPath,
      outputPath: this.imageState.outputFolder || undefined,
    });

    window.electronAPI.image.onProgress(() => {});

    if (result.success) {
      this.imageState.status = 'done';
      this.imageState.result = result;
    } else {
      this.imageState.status = 'error';
      this.imageState.error = result.error || 'Conversion failed';
    }
    if (this.ui) this.ui.update();
  }

  _handleImageRetry() {
    this.imageState.status = 'idle';
    this.imageState.progress = null;
    this.imageState.error = null;
    if (this.ui) this.ui.update();
  }

  async _handleImageOpenFile() {
    if (this.imageState.result && this.imageState.result.outputPath) {
      await window.electronAPI.image.revealFile({ filePath: this.imageState.result.outputPath });
    }
  }

  async _handleImageOpenFolder() {
    if (this.imageState.result && this.imageState.result.outputPath) {
      await window.electronAPI.image.revealFile({ filePath: this.imageState.result.outputPath });
    }
  }

  _handleImageConvertAnother() {
    this.imageState.reset();
    if (this.ui) this.ui.update();
  }

  // ── Video to GIF handlers ──

  async _handleGifPickFile(path) {
    if (!path) {
      const picked = await window.electronAPI.video.pickFile();
      if (!picked) return;
      path = picked;
    }
    this.gifState.reset();
    this.gifState.inputPath = path;
    this.gifState.status = 'loading';
    this.state.activeSection = 'gif';
    if (this.ui) this.ui.update();

    window.electronAPI.video.onGifProgress((data) => {
      this.gifState.progress = data;
      if (this.ui) this.ui.update();
    });

    const meta = await window.electronAPI.video.getMetadata({ inputPath: path });
    if (!meta.success) {
      this.gifState.status = 'error';
      this.gifState.error = meta.error || 'Failed to read metadata';
      window.electronAPI.video.onGifProgress(() => {});
      if (this.ui) this.ui.update();
      return;
    }
    this.gifState.inputMeta = {
      duration: meta.duration,
      resolution: meta.originalResolution,
      fileSize: meta.originalSize,
    };

    const analyzeResult = await window.electronAPI.video.gif({ mode: 'analyze', inputPath: path });
    window.electronAPI.video.onGifProgress(() => {});

    if (!analyzeResult.success) {
      this.gifState.status = 'error';
      this.gifState.error = analyzeResult.error || 'Analysis failed';
      if (this.ui) this.ui.update();
      return;
    }

    this.gifState.suggestions = analyzeResult.suggestions || [];
    this.gifState.status = 'idle';
    if (this.ui) this.ui.update();
  }

  _handleGifRemoveFile() {
    this.gifState.reset();
    if (this.ui) this.ui.update();
  }

  async _handleGifChangeOutput() {
    const folder = await window.electronAPI.video.pickOutputFolder();
    if (folder) {
      this.gifState.outputFolder = folder;
      if (this.ui) this.ui.update();
    }
  }

  _handleGifAddSegment() {
    const gs = this.gifState;
    const totalDur = gs.inputMeta ? gs.inputMeta.duration : 30;
    const last = gs.segments[gs.segments.length - 1];
    const defaultStart = last ? Math.min(last.endTime + 1, totalDur - 2) : 0;
    const defaultEnd = Math.min(defaultStart + 3, totalDur);
    if (defaultEnd > defaultStart) {
      gs.addSegment(defaultStart, defaultEnd, 1);
      if (this.ui) this.ui.update();
    }
  }

  _handleGifRemoveSegment(segId) {
    this.gifState.removeSegment(segId);
    if (this.ui) this.ui.update();
  }

  _handleGifUpdateSegment(segId, props) {
    this.gifState.updateSegment(segId, props);
    if (this.ui) this.ui.update();
  }

  _handleGifAddSuggestion(start, end) {
    this.gifState.addSegment(start, end, 1);
    if (this.ui) this.ui.update();
  }

  _handleGifSelectSegment(segId) {
    this.gifState.selectedSegmentId = segId;
    if (this.ui) this.ui.update();
  }

  _handleGifSplit() {
    const gs = this.gifState;
    const seg = gs.selectedSegment;
    if (!seg) return;
    const splitTime = gs.currentTime;
    if (splitTime <= seg.startTime || splitTime >= seg.endTime) {
      gs.error = 'Move playhead inside the clip to split';
      gs.status = 'error';
      if (this.ui) this.ui.update();
      setTimeout(() => { if (gs.status === 'error' && gs.error === 'Move playhead inside the clip to split') { gs.status = 'idle'; gs.error = null; if (this.ui) this.ui.update(); } }, 2000);
      return;
    }
    gs.splitSegment(seg.id, splitTime);
    if (this.ui) this.ui.update();
  }

  _handleGifTimelineClick(pct) {
    const gs = this.gifState;
    const dur = gs.inputMeta ? gs.inputMeta.duration : 0;
    if (dur <= 0) return;
    const targetTime = pct * dur;
    gs.currentTime = targetTime;
    const video = this.ui ? this.ui.getVideoElement() : null;
    if (video) {
      video.currentTime = targetTime;
    }
    // Check which segment contains this time and select it
    for (const seg of gs.segments) {
      if (targetTime >= seg.startTime && targetTime < seg.endTime) {
        gs.selectedSegmentId = seg.id;
        break;
      }
    }
    if (this.ui) this.ui.update();
  }

  _handleGifPresetChange(preset) {
    this.gifState.preset = preset;
    if (this.ui) this.ui.update();
  }

  async _startGifGenerate() {
    const gs = this.gifState;
    if (!gs.inputPath || gs.status === 'generating') return;
    if (gs.segments.length === 0) {
      gs.error = 'Add at least one clip';
      gs.status = 'error';
      if (this.ui) this.ui.update();
      return;
    }
    for (const seg of gs.segments) {
      if (seg.endTime <= seg.startTime) {
        gs.error = `Clip "${seg.id}": end must be after start`;
        gs.status = 'error';
        if (this.ui) this.ui.update();
        return;
      }
    }
    gs.status = 'generating';
    gs.progress = null;
    gs.result = null;
    gs.error = null;
    if (this.ui) this.ui.update();

    window.electronAPI.video.onGifProgress((data) => {
      gs.progress = data;
      if (this.ui) this.ui.update();
    });

    const result = await window.electronAPI.video.gif({
      mode: 'final',
      inputPath: gs.inputPath,
      segments: gs.segments.map(s => ({
        startTime: s.startTime,
        duration: Math.round((s.endTime - s.startTime) * 10) / 10,
        speed: s.speed,
      })),
      preset: gs.preset,
      outputPath: gs.outputFolder || undefined,
    });

    window.electronAPI.video.onGifProgress(() => {});

    if (result.success) {
      gs.status = 'done';
      gs.result = result;
    } else {
      gs.status = 'error';
      gs.error = result.error || 'GIF generation failed';
    }
    if (this.ui) this.ui.update();
  }

  _handleGifRetry() {
    this.gifState.status = 'idle';
    this.gifState.progress = null;
    this.gifState.error = null;
    if (this.ui) this.ui.update();
  }

  async _handleGifOpenFile() {
    if (this.gifState.result && this.gifState.result.outputPath) {
      await window.electronAPI.video.revealFile({ filePath: this.gifState.result.outputPath });
    }
  }

  async _handleGifOpenFolder() {
    if (this.gifState.result && this.gifState.result.outputPath) {
      await window.electronAPI.video.revealFile({ filePath: this.gifState.result.outputPath });
    }
  }

  _handleGifNew() {
    this.gifState.reset();
    if (this.ui) this.ui.update();
  }

  _handleTabChange(tab) {
    this.state.activeSection = tab;
    if (this.ui) this.ui.update();
  }
}
