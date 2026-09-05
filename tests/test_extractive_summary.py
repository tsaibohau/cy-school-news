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
assert summary["version"] == "extractive-v2"

multi_activity = {"title": "近期學生研習活動彙整", "blocks": [
    {"type": "heading", "text": "科學營"},
    {"type": "list", "items": [
        "科學營於9月12日辦理，請有興趣學生於9月5日前完成報名。",
        "寫作工作坊於9月20日在圖書館舉行，報名期限為9月10日。",
        "英語演講講座於9月25日在第一會議室辦理，採線上報名。",
    ]},
], "attachments": []}
multi_summary = summarize_detail(multi_activity)
assert len(multi_summary["items"]) >= 2
assert "另有" in multi_summary["text"]
assert {item["label"] for item in multi_summary["items"]} >= {"科學營", "寫作工作坊"}

pdf_only = {"title": "申請公告", "blocks": [], "attachments": [{
    "provenance": "official_attachment", "parse_status": "parsed",
    "embedded_text": "符合資格的學生請於9月10日前將申請表交至教務處註冊組。",
}]}
assert summarize_detail(pdf_only)["provenance"] == "official_attachment"
assert summarize_detail({"title": "公告", "blocks": [], "attachments": []})["status"] == "insufficient"
print("Deterministic extractive summary tests passed")
