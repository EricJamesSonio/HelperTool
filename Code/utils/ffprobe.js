const path = require('path');
const fs = require('fs');

function getFfprobePath() {
  try {
    const ffprobePath = require('@ffprobe-installer/ffprobe').path;
    const unpacked = ffprobePath.replace('app.asar', 'app.asar.unpacked');
    if (unpacked !== ffprobePath) {
      if (fs.existsSync(unpacked)) return unpacked;
    } else {
      if (fs.existsSync(ffprobePath)) return ffprobePath;
    }
  } catch (e) {}

  try {
    const ffmpegDir = path.dirname(require.resolve('ffmpeg-static'));
    const candidate = path.join(ffmpegDir, 'ffprobe.exe');
    if (fs.existsSync(candidate)) return candidate;
  } catch (e) {}

  return 'ffprobe';
}

module.exports = getFfprobePath;
