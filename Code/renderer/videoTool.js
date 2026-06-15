import VideoState from './videoTool/videoState.js';
import ImageState from './videoTool/imageState.js';
import VideoUI from './videoTool/videoUI.js';
import { DEFAULT_PRESET } from './videoTool/videoPresets.js';

export default class VideoTool {
  constructor() {
    this.state = new VideoState();
    this.imageState = new ImageState();
    this.ui = null;
    this._container = null;
  }

  initialize() {
    return { success: true };
  }

  render(container) {
    this._container = container;
    this.ui = new VideoUI(this.state, this.imageState);
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
      onImageConvert: () => this._startImageConvert(),
      onImageRetry: () => this._handleImageRetry(),
      onImageOpenFile: () => this._handleImageOpenFile(),
      onImageOpenFolder: () => this._handleImageOpenFolder(),
      onImageConvertAnother: () => this._handleImageConvertAnother(),
    });
    this.ui.render(container);
  }

  destroy() {
    window.electronAPI.video.onProgress(() => {});
    window.electronAPI.image.onProgress(() => {});
    this.ui = null;
    this.state.reset();
    this.imageState.reset();
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
    this.imageState.inputMeta = { resolution: '?', fileSize: 0 };
    this.imageState.status = 'idle';
    if (this.ui) this.ui.update();
  }

  _handleImageRemoveFile() {
    this.imageState.reset();
    if (this.ui) this.ui.update();
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
}