import { renderFileDropZone, renderPresetCards, renderOutputRow, renderCompressButton, renderProgress, renderResult, renderError } from './videoRenderer.js';
import { renderImageDropZone, renderImageOutputRow, renderImageResult, renderImageProgress, renderImageError } from './imageRenderer.js';
import { renderGifDropZone, renderGifFileInfo, renderGifOutputRow, renderGifPlayerSlot, renderGifTimeline, renderGifSegmentActions, renderGifSuggestions, renderGifAddClipButton, renderGifPresets, renderGifGenerateButton, renderGifProgress, renderGifResult, renderGifError } from './gifRenderer.js';

export default class VideoUI {
  constructor(state, imageState, gifState) {
    this._state = state;
    this._imageState = imageState;
    this._gifState = gifState;
    this._container = null;
    this._videoEl = null;
    this._onPickFile = null;
    this._onRemoveFile = null;
    this._onPresetChange = null;
    this._onChangeOutput = null;
    this._onCompress = null;
    this._onRetry = null;
    this._onOpenFile = null;
    this._onOpenFolder = null;
    this._onCompressAnother = null;
    this._onImagePickFile = null;
    this._onImageRemoveFile = null;
    this._onImageChangeOutput = null;
    this._onImageConvert = null;
    this._onImageRetry = null;
    this._onImageOpenFile = null;
    this._onImageOpenFolder = null;
    this._onImageConvertAnother = null;
    this._onGifPickFile = null;
    this._onGifRemoveFile = null;
    this._onGifChangeOutput = null;
    this._onGifAddSegment = null;
    this._onGifRemoveSegment = null;
    this._onGifUpdateSegment = null;
    this._onGifAddSuggestion = null;
    this._onGifSelectSegment = null;
    this._onGifSplit = null;
    this._onGifTimelineClick = null;
    this._onGifPresetChange = null;
    this._onGifGenerate = null;
    this._onGifRetry = null;
    this._onGifOpenFile = null;
    this._onGifOpenFolder = null;
    this._onGifNew = null;
    this._onTabChange = null;
  }

  setCallbacks(cbs) {
    this._onPickFile = cbs.onPickFile || null;
    this._onRemoveFile = cbs.onRemoveFile || null;
    this._onPresetChange = cbs.onPresetChange || null;
    this._onChangeOutput = cbs.onChangeOutput || null;
    this._onCompress = cbs.onCompress || null;
    this._onRetry = cbs.onRetry || null;
    this._onOpenFile = cbs.onOpenFile || null;
    this._onOpenFolder = cbs.onOpenFolder || null;
    this._onCompressAnother = cbs.onCompressAnother || null;
    this._onImagePickFile = cbs.onImagePickFile || null;
    this._onImageRemoveFile = cbs.onImageRemoveFile || null;
    this._onImageChangeOutput = cbs.onImageChangeOutput || null;
    this._onImageConvert = cbs.onImageConvert || null;
    this._onImageRetry = cbs.onImageRetry || null;
    this._onImageOpenFile = cbs.onImageOpenFile || null;
    this._onImageOpenFolder = cbs.onImageOpenFolder || null;
    this._onImageConvertAnother = cbs.onImageConvertAnother || null;
    this._onGifPickFile = cbs.onGifPickFile || null;
    this._onGifRemoveFile = cbs.onGifRemoveFile || null;
    this._onGifChangeOutput = cbs.onGifChangeOutput || null;
    this._onGifAddSegment = cbs.onGifAddSegment || null;
    this._onGifRemoveSegment = cbs.onGifRemoveSegment || null;
    this._onGifUpdateSegment = cbs.onGifUpdateSegment || null;
    this._onGifAddSuggestion = cbs.onGifAddSuggestion || null;
    this._onGifSelectSegment = cbs.onGifSelectSegment || null;
    this._onGifSplit = cbs.onGifSplit || null;
    this._onGifTimelineClick = cbs.onGifTimelineClick || null;
    this._onGifPresetChange = cbs.onGifPresetChange || null;
    this._onGifGenerate = cbs.onGifGenerate || null;
    this._onGifRetry = cbs.onGifRetry || null;
    this._onGifOpenFile = cbs.onGifOpenFile || null;
    this._onGifOpenFolder = cbs.onGifOpenFolder || null;
    this._onGifNew = cbs.onGifNew || null;
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
    const slot = this._container.querySelector('#gfPlayerSlot');
    if (!slot) return;
    this._createVideoElement(slot);
  }

  _restoreVideoPlayer(oldVideo) {
    const slot = this._container.querySelector('#gfPlayerSlot');
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
    video.id = 'gfVideo';
    video.className = 'gf-video';
    video.controls = true;
    video.preload = 'auto';
    const gs = this._gifState;
    if (gs.inputPath) {
      video.src = 'file://' + gs.inputPath.replace(/\\/g, '/');
    }
    slot.appendChild(video);
    this._videoEl = video;
    if (this._onGifVideoReady) this._onGifVideoReady(video);

    video.addEventListener('timeupdate', () => {
      this._gifState.currentTime = video.currentTime;
      const timeline = this._container.querySelector('#gfTimeline');
      if (timeline) {
        const playhead = timeline.querySelector('.gf-playhead');
        const dur = this._gifState.inputMeta ? this._gifState.inputMeta.duration : 1;
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
          Video Compression
        </button>
        <button class="vt-tab ${active === 'image' ? 'vt-tab--active' : ''}" data-tab="image">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><circle cx="7" cy="8" r="1.5"/><path d="M2 14l4-4 3 3 3-3 4 4"/></svg>
          Image to ICO
        </button>
        <button class="vt-tab ${active === 'gif' ? 'vt-tab--active' : ''}" data-tab="gif">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="14" rx="1.5"/><text x="5" y="14" font-size="8" font-weight="bold" stroke="none" fill="currentColor">GIF</text></svg>
          Video to GIF
        </button>
      </div>`;
  }

  _getTemplate() {
    const st = this._state;
    const im = this._imageState;
    const gf = this._gifState;

    if (!st.inputPath && !im.inputPath && !gf.inputPath) {
      const videoContent = renderFileDropZone(null, null);
      const imageContent = renderImageDropZone(im.inputPath, im.inputMeta);
      const gifContent = renderGifDropZone();
      let activeContent;
      if (st.activeSection === 'image') activeContent = imageContent;
      else if (st.activeSection === 'gif') activeContent = gifContent;
      else activeContent = videoContent;
      return `<div class="vt-body">${this._renderTabs()}${activeContent}</div>`;
    }

    const isVideoActive = st.activeSection === 'video';
    const isImageActive = st.activeSection === 'image';
    const isGifActive = st.activeSection === 'gif';

    let videoContent = '';
    if (isVideoActive) {
      const fileSection = renderFileDropZone(st.inputPath, st.inputMeta);
      let inner = '';
      if (st.inputPath) {
        const presetSection = renderPresetCards(st.selectedPreset, st.inputMeta);
        const outputSection = renderOutputRow(st.outputFolder);
        const compressSection = renderCompressButton(st.status);
        const progressSection = st.status === 'compressing' ? renderProgress(st.progress) : '';
        const resultSection = st.status === 'done' && st.result ? renderResult(st.result) : '';
        const errorSection = st.status === 'error' ? renderError(st.error) : '';
        inner = `
          <div class="vt-layout">
            <div class="vt-sidebar">
              <div class="vt-section-label">Preset</div>
              <div class="vt-presets" id="vtPresets">${presetSection}</div>
            </div>
            <div class="vt-main">
              ${outputSection ? `<div class="vt-section">${outputSection}</div>` : ''}
              ${compressSection ? `<div class="vt-section">${compressSection}</div>` : ''}
              ${progressSection ? `<div class="vt-section">${progressSection}</div>` : ''}
              ${resultSection ? `<div class="vt-section">${resultSection}</div>` : ''}
              ${errorSection ? `<div class="vt-section">${errorSection}</div>` : ''}
            </div>
          </div>`;
      }
      videoContent = fileSection + inner;
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

    let gifContent = '';
    if (isGifActive) {
      if (!gf.inputPath) {
        gifContent = renderGifDropZone();
      } else {
        const fileInfo = renderGifFileInfo(gf.inputPath, gf.inputMeta);
        const outputRow = renderGifOutputRow(gf.outputFolder);
        const playerSlot = renderGifPlayerSlot();
        const timeline = gf.segments.length > 0 ? renderGifTimeline(
          gf.segments, gf.inputMeta.duration, gf.currentTime, gf.selectedSegmentId, (i) => gf.getSegmentColor(i)
        ) : '';
        const segActions = gf.selectedSegment ? renderGifSegmentActions(gf.selectedSegment, gf.segments.indexOf(gf.selectedSegment)) : '';
        const suggestions = gf.status !== 'generating' && gf.status !== 'done' && gf.suggestions.length > 0
          ? renderGifSuggestions(gf.suggestions) : '';
        const addClipBtn = gf.status !== 'generating' && gf.status !== 'done'
          ? renderGifAddClipButton() : '';
        const presets = gf.status !== 'generating' && gf.status !== 'done'
          ? renderGifPresets(gf.preset) : '';
        const generateBtn = gf.status !== 'generating' && gf.status !== 'done' && gf.segments.length > 0
          ? renderGifGenerateButton() : '';
        const progressSection = gf.status === 'generating' ? renderGifProgress(gf.progress) : '';
        const resultSection = gf.status === 'done' && gf.result ? renderGifResult(gf.result) : '';
        const errorSection = gf.status === 'error' ? renderGifError(gf.error) : '';

        gifContent = `
          <div class="gf-file-info-wrapper">${fileInfo}</div>
          <div class="gf-output-area">
            ${outputRow}
            <div class="gf-player-area">${playerSlot}</div>
            ${timeline ? `<div class="gf-timeline-wrapper">${timeline}</div>` : ''}
            ${segActions ? `<div class="gf-seg-actions-wrapper">${segActions}</div>` : ''}
            ${suggestions}
            ${addClipBtn}
            ${presets}
            ${generateBtn}
            ${progressSection}
            ${resultSection}
            ${errorSection}
          </div>`;
      }
    }

    return `
      <div class="vt-body">
        ${this._renderTabs()}
        ${videoContent}
        ${imageContent}
        ${gifContent}
      </div>`;
  }

  _bindEvents() {
    if (!this._container) return;

    this._container.querySelectorAll('.vt-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (this._onTabChange) this._onTabChange(tab.dataset.tab);
      });
    });

    // ── Video events ──
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

    this._container.querySelectorAll('.vt-preset-card').forEach(c => {
      c.addEventListener('click', () => { if (this._onPresetChange) this._onPresetChange(c.dataset.preset); });
    });

    const coBtn = this._container.querySelector('#vtChangeOutputBtn');
    if (coBtn && this._onChangeOutput) coBtn.addEventListener('click', () => this._onChangeOutput());

    const cBtn = this._container.querySelector('#vtCompressBtn');
    if (cBtn && this._onCompress) cBtn.addEventListener('click', () => this._onCompress());

    const rBtn = this._container.querySelector('#vtRetryBtn');
    if (rBtn && this._onRetry) rBtn.addEventListener('click', () => this._onRetry());

    const oFBtn = this._container.querySelector('#vtOpenFileBtn');
    if (oFBtn && this._onOpenFile) oFBtn.addEventListener('click', () => this._onOpenFile());

    const oFdBtn = this._container.querySelector('#vtOpenFolderBtn');
    if (oFdBtn && this._onOpenFolder) oFdBtn.addEventListener('click', () => this._onOpenFolder());

    const caBtn = this._container.querySelector('#vtCompressAnotherBtn');
    if (caBtn && this._onCompressAnother) caBtn.addEventListener('click', () => this._onCompressAnother());

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

    // ── GIF events ──
    const gfDrop = this._container.querySelector('#gfDropZone');
    if (gfDrop) {
      gfDrop.addEventListener('dragover', (e) => { e.preventDefault(); gfDrop.classList.add('gf-drag-over'); });
      gfDrop.addEventListener('dragleave', () => gfDrop.classList.remove('gf-drag-over'));
      gfDrop.addEventListener('drop', (e) => {
        e.preventDefault(); gfDrop.classList.remove('gf-drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.path && this._onGifPickFile) this._onGifPickFile(file.path);
      });
    }

    const gfBtn = this._container.querySelector('#gfBrowseBtn');
    if (gfBtn && this._onGifPickFile) gfBtn.addEventListener('click', () => this._onGifPickFile(null));

    const gfRem = this._container.querySelector('#gfRemoveFile');
    if (gfRem && this._onGifRemoveFile) gfRem.addEventListener('click', () => this._onGifRemoveFile());

    const gfCoBtn = this._container.querySelector('#gfChangeOutputBtn');
    if (gfCoBtn && this._onGifChangeOutput) gfCoBtn.addEventListener('click', () => this._onGifChangeOutput());

    // Segment bars on timeline
    this._container.querySelectorAll('.gf-seg-bar').forEach(bar => {
      bar.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._onGifSelectSegment) this._onGifSelectSegment(bar.dataset.segId);
      });
    });

    // Timeline click (seek)
    const timeline = this._container.querySelector('#gfTimeline');
    if (timeline && this._onGifTimelineClick) {
      timeline.addEventListener('click', (e) => {
        const rect = timeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = x / rect.width;
        if (this._onGifTimelineClick) this._onGifTimelineClick(pct);
      });
    }

    // Split / Delete buttons
    const splitBtn = this._container.querySelector('#gfSplitBtn');
    if (splitBtn && this._onGifSplit) splitBtn.addEventListener('click', () => this._onGifSplit());

    const delBtn = this._container.querySelector('#gfDeleteBtn');
    if (delBtn && this._onGifRemoveSegment) {
      const segId = this._gifState.selectedSegmentId;
      if (segId) delBtn.addEventListener('click', () => this._onGifRemoveSegment(segId));
    }

    // Suggestion pills
    this._container.querySelectorAll('.gf-suggestion-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this._onGifAddSuggestion) {
          const start = parseFloat(btn.dataset.start);
          const dur = parseFloat(btn.dataset.dur);
          this._onGifAddSuggestion(start, start + dur);
        }
      });
    });

    // Add clip button
    const addClipBtn = this._container.querySelector('#gfAddClipBtn');
    if (addClipBtn && this._onGifAddSegment) addClipBtn.addEventListener('click', () => this._onGifAddSegment());

    // Preset cards
    this._container.querySelectorAll('.gf-preset-card').forEach(c => {
      c.addEventListener('click', () => { if (this._onGifPresetChange) this._onGifPresetChange(c.dataset.preset); });
    });

    const gfGen = this._container.querySelector('#gfGenerateBtn');
    if (gfGen && this._onGifGenerate) gfGen.addEventListener('click', () => this._onGifGenerate());

    const gfRetry = this._container.querySelector('#gfRetryBtn');
    if (gfRetry && this._onGifRetry) gfRetry.addEventListener('click', () => this._onGifRetry());

    const gfOF = this._container.querySelector('#gfOpenFileBtn');
    if (gfOF && this._onGifOpenFile) gfOF.addEventListener('click', () => this._onGifOpenFile());

    const gfOFd = this._container.querySelector('#gfOpenFolderBtn');
    if (gfOFd && this._onGifOpenFolder) gfOFd.addEventListener('click', () => this._onGifOpenFolder());

    const gfNew = this._container.querySelector('#gfNewGifBtn');
    if (gfNew && this._onGifNew) gfNew.addEventListener('click', () => this._onGifNew());
  }
}
