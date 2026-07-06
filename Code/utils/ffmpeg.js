const path = require('path');
const fs = require('fs');

function getFfmpegPath() {
  const ffmpegPath = require('ffmpeg-static');
  const unpacked = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
  if (unpacked !== ffmpegPath) {
    if (fs.existsSync(unpacked)) return unpacked;
  } else {
    if (fs.existsSync(ffmpegPath)) return ffmpegPath;
  }
  return ffmpegPath;
}

module.exports = getFfmpegPath();
