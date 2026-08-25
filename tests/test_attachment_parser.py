"""Offline attachment text tests: embedded PDF text only, never OCR."""

from io import BytesIO
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))
from attachment_parser import enrich_pdf_attachments, extract_embedded_text  # noqa: E402


def make_pdf() -> bytes:
    from pypdf import PdfWriter
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    stream = BytesIO()
    writer.write(stream)
    return stream.getvalue()


def make_text_pdf() -> bytes:
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
    writer = PdfWriter()
    page = writer.add_blank_page(width=300, height=200)
    font = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
    })
    page[NameObject("/Resources")] = DictionaryObject({
        NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)}),
    })
    content = DecodedStreamObject()
    content.set_data(b"BT /F1 12 Tf 20 100 Td (Verified deadline 2026-09-01) Tj ET")
    page[NameObject("/Contents")] = writer._add_object(content)
    stream = BytesIO()
    writer.write(stream)
    return stream.getvalue()


assert extract_embedded_text(b"not a doc", "docx")["parse_status"] == "unparsed"
pdf = extract_embedded_text(make_pdf(), ".pdf")
assert pdf["parse_status"] == "unparsed", "blank/image-only PDF must not be guessed"
assert pdf["provenance"] == "official_attachment"
text_pdf = extract_embedded_text(make_text_pdf(), ".pdf")
assert text_pdf["parse_status"] == "parsed"
assert "Verified deadline 2026-09-01" in text_pdf["text"]
assert text_pdf["page_count"] == 1
assert text_pdf["content_sha256"]


class FakeResponse:
    url = "https://school.example/file.pdf"
    headers = {"content-length": str(len(make_pdf()))}

    def raise_for_status(self):
        return None

    def iter_content(self, _size):
        yield make_pdf()


class FakeSession:
    def get(self, *_args, **_kwargs):
        return FakeResponse()


record = {
    "source_url": "https://school.example/article/1",
    "attachments": [{"url": "https://school.example/file.pdf", "extension": ".pdf",
                     "parse_status": "unparsed", "provenance": "official_attachment"}],
}
budget = {"remaining": 1}
enrich_pdf_attachments(record, FakeSession(), budget, timeout_sec=1, request_delay_sec=0)
assert budget["remaining"] == 0
assert record["attachments"][0]["parse_status"] == "unparsed"
assert record["attachments"][0]["content_sha256"]
assert record["attachments"][0]["size"] == len(make_pdf())

remote = {
    "source_url": "https://school.example/article/1",
    "attachments": [{"url": "https://elsewhere.example/file.pdf", "extension": ".pdf"}],
}
enrich_pdf_attachments(remote, FakeSession(), {"remaining": 1}, timeout_sec=1, request_delay_sec=0)
assert remote["attachments"][0]["parse_status"] == "unsupported"
assert remote["attachments"][0]["parse_reason"] == "remote_host"
print("Attachment parser tests passed")

