const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const path = require('path');
const fs = require('fs');
const os = require('os');

const PRESETS = {
  high:     { crf: 21, maxHeight: 1080, audioBitrate: '160k', fps: null },
  balanced: { crf: 25, maxHeight: 1080, audioBitrate: '128k', fps: 30  },
  small:    { crf: 30, maxHeight: 720,  audioBitrate: '96k',  fps: 24  },
};

async function getMetadata(inputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      inputPath
    ];
    const proc = spawn(ffprobePath, args);
    let stdout = '';
    proc.stdout.on('data', d => stdout += d);
    proc.on('close', code => {
      if (code !== 0) return reject(new Error('ffprobe failed'));
      try {
        const info = JSON.parse(stdout);
        const videoStream = info.streams.find(s => s.codec_type === 'video');
        const fps = videoStream ? (() => {
          const parts = (videoStream.r_frame_rate || '30/1').split('/');
          return parseInt(parts[0]) / (parseInt(parts[1]) || 1);
        })() : 0;
        resolve({
          duration: parseFloat(info.format.duration || 0),
          size: parseInt(info.format.size || 0),
          width: videoStream ? videoStream.width : 0,
          height: videoStream ? videoStream.height : 0,
          fps,
        });
      } catch (e) {
        reject(new Error('Failed to parse ffprobe output'));
      }
    });
    proc.on('error', reject);
  });
}

function buildArgs(inputPath, outputPath, preset, metadata) {
  const p = PRESETS[preset] || PRESETS.balanced;
  const args = ['-i', inputPath, '-y'];
  args.push('-c:v', 'libx264');
  args.push('-crf', String(p.crf));
  args.push('-preset', 'medium');
  if (metadata.height > p.maxHeight) {
    args.push('-vf', `scale=-2:${p.maxHeight}`);
  }
  if (p.fps && metadata.fps > p.fps) {
    args.push('-r', String(p.fps));
  }
  args.push('-c:a', 'aac');
  args.push('-b:a', p.audioBitrate);
  args.push('-progress', 'pipe:1');
  args.push('-nostats');
  args.push(outputPath);
  return args;
}

async function videoCompress(payload, onProgress) {
  const { inputPath, preset = 'balanced', outputPath: userOutputPath, metadataOnly = false } = payload;

  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error('Input file not found: ' + inputPath);
  }

  const metadata = await getMetadata(inputPath);

  if (metadataOnly) {
    return {
      originalSize: metadata.size,
      originalResolution: `${metadata.width}x${metadata.height}`,
      duration: metadata.duration,
      fps: metadata.fps,
    };
  }

  const startTime = Date.now();
  const ext = path.extname(inputPath);
  const baseName = path.basename(inputPath, ext);
  const outputDir = userOutputPath || os.tmpdir();
  const outputPath = path.join(outputDir, `${baseName}_compressed${ext}`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const args = buildArgs(inputPath, outputPath, preset, metadata);

  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let currentTime = 0;

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('out_time_ms=')) {
          const ms = parseInt(line.split('=')[1]) / 1000000;
          if (!isNaN(ms) && metadata.duration > 0) {
            currentTime = ms;
            const percent = Math.min(99, Math.round((ms / metadata.duration) * 100));
            const estimatedFinalSize = percent > 5 && fs.existsSync(outputPath)
              ? Math.round(fs.statSync(outputPath).size / (percent / 100))
              : null;
            onProgress({ percent, currentTime: ms, totalTime: metadata.duration, estimatedOutputSize: estimatedFinalSize, originalSize: metadata.size });
          }
        }
      }
    });

    proc.stderr.on('data', () => {});

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });

    proc.on('error', (err) => {
      reject(new Error('Failed to start FFmpeg: ' + err.message));
    });
  });

  const outputMeta = await getMetadata(outputPath);
  const processingTime = Date.now() - startTime;
  const reductionPercent = outputMeta.size > 0 ? Math.round((1 - outputMeta.size / metadata.size) * 100) : 0;

  return {
    outputPath,
    originalSize: metadata.size,
    compressedSize: outputMeta.size,
    reductionPercent,
    originalResolution: `${metadata.width}x${metadata.height}`,
    outputResolution: `${outputMeta.width}x${outputMeta.height}`,
    duration: metadata.duration,
    processingTime,
  };
}

module.exports = videoCompress;