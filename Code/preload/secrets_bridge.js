const { ipcRenderer } = require('electron');

module.exports = {
    secretsHasPassword:    ()            => ipcRenderer.invoke('secrets-has-password'),
    secretsSetPassword:    (pw)          => ipcRenderer.invoke('secrets-set-password', pw),
    secretsVerifyPassword: (pw)          => ipcRenderer.invoke('secrets-verify-password', pw),
    secretsResetPassword:  (old, nw)     => ipcRenderer.invoke('secrets-reset-password', old, nw),
    secretsGetAll:         ()            => ipcRenderer.invoke('secrets-get-all'),
    secretsAdd:            (n, v)        => ipcRenderer.invoke('secrets-add', n, v),
    secretsUpdate:         (id, n, v)    => ipcRenderer.invoke('secrets-update', id, n, v),
    secretsDelete:         (id)          => ipcRenderer.invoke('secrets-delete', id),
};