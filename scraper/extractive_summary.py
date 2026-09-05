"""Deterministic, evidence-bearing summaries for official announcements."""
from __future__ import annotations

import re

SUMMARY_VERSION = "extractive-v3-public-minimized"
META_PREFIX = re.compile(r"^(?:作者|發布日期|發佈日期|最後更新日期)\s*[：:]\s*[^。！？!?]{0,80}", re.I)
NOISE = re.compile(r"^(?:下載附件|附件下載|回首頁|國立嘉義(?:女子)?高級中學)$")
SIGNALS = {"請": 2, "須": 2, "務必": 3, "截止": 5, "期限": 4, "報名": 4,
           "申請": 4, "繳交": 4, "辦理": 3, "時間": 3, "地點": 3,
           "對象": 3, "資格": 3, "調整": 3, "延期": 4, "取消": 4,
           "參加": 2, "附件": 1}
GENERIC_HEADINGS = {"說明", "公告內容", "主旨", "注意事項", "相關資訊", "附件"}
NUMBERED_ITEM = re.compile(r"^(?:第[一二三四五六七八九十]+項|[一二三四五六七八九十]+[、.]|\(?\d{1,2}\)?[、.)．])\s*")
PERSONAL_DATA = re.compile(r"(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:\d{2,4}[-\s]?)?\d{3,4}[-\s]?\d{3,4}|\b\d{8,10}\b)")
SHORT_FACT_NOTICE_CHARS = 60


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


def _short(value: str, limit: int = 150) -> str:
    value = _clean(value)
    return value if len(value) <= limit else value[:limit - 1].rstrip("，、；;：: ") + "…"


def _fingerprint(value: str) -> set[str]:
    compact = re.sub(r"[^0-9a-z\u3400-\u9fff]+", "", _clean(value).lower())
    return {compact[i:i + 2] for i in range(max(0, len(compact) - 1))}


def _too_similar(left: str, right: str) -> bool:
    a, b = _fingerprint(left), _fingerprint(right)
    if not a or not b:
        return _clean(left) == _clean(right)
    return len(a & b) / max(1, min(len(a), len(b))) >= .72


def _item_label(value: str, fallback: str = "") -> str:
    value = NUMBERED_ITEM.sub("", _clean(value)).strip()
    if "；" in value:
        first_cell = value.split("；", 1)[0].strip()
        if 2 <= len(first_cell) <= 24:
            return first_cell
    match = re.match(r"^([^，。；;：:]{2,24}?)(?:將?於|自\d|時間[：:]|日期[：:])", value)
    if match and not re.match(r"^(?:請|須|務必|本校|學生)", match.group(1)):
        return match.group(1).strip()
    return fallback


def _candidate_rows(record: dict) -> tuple[list[dict], bool]:
    rows: list[dict] = []
    current_heading = ""
    structured_groups = 0
    numbered_count = 0
    meaningful_headings: set[str] = set()
    for block in record.get("blocks") or []:
        block_type = block.get("type")
        if block_type == "heading":
            current_heading = _clean(block.get("text"))
            if current_heading and current_heading not in GENERIC_HEADINGS:
                meaningful_headings.add(current_heading)
            continue
        if block_type == "paragraph":
            values = [block.get("text")]
        elif block_type == "list":
            values = block.get("items") or []
            if len(values) >= 2: structured_groups += 1
        elif block_type == "table":
            values = ["；".join(map(str, row)) for row in block.get("rows") or []]
            if len(values) >= 2: structured_groups += 1
        else:
            values = []
        for value_index, value in enumerate(values):
            raw = _clean(value)
            if NUMBERED_ITEM.match(raw): numbered_count += 1
            label = current_heading
            if block_type in {"list", "table"}:
                label = _item_label(raw, current_heading) or f"項目 {value_index + 1}"
            for sentence in _sentences(value):
                rows.append({"sentence": sentence, "source": "official_article", "label": label, "position": len(rows)})
    return rows, structured_groups > 0 or numbered_count >= 2 or len(meaningful_headings) >= 2


def summarize_detail(record: dict, title: str = "") -> dict:
    candidates, explicit_multi = _candidate_rows(record)
    normalized_title = _clean(title or record.get("title"))
    candidates = [row for row in candidates if row["sentence"] != normalized_title and row["sentence"].strip("。") != normalized_title]
    safe_body_length = len(_clean(" ".join(
        str(block.get("text") or " ".join(map(str, block.get("items") or [])))
        for block in record.get("blocks") or []
    )))
    summary_limit = int(safe_body_length * .20)
    # A very short, factual notice cannot yield a readable 20% summary.  It may
    # be relayed verbatim only when it contains no detected personal data.
    full_notice = _clean(" ".join(row["sentence"] for row in candidates))
    if 12 <= len(full_notice) <= SHORT_FACT_NOTICE_CHARS and not PERSONAL_DATA.search(full_notice):
        return {"status": "extracted", "text": full_notice, "evidence": full_notice,
                "items": [], "provenance": "official_article", "mode": "short_fact_notice",
                "version": SUMMARY_VERSION}
    if not candidates or summary_limit < 12:
        return {"status": "insufficient", "text": "", "evidence": "",
                "items": [], "provenance": "", "version": SUMMARY_VERSION}
    title_terms = _title_terms(normalized_title)
    ranked = sorted(candidates, key=lambda row: (_score(row["sentence"], title_terms, row["position"], row["source"]), -row["position"]), reverse=True)
    selected: list[dict] = []
    for row in ranked:
        if any(_too_similar(row["sentence"], chosen["sentence"]) for chosen in selected): continue
        selected.append(row)
        if len(selected) >= (4 if explicit_multi else 1): break
    if not selected: selected = ranked[:1]
    if not explicit_multi: selected = selected[:1]
    items = [{"label": row["label"], "text": _short(row["sentence"]), "evidence": row["sentence"], "provenance": row["source"]} for row in selected]
    evidence, source = selected[0]["sentence"], selected[0]["source"]
    if len(items) == 1:
        text = _short(evidence, summary_limit)
    else:
        first = ((items[0]["label"] + "：") if items[0]["label"] and not items[0]["label"].startswith("項目 ") else "") + items[0]["text"]
        text = _short(first, max(12, summary_limit - 18)) + f"（另有 {len(items) - 1} 項重點）"
    return {"status": "extracted", "text": text, "evidence": evidence, "items": items, "provenance": source, "version": SUMMARY_VERSION}
