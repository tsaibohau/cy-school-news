"""Offline contract tests for the iSchool JSON adapter."""
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))
from ischool_adapter import PkshAdapter, discover_uid  # noqa: E402

school = {"id": "pksh", "short": "北港高中", "base": "https://www.pksh.ylc.edu.tw",
          "ischool_uid": "WID_0_2_fallback"}
adapter = PkshAdapter(school)
uid, fallback = discover_uid('var g_unique_id = "WID_0_2_live";', school["ischool_uid"])
assert (uid, fallback) == (school["ischool_uid"], True)
uid, fallback = discover_uid("", school["ischool_uid"])
assert (uid, fallback) == ("WID_0_2_fallback", True)

# A partial WID may appear in a DOM class but is not accepted by the iSchool
# backend.  It must never override the configured complete fallback.
full_uid = "WID_0_2_0a14b8dc17bb7190f9566cc9fece58668f20208a"
truncated_uid = "WID_0_2_0a14b8dc17bb7190f9566cc9fece58668"
assert len(full_uid.rsplit("_", 1)[1]) == 40
assert len(truncated_uid.rsplit("_", 1)[1]) == 33
uid, fallback = discover_uid(f'var g_unique_id = "{full_uid}";', school["ischool_uid"])
assert (uid, fallback) == (full_uid, False)
uid, fallback = discover_uid(f'<div data-uid="{truncated_uid}"></div>', full_uid)
assert (uid, fallback) == (full_uid, True)
adapter.discover_board(f'<div data-uid="{truncated_uid}"></div>')
assert adapter.last_discovery_warning == "ignored incomplete iSchool UID (33 hex characters; expected 40)"

payload = [
    {"totalPages": "3"},
    {"newsId": "28123", "time": "2026/08/26", "title": "115學年學測第二次模擬考試程", "unit_name": "教務處", "attr_name": "公告", "clicks": "9"},
    {"newsId": "28123", "time": "2026/08/26", "title": "duplicate"},
    {"newsId": "bad", "title": "invalid"},
]
page = adapter.parse_list(payload, "WID_0_2_live")
assert page.total_pages == 3 and len(page.items) == 1
row = page.items[0]
assert row["id"] == "pksh-28123" and row["source_id"] == "pksh:28123"
assert row["date"] == "2026-08-26" and row["source_unit"] == "教務處"
assert row["url"].endswith("show.php?nid=28123")
detail = adapter.parse_detail({
    "content": "%E5%85%AC%E5%91%8A%E6%9C%AC%E6%96%87%3Ca%20href%3D%22https%3A%2F%2Fexample.invalid%22%3E%E5%A4%96%E9%83%A8%3C%2Fa%3E",
    "attachedfile": [{"name": "official.pdf", "url": "/ischool/news/attached/28123/official.pdf"}],
})
assert detail.content.startswith("公告本文")
assert detail.attachments[0]["filename"] == "official.pdf"
assert detail.external_links == [{"text": "外部", "url": "https://example.invalid"}]
try:
    adapter.parse_detail({"content": "The news is not existed"})
    raise AssertionError("deleted iSchool detail must fail")
except ValueError:
    pass

# Metadata with pages but no usable numeric newsId is an invalid list, not an
# empty school. It exercises external fake links and schema drift fail-closed.
try:
    adapter.parse_list([{"totalPages": 1}, {"newsId": "bad", "title": "偽造"}], "WID_0_2_live")
    raise AssertionError("invalid iSchool list must fail")
except ValueError:
    pass

class RetrySession:
    def __init__(self): self.calls = []
    def post(self, url, data, timeout, **kwargs):
        self.calls.append(kwargs)
        if len(self.calls) == 1:
            raise requests.exceptions.SSLError("fixture")
        class Response:
            def raise_for_status(self): pass
            def json(self): return [{"totalPages": 0}]
        return Response()

secure_school = dict(school, tls_verify_fallback="system-ca")
retry_session = RetrySession()
PkshAdapter(secure_school).fetch_list(retry_session, "WID_0_2_live")
assert len(retry_session.calls) == 2 and retry_session.calls[1].get("verify")
print("iSchool JSON adapter contract tests passed")
