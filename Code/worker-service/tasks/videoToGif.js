const { spawn } = require('child_process');
const ffmpegPath = require('../../utils/ffmpeg');
const ffprobePath = require('../../utils/ffprobe')();
const path = require('path');
const fs = require('fs');
const os = require('os');

const PRESETS = {
  small:    { width: 320, fps: 10 },
  balanced: { width: 480, fps: 15 },
  high:     { width: 720, fps: 24 },
};
const NUM_SUGGESTIONS = 3;

function runFFprobe(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobePath, args);
    let stdout = '';
    proc.stdout.on('data', d => stdout += d);
    proc.on('close', code => {
      if (code !== 0) return reject(new Error('ffprobe failed'));
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error('Failed to parse ffprobe output')); }
    });
    proc.on('error', reject);
  });
}

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

async function getMetadata(inputPath) {
  const info = await runFFprobe([
    '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', inputPath
  ]);
  const videoStream = info.streams.find(s => s.codec_type === 'video');
  return {
    duration: parseFloat(info.format.duration || 0),
    size: parseInt(info.format.size || 0),
    width: videoStream ? videoStream.width : 0,
    height: videoStream ? videoStream.height : 0,
  };
}

function generateSuggestions(duration) {
  const numClips = Math.min(5, Math.max(2, Math.floor(duration / 15)));
  const clipDuration = Math.min(4, Math.max(2, Math.round(duration * 0.05 * 10) / 10));
  const spacing = duration / (numClips + 1);
  const clips = [];
  for (let i = 0; i < numClips; i++) {
    const center = spacing * (i + 1);
    const start = Math.max(0, Math.round((center - clipDuration / 2) * 10) / 10);
    clips.push({ startTime: start, duration: clipDuration });
  }
  return clips;
}

// Build multi-segment FFmpeg filter_complex for GIF with palette
function buildMultiSegmentGifCommand(inputPath, segments, preset, outputPath, palettePath) {
  const p = PRESETS[preset] || PRESETS.balanced;
  const n = segments.length;

  // Input args: each segment gets its own -ss/-t/-i
  const inputArgs = [];
  for (const seg of segments) {
    inputArgs.push('-ss', String(seg.startTime), '-t', String(seg.duration), '-i', inputPath);
  }

  // Per-segment filter strings
  const filterParts = [];
  const inputLabels = [];
  for (let i = 0; i < n; i++) {
    const seg = segments[i];
    const speedFactor = seg.speed > 0 ? 1 / seg.speed : 1;
    const label = `v${i}`;
    inputLabels.push(label);
    // For each input: apply setpts for speed, scale, fps, then reset PTS for concat
    filterParts.push(`[${i}:v]setpts=${speedFactor}*PTS,scale=${p.width}:-1:flags=lanczos,fps=${p.fps},setpts=PTS-STARTPTS[${label}]`);
  }

  // Concat all inputs, split, palettegen, paletteuse
  const concatIn = inputLabels.join('][');

  const filterComplex = `${filterParts.join('; ')}; [${concatIn}]concat=n=${n}:v=1:a=0,split[v0][v1]; [v0]palettegen=stats_mode=diff[pal]; [v1][pal]paletteuse=dither=bayer`;
  return [
    ...inputArgs,
    '-filter_complex', filterComplex,
    '-y', outputPath,
  ];
}

async function videoToGif(payload, onProgress) {
  const { mode, inputPath } = payload;

  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error('Input file not found: ' + inputPath);
  }

  if (mode === 'analyze') {
    const meta = await getMetadata(inputPath);
    const suggestions = generateSuggestions(meta.duration);
    onProgress({ percent: 100, step: 'Analysis complete' });
    return {
      duration: meta.duration,
      resolution: `${meta.width}x${meta.height}`,
      fileSize: meta.size,
      suggestions,
    };
  }

  if (mode === 'final') {
    const { segments, preset = 'balanced', outputPath: userOutputPath } = payload;
    if (!segments || segments.length === 0) throw new Error('No segments provided');

    const baseName = path.basename(inputPath, path.extname(inputPath));
    const outputDir = userOutputPath || os.tmpdir();
    const outputPath = path.join(outputDir, `${baseName}.gif`);
    const palettePath = outputPath.replace('.gif', '_palette.png');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // Calculate final duration for result
    let totalOutputDur = 0;
    for (const seg of segments) {
      totalOutputDur += seg.duration / (seg.speed > 0 ? seg.speed : 1);
    }

    onProgress({ percent: 10, step: `Processing ${segments.length} clip(s)...` });

    const args = buildMultiSegmentGifCommand(inputPath, segments, preset, outputPath, palettePath);
    await runFFmpeg(args);

    // Clean up palette if it exists (FFmpeg generates it as side effect)
    if (fs.existsSync(palettePath)) {
      try { fs.unlinkSync(palettePath); } catch {}
    }

    const p = PRESETS[preset] || PRESETS.balanced;
    const gifStat = fs.statSync(outputPath);
    onProgress({ percent: 100, step: 'Done' });
    return {
      outputPath,
      fileSize: gifStat.size,
      duration: Math.round(totalOutputDur * 10) / 10,
      resolution: `${p.width}x?`,
      fps: p.fps,
      preset,
    };
  }

  throw new Error('Unknown mode: ' + mode);
}

module.exports = videoToGif;
