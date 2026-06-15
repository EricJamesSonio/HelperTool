import { renderFileDropZone, renderPresetCards, renderOutputRow, renderCompressButton, renderProgress, renderResult, renderError } from './videoRenderer.js';
import { renderImageDropZone, renderImageResult, renderImageProgress, renderImageError } from './imageRenderer.js';

export default class VideoUI {
  constructor(state, imageState) {
    this._state = state;
    this._imageState = imageState;
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
    this._onImagePickFile = null;
    this._onImageRemoveFile = null;
    this._onImageConvert = null;
    this._onImageRetry = null;
    this._onImageOpenFile = null;
    this._onImageOpenFolder = null;
    this._onImageConvertAnother = null;
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
    this._onImageConvert = cbs.onImageConvert || null;
    this._onImageRetry = cbs.onImageRetry || null;
    this._onImageOpenFile = cbs.onImageOpenFile || null;
    this._onImageOpenFolder = cbs.onImageOpenFolder || null;
    this._onImageConvertAnother = cbs.onImageConvertAnother || null;
  }

  render(container) {
    this._container = container;
    container.innerHTML = this._getTemplate();
    this._bodyEl = container.querySelector('.vt-body');
    this._bindEvents();
  }

  _getTemplate() {
    const st = this._state;
    const im = this._imageState;
    const fileSection = renderFileDropZone(st.inputPath, st.inputMeta);

    let videoSection = '';
    if (st.inputPath) {
      const presetSection = renderPresetCards(st.selectedPreset, st.inputMeta);
      const outputSection = renderOutputRow(st.outputFolder);
      const compressSection = renderCompressButton(st.status);
      const progressSection = st.status === 'compressing' ? renderProgress(st.progress) : '';
      const resultSection = st.status === 'done' && st.result ? renderResult(st.result) : '';
      const errorSection = st.status === 'error' ? renderError(st.error) : '';
      videoSection = `
        <div class="vt-section-label vt-sec-label">Video Compression</div>
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

    const imgDropSection = renderImageDropZone(im.inputPath, im.inputMeta);
    let imageSection = '';
    if (im.inputPath) {
      const convertSection = im.status !== 'done' ? `<button class="im-convert-btn" id="imConvertBtn">Convert to ICO</button>` : '';
      const progressSection = im.status === 'converting' ? renderImageProgress(im.progress) : '';
      const resultSection = im.status === 'done' && im.result ? renderImageResult(im.result) : '';
      const errorSection = im.status === 'error' ? renderImageError(im.error) : '';
      imageSection = `
        <div class="im-output-area">
          ${convertSection ? `<div class="vt-section">${convertSection}</div>` : ''}
          ${progressSection ? `<div class="vt-section">${progressSection}</div>` : ''}
          ${resultSection ? `<div class="vt-section">${resultSection}</div>` : ''}
          ${errorSection ? `<div class="vt-section">${errorSection}</div>` : ''}
        </div>`;
    }

    return `
      <div class="vt-body">
        ${fileSection}
        ${videoSection}
        <div class="vt-separator"></div>
        <div class="vt-section-label vt-sec-label">Image to ICO</div>
        ${imgDropSection}
        ${imageSection}
      </div>`;
  }

  _bindEvents() {
    if (!this._container) return;

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

  update() {
    if (!this._container) return;
    this._container.innerHTML = this._getTemplate();
    this._bindEvents();
  }
}