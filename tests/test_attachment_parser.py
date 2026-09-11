"""Offline attachment extraction tests: PDF/OOXML, no paid services."""

from io import BytesIO
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))
from attachment_parser import enrich_pdf_attachments, extract_embedded_text  # noqa: E402


def zip_bytes(files: dict[str, str]) -> bytes:
    stream = BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content.encode("utf-8"))
    return stream.getvalue()


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


def make_docx() -> bytes:
    return zip_bytes({
        "word/document.xml": '<?xml version="1.0"?><w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>報名表請送交學務處訓育組</w:t></w:r></w:p></w:body></w:document>'
    })


def make_xlsx() -> bytes:
    return zip_bytes({
        "xl/workbook.xml": '<?xml version="1.0"?><workbook xmlns="urn:x" xmlns:r="urn:r"><sheets><sheet name="報名" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": '<?xml version="1.0"?><Relationships xmlns="urn:rel"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
        "xl/sharedStrings.xml": '<?xml version="1.0"?><sst xmlns="urn:x"><si><t>承辦處室</t></si><si><t>學務處訓育組</t></si></sst>',
        "xl/worksheets/sheet1.xml": '<?xml version="1.0"?><worksheet xmlns="urn:x"><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row></sheetData></worksheet>',
    })


def make_pptx() -> bytes:
    return zip_bytes({
        "ppt/slides/slide1.xml": '<?xml version="1.0"?><p:sld xmlns:p="urn:p" xmlns:a="urn:a"><p:cSld><a:p><a:r><a:t>音樂比賽報名地點：學務處訓育組</a:t></a:r></a:p></p:cSld></p:sld>'
    })


assert extract_embedded_text(b"not a doc", "doc")["parse_status"] == "unparsed"
pdf = extract_embedded_text(make_pdf(), ".pdf")
assert pdf["parse_status"] == "needs_ocr", "blank/image-only PDF must be explicit, never guessed"
assert pdf["provenance"] == "official_attachment"
text_pdf = extract_embedded_text(make_text_pdf(), ".pdf")
assert text_pdf["parse_status"] == "parsed"
assert "Verified deadline 2026-09-01" in text_pdf["text"]
assert text_pdf["page_count"] == 1
assert text_pdf["content_sha256"]
assert "學務處訓育組" in extract_embedded_text(make_docx(), ".docx")["text"]
assert "學務處訓育組" in extract_embedded_text(make_xlsx(), ".xlsx")["text"]
assert "學務處訓育組" in extract_embedded_text(make_pptx(), ".pptx")["text"]
assert extract_embedded_text(b"fake", ".png")["parse_status"] == "needs_ocr"


class FakeResponse:
    url = "https://school.example/file.pdf"
    headers = {"content-length": str(len(make_text_pdf()))}

    def raise_for_status(self):
        return None

    def iter_content(self, _size):
        yield make_text_pdf()


class FakeSession:
    def get(self, *_args, **_kwargs):
        return FakeResponse()


record = {
    "source_url": "https://school.example/article/1",
    "source_hash": "article-revision",
    "attachments": [{"url": "https://school.example/file.pdf", "extension": ".pdf",
                     "parse_status": "unparsed", "provenance": "official_attachment"}],
}
budget = {"remaining": 1}
enrich_pdf_attachments(record, FakeSession(), budget, timeout_sec=1, request_delay_sec=0)
assert budget["remaining"] == 0
assert record["attachments"][0]["parse_status"] == "parsed"
assert "Verified deadline" in record["attachments"][0]["embedded_text"]
assert record["attachments"][0]["content_sha256"]
assert record["attachments"][0]["size"] == len(make_text_pdf())
assert record["source_hash"] != "article-revision", "attachment bytes must participate in detail revision"
assert record["article_source_hash"] == "article-revision"

remote = {
    "source_url": "https://school.example/article/1",
    "attachments": [{"url": "https://elsewhere.example/file.pdf", "extension": ".pdf"}],
}
enrich_pdf_attachments(remote, FakeSession(), {"remaining": 1}, timeout_sec=1, request_delay_sec=0)
assert remote["attachments"][0]["parse_status"] == "unsupported"
assert remote["attachments"][0]["parse_reason"] == "remote_host"
print("Attachment parser tests passed")
