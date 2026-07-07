export const U = {
  currentDSL: null,
  renderedOutput: '',
  selectedPreset: null,
  copied: false,
  error: null,
  rawInput: ''
};

export let panel, closeBtn, previewArea, renderBtn, copyBtn,
  presetsList, errorDisplay, vbCanvas, clearBtn, vbToolbar,
  exportBtn, importBtn;

export function assignRefs() {
  panel       = document.getElementById('ulhPanel');
  closeBtn    = document.getElementById('ulhCloseBtn');
  previewArea = document.getElementById('ulhPreview');
  renderBtn   = document.getElementById('ulhRenderBtn');
  copyBtn     = document.getElementById('ulhCopyBtn');
  presetsList = document.getElementById('ulhPresets');
  errorDisplay = document.getElementById('ulhError');
  vbCanvas    = document.getElementById('ulhVbCanvas');
  clearBtn    = document.getElementById('ulhClearBtn');
  vbToolbar   = document.getElementById('ulhVbToolbar');
  exportBtn   = document.getElementById('ulhExportBtn');
  importBtn   = document.getElementById('ulhImportBtn');
}
