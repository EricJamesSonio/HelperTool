'use strict';

const fs = require('fs');
const path = require('path');
const markdownReport = require('./markdownReport');

const DIR_NAME = '.security';
const NAME_RE = /^result(\d+)\.md$/i;

function nextNumber(dir) {
  let max = 0;
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    names = [];
  }
  for (const name of names) {
    const match = NAME_RE.exec(name);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return max + 1;
}

function reserve(dir) {
  let number = nextNumber(dir);
  for (let tries = 0; tries < 50; tries += 1) {
    const name = 'result' + number + '.md';
    try {
      const fd = fs.openSync(path.join(dir, name), 'wx');
      return { name, fd };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    number += 1;
  }
  throw new Error('Could not pick a free result file name in ' + DIR_NAME + '.');
}

function save(repoPath, report) {
  const dir = path.join(repoPath, DIR_NAME);
  fs.mkdirSync(dir, { recursive: true });
  const ignoreFile = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignoreFile)) fs.writeFileSync(ignoreFile, '*\n', 'utf8');

  const slot = reserve(dir);
  const relative = DIR_NAME + '/' + slot.name;
  try {
    report.savedFile = relative;
    report.markdown = markdownReport.build(report);
    fs.writeSync(slot.fd, report.markdown);
  } catch (e) {
    try {
      fs.closeSync(slot.fd);
      fs.unlinkSync(path.join(dir, slot.name));
    } catch (inner) {
      /* the empty file could not be removed */
    }
    throw e;
  }
  fs.closeSync(slot.fd);
  return relative;
}

module.exports = { save, DIR_NAME };