const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * @param {{ app }} deps
 */
function register({ app }) {

    function getSecretsPath() {
        return path.join(app.getPath('userData'), 'secrets.json');
    }

    function readSecretsFile() {
        const p = getSecretsPath();
        if (!fs.existsSync(p)) return { passwordHash: null, secrets: [] };
        try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return { passwordHash: null, secrets: [] }; }
    }

    function writeSecretsFile(data) {
        fs.writeFileSync(getSecretsPath(), JSON.stringify(data, null, 2), 'utf-8');
    }

    function hashPassword(pw) {
        return crypto.createHash('sha256').update(pw).digest('hex');
    }

    ipcMain.handle('secrets-has-password', () => !!readSecretsFile().passwordHash);

    ipcMain.handle('secrets-set-password', (event, pw) => {
        const data = readSecretsFile();
        if (data.passwordHash) return false;
        data.passwordHash = hashPassword(pw);
        writeSecretsFile(data);
        return true;
    });

    ipcMain.handle('secrets-verify-password', (event, pw) => {
        const data = readSecretsFile();
        if (!data.passwordHash) return false;
        return data.passwordHash === hashPassword(pw);
    });

    ipcMain.handle('secrets-reset-password', (event, oldPw, newPw) => {
        const data = readSecretsFile();
        if (data.passwordHash !== hashPassword(oldPw)) return false;
        data.passwordHash = hashPassword(newPw);
        writeSecretsFile(data);
        return true;
    });

    ipcMain.handle('secrets-get-all', () => readSecretsFile().secrets || []);

    ipcMain.handle('secrets-add', (event, name, value) => {
        const data = readSecretsFile();
        data.secrets = data.secrets || [];
        data.secrets.push({ id: Date.now().toString(), name: name.trim(), value: value.trim() });
        data.secrets.sort((a, b) => a.name.localeCompare(b.name));
        writeSecretsFile(data);
        return true;
    });

    ipcMain.handle('secrets-update', (event, id, name, value) => {
        const data = readSecretsFile();
        const idx = data.secrets.findIndex(s => s.id === id);
        if (idx === -1) return false;
        data.secrets[idx] = { id, name: name.trim(), value: value.trim() };
        data.secrets.sort((a, b) => a.name.localeCompare(b.name));
        writeSecretsFile(data);
        return true;
    });

    ipcMain.handle('secrets-delete', (event, id) => {
        const data = readSecretsFile();
        data.secrets = (data.secrets || []).filter(s => s.id !== id);
        writeSecretsFile(data);
        return true;
    });
}

module.exports = { register };