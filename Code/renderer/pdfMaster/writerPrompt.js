/**
 * PDF Writer prompt: builds the instructions that are given to an AI together
 * with the structure of the current PDF.
 */

import { describeLines, pageLabel } from './writerModel.js';

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
  '',
  'Example:',
  '[[SECTION: S2]]',
  '# Heading',
  '',
  'First paragraph.',
  '',
  'Second paragraph.',
  '[[END]]',
].join('\n');

function excerpt(text, max) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 3) + '...' : t;
}

function describeSection(sec) {
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
  const editable = sections.filter((s) => s.kind === 'flow' || s.kind === 'slots');
  const fixed = sections.filter((s) => s.kind !== 'flow' && s.kind !== 'slots');
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