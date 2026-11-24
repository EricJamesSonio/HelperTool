"""PDF to DOCX conversion helpers."""

import io
import os

from docx import Document
from docx.shared import Inches
from docx.enum.section import WD_SECTION_START
from docx.enum.text import WD_ALIGN_PARAGRAPH

from inspector import MAX_PIXELS, MAX_SCALE, open_pdf
from errors import EngineError


MAX_PAGES = 2000
MAX_RENDER_PIXELS = MAX_PIXELS


def _sanitize_xml_text(value):
    text = "" if value is None else str(value)
    return "".join(
        char for char in text
        if char in "\t\n\r" or ("\u0020" <= char <= "\ud7ff")
        or ("\ue000" <= char <= "\ufffd")
        or ("\U00010000" <= char <= "\U0010ffff")
    )


def _page_preview(page):
    width, height = page.get_size()
    scale = min(MAX_SCALE, 2400.0 / max(width, 1.0))
    while (width * scale) * (height * scale) > MAX_RENDER_PIXELS:
        scale *= 0.8
    pil = page.render(scale=scale).to_pil().convert("RGB")
    buffer = io.BytesIO()
    pil.save(buffer, format="PNG", optimize=True)
    return buffer


def convert_pdf_to_docx(input_path, output_path, progress):
    if not isinstance(input_path, str) or not input_path:
        raise EngineError("INVALID_INPUT", "A PDF path is required.")
    if not isinstance(output_path, str) or not output_path:
        raise EngineError("INVALID_INPUT", "A DOCX output path is required.")
    if os.path.splitext(output_path)[1].lower() != ".docx":
        raise EngineError("INVALID_INPUT", "The output path must use the .docx extension.")

    pdf = open_pdf(input_path)
    try:
        page_count = len(pdf)
        if page_count == 0:
            raise EngineError("UNSUPPORTED_DOCUMENT", "The document has no pages.")
        if page_count > MAX_PAGES:
            raise EngineError("LIMIT_EXCEEDED", "This PDF has %d pages. The limit is %d." % (page_count, MAX_PAGES))

        document = Document()
        section = document.sections[0]
        section.top_margin = Inches(0)
        section.bottom_margin = Inches(0)
        section.left_margin = Inches(0)
        section.right_margin = Inches(0)

        try:
            document.core_properties.title = _sanitize_xml_text(
                os.path.splitext(os.path.basename(input_path))[0]
            )
        except Exception:
            pass

        for index in range(page_count):
            progress("extracting", 5 + int(88 * index / page_count), "Converting page %d of %d" % (index + 1, page_count))
            page = pdf[index]
            try:
                width, height = page.get_size()
                if width <= 0 or height <= 0:
                    raise EngineError("INVALID_PAGE", "Page %d has invalid dimensions." % (index + 1))
                if index > 0:
                    section = document.add_section(WD_SECTION_START.NEW_PAGE)
                    section.top_margin = Inches(0)
                    section.bottom_margin = Inches(0)
                    section.left_margin = Inches(0)
                    section.right_margin = Inches(0)
                section.page_width = Inches(width / 72.0)
                section.page_height = Inches(height / 72.0)
                preview = _page_preview(page)
                preview.seek(0)
                paragraph = document.add_paragraph()
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                paragraph.paragraph_format.space_before = Inches(0)
                paragraph.paragraph_format.space_after = Inches(0)
                paragraph.paragraph_format.line_spacing = 1
                paragraph.add_run().add_picture(
                    preview,
                    width=Inches(width / 72.0),
                    height=Inches(height / 72.0),
                )
            finally:
                page.close()

        progress("writing", 95, "Writing DOCX")
        parent = os.path.dirname(os.path.abspath(output_path))
        if parent:
            os.makedirs(parent, exist_ok=True)
        temp_path = output_path + ".tmp-" + str(os.getpid()) + ".docx"
        try:
            document.save(temp_path)
            os.replace(temp_path, output_path)
        finally:
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
    finally:
        pdf.close()

    progress("completed", 100, "Conversion complete")
    return {
        "outputPath": output_path,
        "pageCount": page_count,
        "warnings": ["Pages are embedded as images to preserve the original PDF appearance; page text is not directly editable."],
    }
