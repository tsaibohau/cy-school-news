from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scraper"))
from extractive_summary import summarize_detail  # noqa: E402

record = {"title": "新生訓練調整公告", "blocks": [
    {"type": "paragraph", "text": "作者：訓育組 發佈日期：2026-08-24"},
    {"type": "paragraph", "text": "因應豪大雨，新生訓練調整至8月26日上午八時辦理，請同學準時到校。"},
    {"type": "paragraph", "text": "詳細流程請參閱附件。"},
], "attachments": []}
summary = summarize_detail(record)
assert summary["status"] == "extracted"
assert summary["provenance"] == "official_article"
assert "8月26日" in summary["text"]
assert "作者" not in summary["text"]
assert summary["evidence"]

pdf_only = {"title": "申請公告", "blocks": [], "attachments": [{
    "provenance": "official_attachment", "parse_status": "parsed",
    "embedded_text": "符合資格的學生請於9月10日前將申請表交至教務處註冊組。",
}]}
assert summarize_detail(pdf_only)["provenance"] == "official_attachment"
assert summarize_detail({"title": "公告", "blocks": [], "attachments": []})["status"] == "insufficient"
print("Deterministic extractive summary tests passed")
