"""Deterministic, evidence-bearing summaries for official announcements."""
from __future__ import annotations

import re

SUMMARY_VERSION = "extractive-v1"
MAX_SUMMARY_CHARS = 180
META_PREFIX = re.compile(r"^(?:作者|發布日期|發佈日期|最後更新日期)\s*[：:]\s*[^。！？!?]{0,80}", re.I)
NOISE = re.compile(r"^(?:下載附件|附件下載|回首頁|國立嘉義(?:女子)?高級中學)$")
SIGNALS = {"請": 2, "須": 2, "務必": 3, "截止": 5, "期限": 4, "報名": 4,
           "申請": 4, "繳交": 4, "辦理": 3, "時間": 3, "地點": 3,
           "對象": 3, "資格": 3, "調整": 3, "延期": 4, "取消": 4,
           "參加": 2, "附件": 1}


def _clean(value: object) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    while META_PREFIX.match(text):
        text = META_PREFIX.sub("", text, count=1).strip(" ：:")
    return text


def _sentences(text: object) -> list[str]:
    rows = []
    for part in re.split(r"(?<=[。！？!?；;])|[\r\n]+", _clean(text)):
        part = _clean(part).strip("•·-–— ")
        if 12 <= len(part) <= 240 and not NOISE.match(part):
            rows.append(part)
    return rows


def _title_terms(title: str) -> set[str]:
    terms = set(re.findall(r"[a-z0-9]{2,}|[\u3400-\u9fff]{2,}", _clean(title).lower()))
    for token in list(terms):
        if re.fullmatch(r"[\u3400-\u9fff]+", token):
            terms.update(token[i:i + 2] for i in range(len(token) - 1))
    return terms


def _score(sentence: str, title_terms: set[str], position: int, source: str) -> int:
    score = (8 if source == "official_article" else 2) + max(0, 5 - min(position, 5))
    score += sum(weight for word, weight in SIGNALS.items() if word in sentence)
    score += min(8, sum(1 for term in title_terms if term and term in sentence.lower()))
    if re.search(r"(?:\d{1,3}年|\d{1,2}[月/.-]\d{1,2}|\d{1,2}[：:]\d{2})", sentence):
        score += 4
    if 28 <= len(sentence) <= 140:
        score += 3
    if len(re.findall(r"\d+", sentence)) > 10:
        score -= 6
    return score


def summarize_detail(record: dict, title: str = "") -> dict:
    candidates = []
    for block in record.get("blocks") or []:
        if block.get("type") in {"paragraph", "heading"}:
            values = [block.get("text")]
        elif block.get("type") == "list":
            values = block.get("items") or []
        elif block.get("type") == "table":
            values = ["；".join(map(str, row)) for row in block.get("rows") or []]
        else:
            values = []
        for value in values:
            candidates.extend((sentence, "official_article") for sentence in _sentences(value))
    for attachment in record.get("attachments") or []:
        if attachment.get("provenance") == "official_attachment" and attachment.get("parse_status") == "parsed":
            candidates.extend((sentence, "official_attachment")
                              for sentence in _sentences(attachment.get("embedded_text")))
    normalized_title = _clean(title or record.get("title"))
    candidates = [(sentence, source) for sentence, source in candidates
                  if sentence != normalized_title and sentence.strip("。") != normalized_title]
    if not candidates:
        return {"status": "insufficient", "text": "", "evidence": "",
                "provenance": "", "version": SUMMARY_VERSION}
    title_terms = _title_terms(normalized_title)
    ranked = [(_score(sentence, title_terms, index, source), -index, sentence, source)
              for index, (sentence, source) in enumerate(candidates)]
    _, _, evidence, source = max(ranked)
    text = evidence if len(evidence) <= MAX_SUMMARY_CHARS else evidence[:MAX_SUMMARY_CHARS - 1].rstrip() + "…"
    return {"status": "extracted", "text": text, "evidence": evidence,
            "provenance": source, "version": SUMMARY_VERSION}
