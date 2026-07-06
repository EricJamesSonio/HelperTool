import { renderFileDropZone, renderPresetCards, renderOutputRow as renderVideoCompressOutputRow, renderCompressButton as renderVideoCompressButton, renderProgress as renderVideoCompressProgress, renderResult as renderVideoCompressResult, renderError as renderVideoCompressError } from './videoRenderer.js';
import { renderImageDropZone, renderImageOutputRow, renderImageResult, renderImageProgress, renderImageError, renderCompressDropZone, renderCompressControls, renderCompressOutputRow, renderCompressButton, renderCompressProgress, renderCompressResult, renderCompressError } from './imageRenderer.js';
import {
  renderDropZone, renderFileInfo, renderOutputRow, renderPlayerSlot,
  renderTimeline, renderSegmentActions,
  renderPresets, renderExportButtons, renderProgress, renderResult, renderError,
} from './timelineRenderer.js';

export default class VideoUI {
  constructor(state, imageState) {
    this._state = state;
    this._imageState = imageState;
    this._container = null;
    this._videoEl = null;

    this._onPickFile = null;
    this._onRemoveFile = null;
    this._onPresetChange = null;
    this._onChangeOutput = null;
    this._onSplit = null;
    this._onDelete = null;
    this._onSpeedChange = null;
    this._onSelectSegment = null;
    this._onTimelineClick = null;
    this._onExportMp4 = null;
    this._onExportGif = null;
    this._onTimelineRetry = null;
    this._onTimelineOpenFile = null;
    this._onTimelineOpenFolder = null;
    this._onTimelineNew = null;
    this._onUndo = null;
    this._onRedo = null;

    this._onCompress = null;
    this._onCompressRetry = null;
    this._onCompressOpenFile = null;
    this._onCompressOpenFolder = null;
    this._onCompressAnother = null;

    this._onImagePickFile = null;
    this._onImageRemoveFile = null;
    this._onImageChangeOutput = null;
    this._onImageConvert = null;
    this._onImageRetry = null;
    this._onImageOpenFile = null;
    this._onImageOpenFolder = null;
    this._onImageConvertAnother = null;

    this._onIcPickFiles = null;
    this._onIcAddMore = null;
    this._onIcRemoveFile = null;
    this._onIcCompress = null;
    this._onIcChangeOutput = null;
    this._onIcPresetChange = null;
    this._onIcFormatChange = null;
    this._onIcRetry = null;
    this._onIcOpenFile = null;
    this._onIcOpenFolder = null;
    this._onIcCompressAnother = null;

    this._onTabChange = null;
  }

  setCallbacks(cbs) {
    this._onPickFile = cbs.onPickFile || null;
    this._onRemoveFile = cbs.onRemoveFile || null;
    this._onPresetChange = cbs.onPresetChange || null;
    this._onChangeOutput = cbs.onChangeOutput || null;
    this._onSplit = cbs.onSplit || null;
    this._onDelete = cbs.onDelete || null;
    this._onSpeedChange = cbs.onSpeedChange || null;
    this._onSelectSegment = cbs.onSelectSegment || null;
    this._onTimelineClick = cbs.onTimelineClick || null;
    this._onExportMp4 = cbs.onExportMp4 || null;
    this._onExportGif = cbs.onExportGif || null;
    this._onTimelineRetry = cbs.onTimelineRetry || null;
    this._onTimelineOpenFile = cbs.onTimelineOpenFile || null;
    this._onTimelineOpenFolder = cbs.onTimelineOpenFolder || null;
    this._onTimelineNew = cbs.onTimelineNew || null;
    this._onUndo = cbs.onUndo || null;
    this._onRedo = cbs.onRedo || null;

    this._onCompress = cbs.onCompress || null;
    this._onCompressRetry = cbs.onCompressRetry || null;
    this._onCompressOpenFile = cbs.onCompressOpenFile || null;
    this._onCompressOpenFolder = cbs.onCompressOpenFolder || null;
    this._onCompressAnother = cbs.onCompressAnother || null;

    this._onImagePickFile = cbs.onImagePickFile || null;
    this._onImageRemoveFile = cbs.onImageRemoveFile || null;
    this._onImageChangeOutput = cbs.onImageChangeOutput || null;
    this._onImageConvert = cbs.onImageConvert || null;
    this._onImageRetry = cbs.onImageRetry || null;
    this._onImageOpenFile = cbs.onImageOpenFile || null;
    this._onImageOpenFolder = cbs.onImageOpenFolder || null;
    this._onImageConvertAnother = cbs.onImageConvertAnother || null;

    this._onIcPickFiles = cbs.onIcPickFiles || null;
    this._onIcAddMore = cbs.onIcAddMore || null;
    this._onIcRemoveFile = cbs.onIcRemoveFile || null;
    this._onIcCompress = cbs.onIcCompress || null;
    this._onIcChangeOutput = cbs.onIcChangeOutput || null;
    this._onIcPresetChange = cbs.onIcPresetChange || null;
    this._onIcFormatChange = cbs.onIcFormatChange || null;
    this._onIcRetry = cbs.onIcRetry || null;
    this._onIcOpenFile = cbs.onIcOpenFile || null;
    this._onIcOpenFolder = cbs.onIcOpenFolder || null;
    this._onIcCompressAnother = cbs.onIcCompressAnother || null;

    this._onTabChange = cbs.onTabChange || null;
  }

  getVideoElement() { return this._videoEl; }

  render(container) {
    this._container = container;
    container.innerHTML = this._getTemplate();
    this._initVideoPlayer();
    this._bindEvents();
  }

  update() {
    if (!this._container) return;
    const oldVideo = this._videoEl;
    const oldBody = this._container.querySelector('.vt-body');
    const scrollTop = oldBody ? oldBody.scrollTop : 0;
    this._videoEl = null;
    this._container.innerHTML = this._getTemplate();
    this._restoreVideoPlayer(oldVideo);
    const newBody = this._container.querySelector('.vt-body');
    if (newBody) newBody.scrollTop = scrollTop;
    this._bindEvents();
  }

  _initVideoPlayer() {
    const slot = this._container.querySelector('#tlPlayerSlot');
    if (!slot) return;
    this._createVideoElement(slot);
  }

  _restoreVideoPlayer(oldVideo) {
    const slot = this._container.querySelector('#tlPlayerSlot');
    if (!slot) return;
    if (oldVideo) {
      slot.appendChild(oldVideo);
      this._videoEl = oldVideo;
      const area = slot.closest('.tl-player-area');
      if (area) area.classList.toggle('paused', oldVideo.paused);
    } else {
      this._createVideoElement(slot);
    }
  }

  _createVideoElement(slot) {
    const video = document.createElement('video');
    video.id = 'tlVideo';
    video.className = 'tl-video';
    video.controls = false;
    video.preload = 'auto';
    const st = this._state;
    if (st.inputPath) {
      video.src = 'file://' + st.inputPath.replace(/\\/g, '/');
    }
    slot.appendChild(video);
    this._videoEl = video;

    // Mark player as paused initially
    const area = slot.closest('.tl-player-area');
    if (area) area.classList.add('paused');

    this._previewSegId = null;
    video.addEventListener('timeupdate', () => {
      const t = video.currentTime;
      const dur = st.inputMeta ? st.inputMeta.duration : 1;

      // Find current enabled segment (source time = video time, raw source plays)
      const seg = st.segments.find(s => s.enabled && t >= s.startTime && t < s.endTime);

      if (!seg) {
        // Disabled/gap area → skip to next enabled segment
        const next = st.segments
          .filter(s => s.enabled && s.startTime > t)
          .sort((a, b) => a.startTime - b.startTime)[0];
        if (next) {
          video.currentTime = next.startTime;
        } else {
          video.pause();
        }
        return;
      }

      // Apply per-segment speed
      if (Math.abs(video.playbackRate - seg.speed) > 0.01) {
        video.playbackRate = seg.speed;
      }

      // Update state
      st.currentTime = t;

      // Auto-select segment when crossing boundary
      if (seg.id !== this._previewSegId) {
        this._previewSegId = seg.id;
        st.selectedSegmentId = seg.id;
      }

      // Move playhead via direct DOM (no full re-render)
      const playhead = this._container ? this._container.querySelector('.tl-playhead') : null;
      if (playhead && dur > 0) {
        playhead.style.left = ((t / dur) * 100) + '%';
      }

      // Update bar highlight
      this._container.querySelectorAll('.tl-seg-bar').forEach(bar => {
        bar.classList.toggle('tl-seg-bar--selected', bar.dataset.segId === st.selectedSegmentId);
      });

      // Update custom controls
      this._updateControls(t, dur);
    });

    video.addEventListener('play', () => this._updatePlayState(true));
    video.addEventListener('pause', () => this._updatePlayState(false));
  }

  _renderTabs() {
    const active = this._state.activeSection;
    return `
      <div class="vt-tabs">
        <button class="vt-tab ${active === 'timeline' ? 'vt-tab--active' : ''}" data-tab="timeline">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><path d="M9 3v14"/><path d="M15 3v14"/><path d="M2 9h6"/><path d="M12 9h6"/><path d="M2 12h6"/><path d="M12 12h6"/><path d="M2 6h6"/><path d="M12 6h6"/></svg>
          Timeline Editor
        </button>
        <button class="vt-tab ${active === 'compress' ? 'vt-tab--active' : ''}" data-tab="compress">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><path d="M10 3v14"/><path d="M6 7l4-4 4 4"/><path d="M6 13l4 4 4-4"/></svg>
          Quick Compress
        </button>
        <button class="vt-tab ${active === 'image' ? 'vt-tab--active' : ''}" data-tab="image">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><circle cx="7" cy="8" r="1.5"/><path d="M2 14l4-4 3 3 3-3 4 4"/></svg>
          Image to ICO
        </button>
        <button class="vt-tab ${active === 'imgCompress' ? 'vt-tab--active' : ''}" data-tab="imgCompress">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14l7-7 7 7"/><path d="M10 7v10"/></svg>
          Image Compress
        </button>
      </div>`;
  }

  _getTemplate() {
    const st = this._state;
    const im = this._imageState;

    let timelineContent = '';
    if (st.activeSection === 'timeline') {
      if (!st.inputPath) {
        timelineContent = renderDropZone();
      } else {
        const fileInfo = renderFileInfo(st.inputPath, st.inputMeta);
        const outputRow = renderOutputRow(st.outputFolder);
        const playerSlot = renderPlayerSlot();
        const timeline = st.segments.length > 0 ? renderTimeline(
          st.segments, st.inputMeta.duration, st.currentTime, st.selectedSegmentId, (i) => st.getSegmentColor(i), st.totalDuration
        ) : '';
        const segActions = st.selectedSegment ? renderSegmentActions(st.selectedSegment, st.segments.indexOf(st.selectedSegment)) : '';
        const presets = st.status !== 'rendering' && st.status !== 'done'
          ? renderPresets(st.selectedPreset) : '';
        const exportBtns = st.status !== 'rendering' && st.status !== 'done' && st.segments.length > 0
          ? renderExportButtons(st.exportMode) : '';
        const progressSection = st.status === 'rendering' ? renderProgress(st.progress) : '';
        const resultSection = st.status === 'done' && st.result ? renderResult(st.result) : '';
        const errorSection = st.status === 'error' ? renderError(st.error) : '';

        timelineContent = `
          <div class="tl-file-info-wrapper">${fileInfo}</div>
          <div class="tl-output-area">
            ${outputRow}
            <div class="tl-player-area">${playerSlot}</div>
            ${timeline ? `<div class="tl-timeline-wrapper">${timeline}</div>` : ''}
            ${segActions ? `<div class="tl-seg-actions-wrapper">${segActions}</div>` : ''}
            ${presets}
            ${exportBtns}
            ${progressSection}
            ${resultSection}
            ${errorSection}
          </div>`;
      }
    }

    let compressContent = '';
    if (st.activeSection === 'compress') {
      if (!st.inputPath) {
        compressContent = renderFileDropZone(null, null);
      } else {
        const fileSection = renderFileDropZone(st.inputPath, st.inputMeta);
        const outputSection = renderVideoCompressOutputRow(st.outputFolder);
        const presetSection = renderPresetCards(st.selectedPreset, st.inputMeta);
        const btnSection = st.compressStatus !== 'compressing' && st.compressStatus !== 'compressed'
          ? renderVideoCompressButton(st.compressStatus) : '';
        const progressSection = st.compressStatus === 'compressing' ? renderVideoCompressProgress(st.compressProgress) : '';
        const resultSection = st.compressStatus === 'compressed' && st.compressResult ? renderVideoCompressResult(st.compressResult) : '';
        const errorSection = st.compressStatus === 'error' ? renderVideoCompressError(st.compressError) : '';

        compressContent = `
          ${fileSection}
          <div class="vt-layout">
            <div class="vt-sidebar">
              <div class="vt-section-label">Preset</div>
              <div class="vt-presets" id="vtPresets">${presetSection}</div>
            </div>
            <div class="vt-main">
              ${outputSection ? `<div class="vt-section">${outputSection}</div>` : ''}
              ${btnSection ? `<div class="vt-section">${btnSection}</div>` : ''}
              ${progressSection ? `<div class="vt-section">${progressSection}</div>` : ''}
              ${resultSection ? `<div class="vt-section">${resultSection}</div>` : ''}
              ${errorSection ? `<div class="vt-section">${errorSection}</div>` : ''}
            </div>
          </div>`;
      }
    }

    let imageContent = '';
    if (st.activeSection === 'image') {
      const drop = renderImageDropZone(im.inputPath, im.inputMeta);
      let inner = '';
      if (im.inputPath) {
        const outputSection = renderImageOutputRow(im.outputFolder);
        const convertSection = im.status !== 'done' ? `<button class="im-convert-btn" id="imConvertBtn">Convert to ICO</button>` : '';
        const progressSection = im.status === 'converting' ? renderImageProgress(im.progress) : '';
        const resultSection = im.status === 'done' && im.result ? renderImageResult(im.result) : '';
        const errorSection = im.status === 'error' ? renderImageError(im.error) : '';
        inner = `
          <div class="im-output-area">
            <div class="vt-section">${outputSection}</div>
            ${convertSection ? `<div class="vt-section">${convertSection}</div>` : ''}
            ${progressSection ? `<div class="vt-section">${progressSection}</div>` : ''}
            ${resultSection ? `<div class="vt-section">${resultSection}</div>` : ''}
            ${errorSection ? `<div class="vt-section">${errorSection}</div>` : ''}
          </div>`;
      }
      imageContent = drop + inner;
    }

    let imgCompressContent = '';
    if (st.activeSection === 'imgCompress') {
      const mode = im.compressInputPaths.length > 1 ? 'batch' : 'single';
      const drop = renderCompressDropZone(mode, im.compressInputPaths, im.compressInputMetas);
      let inner = '';
      if (im.compressInputPaths.length > 0) {
        const outputSection = renderCompressOutputRow(im.outputFolder);
        const controls = im.compressStatus !== 'compressing' && im.compressStatus !== 'done' ? renderCompressControls(im.compressPreset, im.compressFormat) : '';
        const btnSection = im.compressStatus !== 'compressing' && im.compressStatus !== 'done'
          ? renderCompressButton(mode, im.compressInputPaths.length) : '';
        const progressSection = im.compressStatus === 'compressing' ? renderCompressProgress(im.compressProgress) : '';
        const resultSection = im.compressStatus === 'done' && im.compressResult ? renderCompressResult(im.compressResult) : '';
        const errorSection = im.compressStatus === 'error' ? renderCompressError(im.compressError) : '';
        inner = `
          <div class="vt-section">${outputSection}</div>
          ${controls}
          ${btnSection ? `<div class="vt-section">${btnSection}</div>` : ''}
          ${progressSection ? `<div class="vt-section">${progressSection}</div>` : ''}
          ${resultSection ? `<div class="vt-section">${resultSection}</div>` : ''}
          ${errorSection ? `<div class="vt-section">${errorSection}</div>` : ''}`;
      }
      imgCompressContent = drop + inner;
    }

    return `
      <div class="vt-body">
        ${this._renderTabs()}
        ${timelineContent}
        ${compressContent}
        ${imageContent}
        ${imgCompressContent}
      </div>`;
  }

  _updateControls(t, dur) {
    const fill = this._container ? this._container.querySelector('#tlPbFill') : null;
    const thumb = this._container ? this._container.querySelector('#tlPbThumb') : null;
    if (fill && dur > 0) fill.style.width = ((t / dur) * 100) + '%';
    if (thumb && dur > 0) thumb.style.left = ((t / dur) * 100) + '%';

    const timeEl = this._container ? this._container.querySelector('#tlPbTime') : null;
    if (timeEl && dur > 0) {
      const cur = this._formatTime(t);
      const tot = this._formatTime(dur);
      timeEl.textContent = cur + ' / ' + tot;
    }
  }

  _updatePlayState(playing) {
    const area = this._container ? this._container.querySelector('.tl-player-area') : null;
    if (area) area.classList.toggle('paused', !playing);
    const big = this._container ? this._container.querySelector('#tlBigPlay') : null;
    const btn = this._container ? this._container.querySelector('#tlPbPlay') : null;
    if (big) big.style.display = playing ? 'none' : 'flex';
    if (btn) btn.textContent = playing ? '⏸' : '▶';
  }

  _formatTime(s) {
    if (!s || s <= 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  _bindEvents() {
    if (!this._container) return;

    this._container.querySelectorAll('.vt-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (this._onTabChange) this._onTabChange(tab.dataset.tab);
      });
    });

    // ── Shared timeline + compress file pick events ──
    const vDrop = this._container.querySelector('#vtDropZone');
    if (vDrop) {
      vDrop.addEventListener('dragover', (e) => { e.preventDefault(); vDrop.classList.add('vt-drag-over'); });
      vDrop.addEventListener('dragleave', () => vDrop.classList.remove('vt-drag-over'));
      vDrop.addEventListener('drop', (e) => {
        e.preventDefault(); vDrop.classList.remove('vt-drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.path && this._onPickFile) this._onPickFile(file.path);
      });
    }

    const vBtn = this._container.querySelector('#vtBrowseBtn');
    if (vBtn && this._onPickFile) vBtn.addEventListener('click', () => this._onPickFile(null));

    const vRem = this._container.querySelector('#vtRemoveFile');
    if (vRem && this._onRemoveFile) vRem.addEventListener('click', () => this._onRemoveFile());

    const coBtn = this._container.querySelector('#tlChangeOutputBtn') || this._container.querySelector('#vtChangeOutputBtn');
    if (coBtn && this._onChangeOutput) coBtn.addEventListener('click', () => this._onChangeOutput());

    // ── Timeline Editor events ──
    const timeline = this._container.querySelector('#tlTimeline');
    if (timeline && this._onTimelineClick) {
      timeline.addEventListener('click', (e) => {
        const rect = timeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = x / rect.width;
        this._onTimelineClick(pct);
      });
    }

    const speedSel = this._container.querySelector('.tl-speed-select');
    const segId = this._state.selectedSegmentId;
    if (speedSel && segId && this._onSpeedChange) {
      speedSel.addEventListener('change', () => this._onSpeedChange(segId, parseFloat(speedSel.value)));
    }

    const splitBtn = this._container.querySelector('#tlSplitBtn');
    if (splitBtn && this._onSplit) splitBtn.addEventListener('click', () => this._onSplit());

    const delBtn = this._container.querySelector('#tlDeleteBtn');
    if (delBtn && this._onDelete && segId) {
      delBtn.addEventListener('click', () => this._onDelete(segId));
    }

    this._container.querySelectorAll('.tl-preset-card').forEach(c => {
      c.addEventListener('click', () => { if (this._onPresetChange) this._onPresetChange(c.dataset.preset); });
    });

    const mp4Btn = this._container.querySelector('#tlExportMp4Btn');
    if (mp4Btn && this._onExportMp4) mp4Btn.addEventListener('click', () => this._onExportMp4());

    const gifBtn = this._container.querySelector('#tlExportGifBtn');
    if (gifBtn && this._onExportGif) gifBtn.addEventListener('click', () => this._onExportGif());

    const tlRetry = this._container.querySelector('#tlRetryBtn');
    if (tlRetry && this._onTimelineRetry) tlRetry.addEventListener('click', () => this._onTimelineRetry());

    const tlOF = this._container.querySelector('#tlOpenFileBtn');
    if (tlOF && this._onTimelineOpenFile) tlOF.addEventListener('click', () => this._onTimelineOpenFile());

    const tlOFd = this._container.querySelector('#tlOpenFolderBtn');
    if (tlOFd && this._onTimelineOpenFolder) tlOFd.addEventListener('click', () => this._onTimelineOpenFolder());

    const tlNew = this._container.querySelector('#tlNewBtn');
    if (tlNew && this._onTimelineNew) tlNew.addEventListener('click', () => this._onTimelineNew());

    const undoBtn = this._container.querySelector('#tlUndoBtn');
    if (undoBtn && this._onUndo) undoBtn.addEventListener('click', () => this._onUndo());
    const redoBtn = this._container.querySelector('#tlRedoBtn');
    if (redoBtn && this._onRedo) redoBtn.addEventListener('click', () => this._onRedo());

    // ── Custom player controls ──
    const video = this._videoEl;
    const bigPlay = this._container.querySelector('#tlBigPlay');
    if (bigPlay && video) bigPlay.addEventListener('click', () => { video.paused ? video.play() : video.pause(); });
    const pbPlay = this._container.querySelector('#tlPbPlay');
    if (pbPlay && video) pbPlay.addEventListener('click', () => { video.paused ? video.play() : video.pause(); });

    const pbProgress = this._container.querySelector('#tlPbProgress');
    if (pbProgress && video) {
      pbProgress.addEventListener('click', (e) => {
        const rect = pbProgress.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        const dur = this._state.inputMeta ? this._state.inputMeta.duration : 0;
        if (dur > 0) video.currentTime = pct * dur;
      });
    }

    const pbVol = this._container.querySelector('#tlPbVol');
    if (pbVol && video) pbVol.addEventListener('click', () => { video.muted = !video.muted; pbVol.textContent = video.muted ? '🔇' : '🔊'; });

    // ── Quick Compress events ──
    this._container.querySelectorAll('.vt-preset-card').forEach(c => {
      c.addEventListener('click', () => { if (this._onPresetChange) this._onPresetChange(c.dataset.preset); });
    });

    const cmpBtn = this._container.querySelector('#vtCompressBtn');
    if (cmpBtn && this._onCompress) cmpBtn.addEventListener('click', () => this._onCompress());

    const cmpRetry = this._container.querySelector('#vtRetryBtn');
    if (cmpRetry && this._onCompressRetry) cmpRetry.addEventListener('click', () => this._onCompressRetry());

    const cmpOF = this._container.querySelector('#vtOpenFileBtn');
    if (cmpOF && this._onCompressOpenFile) cmpOF.addEventListener('click', () => this._onCompressOpenFile());

    const cmpOFd = this._container.querySelector('#vtOpenFolderBtn');
    if (cmpOFd && this._onCompressOpenFolder) cmpOFd.addEventListener('click', () => this._onCompressOpenFolder());

    const cmpCA = this._container.querySelector('#vtCompressAnotherBtn');
    if (cmpCA && this._onCompressAnother) cmpCA.addEventListener('click', () => this._onCompressAnother());

    // ── Image events ──
    const imDrop = this._container.querySelector('#imDropZone');
    if (imDrop) {
      imDrop.addEventListener('dragover', (e) => { e.preventDefault(); imDrop.classList.add('im-drag-over'); });
      imDrop.addEventListener('dragleave', () => imDrop.classList.remove('im-drag-over'));
      imDrop.addEventListener('drop', (e) => {
        e.preventDefault(); imDrop.classList.remove('im-drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.path && this._onImagePickFile) this._onImagePickFile(file.path);
      });
    }

    const imBtn = this._container.querySelector('#imBrowseBtn');
    if (imBtn && this._onImagePickFile) imBtn.addEventListener('click', () => this._onImagePickFile(null));

    const imRem = this._container.querySelector('#imRemoveFile');
    if (imRem && this._onImageRemoveFile) imRem.addEventListener('click', () => this._onImageRemoveFile());

    const imCoBtn = this._container.querySelector('#imChangeOutputBtn');
    if (imCoBtn && this._onImageChangeOutput) imCoBtn.addEventListener('click', () => this._onImageChangeOutput());

    const imConv = this._container.querySelector('#imConvertBtn');
    if (imConv && this._onImageConvert) imConv.addEventListener('click', () => this._onImageConvert());

    const imRetry = this._container.querySelector('#imRetryBtn');
    if (imRetry && this._onImageRetry) imRetry.addEventListener('click', () => this._onImageRetry());

    const imOF = this._container.querySelector('#imOpenFileBtn');
    if (imOF && this._onImageOpenFile) imOF.addEventListener('click', () => this._onImageOpenFile());

    const imOFd = this._container.querySelector('#imOpenFolderBtn');
    if (imOFd && this._onImageOpenFolder) imOFd.addEventListener('click', () => this._onImageOpenFolder());

    const imCA = this._container.querySelector('#imConvertAnotherBtn');
    if (imCA && this._onImageConvertAnother) imCA.addEventListener('click', () => this._onImageConvertAnother());

    // ── Image Compress events ──
    const icDrop = this._container.querySelector('#icDropZone');
    if (icDrop) {
      icDrop.addEventListener('dragover', (e) => { e.preventDefault(); icDrop.classList.add('im-drag-over'); });
      icDrop.addEventListener('dragleave', () => icDrop.classList.remove('im-drag-over'));
      icDrop.addEventListener('drop', (e) => {
        e.preventDefault(); icDrop.classList.remove('im-drag-over');
        const files = Array.from(e.dataTransfer.files).map(f => f.path).filter(Boolean);
        if (files.length > 0 && this._onIcPickFiles) this._onIcPickFiles(files);
      });
    }

    const icBtn = this._container.querySelector('#icBrowseBtn');
    if (icBtn && this._onIcPickFiles) icBtn.addEventListener('click', () => this._onIcPickFiles(null));

    const icAddMore = this._container.querySelector('#icAddMoreBtn');
    if (icAddMore && this._onIcAddMore) icAddMore.addEventListener('click', () => this._onIcAddMore());

    this._container.querySelectorAll('.ic-file-remove').forEach(btn => {
      if (this._onIcRemoveFile) btn.addEventListener('click', () => this._onIcRemoveFile(parseInt(btn.dataset.idx)));
    });

    const icRem = this._container.querySelector('#icRemoveFile');
    if (icRem && this._onIcRemoveFile) icRem.addEventListener('click', () => this._onIcRemoveFile(0));

    this._container.querySelectorAll('#icPresets .vt-preset-card').forEach(c => {
      c.addEventListener('click', () => { if (this._onIcPresetChange) this._onIcPresetChange(c.dataset.preset); });
    });

    const icFormat = this._container.querySelector('#icFormatSelect');
    if (icFormat && this._onIcFormatChange) icFormat.addEventListener('change', () => this._onIcFormatChange(icFormat.value));

    const icCoBtn = this._container.querySelector('#icChangeOutputBtn');
    if (icCoBtn && this._onIcChangeOutput) icCoBtn.addEventListener('click', () => this._onIcChangeOutput());

    const icCmpBtn = this._container.querySelector('#icCompressBtn');
    if (icCmpBtn && this._onIcCompress) icCmpBtn.addEventListener('click', () => this._onIcCompress());

    const icRetry = this._container.querySelector('#icRetryBtn');
    if (icRetry && this._onIcRetry) icRetry.addEventListener('click', () => this._onIcRetry());

    const icOF = this._container.querySelector('#icOpenFileBtn');
    if (icOF && this._onIcOpenFile) icOF.addEventListener('click', () => this._onIcOpenFile());

    const icOFd = this._container.querySelector('#icOpenFolderBtn');
    if (icOFd && this._onIcOpenFolder) icOFd.addEventListener('click', () => this._onIcOpenFolder());

    const icCA = this._container.querySelector('#icCompressAnotherBtn');
    if (icCA && this._onIcCompressAnother) icCA.addEventListener('click', () => this._onIcCompressAnother());

    if (this._onUndo || this._onRedo) {
      if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = (e) => {
        const panel = this._container;
        if (!panel || !panel.classList.contains('open')) return;
        const isCtrl = e.ctrlKey || e.metaKey;
        if (isCtrl && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          if (this._onUndo) this._onUndo();
        } else if (isCtrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
          e.preventDefault();
          if (this._onRedo) this._onRedo();
        }
      };
      document.addEventListener('keydown', this._keyHandler);
    }
  }
}
