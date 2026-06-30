export const U = {
  currentDSL: null,
  renderedOutput: '',
  selectedPreset: null,
  copied: false,
  error: null,
  rawInput: ''
};

export let panel, closeBtn, inputArea, previewArea, renderBtn, copyBtn,
  presetsList, errorDisplay, charCount;

export function assignRefs() {
  panel       = document.getElementById('ulhPanel');
  closeBtn    = document.getElementById('ulhCloseBtn');
  inputArea   = document.getElementById('ulhInput');
  previewArea = document.getElementById('ulhPreview');
  renderBtn   = document.getElementById('ulhRenderBtn');
  copyBtn     = document.getElementById('ulhCopyBtn');
  presetsList = document.getElementById('ulhPresets');
  errorDisplay = document.getElementById('ulhError');
  charCount   = document.getElementById('ulhCharCount');
}
