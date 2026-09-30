import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
from attachment_reader import MAX_ATTACHMENT_BYTES, read_attachment
from official_fetcher import _safe_url, fetch_official_document
from attachment_ingest import extract_official_document_links, acquire_official_attachments


class FakeResponse:
    def __init__(self, status=200, headers=None, chunks=(b"pdf",)):
        self.status_code=status
        self.headers=headers or {"content-type":"application/pdf"}
        self.chunks=chunks
        self.closed=False
    def iter_content(self, _size):
        yield from self.chunks
    def close(self):
        self.closed=True


class FakeSession:
    def __init__(self, responses):
        self.responses=list(responses);self.calls=[]
    def get(self, url, **kwargs):
        self.calls.append((url,kwargs))
        return self.responses.pop(0)


class AttachmentAndFetchTests(unittest.TestCase):
    def test_attachment_fail_closed_and_size_cap(self):
        too_big=read_attachment("brief.pdf",b"x"*(MAX_ATTACHMENT_BYTES+1))
        self.assertEqual(too_big["reason"],"size_limit")
        self.assertEqual(read_attachment("brief.zip",b"x")["reason"],"unsupported_format")
        with patch("attachment_reader.shutil.which",return_value=None):
            self.assertEqual(read_attachment("legacy.doc",b"x")["reason"],"antiword_not_installed")

    def test_exact_official_host_and_query_filename_allowlist(self):
        self.assertTrue(_safe_url("https://school.example.tw/file?filename=notice.pdf",{"school.example.tw"}))
        self.assertFalse(_safe_url("https://evil.example/notice.pdf",{"school.example.tw"}))
        self.assertFalse(_safe_url("http://school.example.tw/notice.pdf",{"school.example.tw"}))
        self.assertFalse(_safe_url("https://user:pw@school.example.tw/notice.pdf",{"school.example.tw"}))

    def test_fetch_closes_response_and_confirms_404(self):
        ok=FakeResponse()
        session=FakeSession([ok])
        result=fetch_official_document(session,"https://school.example.tw/notice.pdf",source_host="school.example.tw")
        self.assertEqual(result["canonical_status"],"available")
        self.assertEqual(result["bytes"],b"pdf");self.assertTrue(ok.closed)
        missing=FakeResponse(404)
        result=fetch_official_document(FakeSession([missing]),"https://school.example.tw/notice.pdf",source_host="school.example.tw")
        self.assertEqual(result["canonical_status"],"missing_confirmed");self.assertTrue(missing.closed)

    def test_unsafe_redirect_is_not_followed(self):
        redirect=FakeResponse(302,{"location":"https://evil.example/steal.pdf"})
        session=FakeSession([redirect])
        result=fetch_official_document(session,"https://school.example.tw/notice.pdf",source_host="school.example.tw")
        self.assertEqual(result["reason"],"unsafe_redirect")
        self.assertEqual(len(session.calls),1);self.assertTrue(redirect.closed)

    def test_only_allowlisted_document_links_are_acquired(self):
        html='<a href="/files/rules.pdf">PDF</a><a href="https://evil.example/x.pdf">bad</a><a href="/apply">apply</a>'
        links=extract_official_document_links(html,"https://school.example.tw/notice/1",trusted_hosts=set())
        self.assertEqual(links,["https://school.example.tw/files/rules.pdf"])
        response=FakeResponse();session=FakeSession([response])
        rows=acquire_official_attachments(session,html,"https://school.example.tw/notice/1",trusted_hosts=set())
        self.assertEqual(rows[0]["bytes"],b"pdf");self.assertEqual(rows[0]["source_name"],"rules.pdf")
        self.assertEqual(len(session.calls),1)


if __name__=="__main__":unittest.main(verbosity=2)
