'use strict';

const WEIGHT = { critical: 10, high: 7, medium: 4, low: 2, info: 0 };
const LEVELS = ['basic', 'medium', 'advanced'];

function percent(list) {
  let passed = 0;
  let applicable = 0;
  for (const f of list) {
    if (f.status !== 'pass' && f.status !== 'fail') continue;
    const w = WEIGHT[f.severity] || 0;
    applicable += w;
    if (f.status === 'pass') passed += w;
  }
  return applicable ? Math.round((passed / applicable) * 100) : null;
}

function gradeFor(score) {
  if (score === null) return 'n/a';
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function count(list, status) {
  return list.filter((f) => f.status === status).length;
}

function score(findings) {
  const overall = percent(findings);

  const levels = {};
  let previousAchieved = true;
  for (const id of LEVELS) {
    const list = findings.filter((f) => f.level === id);
    const evaluated = list.filter((f) => f.status === 'pass' || f.status === 'fail');
    const failed = count(list, 'fail');
    const achieved = previousAchieved && evaluated.length > 0 && failed === 0;
    levels[id] = { score: percent(list), passed: count(list, 'pass'), failed, achieved };
    previousAchieved = achieved;
  }

  const names = [];
  for (const f of findings) if (!names.includes(f.category)) names.push(f.category);
  const categories = names.map((name) => {
    const list = findings.filter((f) => f.category === name);
    return { name, score: percent(list), passed: count(list, 'pass'), failed: count(list, 'fail') };
  });

  const failedList = findings.filter((f) => f.status === 'fail');
  const counts = {
    pass: count(findings, 'pass'),
    fail: failedList.length,
    skip: count(findings, 'skip'),
    na: count(findings, 'na'),
    critical: failedList.filter((f) => f.severity === 'critical').length,
    high: failedList.filter((f) => f.severity === 'high').length,
    medium: failedList.filter((f) => f.severity === 'medium').length,
    low: failedList.filter((f) => f.severity === 'low').length,
  };

  return { overall, grade: gradeFor(overall), levels, categories, counts };
}

module.exports = { score };