let _textarea = null;

export function initPromptEditor() {
  _textarea = document.getElementById('rsTextarea');
  const copyBtn = document.getElementById('rsCopyBtn');
  const clearBtn = document.getElementById('rsClearBtn');
  const insertTicketBtn = document.getElementById('rsInsertTicketBtn');
  const applyPromptBtn = document.getElementById('rsApplyPromptBtn');

  if (copyBtn) copyBtn.addEventListener('click', copyText);
  if (clearBtn) clearBtn.addEventListener('click', clearText);
  if (insertTicketBtn) insertTicketBtn.addEventListener('click', insertTicket);
  if (applyPromptBtn) applyPromptBtn.addEventListener('click', applyPrompt);
}

function copyText() {
  if (!_textarea) return;
  navigator.clipboard.writeText(_textarea.value).catch(console.error);
}

function clearText() {
  if (!_textarea) return;
  _textarea.value = '';
}

async function insertTicket() {
  const { openTicketPanel } = await import('../../../codeswampUI/ticketPanel.js');
  window.electronAPI.researcher.hideBrowserView();
  openTicketPanel('rsTextarea');
  _watchModalClose('ocTicketPanelModal');
}

async function applyPrompt() {
  const { openPromptPicker } = await import('../../../codeswampUI/promptPicker.js');
  window.electronAPI.researcher.hideBrowserView();
  openPromptPicker('rsTextarea');
  _watchModalClose('ocPromptPickerModal');
}

function _watchModalClose(modalId) {
  const check = setInterval(() => {
    if (!document.getElementById(modalId)) {
      clearInterval(check);
      window.electronAPI.researcher.showBrowserView();
    }
  }, 200);
}

export function getTextarea() { return _textarea; }