import { renderFileDropZone, renderPresetCards, renderOutputRow, renderCompressButton, renderProgress, renderResult, renderError } from './videoRenderer.js';

export default class VideoUI {
  constructor(state) {
    this._state = state;
    this._container = null;
    this._bodyEl = null;
    this._onPickFile = null;
    this._onRemoveFile = null;
    this._onPresetChange = null;
    this._onChangeOutput = null;
    this._onCompress = null;
    this._onRetry = null;
    this._onOpenFile = null;
    this._onOpenFolder = null;
    this._onCompressAnother = null;
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
  }

  render(container) {
    this._container = container;
    container.innerHTML = this._getTemplate();
    this._bodyEl = container.querySelector('.vt-body');
    this._bindEvents();
  }

  _getTemplate() {
    const st = this._state;
    const fileSection = renderFileDropZone(st.inputPath, st.inputMeta);
    const presetSection = st.inputPath ? renderPresetCards(st.selectedPreset, st.inputMeta) : '';
    const outputSection = st.inputPath ? renderOutputRow(st.outputFolder) : '';
    const compressSection = st.inputPath ? renderCompressButton(st.status) : '';
    const progressSection = st.status === 'compressing' ? renderProgress(st.progress) : '';
    const resultSection = st.status === 'done' && st.result ? renderResult(st.result) : '';
    const errorSection = st.status === 'error' ? renderError(st.error) : '';

    return `
      <div class="vt-body">
        ${fileSection}
        ${presetSection ? `<div class="vt-section"><label class="vt-section-label">Preset</label><div class="vt-presets" id="vtPresets">${presetSection}</div></div>` : ''}
        ${outputSection ? `<div class="vt-section">${outputSection}</div>` : ''}
        ${compressSection ? `<div class="vt-section">${compressSection}</div>` : ''}
        ${progressSection ? `<div class="vt-section">${progressSection}</div>` : ''}
        ${resultSection ? `<div class="vt-section">${resultSection}</div>` : ''}
        ${errorSection ? `<div class="vt-section">${errorSection}</div>` : ''}
      </div>`;
  }

  _bindEvents() {
    if (!this._container) return;

    const dropZone = this._container.querySelector('#vtDropZone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('vt-drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('vt-drag-over'));
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('vt-drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.path && this._onPickFile) this._onPickFile(file.path);
      });
    }

    const browseBtn = this._container.querySelector('#vtBrowseBtn');
    if (browseBtn && this._onPickFile) {
      browseBtn.addEventListener('click', () => this._onPickFile(null));
    }

    const removeBtn = this._container.querySelector('#vtRemoveFile');
    if (removeBtn && this._onRemoveFile) {
      removeBtn.addEventListener('click', () => this._onRemoveFile());
    }

    this._container.querySelectorAll('.vt-preset-card').forEach(card => {
      card.addEventListener('click', () => {
        const preset = card.dataset.preset;
        if (this._onPresetChange) this._onPresetChange(preset);
      });
    });

    const changeOutputBtn = this._container.querySelector('#vtChangeOutputBtn');
    if (changeOutputBtn && this._onChangeOutput) {
      changeOutputBtn.addEventListener('click', () => this._onChangeOutput());
    }

    const compressBtn = this._container.querySelector('#vtCompressBtn');
    if (compressBtn && this._onCompress) {
      compressBtn.addEventListener('click', () => this._onCompress());
    }

    const retryBtn = this._container.querySelector('#vtRetryBtn');
    if (retryBtn && this._onRetry) {
      retryBtn.addEventListener('click', () => this._onRetry());
    }

    const openFileBtn = this._container.querySelector('#vtOpenFileBtn');
    if (openFileBtn && this._onOpenFile) {
      openFileBtn.addEventListener('click', () => this._onOpenFile());
    }

    const openFolderBtn = this._container.querySelector('#vtOpenFolderBtn');
    if (openFolderBtn && this._onOpenFolder) {
      openFolderBtn.addEventListener('click', () => this._onOpenFolder());
    }

    const compressAnotherBtn = this._container.querySelector('#vtCompressAnotherBtn');
    if (compressAnotherBtn && this._onCompressAnother) {
      compressAnotherBtn.addEventListener('click', () => this._onCompressAnother());
    }
  }

  update() {
    if (!this._container) return;
    const scrollTop = this._bodyEl ? this._bodyEl.scrollTop : 0;
    this._container.innerHTML = this._getTemplate();
    this._bodyEl = this._container.querySelector('.vt-body');
    if (this._bodyEl) this._bodyEl.scrollTop = scrollTop;
    this._bindEvents();
  }
}