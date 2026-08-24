"""Deterministic extraction for embedded attachment text.

Only formats with a reliable text layer are parsed. Image-only PDFs and
unsupported office formats remain explicitly unparsed; no OCR or guessing.
"""

from io import BytesIO


def extract_embedded_text(data: bytes, extension: str) -> dict:
    ext = (extension or "").lower().lstrip(".")
    if ext != "pdf":
        return {"text": "", "parse_status": "unparsed", "provenance": "official_attachment"}
    try:
        from pypdf import PdfReader
        reader = PdfReader(BytesIO(data))
        pages = [(page.extract_text() or "").strip() for page in reader.pages]
        text = "\n\n".join(page for page in pages if page)
        return {
            "text": text,
            "parse_status": "parsed" if text else "unparsed",
            "provenance": "official_attachment",
        }
    except Exception:
        return {"text": "", "parse_status": "unparsed", "provenance": "official_attachment"}

