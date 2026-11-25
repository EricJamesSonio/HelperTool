"""PDF Writer engine.

analyze_pdf reads every page, separates the repeated template (letterhead
header and page numbers) from the page content and reports the content as
structured lines.

write_pdf rebuilds chosen page ranges from replacement text using the original
layout (fonts, margins, line spacing) and keeps every other page untouched.
The source file is never modified in place; the result is written to a
temporary file and then moved to the target.
"""

import ctypes
import io
import os
import re
import statistics
import time
from collections import Counter

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c

from converter import _detect_header, _page_lines, _render_image
from errors import EngineError
from inspector import open_pdf

MAX_PAGES = 2000
MAX_ITEMS = 5000
MAX_TEXT = 20000
FOOTER_ZONE = 0.86
PROBE_PAGES = 6
HEAD_LINES = 14
ITEM_TYPES = ("h1", "h2", "p", "b")
TOC_ENTRY = re.compile(r"^([IVXLC]+)\.\s*(.+)$")

WIN_FONTS = {
    "cambria": ("cambria.ttc", "cambriab.ttf", "cambriai.ttf", "cambriaz.ttf"),
    "times new roman": ("times.ttf", "timesbd.ttf", "timesi.ttf", "timesbi.ttf"),
    "arial": ("arial.ttf", "arialbd.ttf", "ariali.ttf", "arialbi.ttf"),
    "calibri": ("calibri.ttf", "calibrib.ttf", "calibrii.ttf", "calibriz.ttf"),
    "georgia": ("georgia.ttf", "georgiab.ttf", "georgiai.ttf", "georgiaz.ttf"),
    "verdana": ("verdana.ttf", "verdanab.ttf", "verdanai.ttf", "verdanaz.ttf"),
    "segoe ui": ("segoeui.ttf", "segoeuib.ttf", "segoeuii.ttf", "segoeuiz.ttf"),
    "tahoma": ("tahoma.ttf", "tahomabd.ttf", "", ""),
}


def _r(value):
    return round(float(value), 1)


def _plain(line):
    return line["text"].replace("\t", " ")


def _norm(text):
    return re.sub(r"[^a-z0-9]", "", str(text).lower())


def _median(values, default):
    return statistics.median(values) if values else default
_CENTER_TOL = 8.0


def _line_center(line):
    return (line["l"] + line["r"]) / 2.0


def _infer_center(lines):
    """Finds the common center of centered lines. It is not always the page
    center because documents often have unequal left and right margins."""
    centers = [_line_center(line) for line in lines]
    best = None
    best_count = 0
    for c in centers:
        count = sum(1 for other in centers if abs(other - c) <= 3.0)
        if count > best_count:
            best = c
            best_count = count
    if best is None or best_count < 3 or best_count < 0.4 * len(centers):
        return None
    members = [other for other in centers if abs(other - best) <= 3.0]
    return sum(members) / len(members)


def _match_center(line, refs):
    center = _line_center(line)
    found = None
    for ref in refs:
        if ref is None:
            continue
        distance = abs(center - ref)
        if distance <= _CENTER_TOL and (found is None or distance < found[0]):
            found = (distance, ref)
    return found[1] if found else None


def _line_style(line):
    weights = Counter()
    for token in line["tokens"]:
        weights[token["style"]] += max(len(token["text"]), 1)
    family, bold, italic, _size = weights.most_common(1)[0][0]
    return {
        "family": family or "",
        "bold": bool(bold),
        "italic": bool(italic),
        "size": float(line["size"]),
    }


def _is_page_number(line, height):
    text = _plain(line).strip()
    return bool(re.fullmatch(r"\d{1,4}", text)) and line["baseline"] > height * FOOTER_ZONE


def _split_lines(lines, header, height):
    body = []
    footer = []
    for line in lines:
        if _is_page_number(line, height):
            footer.append(line)
        elif header is not None and line["baseline"] <= header["bottom_pt"]:
            continue
        else:
            body.append(line)
    return body, footer


def _detect_template(pdf):
    for index in range(min(len(pdf), PROBE_PAGES)):
        page = pdf[index]
        try:
            width, height = page.get_size()
            lines = _page_lines(page, height)
            if not lines or lines[0]["top"] > height * 0.2:
                continue
            image, scale = _render_image(page, width, height)
            header = _detect_header(lines, image, scale, width, height)
            if header is not None:
                return header, index
        except Exception:
            continue
        finally:
            page.close()
    return None, -1


def _content_images(page, width, height, header):
    limit = header["bottom_pt"] if header is not None else height * 0.12
    count = 0
    try:
        for obj in page.get_objects(max_depth=15):
            if obj.type != pdfium_c.FPDF_PAGEOBJ_IMAGE:
                continue
            try:
                left, bottom, right, top = obj.get_pos()
            except Exception:
                continue
            center = height - (bottom + top) / 2.0
            if center > limit:
                count += 1
    except Exception:
        pass
    return count


def _footer_info(line):
    return {
        "n": int(_plain(line).strip()),
        "l": _r(line["l"]),
        "r": _r(line["r"]),
        "top": _r(line["top"]),
        "bottom": _r(line["bottom"]),
        "base": _r(line["baseline"]),
        "size": _r(line["size"]),
    }


def _serialize(line):
    style = _line_style(line)
    return {
        "t": _plain(line).strip(),
        "top": _r(line["top"]),
        "base": _r(line["baseline"]),
        "l": _r(line["l"]),
        "r": _r(line["r"]),
        "size": _r(line["size"]),
        "bold": style["bold"],
        "italic": style["italic"],
        "family": style["family"],
    }


def analyze_pdf(input_path, progress):
    pdf = open_pdf(input_path)
    try:
        count = len(pdf)
        if count == 0:
            raise EngineError("UNSUPPORTED_DOCUMENT", "The document has no pages.")
        if count > MAX_PAGES:
            raise EngineError("LIMIT_EXCEEDED", "This PDF has %d pages. The limit is %d." % (count, MAX_PAGES))
        progress("template", 3, "Detecting the page template")
        header, _header_page = _detect_template(pdf)
        pages = []
        footer_geo = None
        for index in range(count):
            progress("analyzing_pages", 8 + int(88 * index / count), "Reading page %d of %d" % (index + 1, count))
            page = pdf[index]
            try:
                width, height = page.get_size()
                try:
                    raw_lines = _page_lines(page, height)
                except Exception:
                    raw_lines = []
                body, foot = _split_lines(raw_lines, header, height)
                footer = _footer_info(foot[-1]) if foot else None
                if footer is not None and footer_geo is None:
                    footer_geo = footer
                images = _content_images(page, width, height, header)
                pages.append({
                    "index": index,
                    "width": _r(width),
                    "height": _r(height),
                    "lines": [_serialize(line) for line in body],
                    "contentImages": images,
                    "locked": images > 0,
                    "footer": footer,
                })
            finally:
                page.close()
    finally:
        pdf.close()

    warnings = []
    if header is None:
        warnings.append("No letterhead header was detected. All page text counts as content and new pages will have no header.")
    if footer_geo is None:
        warnings.append("No page numbers were detected, so page numbers will not be added.")
    progress("completed", 100, "Analysis complete")
    return {
        "schema": 1,
        "pageCount": count,
        "template": {
            "headerFound": header is not None,
            "headerBottom": _r(header["bottom_pt"]) if header is not None else 0,
            "footer": footer_geo,
        },
        "pages": pages,
        "warnings": warnings,
    }


def _font_dirs():
    dirs = []
    windir = os.environ.get("WINDIR") or os.environ.get("SystemRoot")
    if windir:
        dirs.append(os.path.join(windir, "Fonts"))
    local = os.environ.get("LOCALAPPDATA")
    if local:
        dirs.append(os.path.join(local, "Microsoft", "Windows", "Fonts"))
    dirs.extend(["/usr/share/fonts", "/Library/Fonts", "/System/Library/Fonts/Supplemental"])
    return [folder for folder in dirs if os.path.isdir(folder)]


def _builtin(family, bold, italic):
    if re.search(r"arial|helvet|calibri|verdana|tahoma|segoe|sans|trebuchet", family):
        names = ("Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique")
    elif re.search(r"courier|consolas|mono", family):
        names = ("Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique")
    else:
        names = ("Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic")
    if bold and italic:
        return names[3]
    if bold:
        return names[1]
    if italic:
        return names[2]
    return names[0]


class _Fonts:
    def __init__(self, pdfmetrics, ttfont):
        self.pdfmetrics = pdfmetrics
        self.ttfont = ttfont
        self.cache = {}
        self.dirs = _font_dirs()

    def name(self, family, bold, italic):
        key = (str(family or "").lower(), bool(bold), bool(italic))
        if key not in self.cache:
            self.cache[key] = self._ttf(*key) or _builtin(*key)
        return self.cache[key]

    def safe(self, text, fontname):
        if fontname.startswith("pw-"):
            return text
        return text.encode("cp1252", "replace").decode("cp1252")

    def _find(self, filename):
        if not filename:
            return None
        for folder in self.dirs:
            path = os.path.join(folder, filename)
            if os.path.isfile(path):
                return path
        return None

    def _ttf(self, family, bold, italic):
        files = None
        for prefix, entry in WIN_FONTS.items():
            if family.startswith(prefix):
                files = entry
                break
        if files is None:
            return None
        if bold and italic:
            slot = 3
        elif bold:
            slot = 1
        elif italic:
            slot = 2
        else:
            slot = 0
        path = self._find(files[slot])
        if path is None and slot != 0:
            slot = 0
            path = self._find(files[0])
        if path is None:
            return None
        reg_name = "pw-" + re.sub(r"\W+", "_", family) + "-" + str(slot)
        try:
            if reg_name not in self.pdfmetrics.getRegisteredFontNames():
                self.pdfmetrics.registerFont(self.ttfont(reg_name, path, subfontIndex=0))
            return reg_name
        except Exception:
            return None


class _PageWriter:
    def __init__(self, deps, fonts, header):
        self.deps = deps
        self.fonts = fonts
        self.header = header
        self.buffer = io.BytesIO()
        self.canvas = deps["canvas"].Canvas(self.buffer, pagesize=(612.0, 792.0))
        self.reader = None
        if header is not None:
            self.reader = deps["ImageReader"](io.BytesIO(header["png"]))
        self.width = 612.0
        self.height = 792.0
        self.texts = []
        self.open = False
        self.bottom_limit = 740.0

    @property
    def count(self):
        return len(self.texts)

    def start_page(self, width, height):
        if self.open:
            self.canvas.showPage()
        self.width = float(width)
        self.height = float(height)
        self.canvas.setPageSize((self.width, self.height))
        self.texts.append([])
        self.open = True
        if self.reader is not None:
            band = float(self.header["bottom_pt"])
            self.canvas.drawImage(self.reader, 0, self.height - band, width=self.width, height=band)

    def finish(self):
        if self.open:
            self.canvas.showPage()
            self.open = False
        if not self.texts:
            return None
        self.canvas.save()
        return self.buffer.getvalue()

    def font_for(self, style):
        return self.fonts.name(style.get("family") or "", style.get("bold"), style.get("italic"))

    def measure(self, text, fontname, size):
        return self.deps["pdfmetrics"].stringWidth(self.fonts.safe(text, fontname), fontname, size)

    def record(self, text):
        self.texts[-1].append(text)

    def draw(self, x, base_top, text, fontname, size, record=True):
        text = self.fonts.safe(text, fontname)
        if not text:
            return
        self.canvas.setFont(fontname, size)
        self.canvas.drawString(x, self.height - base_top, text)
        if record:
            self.record(text)


def _wrap(pw, words, font, size, first_width, width):
    lines = []
    current = []
    current_width = 0.0
    available = first_width
    space = pw.measure(" ", font, size)
    for word in words:
        word_width = pw.measure(word, font, size)
        if current and current_width + space + word_width > available:
            lines.append(current)
            current = [word]
            current_width = word_width
            available = width
        else:
            current_width += (space if current else 0.0) + word_width
            current.append(word)
    if current:
        lines.append(current)
    return lines


def _draw_line(pw, words, x, base, font, size, available, justify):
    line = " ".join(words)
    if justify and len(words) > 1:
        natural = pw.measure(line, font, size)
        space = pw.measure(" ", font, size)
        extra = (available - natural) / (len(words) - 1)
        if 0.0 <= extra <= space * 2.5:
            cursor = x
            for word in words:
                pw.draw(cursor, base, word, font, size, record=False)
                cursor += pw.measure(word, font, size) + space + extra
            pw.record(line)
            return
    pw.draw(x, base, line, font, size)


def _derive_style(lines_by_page, width, bottom_limit):
flat = [line for page_lines in lines_by_page for line in page_lines]
if not flat:
    base = {"family": "Times New Roman", "size": 12.0, "bold": False, "italic": False}
    return {
        "body": base,
        "head": dict(base, bold=True, size=14.0, align="center"),
        "left": 72.0,
        "right": width - 72.0,
        "pitch": 14.4,
        "para_gap": 14.4,
        "justify": False,
        "first_indent": 0.0,
        "first_base": 100.0,
        "cont_base": 100.0,
        "bullet_x": 18.0,
        "text_x": 36.0,
    }

weights = Counter()
for line in flat:
    count = len(line["text"].strip())
    if count >= 25:
        st = _line_style(line)
        weights[(st["family"], st["size"], st["bold"], st["italic"])] += count
if not weights:
    for line in flat:
        st = _line_style(line)
        weights[(st["family"], st["size"], st["bold"], st["italic"])] += max(len(line["text"].strip()), 1)
family, size, bold, italic = weights.most_common(1)[0][0]
body = {"family": family, "size": size, "bold": bold, "italic": italic}

side_lines = [ln for ln in flat if abs(_line_center(ln) - width / 2.0) > _CENTER_TOL] or flat
left = min(ln["l"] for ln in side_lines)
long_lines = [ln for ln in flat if len(ln["text"].strip()) >= 40] or flat
right = max(ln["r"] for ln in long_lines)
if right - left < width * 0.3:
    left = 72.0
    right = width - 72.0
block_center = (left + right) / 2.0

pitches = []
for page_lines in lines_by_page:
    for a, b in zip(page_lines, page_lines[1:]):
        if abs(a["size"] - size) < 0.6 and abs(b["size"] - size) < 0.6:
            delta = b["baseline"] - a["baseline"]
            if 0.9 * size < delta < 1.9 * size:
                pitches.append(delta)
pitch = _median(pitches, size * 1.2)

gaps = []
edges = []
indents = []
for page_lines in lines_by_page:
    for i, a in enumerate(page_lines[:-1]):
        b = page_lines[i + 1]
        if abs(a["size"] - size) >= 0.6 or abs(b["size"] - size) >= 0.6:
            continue
        delta = b["baseline"] - a["baseline"]
        if 1.6 * pitch <= delta <= 4.5 * pitch:
            gaps.append(delta - pitch)
        if 0.9 * size < delta < 1.9 * size:
            if len(a["text"].strip()) >= 40:
                edges.append(a["r"])
            before = (a["baseline"] - page_lines[i - 1]["baseline"]) if i > 0 else None
            if before is None or before > 1.6 * pitch:
                indents.append(a["l"] - b["l"])
para_gap = _median(gaps, pitch)

justify = False
if len(edges) >= 3:
    top_edge = max(edges)
    justify = statistics.median([top_edge - e for e in edges]) < 1.5

first_indent = 0.0
if indents:
    candidate = statistics.median(indents)
    if 6.0 < candidate < 90.0:
        first_indent = candidate

first_lines = [page_lines[0] for page_lines in lines_by_page if page_lines]
first = first_lines[0]
head_style = _line_style(first)
first_center = _line_center(first)
narrow = (first["r"] - first["l"]) < 0.9 * (right - left)
centered = narrow and (
    abs(first_center - width / 2.0) <= _CENTER_TOL
    or abs(first_center - block_center) <= _CENTER_TOL
)
is_head = (head_style["bold"] and not bold) or head_style["size"] > size + 0.4 or centered
if is_head:
    head = {
        "family": head_style["family"],
        "size": head_style["size"],
        "bold": head_style["bold"],
        "italic": head_style["italic"],
        "align": "center" if centered else "left",
    }
else:
    head = {"family": family, "size": size, "bold": True, "italic": italic, "align": "left"}

return {
    "body": body,
    "head": head,
    "left": left,
    "right": right,
    "pitch": pitch,
    "para_gap": para_gap,
    "justify": justify,
    "first_indent": first_indent,
    "first_base": first["baseline"],
    "cont_base": min(line["baseline"] for line in first_lines),
    "bullet_x": 18.0,
    "text_x": 36.0,
}


def _layout_flow(pw, items, style, width, height):
body = style["body"]
head = style["head"]
body_font = pw.font_for(body)
head_font = pw.font_for(head)
sub_font = pw.font_for(dict(body, bold=True))
size = body["size"]
pitch = style["pitch"]
gap = style["para_gap"]
left = style["left"]
right = style["right"]
text_width = max(right - left, 50.0)
indent = style["first_indent"]
justify = style["justify"]
limit = pw.bottom_limit
state = {"y": style["first_base"]}

def new_page():
    pw.start_page(width, height)
    state["y"] = style["cont_base"]

def ensure(line_size, reserve=0.0):
    if state["y"] + reserve + line_size * 0.25 > limit and state["y"] > style["cont_base"] + 1.0:
        new_page()

pw.start_page(width, height)
previous = None
for item in items:
    kind = item["type"]
    text = " ".join(item["text"].split())
    if not text:
        continue
    if previous is not None:
        if previous == "b" and kind == "b":
            pass
        elif previous == "h2":
            pass
        else:
            state["y"] += gap
    if kind == "h1":
        hsize = head["size"]
        hpitch = max(pitch * hsize / size, hsize * 1.15)
        lines = _wrap(pw, text.split(), head_font, hsize, text_width, text_width)
        ensure(hsize, reserve=hpitch * len(lines) + gap + pitch * 2.0)
        for words in lines:
            ensure(hsize)
            line = " ".join(words)
            line_width = pw.measure(line, head_font, hsize)
            x = left + (text_width - line_width) / 2.0 if head["align"] == "center" else left
            pw.draw(x, state["y"], line, head_font, hsize)
            state["y"] += hpitch
    elif kind == "h2":
        lines = _wrap(pw, text.split(), sub_font, size, text_width, text_width)
        ensure(size, reserve=pitch * 2.0)
        for words in lines:
            ensure(size)
            pw.draw(left, state["y"], " ".join(words), sub_font, size)
            state["y"] += pitch
    elif kind == "b":
        bullet_x = left + style["bullet_x"]
        text_x = left + style["text_x"]
        avail = max(right - text_x, 50.0)
        lines = _wrap(pw, text.split(), body_font, size, avail, avail)
        for n, words in enumerate(lines):
            ensure(size)
            if n == 0:
                pw.draw(bullet_x, state["y"], "\u2022", body_font, size)
            _draw_line(pw, words, text_x, state["y"], body_font, size, avail, justify and n < len(lines) - 1)
            state["y"] += pitch
    else:
        lines = _wrap(pw, text.split(), body_font, size, text_width - indent, text_width)
        for n, words in enumerate(lines):
            ensure(size)
            x = left + (indent if n == 0 else 0.0)
            avail = text_width - (indent if n == 0 else 0.0)
            _draw_line(pw, words, x, state["y"], body_font, size, avail, justify and n < len(lines) - 1)
            state["y"] += pitch
    previous = kind


def _draw_slot_line(pw, line, text, width, avail, side, refs=None):
text = " ".join(str(text).split())
if not text:
    return
st = _line_style(line)
font = pw.font_for(st)
size = st["size"]
ref = _match_center(line, [width / 2.0] + list(refs or []))
if ref is not None:
    limit = 2.0 * min(ref - 54.0, width - 54.0 - ref)
    if limit < 100.0:
        limit = avail
else:
    limit = avail
line_width = pw.measure(text, font, size)
if line_width > limit and line_width > 0:
    size = max(size * limit / line_width, size * 0.6)
    line_width = pw.measure(text, font, size)
if ref is not None:
    x = ref - line_width / 2.0
elif width - line["r"] <= 8.0 and line["l"] > width * 0.3:
    x = line["r"] - line_width
else:
    x = line["l"]
    if x + line_width > width - side:
        x = max(side, width - side - line_width)
pw.draw(x, line["baseline"], text, font, size)


def _slot_geometry(lines, width):
    side = min(min(ln["l"] for ln in lines), min(width - ln["r"] for ln in lines))
    side = max(side, 18.0)
    return side, width - 2.0 * side


def _layout_slots(pw, slot_lines, texts, width, height):
pw.start_page(width, height)
side, avail = _slot_geometry(slot_lines, width)
refs = [_infer_center(slot_lines)]
for line, text in zip(slot_lines, texts):
    _draw_slot_line(pw, line, text, width, avail, side, refs)


def _segments(line):
    segments = []
    current = []
    left = line["l"]
    for token in line["tokens"]:
        if token["tab_x"] is not None:
            segments.append({"text": "".join(current), "x": left})
            current = []
            left = token["tab_x"]
        else:
            current.append(token["text"])
    segments.append({"text": "".join(current), "x": left})
    return segments


def _toc_entries(lines_by_page):
    entries = []
    for page_index, lines in lines_by_page.items():
        for line_index, line in enumerate(lines):
            segments = _segments(line)
            if len(segments) < 2:
                continue
            number = segments[-1]["text"].strip()
            if not re.fullmatch(r"\d{1,4}", number):
                continue
            title_text = " ".join(seg["text"].strip() for seg in segments[:-1]).strip()
            match = TOC_ENTRY.match(title_text)
            if not match:
                continue
            entries.append({
                "page": page_index,
                "line": line_index,
                "roman": match.group(1),
                "title": match.group(2).strip(),
                "old": int(number),
            })
    return entries


def _heading_matches(lines, roman, title):
    roman_norm = _norm(roman)
    title_norm = _norm(title)
    if not title_norm:
        return False
    for line in lines:
        if line == title_norm or line == roman_norm + title_norm:
            return True
        if line.endswith(title_norm):
            prefix = line[:-len(title_norm)]
            if 0 < len(prefix) <= 6 and re.fullmatch(r"[ivxlc]+", prefix):
                return True
    return False


def _page_heads(src, index):
    page = src[index]
    try:
        textpage = page.get_textpage()
        try:
            text = textpage.get_text_range() or ""
        finally:
            textpage.close()
    finally:
        page.close()
    lines = [_norm(row) for row in text.splitlines() if row.strip()]
    return lines[:HEAD_LINES]


def _layout_toc(pw, lines_by_page, changed, width, height):
    for page_index in sorted(lines_by_page):
        lines = lines_by_page[page_index]
        pw.start_page(width, height)
        if not lines:
            continue
        side, avail = _slot_geometry(lines, width)
        for line_index, line in enumerate(lines):
            key = (page_index, line_index)
            segments = _segments(line)
            if key not in changed or len(segments) < 2:
                _draw_slot_line(pw, line, _plain(line), width, avail, side)
                continue
            st = _line_style(line)
            font = pw.font_for(st)
            size = st["size"]
            for number, segment in enumerate(segments):
                text = segment["text"].strip()
                if number == len(segments) - 1:
                    text = str(changed[key])
                    x = line["r"] - pw.measure(text, font, size)
                else:
                    x = segment["x"]
                pw.draw(x, line["baseline"], text, font, size)


def _stamp_number(out, index, number, geo, whiteout, pdfmetrics):
    size = float(geo["size"])
    text = str(number)
    text_width = pdfmetrics.stringWidth(text, "Times-Roman", size)
    center = (float(geo["l"]) + float(geo["r"])) / 2.0
    page = out[index]
    try:
        _w, height = page.get_size()
        if whiteout is not None:
            pad = 2.0
            rect = pdfium_c.FPDFPageObj_CreateNewRect(
                float(whiteout["l"]) - pad,
                height - float(whiteout["bottom"]) - pad,
                float(whiteout["r"]) - float(whiteout["l"]) + 2.0 * pad,
                float(whiteout["bottom"]) - float(whiteout["top"]) + 2.0 * pad,
            )
            pdfium_c.FPDFPageObj_SetFillColor(rect, 255, 255, 255, 255)
            pdfium_c.FPDFPath_SetDrawMode(rect, 1, 0)
            pdfium_c.FPDFPage_InsertObject(page.raw, rect)
        font = pdfium_c.FPDFText_LoadStandardFont(out.raw, b"Times-Roman")
        obj = pdfium_c.FPDFPageObj_CreateTextObj(out.raw, font, size)
        codes = [ord(ch) for ch in text] + [0]
        buffer = (ctypes.c_ushort * len(codes))(*codes)
        pdfium_c.FPDFText_SetText(obj, buffer)
        pdfium_c.FPDFPageObj_Transform(obj, 1.0, 0.0, 0.0, 1.0, center - text_width / 2.0, height - float(geo["base"]))
        pdfium_c.FPDFPage_InsertObject(page.raw, obj)
        pdfium_c.FPDFPage_GenerateContent(page.raw)
    finally:
        page.close()


def _clean_toc(toc_pages, count):
    if toc_pages is None:
        return None
    if (
        not isinstance(toc_pages, list)
        or len(toc_pages) != 2
        or not all(isinstance(v, int) for v in toc_pages)
        or not (0 <= toc_pages[0] <= toc_pages[1] < count)
    ):
        raise EngineError("INVALID_INPUT", "The table of contents range is not valid.")
    return (toc_pages[0], toc_pages[1])


def _validate_replace(replace, toc_range, count):
    if not isinstance(replace, list) or not replace:
        raise EngineError("INVALID_INPUT", "There is nothing to write.")
    clean = []
    for item in replace:
        if not isinstance(item, dict):
            raise EngineError("INVALID_INPUT", "A section is not valid.")
        start = item.get("start")
        end = item.get("end")
        if not (isinstance(start, int) and isinstance(end, int) and 0 <= start <= end < count):
            raise EngineError("INVALID_INPUT", "A section has an invalid page range.")
        mode = item.get("mode")
        if mode == "slots":
            lines = item.get("lines")
            if start != end:
                raise EngineError("INVALID_INPUT", "A fixed layout section must be a single page.")
            if not isinstance(lines, list) or not lines or any(not isinstance(v, str) for v in lines):
                raise EngineError("INVALID_INPUT", "A fixed layout section has no lines.")
            clean.append({"start": start, "end": end, "mode": mode, "lines": [v[:MAX_TEXT] for v in lines]})
        elif mode == "flow":
            items = item.get("items")
            if not isinstance(items, list) or not items or len(items) > MAX_ITEMS:
                raise EngineError("INVALID_INPUT", "A text section has no content.")
            fixed = []
            for entry in items:
                if (
                    not isinstance(entry, dict)
                    or entry.get("type") not in ITEM_TYPES
                    or not isinstance(entry.get("text"), str)
                ):
                    raise EngineError("INVALID_INPUT", "A text section contains an invalid item.")
                fixed.append({"type": entry["type"], "text": entry["text"][:MAX_TEXT]})
            if not any(entry["text"].strip() for entry in fixed):
                raise EngineError("INVALID_INPUT", "A text section is empty.")
            clean.append({"start": start, "end": end, "mode": mode, "items": fixed})
        else:
            raise EngineError("INVALID_INPUT", "A section has an unknown mode.")
    clean.sort(key=lambda entry: entry["start"])
    for a, b in zip(clean, clean[1:]):
        if b["start"] <= a["end"]:
            raise EngineError("INVALID_INPUT", "Two sections overlap.")
    if toc_range is not None:
        for entry in clean:
            if not (entry["end"] < toc_range[0] or entry["start"] > toc_range[1]):
                raise EngineError("INVALID_INPUT", "A section overlaps the table of contents.")
    return clean


def _replace_file(temp_path, target):
    for attempt in range(6):
        try:
            os.replace(temp_path, target)
            return
        except PermissionError:
            time.sleep(0.3 * (attempt + 1))
    raise EngineError(
        "OUTPUT_LOCKED",
        "The output file is in use or protected. Close it in your PDF viewer, or choose a different file name, then try again.",
    )


def _bottom_limit(footer_geo, height):
    if isinstance(footer_geo, dict) and footer_geo.get("top") is not None:
        return float(footer_geo["top"]) - 8.0
    return height - 54.0


def write_pdf(input_path, output_path, replace, toc_pages, footers, footer_geo, progress):
    if not isinstance(output_path, str) or not output_path or os.path.splitext(output_path)[1].lower() != ".pdf":
        raise EngineError("INVALID_INPUT", "The output path must use the .pdf extension.")
    try:
        from reportlab.pdfgen import canvas as rl_canvas
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.lib.utils import ImageReader
    except ImportError:
        raise EngineError("MISSING_DEPENDENCY", "PDF Writer needs the reportlab package. Run: pip install reportlab")

    if not isinstance(footers, list):
        footers = []
    if not isinstance(footer_geo, dict):
        footer_geo = None

    parent = os.path.dirname(os.path.abspath(output_path))
    if parent:
        os.makedirs(parent, exist_ok=True)
    temp_path = output_path + ".tmp-" + str(os.getpid()) + ".pdf"
    warnings = []
    src = None
    gen_doc = None
    toc_doc = None
    out = None
    page_total = 0
    toc_updated = False
    try:
        try:
            src = open_pdf(input_path)
            count = len(src)
            toc_range = _clean_toc(toc_pages, count)
            plan = _validate_replace(replace, toc_range, count)

            progress("template", 3, "Detecting the page template")
            header, _hp = _detect_template(src)
            if header is None:
                warnings.append("No letterhead header was detected, so rebuilt pages have no header.")

            deps = {"canvas": rl_canvas, "pdfmetrics": pdfmetrics, "ImageReader": ImageReader}
            fonts = _Fonts(pdfmetrics, TTFont)
            gen = _PageWriter(deps, fonts, header)

            needed = set()
            for item in plan:
                needed.update(range(item["start"], item["end"] + 1))
            if toc_range is not None:
                needed.update(range(toc_range[0], toc_range[1] + 1))
            cache = {}
            ordered = sorted(needed)
            for number, index in enumerate(ordered):
                progress("reading", 5 + int(15 * number / max(len(ordered), 1)), "Reading page %d" % (index + 1))
                page = src[index]
                try:
                    width, height = page.get_size()
                    raw = _page_lines(page, height)
                finally:
                    page.close()
                body, _foot = _split_lines(raw, header, height)
                cache[index] = {"w": width, "h": height, "lines": body}

            sequence = []
            cursor = 0
            for number, item in enumerate(plan):
                progress("writing", 22 + int(45 * number / len(plan)), "Building section %d of %d" % (number + 1, len(plan)))
                while cursor < item["start"]:
                    sequence.append(["keep", cursor])
                    cursor += 1
                first = cache[item["start"]]
                width = first["w"]
                height = first["h"]
                gen.bottom_limit = _bottom_limit(footer_geo, height)
                before = gen.count
                if item["mode"] == "slots":
                    slot_lines = first["lines"]
                    if len(slot_lines) != len(item["lines"]):
                        raise EngineError(
                            "INVALID_INPUT",
                            "The section on page %d needs exactly %d lines but received %d."
                            % (item["start"] + 1, len(slot_lines), len(item["lines"])),
                        )
                    _layout_slots(gen, slot_lines, item["lines"], width, height)
                else:
                    pages_lines = [cache[i]["lines"] for i in range(item["start"], item["end"] + 1)]
                    style = _derive_style(pages_lines, width, gen.bottom_limit)
                    _layout_flow(gen, item["items"], style, width, height)
                for g in range(before, gen.count):
                    sequence.append(["gen", g])
                cursor = item["end"] + 1
            while cursor < count:
                sequence.append(["keep", cursor])
                cursor += 1
            gen_bytes = gen.finish()

            toc_bytes = None
            if toc_range is not None:
                toc_positions = [
                    pos for pos, entry in enumerate(sequence)
                    if entry[0] == "keep" and toc_range[0] <= entry[1] <= toc_range[1]
                ]
                toc_lines = {i: cache[i]["lines"] for i in range(toc_range[0], toc_range[1] + 1)}
                entries = _toc_entries(toc_lines)
                if not entries:
                    warnings.append("The table of contents lines could not be read, so its page numbers were left as they were.")
                elif toc_positions:
                    progress("contents", 70, "Updating the table of contents")
                    last_toc = max(toc_positions)
                    changed = {}
                    heads = {}
                    for pos in range(last_toc + 1, len(sequence)):
                        kind, idx = sequence[pos]
                        if kind == "keep":
                            heads[pos] = _page_heads(src, idx)
                        else:
                            heads[pos] = [_norm(t) for t in gen.texts[idx]][:HEAD_LINES]
                    for entry in entries:
                        found = None
                        for pos in range(last_toc + 1, len(sequence)):
                            if _heading_matches(heads[pos], entry["roman"], entry["title"]):
                                found = pos + 1
                                break
                        if found is None:
                            warnings.append("The contents entry \"%s\" was not found, its number was left as it was." % entry["title"])
                        elif found != entry["old"]:
                            changed[(entry["page"], entry["line"])] = found
                    if changed:
                        toc_writer = _PageWriter(deps, fonts, header)
                        first = cache[toc_range[0]]
                        _layout_toc(toc_writer, toc_lines, changed, first["w"], first["h"])
                        toc_bytes = toc_writer.finish()
                        for pos in toc_positions:
                            sequence[pos] = ["toc", sequence[pos][1] - toc_range[0]]
                        toc_updated = True

            progress("assembling", 75, "Assembling pages")
            if gen_bytes:
                gen_doc = pdfium.PdfDocument(gen_bytes)
            if toc_bytes:
                toc_doc = pdfium.PdfDocument(toc_bytes)
            out = pdfium.PdfDocument.new()
            for kind, idx in sequence:
                if kind == "keep":
                    out.import_pages(src, pages=[idx], index=len(out))
                elif kind == "gen":
                    out.import_pages(gen_doc, pages=[idx], index=len(out))
                else:
                    out.import_pages(toc_doc, pages=[idx], index=len(out))

            progress("numbering", 85, "Updating page numbers")
            failed = 0
            for pos, (kind, idx) in enumerate(sequence):
                number = pos + 1
                geo = None
                whiteout = None
                if kind == "keep":
                    info = footers[idx] if idx < len(footers) else None
                    if isinstance(info, dict) and info.get("n") is not None and info.get("n") != number:
                        geo = info
                        whiteout = info
                elif footer_geo is not None:
                    geo = footer_geo
                if geo is None:
                    continue
                try:
                    _stamp_number(out, pos, number, geo, whiteout, pdfmetrics)
                except Exception:
                    failed += 1
            if failed:
                warnings.append("Page numbers on %d page(s) could not be updated." % failed)

            progress("saving", 92, "Saving PDF")
            out.save(temp_path)
            page_total = len(sequence)
        finally:
            for doc in (out, gen_doc, toc_doc, src):
                if doc is not None:
                    try:
                        doc.close()
                    except Exception:
                        pass
        _replace_file(temp_path, output_path)
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass

    progress("completed", 100, "PDF written")
    return {
        "outputPath": output_path,
        "pageCount": page_total,
        "replaced": len(plan),
        "tocUpdated": toc_updated,
        "warnings": warnings,
    }