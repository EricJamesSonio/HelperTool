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
      else reject(new Error(stderr.slice(-300)));
    });
    proc.on('error', err => reject(new Error(err.message)));
  });
}

async function videoPreview(payload, onProgress) {
  const { inputPath, startTime, duration, speed = 1, outputPath: userPath } = payload;

  if (!inputPath || !fs.existsSync(inputPath)) throw new Error('Input not found');

  const outDir = userPath ? path.dirname(userPath) : os.tmpdir();
  const outPath = userPath || path.join(outDir, `preview_${Date.now()}.mp4`);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Short preview: low res, limited duration, fast encoding
  const speedFactor = speed > 0 ? 1 / speed : 1;
  const actualDur = Math.min(duration || 3, 5);

  onProgress({ percent: 10, step: 'Generating preview...' });

  const args = [
    '-ss', String(startTime),
    '-t', String(actualDur),
    '-i', inputPath,
    '-vf', `setpts=${speedFactor}*PTS,scale=320:-2`,
    '-c:v', 'libx264',
    '-crf', '30',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-y', outPath,
  ];

  await runFFmpeg(args);

  const stat = fs.statSync(outPath);
  onProgress({ percent: 100, step: 'Preview ready' });

  return {
    outputPath: outPath,
    fileSize: stat.size,
    duration: actualDur / speed,
  };
}

module.exports = videoPreview;
