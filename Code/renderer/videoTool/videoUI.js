import { renderImageDropZone, renderImageOutputRow, renderImageResult, renderImageProgress, renderImageError } from './imageRenderer.js';
import {
  renderDropZone, renderFileInfo, renderOutputRow, renderPlayerSlot,
  renderTimeline, renderSegmentActions, renderSuggestions, renderAddClipButton,
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
    this._onAddSuggestion = null;
    this._onAddClip = null;
    this._onSelectSegment = null;
    this._onTimelineClick = null;
    this._onExportMp4 = null;
    this._onExportGif = null;
    this._onRetry = null;
    this._onOpenFile = null;
    this._onOpenFolder = null;
    this._onNew = null;

    this._onImagePickFile = null;
    this._onImageRemoveFile = null;
    this._onImageChangeOutput = null;
    this._onImageConvert = null;
    this._onImageRetry = null;
    this._onImageOpenFile = null;
    this._onImageOpenFolder = null;
    this._onImageConvertAnother = null;

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
    this._onAddSuggestion = cbs.onAddSuggestion || null;
    this._onAddClip = cbs.onAddClip || null;
    this._onSelectSegment = cbs.onSelectSegment || null;
    this._onTimelineClick = cbs.onTimelineClick || null;
    this._onExportMp4 = cbs.onExportMp4 || null;
    this._onExportGif = cbs.onExportGif || null;
    this._onRetry = cbs.onRetry || null;
    this._onOpenFile = cbs.onOpenFile || null;
    this._onOpenFolder = cbs.onOpenFolder || null;
    this._onNew = cbs.onNew || null;

    this._onImagePickFile = cbs.onImagePickFile || null;
    this._onImageRemoveFile = cbs.onImageRemoveFile || null;
    this._onImageChangeOutput = cbs.onImageChangeOutput || null;
    this._onImageConvert = cbs.onImageConvert || null;
    this._onImageRetry = cbs.onImageRetry || null;
    this._onImageOpenFile = cbs.onImageOpenFile || null;
    this._onImageOpenFolder = cbs.onImageOpenFolder || null;
    this._onImageConvertAnother = cbs.onImageConvertAnother || null;

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
    this._videoEl = null;
    this._container.innerHTML = this._getTemplate();
    this._restoreVideoPlayer(oldVideo);
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
    } else {
      this._createVideoElement(slot);
    }
  }

  _createVideoElement(slot) {
    const video = document.createElement('video');
    video.id = 'tlVideo';
    video.className = 'tl-video';
    video.controls = true;
    video.preload = 'auto';
    const st = this._state;
    if (st.inputPath) {
      video.src = 'file://' + st.inputPath.replace(/\\/g, '/');
    }
    slot.appendChild(video);
    this._videoEl = video;

    video.addEventListener('timeupdate', () => {
      st.currentTime = video.currentTime;
      const timeline = this._container.querySelector('#tlTimeline');
      if (timeline) {
        const playhead = timeline.querySelector('.tl-playhead');
        const dur = st.inputMeta ? st.inputMeta.duration : 1;
        if (playhead && dur > 0) {
          playhead.style.left = ((video.currentTime / dur) * 100) + '%';
        }
      }
    });
  }

  _renderTabs() {
    const active = this._state.activeSection;
    return `
      <div class="vt-tabs">
        <button class="vt-tab ${active === 'video' ? 'vt-tab--active' : ''}" data-tab="video">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><path d="M9 3v14"/><path d="M15 3v14"/><path d="M2 9h6"/><path d="M12 9h6"/><path d="M2 12h6"/><path d="M12 12h6"/><path d="M2 6h6"/><path d="M12 6h6"/></svg>
          Timeline Editor
        </button>
        <button class="vt-tab ${active === 'image' ? 'vt-tab--active' : ''}" data-tab="image">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><circle cx="7" cy="8" r="1.5"/><path d="M2 14l4-4 3 3 3-3 4 4"/></svg>
          Image to ICO
        </button>
      </div>`;
  }

  _getTemplate() {
    const st = this._state;
    const im = this._imageState;

    if (!st.inputPath && !im.inputPath) {
      const videoContent = renderDropZone();
      const imageContent = renderImageDropZone(im.inputPath, im.inputMeta);
      return `<div class="vt-body">${this._renderTabs()}${st.activeSection === 'image' ? imageContent : videoContent}</div>`;
    }

    const isVideoActive = st.activeSection === 'video';
    const isImageActive = st.activeSection === 'image';

    let videoContent = '';
    if (isVideoActive && st.inputPath) {
      const fileInfo = renderFileInfo(st.inputPath, st.inputMeta);
      const outputRow = renderOutputRow(st.outputFolder);
      const playerSlot = renderPlayerSlot();
      const timeline = st.segments.length > 0 ? renderTimeline(
        st.segments, st.inputMeta.duration, st.currentTime, st.selectedSegmentId, (i) => st.getSegmentColor(i)
      ) : '';
      const segActions = st.selectedSegment ? renderSegmentActions(st.selectedSegment, st.segments.indexOf(st.selectedSegment)) : '';
      const suggestions = st.status !== 'rendering' && st.status !== 'done' && st.suggestions && st.suggestions.length > 0
        ? renderSuggestions(st.suggestions) : '';
      const addClipBtn = st.status !== 'rendering' && st.status !== 'done'
        ? renderAddClipButton() : '';
      const presets = st.status !== 'rendering' && st.status !== 'done'
        ? renderPresets(st.selectedPreset) : '';
      const exportBtns = st.status !== 'rendering' && st.status !== 'done' && st.segments.length > 0
        ? renderExportButtons(st.exportMode) : '';
      const progressSection = st.status === 'rendering' ? renderProgress(st.progress) : '';
      const resultSection = st.status === 'done' && st.result ? renderResult(st.result) : '';
      const errorSection = st.status === 'error' ? renderError(st.error) : '';

      videoContent = `
        <div class="tl-file-info-wrapper">${fileInfo}</div>
        <div class="tl-output-area">
          ${outputRow}
          <div class="tl-player-area">${playerSlot}</div>
          ${timeline ? `<div class="tl-timeline-wrapper">${timeline}</div>` : ''}
          ${segActions ? `<div class="tl-seg-actions-wrapper">${segActions}</div>` : ''}
          ${suggestions}
          ${addClipBtn}
          ${presets}
          ${exportBtns}
          ${progressSection}
          ${resultSection}
          ${errorSection}
        </div>`;
    } else if (isVideoActive && !st.inputPath) {
      videoContent = renderDropZone();
    }

    let imageContent = '';
    if (isImageActive) {
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

    return `
      <div class="vt-body">
        ${this._renderTabs()}
        <div class="vt-section-contents">
          ${videoContent}
          ${imageContent}
        </div>
      </div>`;
  }

  _bindEvents() {
    if (!this._container) return;

    this._container.querySelectorAll('.vt-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (this._onTabChange) this._onTabChange(tab.dataset.tab);
      });
    });

    // ── Video / Timeline events ──
    const vDrop = this._container.querySelector('#vtDropZone');
    if (vDrop) {
      vDrop.addEventListener('dragover', (e) => { e.preventDefault(); vDrop.classList.add('tl-drag-over'); });
      vDrop.addEventListener('dragleave', () => vDrop.classList.remove('tl-drag-over'));
      vDrop.addEventListener('drop', (e) => {
        e.preventDefault(); vDrop.classList.remove('tl-drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.path && this._onPickFile) this._onPickFile(file.path);
      });
    }

    const vBtn = this._container.querySelector('#vtBrowseBtn');
    if (vBtn && this._onPickFile) vBtn.addEventListener('click', () => this._onPickFile(null));

    const vRem = this._container.querySelector('#vtRemoveFile');
    if (vRem && this._onRemoveFile) vRem.addEventListener('click', () => this._onRemoveFile());

    const coBtn = this._container.querySelector('#tlChangeOutputBtn');
    if (coBtn && this._onChangeOutput) coBtn.addEventListener('click', () => this._onChangeOutput());

    // Segment bars
    this._container.querySelectorAll('.tl-seg-bar').forEach(bar => {
      bar.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._onSelectSegment) this._onSelectSegment(bar.dataset.segId);
      });
    });

    // Timeline click
    const timeline = this._container.querySelector('#tlTimeline');
    if (timeline && this._onTimelineClick) {
      timeline.addEventListener('click', (e) => {
        const rect = timeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = x / rect.width;
        this._onTimelineClick(pct);
      });
    }

    // Speed select
    const speedSel = this._container.querySelector('.tl-speed-select');
    const segId = this._state.selectedSegmentId;
    if (speedSel && segId && this._onSpeedChange) {
      speedSel.addEventListener('change', () => this._onSpeedChange(segId, parseFloat(speedSel.value)));
    }

    // Split / Cut buttons
    const splitBtn = this._container.querySelector('#tlSplitBtn');
    if (splitBtn && this._onSplit) splitBtn.addEventListener('click', () => this._onSplit());

    const delBtn = this._container.querySelector('#tlDeleteBtn');
    if (delBtn && this._onDelete && segId) {
      delBtn.addEventListener('click', () => this._onDelete(segId));
    }

    // Suggestion pills
    this._container.querySelectorAll('.tl-suggestion-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this._onAddSuggestion) {
          const start = parseFloat(btn.dataset.start);
          const dur = parseFloat(btn.dataset.dur);
          this._onAddSuggestion(start, start + dur);
        }
      });
    });

    // Add clip
    const addBtn = this._container.querySelector('#tlAddClipBtn');
    if (addBtn && this._onAddClip) addBtn.addEventListener('click', () => this._onAddClip());

    // Preset cards
    this._container.querySelectorAll('.tl-preset-card').forEach(c => {
      c.addEventListener('click', () => { if (this._onPresetChange) this._onPresetChange(c.dataset.preset); });
    });

    // Export buttons
    const mp4Btn = this._container.querySelector('#tlExportMp4Btn');
    if (mp4Btn && this._onExportMp4) mp4Btn.addEventListener('click', () => this._onExportMp4());

    const gifBtn = this._container.querySelector('#tlExportGifBtn');
    if (gifBtn && this._onExportGif) gifBtn.addEventListener('click', () => this._onExportGif());

    // Retry
    const retryBtn = this._container.querySelector('#tlRetryBtn');
    if (retryBtn && this._onRetry) retryBtn.addEventListener('click', () => this._onRetry());

    // Open file / folder
    const ofBtn = this._container.querySelector('#tlOpenFileBtn');
    if (ofBtn && this._onOpenFile) ofBtn.addEventListener('click', () => this._onOpenFile());

    const ofdBtn = this._container.querySelector('#tlOpenFolderBtn');
    if (ofdBtn && this._onOpenFolder) ofdBtn.addEventListener('click', () => this._onOpenFolder());

    const newBtn = this._container.querySelector('#tlNewBtn');
    if (newBtn && this._onNew) newBtn.addEventListener('click', () => this._onNew());

    // ── Image events (unchanged) ──
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
  }
}
