"""PDF to DOCX conversion helpers.

Each page is rebuilt as real, editable Word content. A letterhead style header
block (logo plus text) found at the top of the first page is kept as an image
and placed in the section header so it acts as the template. Everything below
it is converted to normal paragraphs with fonts, sizes, alignment and spacing.
Pages without selectable text fall back to a full page image.
"""

import ctypes
import io
import os
import re
import statistics
import time
from collections import Counter

from docx import Document
from docx.enum.section import WD_SECTION_START
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.shared import Pt
from PIL import Image, ImageChops, ImageDraw, ImageStat

from inspector import MAX_PIXELS, MAX_SCALE, open_pdf
from errors import EngineError

try:
    import pypdfium2.raw as pdfium_c
except Exception:
    pdfium_c = None


MAX_PAGES = 2000
MAX_RENDER_PIXELS = MAX_PIXELS
HEADER_PROBE_PAGES = 6
HEADER_VERIFY_PAGES = 14
HEADER_MIN_REPEATS = 2
HEADER_MIN_DARK = 1.0
HEADER_REL_TOLERANCE = 0.35

HEADER_RENDER_SCALE = 3.0
HEADER_GAP_PT = 28.0
HEADER_MAX_FRACTION = 0.3
HEADER_FIRST_LINE_FRACTION = 0.2
HEADER_MATCH_DIFF = 8.0
INK_LEVEL = 235
MIN_TEXT_CHARS = 3
BASELINE_RATIO = 0.8

_SUBSET = re.compile(r"^[A-Z]{6}\+")
_CAMEL = re.compile(r"(?<=[a-z])(?=[A-Z])")
_SUFFIX = re.compile(r"(PSMT|MT|PS)$")
_BOLD_NAME = re.compile(r"bold|black|heavy", re.I)
_ITALIC_NAME = re.compile(r"italic|oblique", re.I)


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


def _render_image(page, width, height):
    scale = min(MAX_SCALE, HEADER_RENDER_SCALE)
    while (width * scale) * (height * scale) > MAX_RENDER_PIXELS:
        scale *= 0.8
    image = page.render(scale=scale).to_pil().convert("RGB")
    return image, scale


def _family_from_name(raw):
    name = _SUBSET.sub("", raw or "").strip()
    if not name:
        return ""
    base = re.split(r"[-,]", name)[0]
    base = _SUFFIX.sub("", base)
    base = _CAMEL.sub(" ", base)
    return base.strip()


def _font_info(textpage, index):
    raw_name = ""
    italic_flag = False
    weight = -1
    if pdfium_c is not None:
        try:
            buffer = ctypes.create_string_buffer(256)
            flags = ctypes.c_int(0)
            length = pdfium_c.FPDFText_GetFontInfo(textpage.raw, index, buffer, 256, ctypes.byref(flags))
            if length and length > 0:
                raw_name = buffer.value.decode("latin-1", "ignore")
            italic_flag = bool(flags.value & 0x40)
        except Exception:
            raw_name = ""
        try:
            weight = int(pdfium_c.FPDFText_GetFontWeight(textpage.raw, index))
        except Exception:
            weight = -1
    family = _family_from_name(raw_name)
    bold = weight >= 600 or bool(_BOLD_NAME.search(raw_name))
    italic = italic_flag or bool(_ITALIC_NAME.search(raw_name))
    return family, bold, italic


def _font_size(textpage, index, loose_height):
    size = 0.0
    if pdfium_c is not None:
        try:
            size = float(pdfium_c.FPDFText_GetFontSize(textpage.raw, index))
        except Exception:
            size = 0.0
    estimate = loose_height / 1.2 if loose_height > 0 else 0.0
    if size <= 0 or size > 400:
        return estimate
    if estimate > 0:
        ratio = estimate / size
        if ratio < 0.6 or ratio > 1.6:
            return estimate
    return size


def _extract_chars(page):
    textpage = page.get_textpage()
    try:
        count = textpage.count_chars()
        if count <= 0:
            return []
        text = textpage.get_text_range(0, count)
        per_char = len(text) != count
        chars = []
        for index in range(count):
            if per_char:
                ch = (textpage.get_text_range(index, 1) or "")[:1]
            else:
                ch = text[index]
            if not ch or ch in "\r\n\x00\ufffe\uffff" or ch.isspace():
                continue
            try:
                left, bottom, right, top = textpage.get_charbox(index)
            except Exception:
                continue
            try:
                loose = textpage.get_charbox(index, loose=True)
            except Exception:
                loose = (left, bottom, right, top)
            if right - left <= 0 or top - bottom <= 0:
                continue
            family, bold, italic = _font_info(textpage, index)
            size = _font_size(textpage, index, loose[3] - loose[1])
            if size < 1.0:
                size = max(top - bottom, 1.0)
            size = round(size * 2.0) / 2.0
            chars.append({
                "ch": ch,
                "l": left,
                "r": right,
                "b": bottom,
                "t": top,
                "size": size,
                "style": (family, bold, italic, size),
            })
        return chars
    finally:
        textpage.close()


def _finish_line(group):
    chars = sorted(group["chars"], key=lambda c: c["l"])
    sizes = Counter(c["size"] for c in chars)
    size = sizes.most_common(1)[0][0]
    baseline = statistics.median(c["bot"] for c in chars)
    tokens = []
    previous = None
    for char in chars:
        if previous is not None:
            if char["ch"] == previous["ch"] and abs(char["l"] - previous["l"]) < 0.2 * char["size"]:
                continue
            gap = char["l"] - previous["r"]
            if gap > 3.0 * char["size"]:
                tokens.append({"text": "\t", "style": previous["style"], "tab_x": char["l"]})
            elif gap > 0.18 * char["size"]:
                tokens.append({"text": " ", "style": previous["style"], "tab_x": None})
        tokens.append({"text": char["ch"], "style": char["style"], "tab_x": None})
        previous = char
    return {
        "l": min(c["l"] for c in chars),
        "r": max(c["r"] for c in chars),
        "top": group["top"],
        "bottom": group["bot"],
        "baseline": baseline,
        "size": size,
        "tokens": tokens,
        "text": "".join(t["text"] for t in tokens),
        "has_tab": any(t["tab_x"] is not None for t in tokens),
    }


def _build_lines(chars, page_height):
    for char in chars:
        char["top"] = page_height - char["t"]
        char["bot"] = page_height - char["b"]
    ordered = sorted(chars, key=lambda c: (c["top"], c["l"]))
    groups = []
    for char in ordered:
        center = (char["top"] + char["bot"]) / 2.0
        best = None
        best_distance = None
        for group in groups[-8:]:
            group_center = (group["top"] + group["bot"]) / 2.0
            inside = group["top"] <= center <= group["bot"]
            contains = char["top"] <= group_center <= char["bot"]
            if inside or contains:
                distance = abs(center - group_center)
                if best is None or distance < best_distance:
                    best = group
                    best_distance = distance
        if best is None:
            groups.append({"top": char["top"], "bot": char["bot"], "chars": [char]})
        else:
            best["chars"].append(char)
            best["top"] = min(best["top"], char["top"])
            best["bot"] = max(best["bot"], char["bot"])
    lines = [_finish_line(group) for group in groups]
    lines = [line for line in lines if line["text"].strip()]
    lines.sort(key=lambda line: line["baseline"])
    return lines


def _page_lines(page, height):
    return _build_lines(_extract_chars(page), height)


def _resampling():
    return getattr(Image, "Resampling", Image).BILINEAR


def _header_signature(image, bottom_px):
    width = image.size[0]
    band = image.crop((0, 0, width, bottom_px)).convert("L")
    return band.resize((240, max(1, int(bottom_px * 240.0 / width))), _resampling())


def _signature_dark(signature):
    return ImageStat.Stat(ImageChops.invert(signature)).mean[0]


def _detect_header(lines, image, scale, width, height):
    if not lines:
        return None
    if lines[0]["top"] > height * HEADER_FIRST_LINE_FRACTION:
        return None
    count = 0
    for index, line in enumerate(lines):
        if index > 0:
            gap = line["top"] - lines[index - 1]["bottom"]
            if gap > max(HEADER_GAP_PT, 2.2 * line["size"]):
                count = index
                break
        if line["top"] > height * HEADER_MAX_FRACTION:
            return None
    if count == 0:
        return None
    header_lines = lines[:count]
    image_width, image_height = image.size
    body_top_px = int(lines[count]["top"] * scale)
    text_bottom_px = int(max(line["bottom"] for line in header_lines) * scale)
    gray = image.convert("L")
    mask = gray.point(lambda p: 255 if p < INK_LEVEL else 0)
    rows = mask.getprojection()[1]
    y = min(max(text_bottom_px, 0), image_height - 1)
    limit = max(min(body_top_px, image_height) - 1, y)
    while y < limit and rows[y]:
        y += 1
    pad = max(4, int(2 * scale))
    bottom_px = min(y + pad, body_top_px - 1, image_height)
    if bottom_px <= 0:
        return None
    band_mask = mask.crop((0, 0, image_width, bottom_px))
    draw = ImageDraw.Draw(band_mask)
    margin_px = int(3 * scale)
    for line in header_lines:
        draw.rectangle(
            [
                line["l"] * scale - margin_px,
                line["top"] * scale - margin_px,
                line["r"] * scale + margin_px,
                line["bottom"] * scale + margin_px,
            ],
            fill=0,
        )
    ink = band_mask.histogram()[255]
    if ink < 0.002 * image_width * bottom_px:
        return None
    buffer = io.BytesIO()
    image.crop((0, 0, image_width, bottom_px)).save(buffer, format="PNG", optimize=True)
    signature = _header_signature(image, bottom_px)
    return {
        "png": buffer.getvalue(),
        "bottom_px": bottom_px,
        "bottom_pt": bottom_px / scale,
        "width": width,
        "height": height,
        "image_width": image_width,
        "signature": signature,
        "dark": _signature_dark(signature),
    }


def _header_matches(header, image):
    if image.size[0] != header["image_width"] or image.size[1] < header["bottom_px"]:
        return False
    dark = header.get("dark", 0.0)
    if dark < HEADER_MIN_DARK:
        return False
    signature = _header_signature(image, header["bottom_px"])
    if signature.size != header["signature"].size:
        return False
    diff = ImageChops.difference(signature, header["signature"])
    tolerance = min(HEADER_MATCH_DIFF, HEADER_REL_TOLERANCE * dark)
    return ImageStat.Stat(diff).mean[0] <= tolerance


def _header_repeats(pdf, header, skip_index, page_count):
    limit = min(page_count, HEADER_VERIFY_PAGES)
    needed = min(HEADER_MIN_REPEATS, limit - 1)
    if needed <= 0:
        return False
    found = 0
    for index in range(limit):
        if index == skip_index:
            continue
        page = pdf[index]
        try:
            width, height = page.get_size()
            if abs(width - header["width"]) > 1.0 or abs(height - header["height"]) > 1.0:
                continue
            image, _scale = _render_image(page, width, height)
            if _header_matches(header, image):
                found += 1
        except Exception:
            continue
        finally:
            page.close()
        if found >= needed:
            return True
    return False


def _find_header_reference(pdf, page_count):
    for probe_index in range(min(page_count, HEADER_PROBE_PAGES)):
        candidate = None
        probe_page = pdf[probe_index]
        try:
            probe_width, probe_height = probe_page.get_size()
            probe_lines = _page_lines(probe_page, probe_height)
            if probe_lines and probe_lines[0]["top"] <= probe_height * HEADER_FIRST_LINE_FRACTION:
                probe_image, probe_scale = _render_image(probe_page, probe_width, probe_height)
                candidate = _detect_header(probe_lines, probe_image, probe_scale, probe_width, probe_height)
        except Exception:
            candidate = None
        finally:
            probe_page.close()
        if candidate is None:
            continue
        if _header_repeats(pdf, candidate, probe_index, page_count):
            return candidate
    return None


def _resolve_header(page, lines, width, height, index, reference):
    try:
        if reference is None:
            return None
        if abs(width - reference["width"]) > 1.0 or abs(height - reference["height"]) > 1.0:
            return None
        image, scale = _render_image(page, width, height)
        if _header_matches(reference, image):
            return reference
    except Exception:
        return None
    return None


def _line_kind(line, width, margin, body_w, block_center=None, left_edges=None):
    center = (line["l"] + line["r"]) / 2.0
    offset = line["l"] - margin
    tolerance = max(4.0, 0.012 * width)
    if offset > 0.04 * body_w:
        if abs(center - width / 2.0) <= tolerance:
            return "center"
        if block_center is not None and not line["has_tab"] and abs(center - block_center) <= tolerance:
            on_edge = False
            if left_edges:
                hits = sum(count for edge, count in left_edges.items() if abs(edge - line["l"]) <= 1.5)
                on_edge = hits >= 3
            if not on_edge:
                return "center"
    if offset > 0.25 * body_w and (width - margin - line["r"]) <= max(4.0, 0.01 * width):
        return "right"
    return "left"


def _try_merge(para, line, kind, body_w, text_right):
    if kind != "left" or para["kind"] != "left":
        return False
    last = para["lines"][-1]
    if last["has_tab"] or line["has_tab"]:
        return False
    if abs(last["size"] - line["size"]) > 0.6:
        return False
    size = last["size"]
    delta = line["baseline"] - last["baseline"]
    if delta < 0.9 * size or delta > 1.7 * size:
        return False
    if last["r"] < text_right - max(0.12 * body_w, 2.0 * size):
        return False
    if len(para["lines"]) >= 2:
        if abs(line["l"] - para["left"]) > 0.6 * size:
            return False
        previous_delta = last["baseline"] - para["lines"][-2]["baseline"]
        if abs(delta - previous_delta) > 0.35 * size:
            return False
    else:
        diff = last["l"] - line["l"]
        if abs(diff) <= 0.6 * size:
            pass
        elif 0.6 * size < diff <= 8.0 * size:
            para["left"] = line["l"]
        else:
            return False
    para["lines"].append(line)
    return True


def _finish_paragraph(para):
    lines = para["lines"]
    size = lines[0]["size"]
    if len(lines) > 1:
        deltas = [lines[i]["baseline"] - lines[i - 1]["baseline"] for i in range(1, len(lines))]
        pitch = statistics.median(deltas)
    else:
        pitch = size * 1.15
    pitch = min(max(pitch, size * 1.1), 400.0)
    para["pitch"] = pitch
    para["desired_top"] = lines[0]["baseline"] - BASELINE_RATIO * pitch
    tokens = []
    for position, line in enumerate(lines):
        tokens.extend(line["tokens"])
        if position < len(lines) - 1:
            next_text = lines[position + 1]["text"]
            hyphenated = line["text"].endswith("-") and next_text[:1].islower()
            if not hyphenated:
                tokens.append({"text": " ", "style": line["tokens"][-1]["style"], "tab_x": None})
    runs = []
    tabs = []
    for token in tokens:
        if token["tab_x"] is not None:
            tabs.append(token["tab_x"])
        if runs and runs[-1][1] == token["style"]:
            runs[-1][0] += token["text"]
        else:
            runs.append([token["text"], token["style"]])
    para["runs"] = runs
    para["tabs"] = tabs


def _group_paragraphs(body, width, margin, body_w, text_right):
    block_center = None
    left_edges = Counter()
    if body:
        block_center = (min(line["l"] for line in body) + max(line["r"] for line in body)) / 2.0
        for line in body:
            left_edges[int(round(line["l"]))] += 1
    paragraphs = []
    for line in body:
        kind = _line_kind(line, width, margin, body_w, block_center, left_edges)
        if paragraphs and _try_merge(paragraphs[-1], line, kind, body_w, text_right):
            continue
        paragraphs.append({
            "kind": kind,
            "lines": [line],
            "left": line["l"],
            "first_left": line["l"],
        })
    for para in paragraphs:
        _finish_paragraph(para)
    return paragraphs


def _plan_page(lines, width, height, header):
    body = [line for line in lines if header is None or line["baseline"] > header["bottom_pt"]]
    if body:
        min_left = min(line["l"] for line in body)
        max_right = max(line["r"] for line in body)
        margin = max(0.0, min(min(min_left, width - max_right), width * 0.4))
    else:
        margin = 36.0
    body_w = max(width - 2.0 * margin, 1.0)
    text_right = width - margin
    paragraphs = _group_paragraphs(body, width, margin, body_w, text_right)
    if header is not None:
        top_margin = header["bottom_pt"] + 1.0
    elif paragraphs:
        top_margin = max(0.0, paragraphs[0]["desired_top"])
    else:
        top_margin = 36.0
    if body:
        max_bottom = max(line["bottom"] for line in body)
        bottom_margin = max(14.0, min(72.0, height - max_bottom - 6.0))
    else:
        bottom_margin = 36.0
    return {
        "margin": margin,
        "top_margin": top_margin,
        "bottom_margin": bottom_margin,
        "paragraphs": paragraphs,
    }


def _plan_for_page(page, width, height, index, reference):
    try:
        lines = _page_lines(page, height)
    except Exception:
        return None, None
    if sum(len(line["text"]) for line in lines) < MIN_TEXT_CHARS:
        return None, None
    try:
        header = _resolve_header(page, lines, width, height, index, reference)
        return _plan_page(lines, width, height, header), header
    except Exception:
        return None, None


def _set_header(section, header, margin_pt):
    header_part = section.header
    header_part.is_linked_to_previous = False
    paragraph = header_part.paragraphs[0]
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt(0)
    fmt.space_after = Pt(0)
    if header is None:
        fmt.line_spacing = Pt(1)
        fmt.line_spacing_rule = WD_LINE_SPACING.EXACTLY
        return
    fmt.line_spacing = 1.0
    fmt.left_indent = Pt(-margin_pt)
    fmt.right_indent = Pt(-margin_pt)
    paragraph.add_run().add_picture(
        io.BytesIO(header["png"]),
        width=Pt(header["width"]),
        height=Pt(header["bottom_pt"]),
    )


def _shrink_last_paragraph(document):
    paragraph = document.paragraphs[-1]
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt(0)
    fmt.space_after = Pt(0)
    fmt.line_spacing = Pt(1)
    fmt.line_spacing_rule = WD_LINE_SPACING.EXACTLY


def _add_spacer(document):
    paragraph = document.add_paragraph()
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt(0)
    fmt.space_after = Pt(0)
    fmt.line_spacing = Pt(1)
    fmt.line_spacing_rule = WD_LINE_SPACING.EXACTLY


def _add_text_paragraph(document, para, margin, cursor):
    pitch = para["pitch"]
    space_before = max(0.0, min(1500.0, para["desired_top"] - cursor))
    paragraph = document.add_paragraph()
    fmt = paragraph.paragraph_format
    fmt.space_before = Pt(space_before)
    fmt.space_after = Pt(0)
    fmt.line_spacing = Pt(pitch)
    fmt.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    kind = para["kind"]
    first = para["lines"][0]
    if kind == "center":
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        line_center = (first["l"] + first["r"]) / 2.0
        area_center = (margin + para["right_edge"]) / 2.0
        if abs(line_center - area_center) > 1.0:
            half = (first["r"] - first["l"]) / 2.0 + 14.0
            fmt.left_indent = Pt(line_center - half - margin)
            fmt.right_indent = Pt(para["right_edge"] - (line_center + half))
    elif kind == "right":
        paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        fmt.right_indent = Pt(max(0.0, para["right_edge"] - first["r"]))
    else:
        paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
        left_indent = max(0.0, para["left"] - margin)
        if left_indent > 1.0:
            fmt.left_indent = Pt(left_indent)
        first_indent = para["first_left"] - para["left"]
        if first_indent > 1.0:
            fmt.first_line_indent = Pt(first_indent)
        if len(para["lines"]) == 1:
            fmt.right_indent = Pt(-min(margin, 18.0))
    for tab_x in para["tabs"]:
        fmt.tab_stops.add_tab_stop(Pt(max(0.0, tab_x - margin)))
    for text, style in para["runs"]:
        run = paragraph.add_run(_sanitize_xml_text(text))
        family, bold, italic, size = style
        if family:
            run.font.name = family
        run.font.size = Pt(size)
        run.font.bold = bool(bold)
        run.font.italic = bool(italic)
    return max(cursor, para["desired_top"]) + pitch * len(para["lines"])


def _fill_image_page(document, section, page, width, height):
    section.left_margin = Pt(0)
    section.right_margin = Pt(0)
    section.top_margin = Pt(0)
    section.bottom_margin = Pt(0)
    _set_header(section, None, 0.0)
    preview = _page_preview(page)
    preview.seek(0)
    paragraph = document.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.line_spacing = 1
    paragraph.add_run().add_picture(preview, width=Pt(width), height=Pt(height))


def _save_document(document, output_path):
    temp_path = output_path + ".tmp-" + str(os.getpid()) + ".docx"
    try:
        document.save(temp_path)
        for attempt in range(6):
            try:
                os.replace(temp_path, output_path)
                return
            except PermissionError:
                time.sleep(0.3 * (attempt + 1))
        try:
            document.save(output_path)
            return
        except PermissionError:
            pass
        raise EngineError(
            "OUTPUT_LOCKED",
            "The output file is in use or protected. Close it in Word, or choose a different file name, then try again.",
        )
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


def convert_pdf_to_docx(input_path, output_path, progress):
    if not isinstance(input_path, str) or not input_path:
        raise EngineError("INVALID_INPUT", "A PDF path is required.")
    if not isinstance(output_path, str) or not output_path:
        raise EngineError("INVALID_INPUT", "A DOCX output path is required.")
    if os.path.splitext(output_path)[1].lower() != ".docx":
        raise EngineError("INVALID_INPUT", "The output path must use the .docx extension.")

    pdf = open_pdf(input_path)
    image_pages = []
    header_pages = 0
    try:
        page_count = len(pdf)
        if page_count == 0:
            raise EngineError("UNSUPPORTED_DOCUMENT", "The document has no pages.")
        if page_count > MAX_PAGES:
            raise EngineError("LIMIT_EXCEEDED", "This PDF has %d pages. The limit is %d." % (page_count, MAX_PAGES))

        document = Document()

        try:
            document.core_properties.title = _sanitize_xml_text(
                os.path.splitext(os.path.basename(input_path))[0]
            )
        except Exception:
            pass

        progress("template", 3, "Detecting the page template")
        header_reference = _find_header_reference(pdf, page_count)

        for index in range(page_count):
            progress("extracting", 5 + int(88 * index / page_count), "Converting page %d of %d" % (index + 1, page_count))
            page = pdf[index]
            try:
                width, height = page.get_size()
                if width <= 0 or height <= 0:
                    raise EngineError("INVALID_PAGE", "Page %d has invalid dimensions." % (index + 1))
                if index > 0:
                    section = document.add_section(WD_SECTION_START.NEW_PAGE)
                    _shrink_last_paragraph(document)
                else:
                    section = document.sections[0]
                section.page_width = Pt(width)
                section.page_height = Pt(height)
                section.header_distance = Pt(0)
                section.footer_distance = Pt(0)

                plan, header = _plan_for_page(page, width, height, index, header_reference)

                if plan is None:
                    image_pages.append(index + 1)
                    _fill_image_page(document, section, page, width, height)
                    continue

                section.left_margin = Pt(plan["margin"])
                section.right_margin = Pt(plan["margin"])
                section.top_margin = Pt(plan["top_margin"])
                section.bottom_margin = Pt(plan["bottom_margin"])
                _set_header(section, header, plan["margin"])
                if header is not None:
                    header_pages += 1

                cursor = plan["top_margin"]
                for para in plan["paragraphs"]:
                    para["right_edge"] = width - plan["margin"]
                    cursor = _add_text_paragraph(document, para, plan["margin"], cursor)
                if not plan["paragraphs"]:
                    _add_spacer(document)
            finally:
                page.close()

        progress("writing", 95, "Writing DOCX")
        parent = os.path.dirname(os.path.abspath(output_path))
        if parent:
            os.makedirs(parent, exist_ok=True)
        _save_document(document, output_path)
    finally:
        pdf.close()

    warnings = []
    if header_pages:
        warnings.append("The letterhead header (logo and title block) is kept as an image in the page header. All text below it is editable Word text.")
    else:
        warnings.append("No image header was detected, so all page text was converted to editable Word text.")
    warnings.append("Pictures, lines and text colors in the page body are not carried over.")
    if image_pages:
        shown = ", ".join(str(number) for number in image_pages[:10])
        if len(image_pages) > 10:
            shown += " and %d more" % (len(image_pages) - 10)
        warnings.append("Pages without selectable text were kept as images: %s." % shown)

    progress("completed", 100, "Conversion complete")
    return {
        "outputPath": output_path,
        "pageCount": page_count,
        "warnings": warnings,
    }