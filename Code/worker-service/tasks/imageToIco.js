const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ICO_SIZES = [16, 32, 48, 64, 128, 256];

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

async function imageToIco(payload, onProgress) {
  const { inputPath, outputPath: userOutputPath, sizes } = payload;

  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error('Input file not found: ' + inputPath);
  }

  const ext = path.extname(inputPath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
    throw new Error('Unsupported format. Use PNG or JPG.');
  }

  const targetSizes = sizes && sizes.length > 0 ? sizes : ICO_SIZES;
  const baseName = path.basename(inputPath, ext);
  const outputDir = userOutputPath || os.tmpdir();
  const outputPath = path.join(outputDir, `${baseName}.ico`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const metadata = await sharp(inputPath).metadata();
  const srcWidth = metadata.width;
  const srcHeight = metadata.height;
  const srcSize = fs.statSync(inputPath).size;

  if (srcWidth < 256 || srcHeight < 256) {
    onProgress({ warning: true, message: `Source image is ${srcWidth}x${srcHeight}. 256x256+ recommended for best results.` });
  }

  const pngBuffers = [];
  const total = targetSizes.length;

  for (let i = 0; i < total; i++) {
    const size = targetSizes[i];
    const dim = Math.min(size, srcWidth, srcHeight);
    const resizeOpts = {
      width: size,
      height: size,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    };

    const png = await sharp(inputPath)
      .resize(resizeOpts)
      .png()
      .toBuffer();

    pngBuffers.push({ size, png });
    onProgress({ percent: Math.round(((i + 1) / total) * 100), step: `Resizing ${size}x${size}...` });
  }

  const icoData = buildIco(pngBuffers);
  fs.writeFileSync(outputPath, icoData);
  const outputFileSize = fs.statSync(outputPath).size;

  const skipped = targetSizes.filter(s => s > srcWidth || s > srcHeight).length;

  return {
    outputPath,
    sizesIncluded: targetSizes,
    skippedSizes: skipped,
    fileSize: outputFileSize,
    srcSize,
    originalResolution: `${srcWidth}x${srcHeight}`,
  };
}

module.exports = imageToIco;