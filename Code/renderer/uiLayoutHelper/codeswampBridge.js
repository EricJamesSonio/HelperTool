import { parseAndRender } from './dslParser.js';

export function renderLayoutBlock(dsl) {
  const result = parseAndRender(dsl);
  if (!result.valid) return null;
  return result.output;
}

export function tryExtractAndRender(text) {
  const blockRegex = /```layout\s*([\s\S]*?)```/g;
  let match;
  const results = [];

  while ((match = blockRegex.exec(text)) !== null) {
    try {
      const dsl = JSON.parse(match[1].trim());
      const rendered = renderLayoutBlock(dsl);
      if (rendered) results.push(rendered);
    } catch {
      // silently skip invalid layout blocks
    }
  }

  return results;
}
