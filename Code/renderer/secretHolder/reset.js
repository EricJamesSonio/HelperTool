import { resetOld, resetNew, resetErr, resetSuccess } from './state.js';
import { _showResetErr } from './utils.js';

export async function handleResetPassword() {
    resetErr.style.display     = 'none';
    resetSuccess.style.display = 'none';
    const old = resetOld.value.trim();
    const nw  = resetNew.value.trim();
    if (!old || !nw) { _showResetErr(resetErr, 'Fill in both fields.'); return; }
    const ok = await window.electronAPI.secretsResetPassword(old, nw);
    if (ok) {
        resetOld.value = ''; resetNew.value = '';
        resetSuccess.style.display = 'block';
        setTimeout(() => { resetSuccess.style.display = 'none'; }, 3500);
    } else {
        _showResetErr(resetErr, 'Current password is incorrect.');
    }
}
