from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scraper"))

from detail_parser import parse_article_detail  # noqa: E402
from scrape import extract_article_date_result, extract_items  # noqa: E402


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
