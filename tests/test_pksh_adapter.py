from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

import requests
import scrape  # noqa: E402
from detail_parser import parse_article_detail  # noqa: E402
from scrape import extract_article_date_result, extract_ischool_next_page, extract_items  # noqa: E402


def read(name):
    return (ROOT / "tests" / "fixtures" / name).read_text(encoding="utf-8")


school = {
    "id": "pksh", "name": "國立北港高級中學", "short": "北港高中",
    "base": "https://www.pksh.ylc.edu.tw", "adapter": "ischool-site-news",
}
source = "https://www.pksh.ylc.edu.tw/ischool/widget/site_news/main2.php?uid=official"
items = extract_items(read("pksh_list.html"), school, source)
assert [row["id"] for row in items] == ["pksh-28123", "pksh-28101"]
assert items[0]["date"] == "2026-08-26" and items[0]["date_source"] == "list"
assert items[1]["url"] == "https://www.pksh.ylc.edu.tw/ischool/public/news_view/show.php?nid=28101"
assert all(row["school_name"] == "北港高中" for row in items)
assert extract_ischool_next_page(read("pksh_list.html"), school, source) == \
    "https://www.pksh.ylc.edu.tw/ischool/widget/site_news/main2.php?uid=official&page=2"


class FakeResponse:
    content = "<html>官方列表</html>".encode()
    encoding = "utf-8"
    apparent_encoding = "utf-8"

    def raise_for_status(self):
        return None


class TLSFallbackSession:
    def __init__(self):
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if len(self.calls) == 1:
            raise requests.exceptions.SSLError("certificate chain incomplete")
        return FakeResponse()


fallback_session = TLSFallbackSession()
original_system_ca_bundle = scrape.system_ca_bundle
scrape.system_ca_bundle = lambda: "/etc/ssl/certs/ca-certificates.crt"
try:
    assert scrape.fetch(fallback_session, source, {
        **school, "tls_verify_fallback": "system-ca",
    }) == "<html>官方列表</html>"
finally:
    scrape.system_ca_bundle = original_system_ca_bundle
assert len(fallback_session.calls) == 2
assert fallback_session.calls[1][1]["verify"] == "/etc/ssl/certs/ca-certificates.crt"
assert fallback_session.calls[1][1]["verify"] is not False

detail_html = read("pksh_detail.html")
assert extract_article_date_result(detail_html) == {"date": "2026-08-26", "date_source": "publication"}
detail = parse_article_detail(
    detail_html, announcement_id="pksh-28123", school_id="pksh",
    title=items[0]["title"], source_url=items[0]["url"],
)
assert detail["parse_status"] == "parsed"
assert any("九月二日" in block.get("text", "") for block in detail["blocks"])
assert any(file["url"].endswith("mock-exam.pdf") for file in detail["attachments"])
assert all("evil.example" not in file["url"] for file in detail["attachments"])
print("PKSH iSchool announcement adapter tests passed")
