const path = require('path');

function extOf(file) {
  const name = path.basename(file).toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1);
}

function countExts(files) {
  const map = new Map();
  for (const file of files || []) {
    const ext = extOf(file);
    map.set(ext, (map.get(ext) || 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
}

function decodeTextBuffer(buffer) {
  if (buffer.length >= 2) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString('utf16le', 2);
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      const swapped = Buffer.from(buffer);
      if (swapped.length >= 4) {
        for (let i = 2; i + 1 < swapped.length; i += 2) {
          const value = swapped[i];
          swapped[i] = swapped[i + 1];
          swapped[i + 1] = value;
        }
      }
      return swapped.toString('utf16le', 2);
    }
  }

  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.toString('utf8', 3);
  }
  return buffer.toString('utf8');
}

function isProbablyTextBuffer(buffer) {
  if (!buffer || !buffer.length) return true;
  if (buffer.length >= 2 &&
      ((buffer[0] === 0xff && buffer[1] === 0xfe) ||
       (buffer[0] === 0xfe && buffer[1] === 0xff))) return true;

  const probe = buffer.subarray(0, Math.min(buffer.length, 8000));
  let controls = 0;
  for (const byte of probe) {
    if (byte === 0) return false;
    if (byte === 9 || byte === 10 || byte === 13) continue;
    if (byte < 32 || byte === 127) controls++;
  }
  return controls / probe.length < 0.02;
}

module.exports = {
  extOf,
  countExts,
  decodeTextBuffer,
  isProbablyTextBuffer,
};
