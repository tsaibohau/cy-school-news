"""List-page dates: 嘉女 keeps the date in the table row, four levels above the link."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scraper"))
import scrape  # noqa: E402

CYGSH = next(s for s in scrape.CONFIG["schools"] if s["id"] == "cygsh")
# Structure copied from the live 嘉女 list page (2026-10-26 diagnostic run).
ROWS = """<table class="listTB table"><thead><tr><th>日期</th><th>標題</th><th>資料建立者</th></tr></thead><tbody>
<tr><td data-th="日期"><div class="d-txt"> 2026-10-12 </div></td>
    <td data-th="標題"><div class="d-txt"><div class="mtitle"><a href="https://www.cygsh.cy.edu.tw/p/406-1013-186869,r508.php">115-1 10/28-29 高三第三次學測模擬考考程表及範圍</a></div></div></td>
    <td data-th="資料建立者"><div class="d-txt"> 試務組長 </div></td></tr>
<tr><td data-th="日期"><div class="d-txt"></div></td>
    <td data-th="標題"><div class="d-txt"><div class="mtitle"><a href="https://www.cygsh.cy.edu.tw/p/406-1013-186563,r508.php">【公告】畢業紀念冊封面設計徵稿</a></div></div></td>
    <td data-th="資料建立者"><div class="d-txt"> 訓育組長 </div></td></tr>
</tbody></table>"""

items = scrape.extract_rulingdigital_items(ROWS, CYGSH, "https://www.cygsh.cy.edu.tw/p/403-1013-508-1.php")
dates = {item["id"]: item["date"] for item in items}
assert dates["cygsh-186869"] == "2026-10-12", dates
assert dates["cygsh-186563"] == "", "a row without a date never borrows its neighbour's date"
print("List date tests passed")
