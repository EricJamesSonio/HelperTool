import { state } from '../../app_manager/appState.js';
import { buildStructure } from './structureBuilder.js';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch (_e) {
      return false;
    }
  }
}

export async function runFunction(fn) {
  const repo = state.selectedRepoPath;
  if (!repo) return { ok: false, msg: 'No folder opened. Select a repo first.' };
  if (fn.type === 'structure') {
    const res = await buildStructure(repo, fn.folders, fn.files);
    if (res.missing.length && res.count === 0) {
      return { ok: false, msg: 'Folder not found: ' + res.missing.join(', ') };
    }
    const copied = await copyText(res.text);
    if (!copied) return { ok: false, msg: 'Could not copy to the clipboard.' };
    let msg = 'Copied ' + res.count + ' entries.';
    if (res.missing.length) msg += ' Not found: ' + res.missing.join(', ') + '.';
    if (res.cut) msg += ' Output was cut at the size limit.';
    return { ok: true, msg, warn: !!(res.missing.length || res.cut) };
  }
  return { ok: false, msg: 'Unknown function type.' };
}