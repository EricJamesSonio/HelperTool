"""PDF inspection and page rendering.

Read-only: input files are never modified or written to.
"""
import base64
import hashlib
import io
import os

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c

from errors import EngineError

MAX_PAGES = 2000
MIN_TEXT_CHARS = 20
IMAGE_COVER_SCANNED = 0.30
IMAGE_COVER_MIXED = 0.60
FULL_PAGE_IMAGE = 0.85
TEXT_PREVIEW_CHARS = 600
LARGE_FILE_BYTES = 200 * 1024 * 1024
HASH_CHUNK = 1024 * 1024
MAX_SCALE = 4.0
MAX_PIXELS = 25_000_000
MAX_VECTOR_COUNT = 100000


def check_path(path):
    if not isinstance(path, str) or not path or "\0" in path:
        raise EngineError("INVALID_INPUT", "A PDF path is required.")
    if not path.lower().endswith(".pdf"):
        raise EngineError("UNSUPPORTED_DOCUMENT", "Only .pdf files are supported.")
    if not os.path.isfile(path):
        raise EngineError("FILE_NOT_FOUND", "The file could not be found.")
    return path


def open_pdf(path):
    check_path(path)
    try:
        return pdfium.PdfDocument(path)
    except pdfium.PdfiumError as exc:
        text = str(exc).lower()
        if "password" in text:
            raise EngineError("ENCRYPTED", "This PDF is password-protected. Unlock it before importing.")
        raise EngineError("UNSUPPORTED_DOCUMENT", "The document is damaged or uses an unsupported format.")


def _sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(HASH_CHUNK), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _clean_metadata(pdf):
    try:
        raw = pdf.get_metadata_dict(skip_empty=True)
    except Exception:
        return {}
    out = {}
    for key, value in (raw or {}).items():
        out[str(key)] = str(value)[:500]
    return out


def _read_permissions(pdf):
    try:
        flags = int(pdfium_c.FPDF_GetDocPermissions(pdf.raw))
    except Exception:
        return None
    return {
        "print": bool(flags & 4),
        "modify": bool(flags & 8),
        "copy": bool(flags & 16),
        "annotate": bool(flags & 32),
    }


def _format_version(pdf):
    try:
        value = pdf.get_version()
    except Exception:
        return None
    if not isinstance(value, int) or value <= 0:
        return None
    return "%d.%d" % (value // 10, value % 10)


def _analyze_objects(page, width, height):
    images = 0
    vectors = 0
    covered = 0.0
    try:
        for obj in page.get_objects(max_depth=15):
            kind = obj.type
            if kind == pdfium_c.FPDF_PAGEOBJ_IMAGE:
                images += 1
                try:
                    left, bottom, right, top = obj.get_pos()
                    w = max(0.0, min(right, width) - max(left, 0.0))
                    h = max(0.0, min(top, height) - max(bottom, 0.0))
                    covered += w * h
                except Exception:
                    pass
            elif kind == pdfium_c.FPDF_PAGEOBJ_PATH:
                vectors += 1
                if vectors >= MAX_VECTOR_COUNT:
                    break
    except Exception:
        pass
    area = width * height
    coverage = min(1.0, covered / area) if area > 0 else 0.0
    return images, vectors, coverage


def _read_text(page):
    textpage = page.get_textpage()
    try:
        return textpage.get_text_range() or ""
    finally:
        textpage.close()


def _classify(chars, coverage):
    if chars >= MIN_TEXT_CHARS:
        return "mixed" if coverage >= IMAGE_COVER_MIXED else "text"
    if coverage >= IMAGE_COVER_SCANNED:
        return "image"
    return "unknown"


def _inspect_page(pdf, index):
    page = pdf[index]
    try:
        width, height = page.get_size()
        try:
            rotation = int(page.get_rotation())
        except Exception:
            rotation = 0
        text = _read_text(page)
        compact = "".join(text.split())
        chars = len(compact)
        words = len(text.split())
        images, vectors, coverage = _analyze_objects(page, width, height)
        classification = _classify(chars, coverage)
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        preview_full = "\n".join(lines)
        if abs(width - height) < 1.0:
            orientation = "square"
        elif width > height:
            orientation = "landscape"
        else:
            orientation = "portrait"
        return {
            "index": index,
            "number": index + 1,
            "width": round(width, 2),
            "height": round(height, 2),
            "orientation": orientation,
            "rotation": rotation,
            "chars": chars,
            "words": words,
            "images": images,
            "vectorObjects": vectors,
            "imageCoverage": round(coverage, 3),
            "fullPageImage": coverage >= FULL_PAGE_IMAGE,
            "classification": classification,
            "needsOcr": classification == "image",
            "textPreview": preview_full[:TEXT_PREVIEW_CHARS],
            "textTruncated": len(preview_full) > TEXT_PREVIEW_CHARS,
        }
    finally:
        page.close()


def _failed_page(index, message):
    return {
        "index": index,
        "number": index + 1,
        "width": 0,
        "height": 0,
        "orientation": "portrait",
        "rotation": 0,
        "chars": 0,
        "words": 0,
        "images": 0,
        "vectorObjects": 0,
        "imageCoverage": 0,
        "fullPageImage": False,
        "classification": "unknown",
        "needsOcr": False,
        "textPreview": "",
        "textTruncated": False,
        "error": message,
    }


def inspect_pdf(path, progress):
    check_path(path)
    size = os.path.getsize(path)
    progress("hashing", 2, "Reading file")
    digest = _sha256(path)
    progress("opening", 8, "Opening document")
    pdf = open_pdf(path)
    try:
        count = len(pdf)
        if count == 0:
            raise EngineError("UNSUPPORTED_DOCUMENT", "The document has no pages.")
        if count > MAX_PAGES:
            raise EngineError("LIMIT_EXCEEDED", "This PDF has %d pages. The limit is %d." % (count, MAX_PAGES))
        metadata = _clean_metadata(pdf)
        permissions = _read_permissions(pdf)
        version = _format_version(pdf)
        pages = []
        for index in range(count):
            try:
                pages.append(_inspect_page(pdf, index))
            except Exception as exc:
                pages.append(_failed_page(index, "This page could not be analyzed."))
            if index % 5 == 0 or index == count - 1:
                percent = 10 + int(85 * (index + 1) / count)
                progress("analyzing_pages", percent, "Analyzing page %d of %d" % (index + 1, count))
    finally:
        pdf.close()

    counts = {"text": 0, "image": 0, "mixed": 0, "unknown": 0}
    sizes = {}
    failed = 0
    for page in pages:
        counts[page["classification"]] = counts.get(page["classification"], 0) + 1
        if page.get("error"):
            failed += 1
        elif page["width"] and page["height"]:
            key = (round(page["width"]), round(page["height"]))
            sizes[key] = sizes.get(key, 0) + 1
    needs_ocr = sum(1 for page in pages if page["needsOcr"])
    size_list = [
        {"width": key[0], "height": key[1], "pages": value}
        for key, value in sorted(sizes.items(), key=lambda item: -item[1])[:10]
    ]

    warnings = []
    if size > LARGE_FILE_BYTES:
        warnings.append("This is a large file. Processing may take longer than usual.")
    if needs_ocr:
        warnings.append("%d page(s) appear to be scanned images. OCR is needed to extract editable text." % needs_ocr)
    unknown_pages = counts.get("unknown", 0) - failed
    if unknown_pages > 0:
        warnings.append("%d page(s) could not be classified because they hold little or no text or imagery." % unknown_pages)
    if failed:
        warnings.append("%d page(s) could not be analyzed." % failed)
    if len(size_list) > 1:
        warnings.append("The document mixes %d different page sizes." % len(size_list))
    if permissions is not None and not permissions["copy"]:
        warnings.append("The document's permissions restrict copying content.")

    try:
        engine_info = str(getattr(pdfium, "PYPDFIUM_INFO", "unknown"))[:200]
    except Exception:
        engine_info = "unknown"

    return {
        "schema": 1,
        "file": {"name": os.path.basename(path), "size": size, "sha256": digest},
        "document": {
            "pageCount": count,
            "version": version,
            "metadata": metadata,
            "permissions": permissions,
        },
        "summary": {
            "counts": {
                "text": counts.get("text", 0),
                "image": counts.get("image", 0),
                "mixed": counts.get("mixed", 0),
                "unknown": counts.get("unknown", 0),
                "needsOcr": needs_ocr,
            },
            "pageSizes": size_list,
        },
        "warnings": warnings,
        "pages": pages,
        "engine": {"name": "pdf-master", "pdfium": engine_info},
    }


def render_page(path, page_index, max_width, image_format):
    if not isinstance(page_index, int) or page_index < 0:
        raise EngineError("INVALID_PAGE", "That page does not exist.")
    if not isinstance(max_width, (int, float)) or max_width < 32 or max_width > 3000:
        raise EngineError("INVALID_INPUT", "The requested preview size is not valid.")
    if image_format not in ("png", "jpeg"):
        raise EngineError("INVALID_INPUT", "The requested image format is not supported.")
    pdf = open_pdf(path)
    try:
        if page_index >= len(pdf):
            raise EngineError("INVALID_PAGE", "That page does not exist.")
        page = pdf[page_index]
        try:
            width, height = page.get_size()
            scale = min(MAX_SCALE, max(0.05, float(max_width) / max(width, 1.0)))
            while (width * scale) * (height * scale) > MAX_PIXELS:
                scale *= 0.8
            try:
                image = page.render(scale=scale).to_pil().convert("RGB")
            except ImportError:
                raise EngineError("MISSING_DEPENDENCY", "The Pillow package is required to render previews.")
        finally:
            page.close()
    finally:
        pdf.close()
    buffer = io.BytesIO()
    if image_format == "jpeg":
        image.save(buffer, format="JPEG", quality=72)
        mime = "image/jpeg"
    else:
        image.save(buffer, format="PNG")
        mime = "image/png"
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return {
        "dataUrl": "data:" + mime + ";base64," + encoded,
        "width": image.width,
        "height": image.height,
    }