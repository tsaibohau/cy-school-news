# -*- coding: utf-8 -*-
"""嘉女學生規定：從已收錄的學校網頁挑出規定檔，轉成規定章節。"""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scraper"))
import school_rules  # noqa: E402

O = "https://www.cygsh.cy.edu.tw"
assert school_rules.download_url("https://drive.google.com/file/d/1IA3d58EuiCps9KS_SWfawdtqtFwJH7lx/view?usp=sharing", O) == \
    ("https://drive.google.com/uc?export=download&id=1IA3d58EuiCps9KS_SWfawdtqtFwJH7lx", "")
assert school_rules.download_url("//www.cygsh.cy.edu.tw/var/file/13/1013/img/104/357848876.pdf", O)[1] == "pdf"
assert school_rules.download_url("https://drive.google.com/drive/folders/1BLrnjjuHn3TuhqQlu5Hb3JGLTeLB_ptT", O) is None, "folders are skipped"
assert school_rules.download_url("https://example.com/rule.pdf", O) is None, "other sites are skipped"

def page(pid, path, links):
    return {"page_id": pid, "status": "ok", "path": path, "doc_links": links}

index = {"pages": {
    "1": page(1, ["行政單位", "學務處", "生活輔導組", "生活教育及輔導"], [
        {"name": "請假規定", "url": "https://drive.google.com/file/d/1IA3d58EuiCps9KS_SWfawdtqtFwJH7lx/view"},
        {"name": "服裝儀容規定", "url": "https://drive.google.com/file/d/1DwfUdDVnD_D4I7f3ARReRSCxmdenPuii/view"},
        {"name": "請假單（表單）", "url": "https://drive.google.com/file/d/1XXXXXXXXXXXXXXXXXXXXXXXXXXXX/view"},
    ]),
    "2": page(2, ["行政單位", "總務處"], [{"name": "職業衛生安全辦法", "url": "https://drive.google.com/file/d/1YYYYYYYYYYYYYYYYYYYYYYYYYY/view"}]),
    "3": page(3, ["教務處", "註冊組", "學習歷程檔案"], [{"name": "本校補充規定", "url": "https://drive.google.com/file/d/1re2pl1Xd16WAKcYt1XCLZLFk_YCtI6br/view"}]),
    "4": page(4, ["學務處", "生活輔導組"], [{"name": "教師請假規定", "url": "https://drive.google.com/file/d/1ZZZZZZZZZZZZZZZZZZZZZZZZZZZ/view"}]),
}}
names = [doc["name"] for doc in school_rules.candidates(index, "cygsh")]
assert names == ["請假規定", "服裝儀容規定", "學習歷程檔案本校補充規定"], names

# A run turns downloaded text into chapters; a failed download keeps nothing new and says so.
class Response:
    def __init__(self, data): self.content, self.headers = data, {"content-type": "application/pdf"}
    def raise_for_status(self): pass

class Session:
    def get(self, url, **_):
        if "1DwfU" in url:
            raise OSError("timeout")
        return Response(b"%PDF-fake")

school_rules.rule_text = lambda data, ext: ("一、學生請假應於三日內完成請假手續，並經導師核准。\n二、事假應事先辦理，病假得於返校後三日內補辦，逾期以曠課論。", "parsed")
school_rules.write_details = lambda school, records: None
status = school_rules.update(index, "cygsh", "嘉女", Session(), delay=0, now=datetime(2026, 11, 2))
items = index["rules"]["items"]
assert [item["title"] for item in items] == ["學生規定 › 請假規定", "學生規定 › 學習歷程檔案本校補充規定"], items
assert items[0]["kind"] == "school_handbook" and items[0]["detail_ref"].startswith("data/details/cygsh/cygsh-rule-")
assert "失敗 1" in status, status
# Fresh files are not downloaded again within CHECK_DAYS.
assert "本次讀 1 份" in school_rules.update(index, "cygsh", "嘉女", Session(), delay=0, now=datetime(2026, 11, 3)), "only the failed one is retried"
print("school rules tests passed")
