"""Bounded local readers. The caller must first fetch same-origin official bytes safely."""
from __future__ import annotations

import hashlib
import importlib.util
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
MAX_TEXT_CHARS = 120_000
MAX_XLS_SHEETS = 30
MAX_XLS_ROWS = 20_000


def read_attachment(source_name: str, data: bytes, *, enable_ocr: bool = False) -> dict:
    name = Path(source_name).name[:300]
    ext = Path(name).suffix.lower().lstrip(".")
    digest = hashlib.sha256(data).hexdigest()
    base = {"source_name": name, "source_type": "attachment", "content_sha256": digest}
    if len(data) > MAX_ATTACHMENT_BYTES:
        return {**base, "parse_status": "unsupported", "reason": "size_limit", "text": ""}
    if ext in {"pdf", "docx", "xlsx", "pptx", "jpg", "jpeg", "png", "gif", "webp"}:
        parser = _repo_attachment_parser
        if parser is None:
            return {**base, "parse_status":"unsupported", "reason":"repository_parser_unavailable", "text":""}
        parsed = parser.extract_embedded_text(data, ext, max_chars=MAX_TEXT_CHARS, enable_ocr=enable_ocr)
        return {**base, **{k:v for k,v in parsed.items() if k not in {"content_sha256", "text"}},
                "text": parsed.get("text", ""), "parser": parsed.get("parser_version")}
    if ext == "xls":
        try:
            import xlrd  # Optional dependency; fail closed if absent.
        except ImportError:
            return {**base, "parse_status":"unsupported", "reason":"xlrd_not_installed", "text":""}
        try:
            book = xlrd.open_workbook(file_contents=data, on_demand=True)
            if book.nsheets > MAX_XLS_SHEETS:
                return {**base, "parse_status":"unsupported", "reason":"sheet_limit", "text":""}
            lines, size = [], 0
            for sheet in book.sheets():
                lines.append(f"[工作表：{sheet.name}]")
                for row_index in range(min(sheet.nrows, MAX_XLS_ROWS)):
                    values = [str(sheet.cell_value(row_index, col) or "").strip() for col in range(sheet.ncols)]
                    line = " | ".join(values).strip(" |")
                    if line:
                        lines.append(line); size += len(line)
                        if size >= MAX_TEXT_CHARS: break
            text = "\n".join(lines)[:MAX_TEXT_CHARS]
            return {**base, "parse_status":"parsed" if text else "unparsed", "text":text,
                    "text_length":len(text), "parser":"xlrd"}
        except Exception:
            return {**base, "parse_status":"unparsed", "reason":"invalid_xls", "text":""}
    if ext == "doc":
        binary = shutil.which("antiword")
        if not binary:
            return {**base, "parse_status":"unsupported", "reason":"antiword_not_installed", "text":""}
        try:
            with tempfile.TemporaryDirectory(prefix="cynews-doc-") as directory:
                path = Path(directory) / "source.doc"
                path.write_bytes(data)
                run = subprocess.run([binary, "-mUTF-8", str(path)], capture_output=True,
                                     timeout=15, check=False, shell=False, env={"PATH": str(Path(binary).parent)})
                text = run.stdout.decode("utf-8", "replace")[:MAX_TEXT_CHARS].strip()
                if run.returncode != 0 or not text:
                    return {**base, "parse_status":"unparsed", "reason":"legacy_doc_parse_failed", "text":""}
                return {**base, "parse_status":"parsed", "text":text, "text_length":len(text), "parser":"antiword"}
        except subprocess.TimeoutExpired:
            return {**base, "parse_status":"unsupported", "reason":"parser_timeout", "text":""}
        except OSError:
            return {**base, "parse_status":"unparsed", "reason":"legacy_doc_parse_failed", "text":""}
    return {**base, "parse_status":"unsupported", "reason":"unsupported_format", "text":""}


def _load_repo_parser():
    root = next((p for p in Path(__file__).resolve().parents if (p / "scraper" / "attachment_parser.py").is_file()), None)
    if root is None:
        return None
    scraper_path = str(root / "scraper")
    if scraper_path not in sys.path:
        sys.path.insert(0, scraper_path)
    source = root / "scraper" / "attachment_parser.py"
    spec = importlib.util.spec_from_file_location("_repo_attachment_parser", source)
    if not spec or not spec.loader:
        raise ImportError("repository attachment parser unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_repo_attachment_parser = _load_repo_parser()
