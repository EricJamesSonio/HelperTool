"""PDF Master document engine.

Protocol: one JSON object per line on stdin (requests) and stdout (responses).
Standard output is reserved for protocol messages. Diagnostics go to stderr.
"""
import json
import sys
import traceback

VERSION = "0.2.0"

PROTO = sys.stdout
sys.stdout = sys.stderr

converter = None


def emit(message):
    PROTO.write(json.dumps(message, ensure_ascii=True, separators=(",", ":")) + "\n")
    PROTO.flush()


def configure_streams():
    for stream in (sys.stdin, PROTO, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass
    try:
        PROTO.reconfigure(newline="\n")
    except Exception:
        pass


def describe_error(exc):
    name = type(exc).__name__
    detail = str(exc).strip()
    where = ""
    if isinstance(exc, SyntaxError):
        where = " in %s line %s" % (str(getattr(exc, "filename", "") or "").replace("\\", "/").split("/")[-1], getattr(exc, "lineno", "?"))
    else:
        try:
            frames = traceback.extract_tb(exc.__traceback__)
            if frames:
                last = frames[-1]
                where = " in %s line %s" % (str(last.filename).replace("\\", "/").split("/")[-1], last.lineno)
        except Exception:
            where = ""
    return ("%s: %s%s" % (name, detail, where))[:400]


def op_ping(payload, progress, inspector):
    return {"pong": True, "version": VERSION}


def op_inspect(payload, progress, inspector):
    return inspector.inspect_pdf(payload.get("inputPath"), progress)


def op_render(payload, progress, inspector):
    return inspector.render_page(
        payload.get("inputPath"),
        payload.get("pageIndex"),
        payload.get("maxWidth", 900),
        payload.get("format", "png"),
    )


def op_convert(payload, progress, inspector):
    if converter is None:
        raise RuntimeError("The DOCX converter module could not be loaded.")
    return converter.convert_pdf_to_docx(
        payload.get("inputPath"),
        payload.get("outputPath"),
        progress,
    )


def op_analyze_writer(payload, progress, inspector):
    import pdf_writer
    return pdf_writer.analyze_pdf(payload.get("inputPath"), progress)


def op_write_pdf(payload, progress, inspector):
    import pdf_writer
    return pdf_writer.write_pdf(
        payload.get("inputPath"),
        payload.get("outputPath"),
        payload.get("replace"),
        payload.get("tocPages"),
        payload.get("footers"),
        payload.get("footerGeo"),
        progress,
    )


OPERATIONS = {
    "ping": op_ping,
    "inspect_pdf": op_inspect,
    "render_page": op_render,
    "convert_pdf_to_docx": op_convert,
    "analyze_writer": op_analyze_writer,
    "write_pdf": op_write_pdf,
}


def handle(message, inspector, engine_error):
    request_id = message.get("requestId")
    if message.get("type") != "request" or not isinstance(request_id, str):
        emit({"type": "error", "requestId": request_id if isinstance(request_id, str) else None, "code": "INVALID_REQUEST", "message": "The request is not valid."})
        return
    job_id = message.get("payload", {}).get("jobId") if isinstance(message.get("payload"), dict) else None
    if not isinstance(job_id, str):
        job_id = None
    operation = OPERATIONS.get(message.get("operation"))
    payload = message.get("payload")
    if operation is None or not isinstance(payload, dict):
        emit({"type": "error", "requestId": request_id, "jobId": job_id, "code": "INVALID_REQUEST", "message": "The operation is not supported."})
        return

    def progress(stage, percent, text):
        emit({"type": "progress", "requestId": request_id, "jobId": job_id, "stage": stage, "percent": percent, "message": text})

    try:
        result = operation(payload, progress, inspector)
        emit({"type": "result", "requestId": request_id, "jobId": job_id, "status": "completed", "payload": result})
    except engine_error as exc:
        emit({"type": "error", "requestId": request_id, "jobId": job_id, "code": exc.code, "message": exc.message})
    except MemoryError:
        emit({"type": "error", "requestId": request_id, "jobId": job_id, "code": "OUT_OF_MEMORY", "message": "The document is too large to process on this computer."})
    except Exception as exc:
        traceback.print_exc()
        detail = str(exc).strip()
        text = "The document could not be processed"
        if detail:
            text += ": " + detail[:300]
        emit({"type": "error", "requestId": request_id, "jobId": job_id, "code": "INTERNAL_ERROR", "message": text})


def main():
    global converter
    configure_streams()
    try:
        import inspector
        from errors import EngineError
        import converter as converter_module
        converter = converter_module
    except ImportError as exc:
        traceback.print_exc()
        emit({"type": "ready", "ok": False, "code": "MISSING_DEPENDENCY", "message": "A required Python package is missing (%s). Run: pip install -r pdf-master/engine/requirements.txt" % exc})
        return 1
    except Exception as exc:
        traceback.print_exc()
        emit({"type": "ready", "ok": False, "code": "ENGINE_LOAD_ERROR", "message": "The PDF engine files could not be loaded. " + describe_error(exc)})
        return 1
    emit({"type": "ready", "ok": True, "version": VERSION, "python": sys.version.split()[0]})
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            message = json.loads(line)
        except ValueError:
            emit({"type": "error", "requestId": None, "code": "INVALID_REQUEST", "message": "The request is not valid JSON."})
            continue
        if not isinstance(message, dict):
            emit({"type": "error", "requestId": None, "code": "INVALID_REQUEST", "message": "The request is not valid."})
            continue
        handle(message, inspector, EngineError)
    return 0


if __name__ == "__main__":
    sys.exit(main())