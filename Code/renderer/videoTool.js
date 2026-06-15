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
      onGifSelectClip: (clipId) => this._handleGifSelectClip(clipId),
      onGifTimeChange: (field, value) => this._handleGifTimeChange(field, value),
      onGifSpeedChange: (speed) => this._handleGifSpeedChange(speed),
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

    const meta = await window.electronAPI.video.getMetadata({ inputPath: path });
    if (!meta.success) {
      this.gifState.status = 'error';
      this.gifState.error = meta.error || 'Failed to read metadata';
      if (this.ui) this.ui.update();
      return;
    }
    this.gifState.inputMeta = {
      duration: meta.duration,
      resolution: meta.originalResolution,
      fileSize: meta.originalSize,
    };

    this.gifState.status = 'generating-previews';
    if (this.ui) this.ui.update();

    window.electronAPI.video.onGifProgress((data) => {
      this.gifState.progress = data;
      if (this.ui) this.ui.update();
    });

    const analyzeResult = await window.electronAPI.video.gif({ mode: 'analyze', inputPath: path });
    if (!analyzeResult.success) {
      this.gifState.status = 'error';
      this.gifState.error = analyzeResult.error || 'Analysis failed';
      window.electronAPI.video.onGifProgress(() => {});
      if (this.ui) this.ui.update();
      return;
    }

    const previewResult = await window.electronAPI.video.gif({
      mode: 'previews',
      inputPath: path,
      clips: analyzeResult.suggestions || [],
    });

    window.electronAPI.video.onGifProgress(() => {});

    if (!previewResult.success) {
      this.gifState.status = 'error';
      this.gifState.error = previewResult.error || 'Preview generation failed';
      if (this.ui) this.ui.update();
      return;
    }

    this.gifState.suggestions = analyzeResult.suggestions || [];
    this.gifState.previews = previewResult.previews || [];
    this.gifState.status = 'preview-ready';
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

  _handleGifSelectClip(clipId) {
    const clip = this.gifState.previews.find(p => p.id === clipId);
    if (!clip) return;
    this.gifState.selectedClipId = clipId;
    this.gifState.settings.startTime = clip.startTime;
    this.gifState.settings.endTime = Math.round((clip.startTime + clip.duration) * 10) / 10;
    if (this.ui) this.ui.update();
  }

  _handleGifTimeChange(field, value) {
    if (field === 'start') {
      this.gifState.settings.startTime = value;
    } else {
      this.gifState.settings.endTime = value;
    }
    if (this.ui) this.ui.update();
  }

  _handleGifSpeedChange(speed) {
    this.gifState.settings.speed = speed;
    if (this.ui) this.ui.update();
  }

  _handleGifPresetChange(preset) {
    this.gifState.settings.preset = preset;
    if (this.ui) this.ui.update();
  }

  async _startGifGenerate() {
    const gs = this.gifState;
    if (!gs.inputPath || gs.status === 'generating') return;
    const startTime = gs.settings.startTime;
    const endTime = gs.settings.endTime;
    if (endTime <= startTime) {
      gs.error = 'End time must be after start time';
      gs.status = 'error';
      if (this.ui) this.ui.update();
      return;
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
      startTime,
      duration: Math.round((endTime - startTime) * 10) / 10,
      speed: gs.settings.speed,
      preset: gs.settings.preset,
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
    this.gifState.status = 'preview-ready';
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
