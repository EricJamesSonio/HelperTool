export function _makeBtn(text, cls, title, onClick) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.title = title; b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
}

export function _showPwError(pwError, msg) {
    pwError.textContent = msg;
    pwError.style.display = 'block';
}

export function _hidePwError(pwError) {
    pwError.style.display = 'none';
}

export function _showResetErr(resetErr, m) {
    resetErr.textContent = m;
    resetErr.style.display = 'block';
}

export function _newNoteId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function _todayISO() {
    return new Date().toISOString().slice(0, 10);
}

export function _formatDisplayDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}, ${y}`;
}
