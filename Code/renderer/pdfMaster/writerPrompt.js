/**
 * PDF Writer prompt: builds the instructions that are given to an AI together
 * with the structure of the current PDF.
 */

import { describeLines, isEditable, pageLabel } from './writerModel.js';

const RULES = [
  'You are a document formatter for a PDF Writer tool. I will give you messy notes. Rewrite them into clean, polished text and return it in the exact block format described below. Your reply is machine-parsed, so follow the format strictly.',
  '',
  'RULES',
  '1. Reply with ONLY the blocks, inside ONE plain-text code block. No greeting and no explanations.',
  '2. Use only the section IDs listed below. Output a block only for sections that my notes cover or that I ask you to generate. Sections without a block stay unchanged.',
  '3. Never output blocks for the FIXED sections.',
  '4. Remove my instructions and notes from the text (for example "just image here", "generate me something different", page numbers, separators).',
  '5. Fix spelling, grammar, capitalization and spacing. Keep my meaning. Write in first person in a formal but natural tone.',
  '6. Never invent facts: no new names, dates, companies, tools, numbers or achievements. Use only what my notes say. When something essential is missing write [CONFIRM: what is missing].',
  '7. Where I ask you to generate a section or to make it different from a sample, write new original wording with similar length, structure and tone. Reuse only real people and facts from my notes.',
  '8. Keep each section heading line exactly as shown in the current structure (same numbering and wording) unless my notes say otherwise.',
  '9. Journal sections: write one entry per working day, oldest first, and return exactly the stated number of entries. The entries per week are fixed by the PDF, so when a week lists fewer entries than working days, skip days to fit (those days are my absences). Check that every weekday matches its real calendar date.',
  '10. Journal wording: TASK is a short title of the work done that day. CHALLENGES and LEARNINGS are first person, plain and specific, and stay close to the length of the current cells. Use the work and the routine tasks my notes mention for each day.',
].join('\n');

const FORMAT = [
  'BLOCK FORMAT',
  'Each block starts with [[SECTION: ID]] on its own line and ends with [[END]] on its own line.',
  'Text sections:',
  '- a heading line starts with "# "',
  '- a sub heading starts with "## "',
  '- a bullet starts with "- " and stays on ONE line',
  '- any other line is paragraph text, and a blank line separates paragraphs',
  '- no bold, italics, tables, emojis or other markdown',
  'Fixed layout sections: return exactly the stated number of lines, in the same order, one new text per line. A blank line may separate groups but is not counted. Do not add "# " or "- ".',
  'Journal sections (tables with Date, Specific Task, Challenges and Learnings):',
  '- first the header lines, only the ones I give details for: STUDENT: name, COURSE: year and course, COMPANY: company name, PREPARED: name | role, REVIEWED: name | role',
  '- then exactly the stated number of entries. Each entry starts with [[ROW n]] on its own line, followed by four lines: DATE:, TASK:, CHALLENGES:, LEARNINGS:',
  '- every field stays on ONE line and is plain text',
  '- DATE keeps the format of the current entries, for example Jun. 05, 2025 (THU), with the real weekday of that date',
  '- the pictures of the Documentation column are kept by the tool, never mention them',
  '',
  'Example:',
  '[[SECTION: S2]]',
  '# Heading',
  '',
  'First paragraph.',
  '',
  'Second paragraph.',
  '[[END]]',
  '',
  'Journal example:',
  '[[SECTION: S9]]',
  'STUDENT: Full Name',
  'COURSE: 3 BSCS',
  'COMPANY: Company Name',
  'PREPARED: Full Name | Intern',
  'REVIEWED: Coordinator Name | OJT Coordinator',
  '[[ROW 1]]',
  'DATE: Jun. 05, 2025 (THU)',
  'TASK: Short title of the work',
  'CHALLENGES: One paragraph on one line.',
  'LEARNINGS: One paragraph on one line.',
  '[[END]]',
].join('\n');

function excerpt(text, max) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 3) + '...' : t;
}

function describeJournal(sec) {
  const j = sec.journal;
  let out = '[' + sec.id + '] ' + pageLabel(sec) + ' | journal table | exactly ' + j.rows.length + ' entries';
  out += '\nEntries per week (fixed): ' + j.weeks.map((w) => w.label + ': ' + w.rows).join(', ') + '.';
  const f = j.fields || {};
  const found = [];
  if (f.student) found.push('STUDENT');
  if (f.course) found.push('COURSE');
  if (f.company) found.push('COMPANY');
  if (f.prepared) found.push('PREPARED');
  if (f.reviewed) found.push('REVIEWED');
  if (found.length) {
    out += '\nHeader fields found in the pages: ' + found.join(', ') + '. Output a line for each one I give details for.';
  }
  out += '\nCurrent entries (layout sample only, never reuse their facts):';
  j.rows.slice(0, 3).forEach((row, i) => {
    out += '\n  ' + (i + 1) + '. date "' + excerpt(row.cells[0], 40) + '" | task "' + excerpt(row.cells[1], 60) + '"';
  });
  if (j.rows.length > 3) out += '\n  ... ' + (j.rows.length - 3) + ' more entries';
  out += '\nLongest current cells: task ' + j.maxWords[1] + ' words, challenges ' + j.maxWords[2] + ' words, learnings ' + j.maxWords[3] + ' words. Do not go much beyond these lengths.';
  return out;
}

function describeSection(sec) {
  if (sec.kind === 'journal') return describeJournal(sec);
  if (sec.kind === 'slots') {
    let out = '[' + sec.id + '] ' + pageLabel(sec) + ' | fixed layout | exactly ' + sec.lines.length + ' lines\nCurrent lines:';
    sec.lines.forEach((line, i) => {
      out += '\n  ' + (i + 1) + '. ' + excerpt(line.t, 100);
    });
    return out;
  }
  const items = describeLines(sec.lines, sec.width);
  const words = sec.lines.reduce((sum, l) => sum + l.t.split(/\s+/).filter(Boolean).length, 0);
  let out = '[' + sec.id + '] ' + pageLabel(sec) + ' | text section\nCurrent structure:';
  items.slice(0, 5).forEach((item) => {
    out += '\n  - ' + item.type + (item.lines > 1 ? ' (' + item.lines + ' lines)' : '') + ': "' + excerpt(item.text, 90) + '"';
  });
  if (items.length > 5) out += '\n  - ... ' + (items.length - 5) + ' more items';
  out += '\n  Total: about ' + words + ' words.';
  return out;
}

export function buildPrompt(sections) {
  const editable = sections.filter((s) => isEditable(s));
  const fixed = sections.filter((s) => !isEditable(s));
  const parts = [RULES];
  parts.push(
    'SECTIONS OF THE CURRENT DOCUMENT\n' +
    '(The current content is only a layout sample. Its names, dates and facts are placeholders: never reuse them unless my notes say so.)'
  );
  if (editable.length) {
    editable.forEach((sec) => parts.push(describeSection(sec)));
  } else {
    parts.push('(No editable sections were found.)');
  }
  if (fixed.length) {
    parts.push(
      'FIXED SECTIONS (never output a block for these):\n' +
      fixed.map((s) => '[' + s.id + '] ' + pageLabel(s) + ' | ' + excerpt(s.title, 50)).join('\n')
    );
  }
  parts.push(FORMAT);
  parts.push('MY NOTES (raw, unpolished):\n<paste everything here>');
  return parts.join('\n\n');
}