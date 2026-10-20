const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ICO_SIZES = [16, 32, 48, 64, 128, 256];

const PRESETS = {
  lossless: { quality: 100, compressionLevel: 9, lossless: true },
  high:     { quality: 90,  compressionLevel: 6, lossless: false },
  balanced: { quality: 75,  compressionLevel: 6, lossless: false },
  small:    { quality: 50,  compressionLevel: 9, lossless: false },
};

const FORMAT_EXT = {
  png:  '.png',
  jpeg: '.jpg',
  webp: '.webp',
  ico:  '.ico',
  svg:  '.svg',
};

const MIME_BY_FORMAT = {
  png:  'image/png',
  jpeg: 'image/jpeg',
  jpg:  'image/jpeg',
  webp: 'image/webp',
  gif:  'image/gif',
  avif: 'image/avif',
  tiff: 'image/tiff',
  bmp:  'image/bmp',
  svg:  'image/svg+xml',
};

function resolveOutputPath(inputPath, outputDir, format) {
  const ext = path.extname(inputPath);
  const baseName = path.basename(inputPath, ext);
  const outExt = FORMAT_EXT[format];
  let outputPath = path.join(outputDir, baseName + outExt);
  if (path.resolve(outputPath).toLowerCase() === path.resolve(inputPath).toLowerCase()) {
    outputPath = path.join(outputDir, baseName + '_converted' + outExt);
  }
  return outputPath;
}

async function getMeta(inputPath) {
  const meta = await sharp(inputPath).metadata();
  const stat = fs.statSync(inputPath);
  return {
    width: meta.width,
    height: meta.height,
    size: stat.size,
    format: meta.format,
    hasAlpha: meta.hasAlpha,
  };
}

async function convertRaster(inputPath, outputDir, format, presetName, onProgress) {
  const preset = PRESETS[presetName] || PRESETS.balanced;
  const meta = await getMeta(inputPath);
  const outputPath = resolveOutputPath(inputPath, outputDir, format);

  let pipeline = sharp(inputPath);

  if (format === 'jpeg') {
    if (meta.hasAlpha) pipeline = pipeline.flatten({ background: '#ffffff' });
    pipeline = pipeline.jpeg({ quality: preset.quality, mozjpeg: true });
  } else if (format === 'png') {
    pipeline = pipeline.png({
      compressionLevel: preset.compressionLevel,
      palette: !preset.lossless,
      quality: preset.lossless ? undefined : preset.quality,
    });
  } else if (format === 'webp') {
    pipeline = pipeline.webp({ quality: preset.quality, lossless: preset.lossless });
  }

  onProgress({ percent: 60, step: `Encoding ${format.toUpperCase()}...` });
  await pipeline.toFile(outputPath);

  const outputSize = fs.statSync(outputPath).size;
  return {
    inputPath,
    outputPath,
    originalSize: meta.size,
    outputSize,
    reductionPercent: meta.size > 0 ? Math.round((1 - outputSize / meta.size) * 100) : 0,
    originalResolution: `${meta.width}x${meta.height}`,
    format,
  };
}

function buildIco(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  let offset = 6 + count * 16;
  const dirEntries = [];
  const dataBuffers = [];

  for (let i = 0; i < count; i++) {
    const { size, png } = pngBuffers[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    dataBuffers.push(png);
    offset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...dataBuffers]);
}

async function convertIco(inputPath, outputDir, onProgress, sizes) {
  const targetSizes = sizes && sizes.length > 0 ? sizes : ICO_SIZES;
  const meta = await getMeta(inputPath);
  const outputPath = resolveOutputPath(inputPath, outputDir, 'ico');

  if (meta.width < 256 || meta.height < 256) {
    onProgress({ warning: true, message: `Source image is ${meta.width}x${meta.height}. 256x256+ recommended for best results.` });
  }

  const pngBuffers = [];
  const total = targetSizes.length;

  for (let i = 0; i < total; i++) {
    const size = targetSizes[i];
    const png = await sharp(inputPath)
      .resize({
        width: size,
        height: size,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    pngBuffers.push({ size, png });
    onProgress({ percent: Math.round(((i + 1) / total) * 90), step: `Resizing ${size}x${size}...` });
  }

  const icoData = buildIco(pngBuffers);
  fs.writeFileSync(outputPath, icoData);
  const outputSize = fs.statSync(outputPath).size;
  const skippedSizes = targetSizes.filter(s => s > meta.width || s > meta.height).length;

  return {
    inputPath,
    outputPath,
    originalSize: meta.size,
    outputSize,
    reductionPercent: meta.size > 0 ? Math.round((1 - outputSize / meta.size) * 100) : 0,
    originalResolution: `${meta.width}x${meta.height}`,
    format: 'ico',
    ico: { sizesIncluded: targetSizes, skippedSizes },
  };
}

async function convertSvg(inputPath, outputDir, onProgress) {
  const meta = await getMeta(inputPath);
  const outputPath = resolveOutputPath(inputPath, outputDir, 'svg');

  onProgress({ percent: 40, step: 'Embedding image in SVG...' });

  const originalBytes = fs.readFileSync(inputPath);
  const mime = MIME_BY_FORMAT[meta.format] || 'image/png';
  const base64 = originalBytes.toString('base64');
  const width = meta.width || 0;
  const height = meta.height || 0;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<image width="${width}" height="${height}" href="data:${mime};base64,${base64}"/>` +
    `</svg>`;

  fs.writeFileSync(outputPath, svg, 'utf8');
  const outputSize = fs.statSync(outputPath).size;

  return {
    inputPath,
    outputPath,
    originalSize: meta.size,
    outputSize,
    reductionPercent: meta.size > 0 ? Math.round((1 - outputSize / meta.size) * 100) : 0,
    originalResolution: `${width}x${height}`,
    format: 'svg',
  };
}

async function convertSingle(inputPath, outputDir, format, preset, onProgress, sizes) {
  if (format === 'ico') return convertIco(inputPath, outputDir, onProgress, sizes);
  if (format === 'svg') return convertSvg(inputPath, outputDir, onProgress);
  return convertRaster(inputPath, outputDir, format, preset, onProgress);
}

async function imageConvert(payload, onProgress) {
  const {
    inputPath,
    inputPaths,
    format = 'png',
    preset = 'balanced',
    outputPath: userOutputPath,
    sizes,
  } = payload;

  if (!FORMAT_EXT[format]) {
    throw new Error('Unsupported format: ' + format);
  }

  const outputDir = userOutputPath || os.tmpdir();
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let files = [];
  if (inputPaths && inputPaths.length > 0) {
    files = inputPaths.filter(f => f && fs.existsSync(f));
    if (files.length === 0) throw new Error('No valid input files');
  } else if (inputPath && fs.existsSync(inputPath)) {
    files = [inputPath];
  } else {
    throw new Error('Input file not found: ' + (inputPath || '(none)'));
  }

  const total = files.length;

  if (total === 1) {
    const result = await convertSingle(files[0], outputDir, format, preset, onProgress, sizes);
    onProgress({ percent: 100, step: 'Done' });
    return { batch: false, ...result };
  }

  const results = [];
  let totalOriginalSize = 0;
  let totalOutputSize = 0;
  const errors = [];

  for (let i = 0; i < total; i++) {
    try {
      const result = await convertSingle(
        files[i],
        outputDir,
        format,
        preset,
        (p) => {
          if (p && !p.warning) {
            onProgress({
              ...p,
              percent: Math.round((i / total) * 100 + ((p.percent || 0) / total)),
              currentFile: i + 1,
              totalFiles: total,
              fileName: path.basename(files[i]),
            });
          } else if (p && p.warning) {
            onProgress(p);
          }
        },
        sizes
      );
      totalOriginalSize += result.originalSize;
      totalOutputSize += result.outputSize;
      results.push(result);
      onProgress({
        percent: Math.round(((i + 1) / total) * 100),
        currentFile: i + 1,
        totalFiles: total,
        fileName: path.basename(files[i]),
      });
    } catch (e) {
      errors.push({ file: files[i], error: e.message });
      results.push({
        inputPath: files[i],
        error: e.message,
        originalSize: 0,
        outputSize: 0,
        reductionPercent: 0,
      });
    }
  }

  return {
    batch: true,
    results,
    totalOriginalSize,
    totalOutputSize,
    totalReductionPercent: totalOriginalSize > 0
      ? Math.round((1 - totalOutputSize / totalOriginalSize) * 100) : 0,
    errors: errors.length > 0 ? errors : undefined,
    outputDir,
  };
}

module.exports = imageConvert;
