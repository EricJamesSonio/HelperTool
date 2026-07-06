const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PRESETS = {
  lossless: { quality: 100, compressionLevel: 9, lossless: true, desc: 'PNG lossless' },
  high:     { quality: 90,  compressionLevel: 6, lossless: false, desc: 'JPEG 90%' },
  balanced: { quality: 75,  compressionLevel: 6, lossless: false, desc: 'JPEG 75%' },
  small:    { quality: 50,  compressionLevel: 9, lossless: false, desc: 'JPEG 50%' },
};

function getOutputFormat(inputPath) {
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === '.png') return 'png';
  if (ext === '.webp') return 'webp';
  return 'jpeg';
}

async function getMetadata(inputPath) {
  const meta = await sharp(inputPath).metadata();
  const stat = fs.statSync(inputPath);
  return {
    width: meta.width,
    height: meta.height,
    size: stat.size,
    format: meta.format,
  };
}

async function compressSingle(inputPath, outputDir, presetName, format) {
  const preset = PRESETS[presetName] || PRESETS.balanced;
  const ext = path.extname(inputPath);
  const baseName = path.basename(inputPath, ext);
  const outputFormat = format || getOutputFormat(inputPath);
  const outputExt = outputFormat === 'jpeg' ? '.jpg' : '.' + outputFormat;
  const outputPath = path.join(outputDir, `${baseName}_compressed${outputExt}`);

  const meta = await getMetadata(inputPath);
  let pipeline = sharp(inputPath);

  if (outputFormat === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: preset.quality, mozjpeg: true });
  } else if (outputFormat === 'png') {
    pipeline = pipeline.png({ compressionLevel: preset.compressionLevel, palette: preset.lossless ? false : true });
  } else if (outputFormat === 'webp') {
    pipeline = pipeline.webp({ quality: preset.quality });
  }

  await pipeline.toFile(outputPath);
  const outputSize = fs.statSync(outputPath).size;

  return {
    inputPath,
    outputPath,
    originalSize: meta.size,
    compressedSize: outputSize,
    reductionPercent: meta.size > 0 ? Math.round((1 - outputSize / meta.size) * 100) : 0,
    originalResolution: `${meta.width}x${meta.height}`,
    format: outputFormat,
  };
}

async function imageCompress(payload, onProgress) {
  const { inputPath, inputPaths, preset = 'balanced', outputPath: userOutputPath, format } = payload;

  const outputDir = userOutputPath || os.tmpdir();
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (inputPaths && inputPaths.length > 0) {
    const files = inputPaths.filter(f => fs.existsSync(f));
    if (files.length === 0) throw new Error('No valid input files');

    const total = files.length;
    const results = [];
    let overallOriginalSize = 0;
    let overallCompressedSize = 0;
    let errors = [];

    for (let i = 0; i < total; i++) {
      try {
        const meta = await getMetadata(files[i]);
        overallOriginalSize += meta.size;
        const result = await compressSingle(files[i], outputDir, preset, format);
        overallCompressedSize += result.compressedSize;
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
          compressedSize: 0,
          reductionPercent: 0,
        });
      }
    }

    return {
      batch: true,
      results,
      totalOriginalSize: overallOriginalSize,
      totalCompressedSize: overallCompressedSize,
      totalReductionPercent: overallOriginalSize > 0
        ? Math.round((1 - overallCompressedSize / overallOriginalSize) * 100) : 0,
      errors: errors.length > 0 ? errors : undefined,
      outputDir,
    };
  }

  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error('Input file not found: ' + inputPath);
  }

  const startMeta = await getMetadata(inputPath);
  const result = await compressSingle(inputPath, outputDir, preset, format);

  onProgress({ percent: 100, step: 'Done' });

  return {
    batch: false,
    ...result,
    originalResolution: `${startMeta.width}x${startMeta.height}`,
    outputPath: result.outputPath,
  };
}

module.exports = imageCompress;
