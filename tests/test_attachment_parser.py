"""Offline attachment text tests: embedded PDF text only, never OCR."""

from io import BytesIO
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))
from attachment_parser import extract_embedded_text  # noqa: E402


def make_pdf() -> bytes:
    from pypdf import PdfWriter
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    stream = BytesIO()
    writer.write(stream)
    return stream.getvalue()


assert extract_embedded_text(b"not a doc", "docx")["parse_status"] == "unparsed"
pdf = extract_embedded_text(make_pdf(), ".pdf")
assert pdf["parse_status"] == "unparsed", "blank/image-only PDF must not be guessed"
assert pdf["provenance"] == "official_attachment"
print("Attachment parser tests passed")

