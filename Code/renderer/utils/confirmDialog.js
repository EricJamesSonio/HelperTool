let _overlayId = 0;

export function alertDialog(message) {
  const id = ++_overlayId;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'alertOverlay-' + id;
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 100000;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.55);
      animation: cfFadeIn 0.12s ease;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      background: var(--bg-surface, #0c1427);
      border: 1px solid var(--border-default, rgba(255,255,255,0.10));
      border-radius: 10px;
      padding: 24px 28px;
      min-width: 320px;
      max-width: 460px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.5);
      font-family: var(--font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    `;

    box.innerHTML = `
      <div style="font-size:14px;font-weight:600;color:var(--text-primary,#eef2ff);margin-bottom:16px;line-height:1.5">
        ${message}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="alertOkBtn-${id}" style="
          height:32px;padding:0 14px;border-radius:6px;
          background:var(--accent,#22d3ee);border:none;
          color:#000;font-size:13px;font-weight:600;
          cursor:pointer;font-family:inherit;
        ">OK</button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function close() {
      const el = document.getElementById('alertOverlay-' + id);
      if (el) el.remove();
      resolve();
    }

    document.getElementById('alertOkBtn-' + id).addEventListener('click', () => close());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape' || e.key === 'Enter') { close(); document.removeEventListener('keydown', handler); }
    });
  });
}

export function confirmDialog(message) {
  const id = ++_overlayId;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'confirmOverlay-' + id;
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 100000;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.55);
      animation: cfFadeIn 0.12s ease;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      background: var(--bg-surface, #0c1427);
      border: 1px solid var(--border-default, rgba(255,255,255,0.10));
      border-radius: 10px;
      padding: 24px 28px;
      min-width: 320px;
      max-width: 460px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.5);
      font-family: var(--font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
    `;

    box.innerHTML = `
      <div style="font-size:14px;font-weight:600;color:var(--text-primary,#eef2ff);margin-bottom:16px;line-height:1.5">
        ${message}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="cfCancelBtn-${id}" style="
          height:32px;padding:0 14px;border-radius:6px;
          background:var(--bg-raised,#1a2540);border:1px solid var(--border-default,rgba(255,255,255,0.10));
          color:var(--text-secondary,#94a3c4);font-size:13px;font-weight:500;
          cursor:pointer;font-family:inherit;
        ">Cancel</button>
        <button id="cfConfirmBtn-${id}" style="
          height:32px;padding:0 14px;border-radius:6px;
          background:var(--red,#f87171);border:none;
          color:#fff;font-size:13px;font-weight:600;
          cursor:pointer;font-family:inherit;
        ">Confirm</button>
      </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    function close(result) {
      const el = document.getElementById('confirmOverlay-' + id);
      if (el) el.remove();
      resolve(result);
    }

    document.getElementById('cfCancelBtn-' + id).addEventListener('click', () => close(false));
    document.getElementById('cfConfirmBtn-' + id).addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });

    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', handler); }
      if (e.key === 'Enter')  { close(true);  document.removeEventListener('keydown', handler); }
    });
  });
}

const style = document.createElement('style');
style.textContent = `@keyframes cfFadeIn { from { opacity:0 } to { opacity:1 } }`;
document.head.appendChild(style);
