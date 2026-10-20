import VideoState from './videoTool/videoState.js';
import ImageState from './videoTool/imageState.js';
import VideoUI from './videoTool/videoUI.js';

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
      // Timeline
      onPickFile: (path) => this._handlePickFile(path),
      onRemoveFile: () => this._handleRemoveFile(),
      onPresetChange: (preset) => this._handlePresetChange(preset),
      onChangeOutput: () => this._handleChangeOutput(),
      onSplit: () => this._handleSplit(),
      onDelete: (segId) => this._handleDelete(segId),
      onSpeedChange: (segId, speed) => this._handleSpeedChange(segId, speed),
      onSelectSegment: (segId) => this._handleSelectSegment(segId),
      onTimelineClick: (pct) => this._handleTimelineClick(pct),
      onExportMp4: () => this._startExport('mp4'),
      onExportGif: () => this._startExport('gif'),
      onTimelineRetry: () => this._handleTimelineRetry(),
      onTimelineOpenFile: () => this._handleTimelineOpenFile(),
      onTimelineOpenFolder: () => this._handleTimelineOpenFolder(),
      onTimelineNew: () => this._handleTimelineNew(),
      onUndo: () => this._handleUndo(),
      onRedo: () => this._handleRedo(),
      // Quick Compress
      onCompress: () => this._startCompress(),
      onCompressRetry: () => this._handleCompressRetry(),
      onCompressOpenFile: () => this._handleCompressOpenFile(),
      onCompressOpenFolder: () => this._handleCompressOpenFolder(),
      onCompressAnother: () => this._handleCompressAnother(),
      // Image Converter
      onImagePickFiles: (paths) => this._handleImagePickFiles(paths),
      onImageAddMore: () => this._handleImageAddMore(),
      onImageRemoveFile: (idx) => this._handleImageRemoveFile(idx),
      onImageChangeOutput: () => this._handleImageChangeOutput(),
      onImageFormatChange: (format) => this._handleImageFormatChange(format),
      onImagePresetChange: (preset) => this._handleImagePresetChange(preset),
      onImageConvert: () => this._startImageConvert(),
      onImageRetry: () => this._handleImageRetry(),
      onImageOpenFile: () => this._handleImageOpenFile(),
      onImageOpenFolder: () => this._handleImageOpenFolder(),
      onImageConvertAnother: () => this._handleImageConvertAnother(),
      // Tab
      onTabChange: (tab) => this._handleTabChange(tab),
    });
    this.ui.render(container);
  }

  destroy() {
    window.electronAPI.video.onProgress(() => {});
    window.electronAPI.image.onConvertProgress(() => {});
    this.ui = null;
    this.state.reset();
    this.imageState.reset();
    this._container = null;
  }

  // ── Shared ──

  async _handlePickFile(path) {
    const st = this.state;
    if (!path) {
      const picked = await window.electronAPI.video.pickFile();
      if (!picked) return;
      path = picked;
    }
    st.reset();
    st.inputPath = path;
    st.status = 'loading';
    if (this.ui) this.ui.update();

    const meta = await window.electronAPI.video.getMetadata({ inputPath: path });
    if (!meta.success) {
      st.status = 'error';
      st.error = meta.error || 'Failed to read metadata';
      if (this.ui) this.ui.update();
      return;
    }
    st.inputMeta = {
      duration: meta.duration,
      resolution: meta.originalResolution,
      fileSize: meta.originalSize,
      originalSize: meta.originalSize,
      originalResolution: meta.originalResolution,
    };

    // Auto-add full video as initial segment (CapCut-style)
    st.addSegment(0, st.inputMeta.duration, 1);

    st.status = 'idle';
    if (this.ui) this.ui.update();

    // Set raw video as source for live preview
    const video = this.ui ? this.ui.getVideoElement() : null;
    if (video) {
      video.src = 'file://' + path.replace(/\\/g, '/');
      video.load();
    }
  }

  _handleRemoveFile() {
    this.state.reset();
    if (this.ui) this.ui.update();
    const video = this.ui ? this.ui.getVideoElement() : null;
    if (video) { video.src = ''; video.load(); }
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

  _handleTabChange(tab) {
    this.state.activeSection = tab;
    if (this.ui) this.ui.update();
  }

  // ── Timeline handlers ──

  _handleDelete(segId) {
    this.state.removeSegment(segId);
    if (this.ui) this.ui.update();
  }

  _handleSpeedChange(segId, speed) {
    this.state.updateSegment(segId, { speed });
    if (this.ui) this.ui.update();
  }

  _handleSelectSegment(segId) {
    const st = this.state;
    st.selectedSegmentId = segId;
    if (this.ui) this.ui.update();
  }

  _handleSplit() {
    const st = this.state;
    const seg = st.selectedSegment;
    if (!seg) return;
    const splitTime = st.currentTime;
    if (isNaN(splitTime) || splitTime <= seg.startTime || splitTime >= seg.endTime) {
      st.error = 'Move playhead inside the clip to split';
      st.status = 'error';
      if (this.ui) this.ui.update();
      setTimeout(() => {
        if (st.status === 'error' && st.error === 'Move playhead inside the clip to split') {
          st.status = 'idle'; st.error = null; if (this.ui) this.ui.update();
        }
      }, 2000);
      return;
    }
    st.splitSegment(seg.id, splitTime);
    if (this.ui) this.ui.update();
  }

  _handleTimelineClick(pct) {
    const st = this.state;
    const dur = st.inputMeta ? st.inputMeta.duration : 0;
    if (dur <= 0) return;
    const targetTime = pct * dur; // source-time position
    st.currentTime = targetTime;
    const video = this.ui ? this.ui.getVideoElement() : null;
    if (video) video.currentTime = targetTime;
    for (const seg of st.segments) {
      if (seg.enabled && targetTime >= seg.startTime && targetTime < seg.endTime) {
        st.selectedSegmentId = seg.id;
        break;
      }
    }
    if (this.ui) this.ui.update();
  }

  async _startExport(mode) {
    const st = this.state;
    if (!st.inputPath || st.status === 'rendering') return;
    const active = st.activeSegments;
    if (active.length === 0) {
      st.error = 'Add at least one clip';
      st.status = 'error';
      if (this.ui) this.ui.update();
      return;
    }
    for (const seg of active) {
      const dur = seg.endTime - seg.startTime;
      if (isNaN(dur) || dur <= 0) {
        st.error = 'Clip has invalid duration';
        st.status = 'error';
        if (this.ui) this.ui.update();
        return;
      }
    }

    st.exportMode = mode;
    st.status = 'rendering';
    st.progress = null;
    st.result = null;
    st.error = null;
    if (this.ui) this.ui.update();

    const segmentsPayload = active.map(s => ({
      startTime: s.startTime,
      endTime: s.endTime,
      duration: Math.round((s.endTime - s.startTime) * 10) / 10,
      speed: s.speed,
      enabled: true,
    }));

    if (mode === 'gif') {
      window.electronAPI.video.onGifProgress((data) => {
        st.progress = data;
        if (this.ui) this.ui.update();
      });
      const result = await window.electronAPI.video.gif({
        mode: 'final',
        inputPath: st.inputPath,
        segments: segmentsPayload,
        preset: st.selectedPreset,
        outputPath: st.outputFolder || undefined,
      });
      window.electronAPI.video.onGifProgress(() => {});
      if (result.success) { st.status = 'done'; st.result = result; }
      else { st.status = 'error'; st.error = result.error || 'GIF export failed'; }
    } else {
      window.electronAPI.video.onRenderProgress((data) => {
        st.progress = data;
        if (this.ui) this.ui.update();
      });
      const result = await window.electronAPI.video.render({
        inputPath: st.inputPath,
        segments: segmentsPayload,
        preset: st.selectedPreset,
        outputPath: st.outputFolder || undefined,
      });
      window.electronAPI.video.onRenderProgress(() => {});
      if (result.success) { st.status = 'done'; st.result = result; }
      else { st.status = 'error'; st.error = result.error || 'Render failed'; }
    }
    if (this.ui) this.ui.update();
  }

  _handleTimelineRetry() {
    this.state.status = 'idle';
    this.state.progress = null;
    this.state.error = null;
    if (this.ui) this.ui.update();
  }

  async _handleTimelineOpenFile() {
    if (this.state.result && this.state.result.outputPath) {
      await window.electronAPI.video.revealFile({ filePath: this.state.result.outputPath });
    }
  }

  async _handleTimelineOpenFolder() {
    if (this.state.result && this.state.result.outputPath) {
      await window.electronAPI.video.revealFile({ filePath: this.state.result.outputPath });
    }
  }

  _handleUndo() {
    if (this.state.undo() && this.ui) this.ui.update();
  }

  _handleRedo() {
    if (this.state.redo() && this.ui) this.ui.update();
  }

  _handleTimelineNew() {
    this.state.reset();
    if (this.ui) this.ui.update();
    const video = this.ui ? this.ui.getVideoElement() : null;
    if (video) { video.src = ''; video.load(); }
  }

  // ── Quick Compress handlers ──

  async _startCompress() {
    const st = this.state;
    if (!st.inputPath || st.compressStatus === 'compressing') return;
    st.compressStatus = 'compressing';
    st.compressProgress = null;
    st.compressResult = null;
    st.compressError = null;
    if (this.ui) this.ui.update();

    window.electronAPI.video.onProgress((data) => {
      st.compressProgress = data;
      if (this.ui) this.ui.update();
    });

    const result = await window.electronAPI.video.compress({
      inputPath: st.inputPath,
      preset: st.selectedPreset,
      outputPath: st.outputFolder,
    });

    window.electronAPI.video.onProgress(() => {});

    if (result.success) {
      st.compressStatus = 'compressed';
      st.compressResult = result;
    } else {
      st.compressStatus = 'error';
      st.compressError = result.error || 'Compression failed';
    }
    if (this.ui) this.ui.update();
  }

  _handleCompressRetry() {
    this.state.compressStatus = 'idle';
    this.state.compressProgress = null;
    this.state.compressError = null;
    if (this.ui) this.ui.update();
  }

  async _handleCompressOpenFile() {
    if (this.state.compressResult && this.state.compressResult.outputPath) {
      await window.electronAPI.video.revealFile({ filePath: this.state.compressResult.outputPath });
    }
  }

  async _handleCompressOpenFolder() {
    if (this.state.compressResult && this.state.compressResult.outputPath) {
      await window.electronAPI.video.revealFile({ filePath: this.state.compressResult.outputPath });
    }
  }

  _handleCompressAnother() {
    const st = this.state;
    st.compressStatus = 'idle';
    st.compressProgress = null;
    st.compressResult = null;
    st.compressError = null;
    if (this.ui) this.ui.update();
  }

  // ── Image Converter handlers ──

  async _handleImagePickFiles(paths) {
    const im = this.imageState;

    if (!paths) {
      const picked = await window.electronAPI.image.pickFiles();
      if (!picked || picked.length === 0) return;
      paths = picked;
    }

    if (typeof paths === 'string') paths = [paths];
    if (paths.length === 0) return;

    im.inputPaths = paths;
    im.inputMetas = [];
    im.status = 'loading';
    im.error = null;
    im.warning = null;
    im.result = null;
    if (this.ui) this.ui.update();

    const metas = await Promise.all(paths.map(async (p) => {
      const meta = await window.electronAPI.image.getMetadata({ inputPath: p });
      return meta.success ? { resolution: meta.resolution, fileSize: meta.fileSize } : { resolution: '?', fileSize: 0 };
    }));

    im.inputMetas = metas;
    im.status = 'idle';
    this.state.activeSection = 'image';
    if (this.ui) this.ui.update();
  }

  async _handleImageAddMore() {
    const im = this.imageState;
    const picked = await window.electronAPI.image.pickFiles();
    if (!picked || picked.length === 0) return;

    const existing = new Set(im.inputPaths);
    const newPaths = picked.filter(p => !existing.has(p));
    if (newPaths.length === 0) return;

    const newMetas = await Promise.all(newPaths.map(async (p) => {
      const meta = await window.electronAPI.image.getMetadata({ inputPath: p });
      return meta.success ? { resolution: meta.resolution, fileSize: meta.fileSize } : { resolution: '?', fileSize: 0 };
    }));

    im.inputPaths = [...im.inputPaths, ...newPaths];
    im.inputMetas = [...im.inputMetas, ...newMetas];
    if (this.ui) this.ui.update();
  }

  _handleImageRemoveFile(idx) {
    const im = this.imageState;
    im.inputPaths.splice(idx, 1);
    im.inputMetas.splice(idx, 1);
    if (im.inputPaths.length === 0) {
      im.reset();
    }
    if (this.ui) this.ui.update();
  }

  async _handleImageChangeOutput() {
    const folder = await window.electronAPI.image.pickOutputFolder();
    if (folder) {
      this.imageState.outputFolder = folder;
      if (this.ui) this.ui.update();
    }
  }

  _handleImageFormatChange(format) {
    this.imageState.format = format;
    if (this.ui) this.ui.update();
  }

  _handleImagePresetChange(preset) {
    this.imageState.preset = preset;
    if (this.ui) this.ui.update();
  }

  async _startImageConvert() {
    const im = this.imageState;
    if (im.inputPaths.length === 0 || im.status === 'converting') return;

    im.status = 'converting';
    im.progress = null;
    im.result = null;
    im.error = null;
    im.warning = null;
    if (this.ui) this.ui.update();

    window.electronAPI.image.onConvertProgress((data) => {
      if (data.warning) im.warning = data.message;
      im.progress = data;
      if (this.ui) this.ui.update();
    });

    const payload = {
      inputPaths: im.inputPaths,
      format: im.format,
      preset: im.preset,
      outputPath: im.outputFolder || undefined,
    };

    const result = await window.electronAPI.image.convert(payload);
    window.electronAPI.image.onConvertProgress(() => {});

    if (result.success) {
      im.status = 'done';
      im.result = result;
    } else {
      im.status = 'error';
      im.error = result.error || 'Conversion failed';
    }
    if (this.ui) this.ui.update();
  }

  _handleImageRetry() {
    const im = this.imageState;
    im.status = 'idle';
    im.progress = null;
    im.error = null;
    if (this.ui) this.ui.update();
  }

  async _handleImageOpenFile() {
    const result = this.imageState.result;
    if (!result) return;
    const p = result.batch ? result.results[0]?.outputPath : result.outputPath;
    if (p) await window.electronAPI.image.revealFile({ filePath: p });
  }

  async _handleImageOpenFolder() {
    const result = this.imageState.result;
    if (!result) return;
    const dir = result.outputDir || (result.outputPath ? result.outputPath.replace(/[/\\][^/\\]+$/, '') : null);
    if (dir) await window.electronAPI.image.revealFile({ filePath: dir });
  }

  _handleImageConvertAnother() {
    const im = this.imageState;
    im.status = 'idle';
    im.progress = null;
    im.result = null;
    im.error = null;
    if (this.ui) this.ui.update();
  }
}
