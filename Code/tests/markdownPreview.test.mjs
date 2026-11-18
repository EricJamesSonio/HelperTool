import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadModuleCopy } from './helpers.mjs';

describe('IDE Markdown preview', () => {
  it('renders GitHub-style headings, inline text, code blocks, lists, and tables', async () => {
    const { renderMarkdown } = await loadModuleCopy('renderer/ideMode/markdownPreview.js');
    const html = renderMarkdown([
      '# Commands Reference',
      '',
      'Use **npm install** and `npm run build`.',
      '',
      '```bash',
      'npm install',
      '```',
      '',
      '- [x] Dependencies',
      '- [ ] Build',
      '',
      '| Name | Value |',
      '| --- | ---: |',
      '| App | Helper Tool |',
    ].join('\n'));

    assert.ok(html.includes('<h1>Commands Reference</h1>'));
    assert.ok(html.includes('<strong>npm install</strong>'));
    assert.ok(html.includes('<code>npm run build</code>'));
    assert.ok(html.includes('<pre><code class="language-bash">npm install</code></pre>'));
    assert.ok(html.includes('<input type="checkbox" disabled checked>'));
    assert.ok(html.includes('<table><thead>'));
    assert.ok(html.includes('style="text-align:right"'));
  });

  it('escapes raw HTML and excludes unsafe link schemes', async () => {
    const { renderMarkdown } = await loadModuleCopy('renderer/ideMode/markdownPreview.js');
    const html = renderMarkdown('<script>alert(1)</script>\n\n[bad](javascript:alert(1)) [good](https://example.com)');

    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('href="javascript:'));
    assert.ok(html.includes('href="https://example.com"'));
  });
});
