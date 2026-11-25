const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SUPPORTED_LANGS = new Set([
  'eng', 'spa', 'fra', 'deu', 'ita', 'por', 'rus',
  'jpn', 'kor', 'chi_sim', 'chi_tra', 'ara', 'hin',
]);

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function countWords(text) {
  const t = String(text || '').trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

function uniqueOutputPath(inputPath, outputDir, used) {
  const base = path.basename(inputPath, path.extname(inputPath));
  let name = base + '.txt';
  let n = 1;
  while (used.has(name.toLowerCase())) {
    n += 1;
    name = base + '_' + n + '.txt';
  }
  used.add(name.toLowerCase());
  return path.join(outputDir, name);
}

async function prepareImage(inputPath) {
  const meta = await sharp(inputPath).metadata();
  let pipeline = sharp(inputPath).rotate();
  if (meta.hasAlpha) {
    pipeline = pipeline.flatten({ background: '#ffffff' });
  }
  const width = meta.width || 0;
  if (width > 0 && width < 1000) {
    const target = Math.min(width * 2, 2400);
    pipeline = pipeline.resize({ width: Math.round(target) });
  }
  pipeline = pipeline.grayscale().normalize();
  return pipeline.png().toBuffer();
}

function loadTesseract() {
  try {
    return require('tesseract.js');
  } catch (e) {
    throw new Error('tesseract.js is not installed. Run: npm install tesseract.js');
  }
}

async function imageToText(payload, onProgress) {
  const {
    inputPaths,
    inputPath,
    lang = 'eng',
    outputPath: userOutputPath,
    cachePath,
  } = payload;

  if (!SUPPORTED_LANGS.has(lang)) {
    throw new Error('Unsupported language: ' + lang);
  }

  let files = [];
  if (inputPaths && inputPaths.length > 0) {
    files = inputPaths.filter((f) => f && fs.existsSync(f));
    if (files.length === 0) throw new Error('No valid input files');
  } else if (inputPath && fs.existsSync(inputPath)) {
    files = [inputPath];
  } else {
    throw new Error('Input file not found: ' + (inputPath || '(none)'));
  }

  const outputDir = userOutputPath || os.tmpdir();
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  if (cachePath && !fs.existsSync(cachePath)) {
    fs.mkdirSync(cachePath, { recursive: true });
  }

  const { createWorker } = loadTesseract();
  const total = files.length;
  let fileIndex = 0;
  let fileName = path.basename(files[0]);
  let lastKey = '';

  const emit = (fraction, step) => {
    const percent = Math.min(99, Math.round(((fileIndex + fraction) / total) * 100));
    const key = percent + '|' + step;
    if (key === lastKey) return;
    lastKey = key;
    onProgress({
      percent,
      step,
      currentFile: fileIndex + 1,
      totalFiles: total,
      fileName,
    });
  };

  const logger = (m) => {
    if (!m || !m.status) return;
    if (m.status === 'recognizing text') {
      emit(m.progress || 0, 'Recognizing text...');
    } else if (String(m.status).indexOf('loading') !== -1 || String(m.status).indexOf('initializ') !== -1) {
      emit(0, 'Loading language data...');
    }
  };

  const results = [];
  const used = new Set();
  let worker = null;

  try {
    onProgress({
      percent: 0,
      step: 'Starting OCR engine...',
      currentFile: 1,
      totalFiles: total,
      fileName,
    });

    const options = { logger };
    if (cachePath) options.cachePath = cachePath;
    worker = await createWorker(lang, 1, options);

    for (let i = 0; i < total; i++) {
      fileIndex = i;
      fileName = path.basename(files[i]);
      try {
        emit(0, 'Preparing image...');
        const buffer = await prepareImage(files[i]);
        const { data } = await worker.recognize(buffer);
        const text = normalizeText(data && data.text);
        const outPath = uniqueOutputPath(files[i], outputDir, used);
        fs.writeFileSync(outPath, text, 'utf8');
        results.push({
          inputPath: files[i],
          outputPath: outPath,
          text,
          charCount: text.length,
          wordCount: countWords(text),
          confidence: Math.round((data && data.confidence) || 0),
          empty: text.trim().length === 0,
        });
      } catch (e) {
        results.push({ inputPath: files[i], error: e.message || String(e) });
      }
    }
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (_) {}
    }
  }

  const succeeded = results.filter((r) => !r.error);
  if (succeeded.length === 0) {
    throw new Error(results[0] && results[0].error ? results[0].error : 'Text extraction failed');
  }

  let combinedPath = null;
  if (total > 1) {
    combinedPath = path.join(outputDir, 'ocr_combined_' + Date.now() + '.txt');
    const combined = succeeded
      .map((r) => '===== ' + path.basename(r.inputPath) + ' =====\n' + r.text)
      .join('\n\n');
    fs.writeFileSync(combinedPath, combined, 'utf8');
  }

  onProgress({
    percent: 100,
    step: 'Done',
    currentFile: total,
    totalFiles: total,
    fileName,
  });

  const errors = results
    .filter((r) => r.error)
    .map((r) => ({ file: r.inputPath, error: r.error }));

  return {
    lang,
    results,
    outputDir,
    combinedPath,
    totalChars: succeeded.reduce((sum, r) => sum + r.charCount, 0),
    totalWords: succeeded.reduce((sum, r) => sum + r.wordCount, 0),
    errors: errors.length > 0 ? errors : undefined,
  };
}

module.exports = imageToText;