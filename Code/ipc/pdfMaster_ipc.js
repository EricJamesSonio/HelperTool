'use strict';

const { ipcMain, dialog } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config/config.js');
const sidecar = require('../services/pdfMaster/sidecar.js');

const MAX_PDF_BYTES = 500 * 1024 * 1024;
const MAX_REPORT_BYTES = 50 * 1024 * 1024;
const MAX_WRITE_PAYLOAD_BYTES = 20 * 1024 * 1024;
const INSPECT_TIMEOUT_MS = 10 * 60 * 1000;
const RENDER_TIMEOUT_MS = 60 * 1000;
const CONVERT_TIMEOUT_MS = 30 * 60 * 1000;
const ANALYZE_TIMEOUT_MS = 15 * 60 * 1000;
const WRITE_TIMEOUT_MS = 30 * 60 * 1000;
const FORMATS = new Set(['png', 'jpeg']);

let _getMainWindow = () => null;
let _registered = false;

function featureOn() {
  try {
    const feats = config.readConfig() && config.readConfig().features;
    return !feats || feats.pdfMaster !== false;
  } catch (_) {
    return true;
  }
}

function checkPdf(p) {
  if (typeof p !== 'string' || !p || p.length > 4096 || p.indexOf('\0') !== -1) {
    return { ok: false, error: 'Invalid file path.' };
  }
  if (!path.isAbsolute(p)) return { ok: false, error: 'Invalid file path.' };
  let real;
  try {
    real = fs.realpathSync(p);
  } catch (_) {
    return { ok: false, error: 'The file could not be found.' };
  }
  if (path.extname(real).toLowerCase() !== '.pdf') {
    return { ok: false, error: 'Only .pdf files are supported.' };
  }
  let st;
  try {
    st = fs.statSync(real);
  } catch (_) {
    return { ok: false, error: 'The file could not be read.' };
  }
  if (!st.isFile()) return { ok: false, error: 'That path is not a file.' };
  if (st.size === 0) return { ok: false, error: 'The file is empty.' };
  if (st.size > MAX_PDF_BYTES) {
    return { ok: false, error: 'The file is larger than the ' + Math.round(MAX_PDF_BYTES / 1048576) + ' MB limit.' };
  }
  return { ok: true, path: real, size: st.size };
}

function safeJobId(value) {
  return typeof value === 'string' && /^[\w-]{1,64}$/.test(value) ? value : crypto.randomUUID();
}

function sameFile(a, b) {
  const x = path.resolve(a);
  const y = path.resolve(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

function cleanFooter(f) {
  if (!f || typeof f !== 'object') return null;
  const out = {};
  for (const key of ['n', 'l', 'r', 'top', 'bottom', 'base', 'size']) {
    const value = Number(f[key]);
    if (!Number.isFinite(value)) return null;
    out[key] = value;
  }
  return out;
}

function cleanToc(value) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const a = Number(value[0]);
  const b = Number(value[1]);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < a) return null;
  return [a, b];
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, payload) => {
    const win = _getMainWindow();
    if (!win || win.isDestroyed() || event.sender !== win.webContents) {
      return { success: false, error: 'Request not allowed.' };
    }
    if (!featureOn()) {
      return { success: false, error: 'PDF Master is turned off in Settings.' };
    }
    try {
      return await fn(payload, win);
    } catch (err) {
      return { success: false, code: (err && err.code) || 'ERROR', error: (err && err.message) || String(err) };
    }
  });
}

function register(deps) {
  if (_registered) return;
  _registered = true;
  if (deps && typeof deps.getMainWindow === 'function') _getMainWindow = deps.getMainWindow;
  const app = deps && deps.app;

  handle('pdfMaster:status', async () => {
    const st = await sidecar.status();
    return Object.assign({ success: true }, st);
  });

  handle('pdfMaster:pickPdf', async (payload, win) => {
    const res = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
    });
    if (res.canceled || !res.filePaths || !res.filePaths[0]) return { success: true, canceled: true };
    return { success: true, path: res.filePaths[0] };
  });

  handle('pdfMaster:inspect', async (payload, win) => {
    const chk = checkPdf(payload && payload.inputPath);
    if (!chk.ok) return { success: false, error: chk.error };
    const jobId = safeJobId(payload && payload.jobId);
    const send = (data) => {
      if (win.isDestroyed()) return;
      win.webContents.send('pdfMaster:progress', Object.assign({ jobId }, data));
    };
    const report = await sidecar.request('inspect_pdf', { inputPath: chk.path }, {
      jobId,
      timeoutMs: INSPECT_TIMEOUT_MS,
      onProgress: send,
    });
    return { success: true, jobId, report };
  });

  handle('pdfMaster:renderPage', async (payload) => {
    const chk = checkPdf(payload && payload.inputPath);
    if (!chk.ok) return { success: false, error: chk.error };
    const pageIndex = Number(payload.pageIndex);
    const maxWidth = Number(payload.maxWidth);
    const format = FORMATS.has(payload.format) ? payload.format : 'png';
    if (!Number.isInteger(pageIndex) || pageIndex < 0) return { success: false, error: 'That page does not exist.' };
    if (!Number.isFinite(maxWidth) || maxWidth < 64 || maxWidth > 2400) {
      return { success: false, error: 'The preview size is not valid.' };
    }
    const out = await sidecar.request('render_page', {
      inputPath: chk.path,
      pageIndex,
      maxWidth: Math.round(maxWidth),
      format,
    }, { timeoutMs: RENDER_TIMEOUT_MS });
    return { success: true, dataUrl: out.dataUrl, width: out.width, height: out.height };
  });

  handle('pdfMaster:cancel', async (payload) => {
    const jobId = payload && typeof payload.jobId === 'string' ? payload.jobId : '';
    return { success: true, cancelled: sidecar.cancel(jobId) };
  });

  handle('pdfMaster:convertToDocx', async (payload, win) => {
    const chk = checkPdf(payload && payload.inputPath);
    if (!chk.ok) return { success: false, error: chk.error };
    const jobId = safeJobId(payload && payload.jobId);
    const rawName = path.basename(chk.path).replace(/\.pdf$/i, '') + '.docx';
    const name = rawName.replace(/[^\w.\- ]+/g, '_') || 'converted.docx';
    const startDir = app && app.getPath ? app.getPath('documents') : '';
    const res = await dialog.showSaveDialog(win, {
      defaultPath: startDir ? path.join(startDir, name) : name,
      filters: [{ name: 'Microsoft Word Document (*.docx)', extensions: ['docx'] }],
    });
    if (res.canceled || !res.filePath) return { success: true, canceled: true };
    let target = res.filePath;
    if (path.extname(target).toLowerCase() !== '.docx') target += '.docx';
    const send = (data) => {
      if (win.isDestroyed()) return;
      win.webContents.send('pdfMaster:progress', Object.assign({ jobId }, data));
    };
    const result = await sidecar.request('convert_pdf_to_docx', {
      inputPath: chk.path,
      outputPath: target,
    }, {
      jobId,
      timeoutMs: CONVERT_TIMEOUT_MS,
      onProgress: send,
    });
    return Object.assign({ success: true, jobId }, result);
  });

  handle('pdfMaster:analyzeWriter', async (payload, win) => {
    const chk = checkPdf(payload && payload.inputPath);
    if (!chk.ok) return { success: false, error: chk.error };
    const jobId = safeJobId(payload && payload.jobId);
    const send = (data) => {
      if (win.isDestroyed()) return;
      win.webContents.send('pdfMaster:progress', Object.assign({ jobId }, data));
    };
    const analysis = await sidecar.request('analyze_writer', { inputPath: chk.path }, {
      jobId,
      timeoutMs: ANALYZE_TIMEOUT_MS,
      onProgress: send,
    });
    return { success: true, jobId, analysis };
  });

  handle('pdfMaster:writePdf', async (payload, win) => {
    const chk = checkPdf(payload && payload.inputPath);
    if (!chk.ok) return { success: false, error: chk.error };
    const jobId = safeJobId(payload && payload.jobId);
    const replace = payload && Array.isArray(payload.replace) ? payload.replace : [];
    if (!replace.length) return { success: false, error: 'There is nothing to write.' };
    if (replace.length > 300) return { success: false, error: 'Too many sections.' };
    if (JSON.stringify(replace).length > MAX_WRITE_PAYLOAD_BYTES) {
      return { success: false, error: 'The text is too large to write.' };
    }
    const mode = payload.saveMode === 'replace' ? 'replace' : 'new';
    const baseName = path.basename(chk.path);
    let target;
    if (mode === 'replace') {
      const ask = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Replace original', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: 'Replace original PDF',
        message: 'Replace "' + baseName + '" with the edited version?',
        detail: 'The original file will be overwritten. This cannot be undone.',
      });
      if (ask.response !== 0) return { success: true, canceled: true };
      target = chk.path;
    } else {
      const suggested = baseName.replace(/\.pdf$/i, '') + '-edited.pdf';
      const res = await dialog.showSaveDialog(win, {
        defaultPath: path.join(path.dirname(chk.path), suggested),
        filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
      });
      if (res.canceled || !res.filePath) return { success: true, canceled: true };
      target = res.filePath;
      if (path.extname(target).toLowerCase() !== '.pdf') target += '.pdf';
      if (sameFile(target, chk.path)) {
        return { success: false, error: 'Choose a different file name, or use Replace original.' };
      }
    }
    const footers = Array.isArray(payload.footers) ? payload.footers.slice(0, 3000).map(cleanFooter) : [];
    const send = (data) => {
      if (win.isDestroyed()) return;
      win.webContents.send('pdfMaster:progress', Object.assign({ jobId }, data));
    };
    const result = await sidecar.request('write_pdf', {
      inputPath: chk.path,
      outputPath: target,
      replace,
      tocPages: cleanToc(payload.tocPages),
      footers,
      footerGeo: cleanFooter(payload.footerGeo),
    }, {
      jobId,
      timeoutMs: WRITE_TIMEOUT_MS,
      onProgress: send,
    });
    return Object.assign({ success: true, jobId, mode }, result);
  });

  handle('pdfMaster:saveReport', async (payload, win) => {
    const report = payload && payload.report;
    if (!report || typeof report !== 'object') return { success: false, error: 'There is no report to save.' };
    const text = JSON.stringify(report, null, 2);
    if (Buffer.byteLength(text) > MAX_REPORT_BYTES) return { success: false, error: 'The report is too large to save.' };
    const rawName = path.basename(String((payload && payload.suggestedName) || 'inspection.json'));
    const name = rawName.replace(/[^\w.\- ]+/g, '_') || 'inspection.json';
    const startDir = app && app.getPath ? app.getPath('documents') : '';
    const res = await dialog.showSaveDialog(win, {
      defaultPath: startDir ? path.join(startDir, name) : name,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return { success: true, canceled: true };
    let target = res.filePath;
    if (path.extname(target).toLowerCase() !== '.json') target += '.json';
    const tmp = target + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, target);
    return { success: true, path: target };
  });
}

function cleanup() {
  try {
    sidecar.shutdown(true);
  } catch (_) {}
}

module.exports = { register, cleanup };