"""Journal table support for PDF Writer.

A journal page holds a ruled table (Date, Specific Task, Challenges,
Learnings, Documentation). Only the text of the first four columns and a few
header and signature fields are replaced. Rules, images and every other object
stay untouched: white patches cover the old text and the new text is drawn on
top as an overlay page.
"""

import io
import math
import re
import statistics
from collections import Counter

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c

from converter import _extract_chars
from errors import EngineError

TEXT_COLS = 4
MIN_RULES = 5
MAX_RULES = 12
RULE_THICK = 3.0
RULE_LEN = 24.0
SNAP = 2.0
PAD = 5.4
INSET = 1.4
MAX_OBJECTS = 40000
MIN_BAND = 6.0
BLANK_BAND = 40.0
SHRINK = (1.0, 0.96, 0.92, 0.88, 0.84, 0.8, 0.76, 0.72, 0.68, 0.64)
KEYS = ("date", "task", "challenges", "learnings")
LABELS = ("Date", "Specific Task", "Challenges", "Learnings")
HEADER_CELL = re.compile(r"specific\s*task", re.I)
WEEK_LINE = re.compile(r"^\s*(?:OJT\s+JOURNAL\s*)?WEEK\s*(\d+)\s*$", re.I)
FIELD_PATTERNS = (
    ("student", re.compile(r"^(\s*Student\s+Name\s*:)\s*(.*)$", re.I)),
    ("course", re.compile(r"^(\s*Year\s+and\s+Course\s*:)\s*(.*)$", re.I)),
    ("company", re.compile(r"^(\s*Company\s*:)\s*(.*)$", re.I)),
)
PREPARED = re.compile(r"prepared\s*by", re.I)
REVIEWED = re.compile(r"reviewed\s*by", re.I)


def _collect_rules(page, width, height):
    verts = []
    horiz = []
    seen = 0
    try:
        for obj in page.get_objects(max_depth=15):
            seen += 1
            if seen > MAX_OBJECTS:
                break
            if obj.type != pdfium_c.FPDF_PAGEOBJ_PATH:
                continue
            try:
                left, bottom, right, top = obj.get_pos()
            except Exception:
                continue
            w = right - left
            h = top - bottom
            if w <= RULE_THICK and h >= RULE_LEN:
                verts.append(((left + right) / 2.0, height - top, height - bottom))
            elif h <= RULE_THICK and w >= RULE_LEN:
                horiz.append((height - (top + bottom) / 2.0, left, right))
    except Exception:
        pass
    return verts, horiz


def _grid(page, width, height):
    verts, horiz = _collect_rules(page, width, height)
    if len(verts) < MIN_RULES:
        return None
    groups = []
    for x, y0, y1 in sorted(verts):
        if groups and abs(x - groups[-1]["x"]) <= SNAP:
            group = groups[-1]
            group["top"] = min(group["top"], y0)
            group["bottom"] = max(group["bottom"], y1)
        else:
            groups.append({"x": x, "top": y0, "bottom": y1})
    longest = max(g["bottom"] - g["top"] for g in groups)
    main = [g for g in groups if g["bottom"] - g["top"] >= 0.5 * longest]
    if len(main) < MIN_RULES or len(main) > MAX_RULES:
        return None
    xs = [g["x"] for g in main]
    top = min(g["top"] for g in main)
    bottom = max(g["bottom"] for g in main)
    span = xs[-1] - xs[0]
    rules = []
    for y, left, right in sorted(horiz):
        if rules and abs(y - rules[-1]["y"]) <= SNAP:
            rules[-1]["l"] = min(rules[-1]["l"], left)
            rules[-1]["r"] = max(rules[-1]["r"], right)
        else:
            rules.append({"y": y, "l": left, "r": right})
    ys = [
        g["y"] for g in rules
        if g["r"] - g["l"] >= 0.6 * span
        and g["l"] <= xs[0] + 6.0
        and g["r"] >= xs[-1] - 6.0
        and top - SNAP <= g["y"] <= bottom + SNAP
    ]
    bounds = []
    for value in sorted([top, bottom] + ys):
        if bounds and value - bounds[-1] < 3.0:
            continue
        bounds.append(value)
    if len(bounds) < 2:
        return None
    cont = not any(abs(y - top) <= 3.0 for y in ys)
    return {"xs": xs, "top": top, "bottom": bottom, "bounds": bounds, "cont": cont}


def _finish(group, split_gap):
    chars = sorted(group["chars"], key=lambda c: c["l"])
    size = Counter(c["size"] for c in chars).most_common(1)[0][0]
    style = Counter(c["style"] for c in chars).most_common(1)[0][0]
    segs = []
    current = None
    previous = None
    for ch in chars:
        gap = 0.0
        if previous is not None:
            if ch["ch"] == previous["ch"] and abs(ch["l"] - previous["l"]) < 0.2 * ch["size"]:
                continue
            gap = ch["l"] - previous["r"]
        if current is None or gap > split_gap * size:
            current = {"text": "", "l": ch["l"], "r": ch["r"]}
            segs.append(current)
        elif gap > 0.18 * size:
            current["text"] += " "
        current["text"] += ch["ch"]
        current["r"] = max(current["r"], ch["r"])
        previous = ch
    return {
        "text": " ".join(s["text"] for s in segs),
        "segs": segs,
        "l": segs[0]["l"],
        "r": max(s["r"] for s in segs),
        "top": min(c["top"] for c in chars),
        "bot": max(c["bot"] for c in chars),
        "base": statistics.median(c["bot"] for c in chars),
        "size": size,
        "family": style[0],
        "bold": style[1],
        "italic": style[2],
    }


def _lines(chars, split_gap):
    if not chars:
        return []
    ordered = sorted(chars, key=lambda c: (c["cy"], c["l"]))
    groups = []
    for ch in ordered:
        if groups and abs(ch["cy"] - groups[-1]["cy"]) <= 0.5 * max(ch["size"], 1.0):
            group = groups[-1]
            group["chars"].append(ch)
            count = len(group["chars"])
            group["cy"] = (group["cy"] * (count - 1) + ch["cy"]) / count
        else:
            groups.append({"chars": [ch], "cy": ch["cy"]})
    return [_finish(group, split_gap) for group in groups]


def _signature(lines):
    for index, line in enumerate(lines):
        if len(line["segs"]) < 2:
            continue
        left = next((s for s in line["segs"] if PREPARED.search(s["text"])), None)
        right = next((s for s in line["segs"] if REVIEWED.search(s["text"])), None)
        if left is None or right is None:
            continue
        below = [ln for ln in lines[index + 1:] if ln["top"] - line["bot"] < 90.0][:2]
        fields = {}
        targets = []
        for slot, ln in zip(("name", "role"), below):
            for seg in ln["segs"]:
                near_left = abs(seg["l"] - left["l"]) <= abs(seg["l"] - right["l"])
                side = "prepared" if near_left else "reviewed"
                fields.setdefault(side, {})[slot] = seg["text"].strip()
                targets.append({"kind": side + "_" + slot, "seg": seg, "line": ln})
        return fields, targets
    return {}, []


def _fields(lines):
    fields = {}
    targets = []
    for line in lines:
        text = line["text"]
        week = WEEK_LINE.match(text)
        if week:
            if "week" not in fields:
                fields["week"] = "WEEK " + week.group(1)
            continue
        for kind, pattern in FIELD_PATTERNS:
            match = pattern.match(text)
            if match and kind not in fields:
                fields[kind] = match.group(2).strip()
                targets.append({"kind": kind, "label": match.group(1).strip(), "line": line})
                break
    sign_fields, sign_targets = _signature(lines)
    fields.update(sign_fields)
    targets.extend(sign_targets)
    return fields, targets


def read_page(page, index):
    width, height = page.get_size()
    grid = _grid(page, width, height)
    if grid is None:
        return None
    chars = _extract_chars(page)
    for ch in chars:
        ch["top"] = height - ch["t"]
        ch["bot"] = height - ch["b"]
        ch["cx"] = (ch["l"] + ch["r"]) / 2.0
        ch["cy"] = (ch["top"] + ch["bot"]) / 2.0
    xs = grid["xs"]
    cols = min(TEXT_COLS, len(xs) - 1)
    bounds = grid["bounds"]
    bands = []
    for n in range(len(bounds) - 1):
        top = bounds[n]
        bottom = bounds[n + 1]
        if bottom - top < MIN_BAND:
            continue
        cells = []
        for c in range(cols):
            members = [
                ch for ch in chars
                if xs[c] <= ch["cx"] < xs[c + 1] and top <= ch["cy"] < bottom
            ]
            cells.append(_lines(members, 99.0))
        joined = " ".join(ln["text"] for cell in cells for ln in cell)
        cont = n == 0 and grid["cont"]
        has_text = any(cells)
        bands.append({
            "top": top,
            "bottom": bottom,
            "cont": cont,
            "header": bool(HEADER_CELL.search(joined)),
            "blank": (not has_text) and (bottom - top) < BLANK_BAND and not cont,
            "cells": cells,
        })
    extras = [
        ch for ch in chars
        if not (
            xs[0] <= ch["cx"] <= xs[-1]
            and grid["top"] - 2.0 <= ch["cy"] <= grid["bottom"] + 2.0
        )
    ]
    fields, targets = _fields(_lines(extras, 3.0))
    return {
        "index": index,
        "width": width,
        "height": height,
        "xs": xs,
        "cols": cols,
        "bands": bands,
        "fields": fields,
        "targets": targets,
    }


def _cell_text(cell):
    return " ".join(ln["text"] for ln in cell)[:400]


def analyze_page(page, index):
    info = read_page(page, index)
    if info is None:
        return None
    bands = []
    for band in info["bands"]:
        cells = [_cell_text(cell) for cell in band["cells"]]
        while len(cells) < TEXT_COLS:
            cells.append("")
        bands.append({
            "cont": band["cont"],
            "header": band["header"],
            "blank": band["blank"],
            "cells": cells,
        })
    return {"bands": bands, "fields": info["fields"]}


def read_section(src, start, end):
    pages = []
    for index in range(start, end + 1):
        page = src[index]
        try:
            info = read_page(page, index)
        finally:
            page.close()
        if info is not None:
            pages.append(info)
    return pages


def build_rows(pages):
    rows = []
    for info in pages:
        for band in info["bands"]:
            if band["header"] or band["blank"]:
                continue
            if band["cont"] and rows:
                rows[-1]["segs"].append((info, band))
                continue
            rows.append({"segs": [(info, band)]})
    return rows


def _column_style(c, items, base):
    counts = Counter()
    pitches = []
    offsets = []
    aligns = Counter()
    valigns = Counter()
    pads = []
    for info, band, lines in items:
        left = info["xs"][c]
        right = info["xs"][c + 1]
        avail = right - left - 2.0 * PAD
        for ln in lines:
            counts[(ln["family"], ln["bold"], ln["italic"], ln["size"])] += len(ln["text"])
        for a, b in zip(lines, lines[1:]):
            delta = b["base"] - a["base"]
            if 0.8 * a["size"] <= delta <= 3.5 * a["size"]:
                pitches.append(delta)
        body = lines[:-1]
        if body and all(ln["r"] - ln["l"] >= 0.88 * avail for ln in body):
            aligns["justify"] += 1
            pads.append(min(ln["l"] for ln in lines) - left)
        else:
            middle = (left + right) / 2.0
            if all(abs((ln["l"] + ln["r"]) / 2.0 - middle) <= 4.0 for ln in lines):
                aligns["center"] += 1
            else:
                aligns["left"] += 1
        first_gap = lines[0]["top"] - band["top"]
        last_gap = band["bottom"] - lines[-1]["bot"]
        free = first_gap + last_gap
        if free > 2.0 * lines[0]["size"] and abs(first_gap - last_gap) <= 0.2 * free:
            valigns["center"] += 1
        else:
            valigns["top"] += 1
            offsets.append(lines[0]["base"] - band["top"])
    family, bold, italic, size = counts.most_common(1)[0][0] if counts else base
    pitch = statistics.median(pitches) if pitches else size * 1.3
    if aligns:
        align = aligns.most_common(1)[0][0]
    else:
        align = "center" if c < 2 else "justify"
    if valigns:
        valign = valigns.most_common(1)[0][0]
    else:
        valign = "center" if c < 2 else "top"
    if offsets:
        offset = statistics.median(offsets)
    else:
        offset = 2.0 + pitch * 0.5 + size * 0.32
    pad = min(max(statistics.median(pads), 2.0), 12.0) if pads else PAD
    return {
        "family": family,
        "bold": bold,
        "italic": italic,
        "size": size,
        "pitch": pitch,
        "off": offset,
        "align": align,
        "valign": valign,
        "pad": pad,
    }


def column_styles(pages):
    cells = [[] for _ in range(TEXT_COLS)]
    everything = Counter()
    for info in pages:
        for band in info["bands"]:
            if band["header"]:
                continue
            for c, lines in enumerate(band["cells"]):
                if not lines:
                    continue
                cells[c].append((info, band, lines))
                for ln in lines:
                    everything[(ln["family"], ln["bold"], ln["italic"], ln["size"])] += len(ln["text"])
    base = everything.most_common(1)[0][0] if everything else ("Times New Roman", False, False, 12.0)
    return [_column_style(c, cells[c], base) for c in range(TEXT_COLS)]


class _Metrics:
    def __init__(self, fonts, deps):
        self.fonts = fonts
        self.pdfmetrics = deps["pdfmetrics"]

    def font(self, style):
        return self.fonts.name(style["family"], style["bold"], style["italic"])

    def width(self, text, font, size):
        return self.pdfmetrics.stringWidth(self.fonts.safe(text, font), font, size)


def _page_ops(ops, info):
    entry = ops.get(info["index"])
    if entry is None:
        entry = {"w": info["width"], "h": info["height"], "white": [], "text": []}
        ops[info["index"]] = entry
    return entry


def _wrap(metrics, words, font, size, avail):
    lines = []
    current = []
    used = 0.0
    space = metrics.width(" ", font, size)
    for word in words:
        width = metrics.width(word, font, size)
        if current and used + space + width > avail:
            lines.append(current)
            current = [word]
            used = width
        else:
            used += (space if current else 0.0) + width
            current.append(word)
    if current:
        lines.append(current)
    return lines


def _emit(metrics, entry, style, left, right, words, base, size, font, last):
    text = " ".join(words)
    natural = metrics.width(text, font, size)
    if style["align"] == "center":
        entry["text"].append(((left + right) / 2.0 - natural / 2.0, base, text, font, size))
        return
    x = left + style["pad"]
    avail = right - left - 2.0 * style["pad"]
    if style["align"] == "justify" and not last and len(words) > 1:
        space = metrics.width(" ", font, size)
        extra = (avail - natural) / (len(words) - 1)
        if 0.0 <= extra <= 4.0 * space:
            cursor = x
            for word in words:
                entry["text"].append((cursor, base, word, font, size))
                cursor += metrics.width(word, font, size) + space + extra
            return
    entry["text"].append((x, base, text, font, size))


def _layout_row(row, texts, styles, metrics, ops, number):
    segs = row["segs"]
    first_info = segs[0][0]
    for c in range(TEXT_COLS):
        style = styles[c]
        for info, band in segs:
            if c >= info["cols"]:
                continue
            left = info["xs"][c]
            right = info["xs"][c + 1]
            _page_ops(ops, info)["white"].append((
                left + INSET,
                band["top"] + INSET,
                right - left - 2.0 * INSET,
                band["bottom"] - band["top"] - 2.0 * INSET,
            ))
        text = " ".join(str(texts[c]).split())
        if not text or c >= first_info["cols"]:
            continue
        left = first_info["xs"][c]
        right = first_info["xs"][c + 1]
        font = metrics.font(style)
        avail = max(right - left - 2.0 * style["pad"], 20.0)
        words = text.split()
        fit = None
        for k in SHRINK:
            size = style["size"] * k
            pitch = style["pitch"] * k
            lines = _wrap(metrics, words, font, size, avail)
            caps = []
            for info, band in segs:
                base0 = band["top"] + style["off"] * k
                room = band["bottom"] - INSET - 0.28 * size - base0
                if room < 0:
                    caps.append(0)
                else:
                    caps.append(int(math.floor(room / pitch)) + 1)
            if sum(caps) >= len(lines):
                fit = (k, size, pitch, lines, caps)
                break
        if fit is None:
            raise EngineError(
                "INVALID_INPUT",
                "Journal row %d, %s: the text does not fit its cell even at a smaller size. Shorten it." % (number, LABELS[c]),
            )
        k, size, pitch, lines, caps = fit
        total = len(lines)
        centered = style["valign"] == "center" and len(segs) == 1 and total <= caps[0]
        index = 0
        for s, (info, band) in enumerate(segs):
            take = lines[index:index + caps[s]]
            if not take:
                break
            if centered:
                middle = (band["top"] + band["bottom"]) / 2.0
                base0 = middle + 0.33 * size - (len(take) - 1) * pitch / 2.0
            else:
                base0 = band["top"] + style["off"] * k
            entry = _page_ops(ops, info)
            for n, words_line in enumerate(take):
                last = index + n == total - 1
                _emit(
                    metrics, entry, style,
                    info["xs"][c], info["xs"][c + 1],
                    words_line, base0 + n * pitch, size, font, last,
                )
            index += len(take)


def _apply_fields(info, header, metrics, ops):
    for target in info["targets"]:
        kind = target["kind"]
        line = target["line"]
        if kind in ("student", "course", "company"):
            value = str(header.get(kind) or "").strip()
            if not value:
                continue
            text = target["label"] + " " + value
            left = line["segs"][0]["l"]
            right = line["r"]
        else:
            side, slot = kind.split("_", 1)
            person = header.get(side) or {}
            value = str(person.get(slot) or "").strip()
            if not value:
                continue
            text = value
            left = target["seg"]["l"]
            right = target["seg"]["r"]
        entry = _page_ops(ops, info)
        entry["white"].append((
            left - 1.5,
            line["top"] - 1.5,
            right - left + 3.0,
            line["bot"] - line["top"] + 3.0,
        ))
        font = metrics.font(line)
        size = line["size"]
        room = info["width"] - left - 18.0
        natural = metrics.width(text, font, size)
        if natural > room > 0:
            size = max(size * room / natural, size * 0.7)
        entry["text"].append((left, line["base"], text, font, size))


def _render_overlay(order, ops, fonts, deps):
    buffer = io.BytesIO()
    first = ops[order[0]]
    canvas = deps["canvas"].Canvas(buffer, pagesize=(first["w"], first["h"]))
    for index in order:
        entry = ops[index]
        height = entry["h"]
        canvas.setPageSize((entry["w"], height))
        canvas.setFillColorRGB(1, 1, 1)
        for x, top, w, h in entry["white"]:
            canvas.rect(x, height - top - h, w, h, stroke=0, fill=1)
        canvas.setFillColorRGB(0, 0, 0)
        for x, base, text, font, size in entry["text"]:
            canvas.setFont(font, size)
            canvas.drawString(x, height - base, fonts.safe(text, font))
        canvas.showPage()
    canvas.save()
    return buffer.getvalue()


def apply(src, out, items, pos_of, fonts, deps, keep):
    metrics = _Metrics(fonts, deps)
    notes = []
    ops = {}
    for item in items:
        pages = read_section(src, item["start"], item["end"])
        rows = build_rows(pages)
        if not rows:
            raise EngineError(
                "UNSUPPORTED_DOCUMENT",
                "No journal table was found on pages %d-%d." % (item["start"] + 1, item["end"] + 1),
            )
        if len(rows) != len(item["rows"]):
            raise EngineError(
                "INVALID_INPUT",
                "The journal has %d rows but %d entries were given." % (len(rows), len(item["rows"])),
            )
        styles = column_styles(pages)
        for number, (row, entry) in enumerate(zip(rows, item["rows"])):
            _layout_row(row, [entry[key] for key in KEYS], styles, metrics, ops, number + 1)
        header = item.get("header") or {}
        if header:
            for info in pages:
                _apply_fields(info, header, metrics, ops)
    order = [index for index in sorted(ops) if ops[index]["white"] or ops[index]["text"]]
    if not order:
        return notes
    data = _render_overlay(order, ops, fonts, deps)
    overlay = pdfium.PdfDocument(data)
    keep.append(overlay)
    for k, index in enumerate(order):
        pos = pos_of.get(index)
        if pos is None:
            continue
        xobj = overlay.page_as_xobject(k, out)
        keep.append(xobj)
        page = out[pos]
        try:
            page.insert_obj(xobj.as_pageobject())
            page.gen_content()
        finally:
            page.close()
    return notes