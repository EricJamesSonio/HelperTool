import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('PDF Master XML text sanitizer removes control characters', () => {
  const engineDir = path.join(process.cwd(), 'pdf-master', 'engine');
  const script = [
    `import sys`,
    `sys.path.insert(0, ${JSON.stringify(engineDir)})`,
    `from converter import _sanitize_xml_text`,
    `print(repr(_sanitize_xml_text('Valid\\x00\\x01 text\\nnext')))`,
  ].join('; ');
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "'Valid text\\nnext'");
});

test('PDF Master converter preserves each page as a full-page DOCX image', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpertool-pdfm-'));
  const pdfPath = path.join(dir, 'sample.pdf');
  const docxPath = path.join(dir, 'sample.docx');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length 58 >>\nstream\nBT /F1 18 Tf 72 720 Td (PDF conversion test) Tj ET\nendstream',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  fs.writeFileSync(pdfPath, pdf, 'latin1');

  const engineDir = path.join(process.cwd(), 'pdf-master', 'engine');
  const script = [
    `import sys`,
    `sys.path.insert(0, ${JSON.stringify(engineDir)})`,
    `from converter import convert_pdf_to_docx`,
    `print(convert_pdf_to_docx(${JSON.stringify(pdfPath)}, ${JSON.stringify(docxPath)}, lambda s,p,m: None))`,
  ].join('; ');
  const converted = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  try {
    assert.equal(converted.status, 0, converted.stderr || converted.stdout);
    assert.equal(fs.existsSync(docxPath), true);

    const protocolDocx = path.join(dir, 'protocol.docx');
    const protocol = spawnSync(process.platform === 'win32' ? 'python' : 'python3', [
      path.join(process.cwd(), 'pdf-master', 'engine', 'main.py'),
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      input: JSON.stringify({
        type: 'request',
        requestId: 'test-request',
        operation: 'convert_pdf_to_docx',
        payload: { inputPath: pdfPath, outputPath: protocolDocx },
      }) + '\n',
    });
    assert.equal(protocol.status, 0, protocol.stderr);
    assert.match(protocol.stdout, /"status":"completed"/);
    assert.equal(fs.existsSync(protocolDocx), true);

    const verify = spawnSync(process.platform === 'win32' ? 'python' : 'python3', [
      '-c',
      `from docx import Document; d=Document(${JSON.stringify(docxPath)}); print(len(d.inline_shapes), round(d.sections[0].page_width / 914400, 1), round(d.sections[0].page_height / 914400, 1), repr(' '.join(p.text for p in d.paragraphs)))`,
    ], { encoding: 'utf8' });
    assert.equal(verify.status, 0, verify.stderr);
    assert.match(verify.stdout, /^1 8\.5 11\.0 /);
    assert.doesNotMatch(verify.stdout, /PDF conversion test/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
