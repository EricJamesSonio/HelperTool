import VideoState from './videoTool/videoState.js';
import VideoUI from './videoTool/videoUI.js';
import { DEFAULT_PRESET } from './videoTool/videoPresets.js';

export default class VideoTool {
  constructor() {
    this.state = new VideoState();
    this.ui = null;
    this._container = null;
  }

  initialize() {
    return { success: true };
  }

  render(container) {
    this._container = container;
    this.ui = new VideoUI(this.state);
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
    });
    this.ui.render(container);
  }

  destroy() {
    window.electronAPI.video.onProgress(() => {});
    this.ui = null;
    this.state.reset();
    this._container = null;
  }

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
}