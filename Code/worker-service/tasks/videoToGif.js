const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const path = require('path');
const fs = require('fs');
const os = require('os');

const PRESETS = {
  small:    { width: 320, fps: 10, label: 'Small',  desc: '320p · 10fps' },
  balanced: { width: 480, fps: 15, label: 'Balanced', desc: '480p · 15fps' },
  high:     { width: 720, fps: 24, label: 'High Quality', desc: '720p · 24fps' },
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
    clips.push({ id: `clip-${i}`, startTime: start, duration: clipDuration });
  }
  return clips;
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

  if (mode === 'previews') {
    const { clips } = payload;
    const tmpDir = path.join(os.tmpdir(), 'opencode-gif-previews-' + Date.now());
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const results = [];
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const gifPath = path.join(tmpDir, `preview_${clip.id}.gif`);
      const args = [
        '-ss', String(clip.startTime),
        '-t', String(clip.duration),
        '-i', inputPath,
        '-vf', 'fps=10,scale=240:-1:flags=lanczos',
        '-y', gifPath,
      ];
      await runFFmpeg(args);
      results.push({ id: clip.id, startTime: clip.startTime, duration: clip.duration, gifPath });
      onProgress({ percent: Math.round(((i + 1) / clips.length) * 100), step: `Preview ${i + 1}/${clips.length}` });
    }
    return { previews: results, previewDir: tmpDir };
  }

  if (mode === 'final') {
    const { startTime, duration, speed = 1, preset = 'balanced', outputPath: userOutputPath } = payload;
    const p = PRESETS[preset] || PRESETS.balanced;
    const speedFactor = speed > 0 ? 1 / speed : 1;
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const outputDir = userOutputPath || os.tmpdir();
    const outputPath = path.join(outputDir, `${baseName}.gif`);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const palettePath = outputPath.replace('.gif', '_palette.png');
    const actualDuration = speedFactor !== 1 ? duration / speedFactor : duration;

    onProgress({ percent: 5, step: 'Generating palette...' });
    const paletteArgs = [
      '-ss', String(startTime),
      '-t', String(duration),
      '-i', inputPath,
      '-vf', `fps=${p.fps},scale=${p.width}:-1:flags=lanczos,palettegen=stats_mode=diff`,
      '-y', palettePath,
    ];
    await runFFmpeg(paletteArgs);

    onProgress({ percent: 50, step: 'Applying palette...' });
    const gifArgs = [
      '-ss', String(startTime),
      '-t', String(duration),
      '-i', inputPath,
      '-i', palettePath,
      '-lavfi', `fps=${p.fps},scale=${p.width}:-1:flags=lanczos,setpts=${speedFactor}*PTS [x]; [x][1:v] paletteuse=dither=bayer`,
      '-y', outputPath,
    ];
    await runFFmpeg(gifArgs);

    if (fs.existsSync(palettePath)) fs.unlinkSync(palettePath);

    const gifStat = fs.statSync(outputPath);
    onProgress({ percent: 100, step: 'Done' });
    return {
      outputPath,
      fileSize: gifStat.size,
      duration: Math.round(actualDuration * 10) / 10,
      resolution: `${p.width}x?`,
      fps: p.fps,
      preset,
    };
  }

  throw new Error('Unknown mode: ' + mode);
}

module.exports = videoToGif;
