const { spawn } = require('child_process');
const ffmpegPath = require('../../utils/ffmpeg');
const path = require('path');
const fs = require('fs');
const os = require('os');

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-300)}`));
    });
    proc.on('error', err => reject(new Error('Failed to start FFmpeg: ' + err.message)));
  });
}

async function videoRender(payload, onProgress) {
  const { inputPath, segments, preset, outputPath: userOutputPath, preview } = payload;

  if (!inputPath || !fs.existsSync(inputPath)) throw new Error('Input file not found');
  if (!segments || segments.length === 0) throw new Error('No segments provided');

  const activeSegs = segments.filter(s => s.enabled !== false);
  if (activeSegs.length === 0) throw new Error('No enabled segments');

  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputDir = userOutputPath || os.tmpdir();
  const outputPath = path.join(outputDir, `${baseName}_edited.mp4`);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  let p, presetName;
  if (preview) {
    p = { crf: 35, scale: '320:-2' };
    presetName = 'ultrafast';
  } else {
    const presetMap = {
      small:    { crf: 28, scale: '640:-2' },
      balanced: { crf: 23, scale: '854:-2' },
      high:     { crf: 18, scale: '1280:-2' },
    };
    p = presetMap[preset] || presetMap.balanced;
    presetName = 'fast';
  }

  const n = activeSegs.length;

  // Each segment: -ss start -t dur -i input
  const inputArgs = [];
  for (const seg of activeSegs) {
    const dur = Math.round((seg.endTime - seg.startTime) * 10) / 10;
    inputArgs.push('-ss', String(seg.startTime), '-t', String(dur), '-i', inputPath);
  }

  // Per-segment filter: setpts for speed, scale
  const filterParts = [];
  const inputLabels = [];
  for (let i = 0; i < n; i++) {
    const seg = activeSegs[i];
    const speedFactor = seg.speed > 0 ? 1 / seg.speed : 1;
    const label = `v${i}`;
    inputLabels.push(label);
    filterParts.push(`[${i}:v]setpts=${speedFactor}*PTS,scale=${p.scale},setpts=PTS-STARTPTS[${label}]`);
  }

  // Concat all
  const concatIn = inputLabels.join('][');
  const filterComplex = `${filterParts.join('; ')}; [${concatIn}]concat=n=${n}:v=1:a=0[vout]`;

  onProgress({ percent: 10, step: 'Processing segments...' });

  const args = [
    ...inputArgs,
    '-filter_complex', filterComplex,
    '-map', '[vout]',
    '-crf', String(p.crf),
    '-preset', presetName,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-y', outputPath,
  ];

  await runFFmpeg(args);

  const stat = fs.statSync(outputPath);
  onProgress({ percent: 100, step: 'Done' });

  return {
    outputPath,
    fileSize: stat.size,
    duration: activeSegs.reduce((sum, s) => sum + ((s.endTime - s.startTime) / (s.speed || 1)), 0),
    preset,
  };
}

module.exports = videoRender;
