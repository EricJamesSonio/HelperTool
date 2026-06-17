const { app } = require('electron');
const path = require('path');
const fs = require('fs');

function getStorePath() { return path.join(app.getPath('userData'), 'automation-sketches.json'); }

function readStore() {
  try { return JSON.parse(fs.readFileSync(getStorePath(), 'utf8')); }
  catch { return { sketches: [] }; }
}

function writeStore(data) {
  fs.writeFileSync(getStorePath(), JSON.stringify(data, null, 2));
}

function listSketches() {
  const data = readStore();
  return data.sketches.map(s => ({
    id: s.id, name: s.name, createdAt: s.createdAt, updatedAt: s.updatedAt
  }));
}

function loadSketch(id) {
  const data = readStore();
  return data.sketches.find(s => s.id === id) || null;
}

function saveSketch(sketch) {
  const data = readStore();
  const idx = data.sketches.findIndex(s => s.id === sketch.id);
  sketch.updatedAt = Date.now();
  if (idx >= 0) data.sketches[idx] = sketch;
  else data.sketches.push(sketch);
  writeStore(data);
  return sketch;
}

function deleteSketch(id) {
  const data = readStore();
  data.sketches = data.sketches.filter(s => s.id !== id);
  writeStore(data);
}

function renameSketch(id, name) {
  const data = readStore();
  const s = data.sketches.find(sk => sk.id === id);
  if (s) { s.name = name; s.updatedAt = Date.now(); writeStore(data); }
  return s;
}

module.exports = { listSketches, loadSketch, saveSketch, deleteSketch, renameSketch };
