import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PYTHON = process.platform === 'win32' ? 'python' : 'python3';
const ENGINE_DIR = path.join(process.cwd(), 'pdf-master', 'engine');

function buildPdf(stream) {
  const length = Buffer.byteLength(stream, 'latin1');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${length} >>\nstream\n${stream}\nendstream`,
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
  return pdf;
}

function convert(pdfPath, docxPath) {
  const script = [
    `import sys`,
    `sys.path.insert(0, ${JSON.stringify(ENGINE_DIR)})`,
    `from converter import convert_pdf_to_docx`,
    `print(convert_pdf_to_docx(${JSON.stringify(pdfPath)}, ${JSON.stringify(docxPath)}, lambda s,p,m: None))`,
  ].join('; ');
  return spawnSync(PYTHON, ['-c', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

test('PDF Master XML text sanitizer removes control characters', () => {
  const script = [
    `import sys`,
    `sys.path.insert(0, ${JSON.stringify(ENGINE_DIR)})`,
    `from converter import _sanitize_xml_text`,
    `print(repr(_sanitize_xml_text('Valid\\x00\\x01 text\\nnext')))`,
  ].join('; ');
  const result = spawnSync(PYTHON, ['-c', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "'Valid text\\nnext'");
});

test('PDF Master converter produces editable DOCX text', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpertool-pdfm-'));
  const pdfPath = path.join(dir, 'sample.pdf');
  const docxPath = path.join(dir, 'sample.docx');
  fs.writeFileSync(pdfPath, buildPdf('BT /F1 18 Tf 72 720 Td (PDF conversion test) Tj ET'), 'latin1');

  const converted = convert(pdfPath, docxPath);

  try {
    assert.equal(converted.status, 0, converted.stderr || converted.stdout);
    assert.equal(fs.existsSync(docxPath), true);

    const protocolDocx = path.join(dir, 'protocol.docx');
    const protocol = spawnSync(PYTHON, [
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

    const verify = spawnSync(PYTHON, [
      '-c',
      `from docx import Document; d=Document(${JSON.stringify(docxPath)}); print(len(d.inline_shapes), round(d.sections[0].page_width / 914400, 1), round(d.sections[0].page_height / 914400, 1), repr(' '.join(p.text for p in d.paragraphs)))`,
    ], { encoding: 'utf8' });
    assert.equal(verify.status, 0, verify.stderr);
    assert.match(verify.stdout, /^0 8\.5 11\.0 /);
    assert.match(verify.stdout, /PDF conversion test/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('PDF Master converter keeps the letterhead as an image and the body as text', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helpertool-pdfm-'));
  const pdfPath = path.join(dir, 'letterhead.pdf');
  const docxPath = path.join(dir, 'letterhead.docx');
  const stream = [
    '0 0 0 rg 72 730 40 40 re f',
    'BT /F1 14 Tf 130 752 Td (Header Name) Tj ET',
    'BT /F1 10 Tf 130 736 Td (Header Address) Tj ET',
    'BT /F1 18 Tf 72 500 Td (Body Title) Tj ET',
  ].join('\n');
  fs.writeFileSync(pdfPath, buildPdf(stream), 'latin1');

  const converted = convert(pdfPath, docxPath);

  try {
    assert.equal(converted.status, 0, converted.stderr || converted.stdout);
    const verify = spawnSync(PYTHON, [
      '-c',
      `from docx import Document; d=Document(${JSON.stringify(docxPath)}); h=d.sections[0].header; print(len(h._element.xpath('.//w:drawing')), repr(' '.join(p.text for p in d.paragraphs)))`,
    ], { encoding: 'utf8' });
    assert.equal(verify.status, 0, verify.stderr);
    assert.match(verify.stdout, /^1 .*Body Title/);
    assert.doesNotMatch(verify.stdout, /Header Name/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});