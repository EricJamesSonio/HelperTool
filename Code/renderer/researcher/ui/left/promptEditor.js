let _textarea = null;

export function initPromptEditor() {
  _textarea = document.getElementById('rsTextarea');
  const copyBtn = document.getElementById('rsCopyBtn');
  const clearBtn = document.getElementById('rsClearBtn');
  const insertTicketBtn = document.getElementById('rsInsertTicketBtn');
  const applyPromptBtn = document.getElementById('rsApplyPromptBtn');
  const planningBtn = document.getElementById('rsPlanningBtn');
  const stonesBtn = document.getElementById('rsStonesBtn');
  const kitBtn = document.getElementById('rsKitBtn');

  if (copyBtn) copyBtn.addEventListener('click', copyText);
  if (clearBtn) clearBtn.addEventListener('click', clearText);
  if (insertTicketBtn) insertTicketBtn.addEventListener('click', insertTicket);
  if (applyPromptBtn) applyPromptBtn.addEventListener('click', applyPrompt);
  if (planningBtn) planningBtn.addEventListener('click', openPlanning);
  if (stonesBtn) stonesBtn.addEventListener('click', openStones);
  if (kitBtn) kitBtn.addEventListener('click', openKit);
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

async function openPlanning() {
  const { openPlanningPanel } = await import('../../../codeswampUI/planningPanel.js');
  window.electronAPI.researcher.hideBrowserView();
  openPlanningPanel('rsTextarea');
  _watchModalClose('ocPlanningPanelModal');
}

async function openStones() {
  const { openStonePanel } = await import('../../../codeswampUI/stonePanel.js');
  window.electronAPI.researcher.hideBrowserView();
  openStonePanel('rsTextarea');
  _watchModalClose('ocStonePanelModal');
}

async function openKit() {
  const { openBuildKitPanel } = await import('../../../codeswampUI/buildKitPanel.js');
  window.electronAPI.researcher.hideBrowserView();
  openBuildKitPanel('rsTextarea');
  _watchModalClose('ocBuildKitPanelModal');
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