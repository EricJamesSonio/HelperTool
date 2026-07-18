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

    async function readSecretsFile() {
        const p = getSecretsPath();
        if (!fs.existsSync(p)) return { passwordHash: null, secrets: [] };
        try { return JSON.parse(await fs.promises.readFile(p, 'utf-8')); } catch { return { passwordHash: null, secrets: [] }; }
    }

    async function writeSecretsFile(data) {
        await fs.promises.writeFile(getSecretsPath(), JSON.stringify(data, null, 2), 'utf-8');
    }

    function hashPassword(pw) {
        return crypto.createHash('sha256').update(pw).digest('hex');
    }

    ipcMain.handle('secrets-has-password', async () => !!(await readSecretsFile()).passwordHash);

    ipcMain.handle('secrets-set-password', async (event, pw) => {
        const data = await readSecretsFile();
        if (data.passwordHash) return false;
        data.passwordHash = hashPassword(pw);
        await writeSecretsFile(data);
        return true;
    });

    ipcMain.handle('secrets-verify-password', async (event, pw) => {
        const data = await readSecretsFile();
        if (!data.passwordHash) return false;
        return data.passwordHash === hashPassword(pw);
    });

    ipcMain.handle('secrets-reset-password', async (event, oldPw, newPw) => {
        const data = await readSecretsFile();
        if (data.passwordHash !== hashPassword(oldPw)) return false;
        data.passwordHash = hashPassword(newPw);
        await writeSecretsFile(data);
        return true;
    });

    ipcMain.handle('secrets-get-all', async () => (await readSecretsFile()).secrets || []);

    ipcMain.handle('secrets-add', async (event, name, value) => {
        const data = await readSecretsFile();
        data.secrets = data.secrets || [];
        data.secrets.push({ id: Date.now().toString(), name: name.trim(), value: value.trim() });
        data.secrets.sort((a, b) => a.name.localeCompare(b.name));
        await writeSecretsFile(data);
        return true;
    });

    ipcMain.handle('secrets-update', async (event, id, name, value) => {
        const data = await readSecretsFile();
        const idx = data.secrets.findIndex(s => s.id === id);
        if (idx === -1) return false;
        data.secrets[idx] = { id, name: name.trim(), value: value.trim() };
        data.secrets.sort((a, b) => a.name.localeCompare(b.name));
        await writeSecretsFile(data);
        return true;
    });

    ipcMain.handle('secrets-delete', async (event, id) => {
        const data = await readSecretsFile();
        data.secrets = (data.secrets || []).filter(s => s.id !== id);
        await writeSecretsFile(data);
        return true;
    });
}

module.exports = { register };