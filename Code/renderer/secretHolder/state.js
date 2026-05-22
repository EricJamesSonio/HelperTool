export const S = {
    unlocked: false,
    secrets: [],
    notes: [],
    editingId: null,
    editingNoteId: null,
    initialized: false,
    activeTab: 'secrets',
};

export let panel, lockScreen, mainScreen,
    pwInput, pwSubmitBtn, pwError, pwLabel, pwSubtitle,
    secretsList, addName, addValue, addBtn,
    editModal, editName, editValue, editSaveBtn, editCancelBtn,
    lockBtn, closeBtn, closeLockBtn,
    resetSection, resetOld, resetNew, resetBtn, resetErr, resetSuccess,
    togglePwBtn,
    tabSecrets, tabNotes, panelSecrets, panelNotes,
    notesList, noteFormTitle, noteFormBody, noteFormDate,
    noteSaveBtn, noteCancelBtn, noteDeleteBtn, noteNewBtn,
    notesEditorEmpty, notesEditorForm;

export function assignRefs() {
    panel          = document.getElementById('secretHolderPanel');
    lockScreen     = document.getElementById('shLockScreen');
    mainScreen     = document.getElementById('shMainScreen');
    pwInput        = document.getElementById('shPwInput');
    pwSubmitBtn    = document.getElementById('shPwSubmit');
    pwError        = document.getElementById('shPwError');
    pwLabel        = document.getElementById('shPwLabel');
    pwSubtitle     = document.getElementById('shPwSubtitle');
    secretsList    = document.getElementById('shSecretsList');
    addName        = document.getElementById('shAddName');
    addValue       = document.getElementById('shAddValue');
    addBtn         = document.getElementById('shAddBtn');
    editModal      = document.getElementById('shEditModal');
    editName       = document.getElementById('shEditName');
    editValue      = document.getElementById('shEditValue');
    editSaveBtn    = document.getElementById('shEditSave');
    editCancelBtn  = document.getElementById('shEditCancel');
    lockBtn        = document.getElementById('shLockBtn');
    closeBtn       = document.getElementById('shCloseBtn');
    closeLockBtn   = document.getElementById('shCloseLock');
    resetSection   = document.getElementById('shResetSection');
    resetOld       = document.getElementById('shResetOld');
    resetNew       = document.getElementById('shResetNew');
    resetBtn       = document.getElementById('shResetBtn');
    resetErr       = document.getElementById('shResetErr');
    resetSuccess   = document.getElementById('shResetSuccess');
    togglePwBtn    = document.getElementById('shTogglePw');
    tabSecrets     = document.getElementById('shTabSecrets');
    tabNotes       = document.getElementById('shTabNotes');
    panelSecrets   = document.getElementById('shPanelSecrets');
    panelNotes     = document.getElementById('shPanelNotes');
    notesList          = document.getElementById('shNotesList');
    noteFormTitle      = document.getElementById('shNoteFormTitle');
    noteFormBody       = document.getElementById('shNoteFormBody');
    noteFormDate       = document.getElementById('shNoteFormDate');
    noteSaveBtn        = document.getElementById('shNoteSaveBtn');
    noteCancelBtn      = document.getElementById('shNoteCancelBtn');
    noteDeleteBtn      = document.getElementById('shNoteDeleteBtn');
    noteNewBtn         = document.getElementById('shNoteNewBtn');
    notesEditorEmpty   = document.getElementById('shNotesEditorEmpty');
    notesEditorForm    = document.getElementById('shNotesEditorForm');
}
