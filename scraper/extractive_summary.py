"""Deterministic, evidence-bearing summaries for official announcements."""
from __future__ import annotations

import re

SUMMARY_VERSION = "extractive-v4"
# Strip only the label and its value (a date or a short unit name), never the text after it.
META_PREFIX = re.compile(r"^(?:作者|發布日期|發佈日期|最後更新日期)\s*[：:]\s*(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|[^\s：:]{1,20})", re.I)
NOISE = re.compile(r"^(?:下載附件|附件下載|回首頁|國立嘉義(?:女子)?高級中學)$")
SIGNALS = {"請": 2, "須": 2, "務必": 3, "截止": 5, "期限": 4, "報名": 4,
           "申請": 4, "繳交": 4, "辦理": 3, "時間": 3, "地點": 3,
           "對象": 3, "資格": 3, "調整": 3, "延期": 4, "取消": 4,
           "參加": 2, "附件": 1}
GENERIC_HEADINGS = {"說明", "公告內容", "主旨", "注意事項", "相關資訊", "附件"}
NUMBERED_ITEM = re.compile(r"^(?:第[一二三四五六七八九十]+項|[一二三四五六七八九十]+[、.]|\(?\d{1,2}\)?[、.)．])\s*")
PERSONAL_DATA = re.compile(r"(?:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(?:\d{2,4}[-\s]?)?\d{3,4}[-\s]?\d{3,4}|\b\d{8,10}\b)")
SHORT_FACT_NOTICE_CHARS = 60
# Likely personal names: class number + name + 同學, or name + 小姐/先生/女士.
PERSON_NAME = re.compile(r"\d{3}\s*[\u4e00-\u9fff]{2,3}\s*同學|[\u4e00-\u9fff]{2,3}\s*(?:小姐|先生|女士)")
# Background and routing phrases that say little about what the reader must do.
BOILERPLATE = re.compile(r"^(?:說明\s*[：:]\s*)?(?:[一二三四五六七八九十]+、\s*)?(?:依據|依\S{0,12}函|檢送|本部|本會|本署|本局|為推動|為提升|為鼓勵|為落實|旨揭)|詳如附件|請參閱附件|如附件|請轉知|惠請|敬請|請查照|諒達")
LEAD_IN = re.compile(r"^(?:說明\s*[：:]\s*|主旨\s*[：:]\s*)?(?:[一二三四五六七八九十]+、|\(?[0-9]{1,2}\)?[、.．])?\s*")
# Accuracy over brevity (user decision 2026-10-26): keep more of the facts.
SUMMARY_MIN_CHARS = 80
SUMMARY_MAX_CHARS = 200
MULTI_MAX_CHARS = 240
SINGLE_MAX_SENTENCES = 3
MAX_SENTENCE_CHARS = 240


def _clean(value: object) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    while META_PREFIX.match(text):
        text = META_PREFIX.sub("", text, count=1).strip(" ：:")
    return text


def _split_long(part: str) -> list[str]:
    """Break a run-on sentence at commas so it is kept instead of discarded."""
    if len(part) <= MAX_SENTENCE_CHARS:
        return [part]
    chunks, current = [], ""
    for piece in re.split(r"(?<=[，,、：:])", part):
        if current and len(current) + len(piece) > MAX_SENTENCE_CHARS:
            chunks.append(current)
            current = ""
        current += piece
    if current:
        chunks.append(current)
    return [chunk[:MAX_SENTENCE_CHARS] for chunk in chunks]


def _sentences(text: object) -> list[str]:
    rows = []
    for part in re.split(r"(?<=[。！？!?；;])|[\r\n]+", _clean(text)):
        part = _clean(part).strip("•·-–— ")
        for piece in _split_long(part):
            piece = piece.strip()
            if len(piece) >= 12 and not NOISE.match(piece):
                rows.append(piece)
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
    if BOILERPLATE.search(sentence):
        score -= 8
    if PERSON_NAME.search(sentence) or PERSONAL_DATA.search(sentence):
        score -= 12
    return score


def _short(value: str, limit: int = 150) -> str:
    value = LEAD_IN.sub("", _clean(value), count=1) or _clean(value)
    if len(value) <= limit:
        return value
    cut = value[:limit - 1]
    # Prefer ending at a clause boundary so numbers and names are not split.
    boundary = max(cut.rfind(mark) for mark in "，、；;。 ")
    if boundary >= limit * .6:
        cut = cut[:boundary]
    return cut.rstrip("，、；;：: ") + "…"


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
            # Some posts are written entirely as bold headings; keep long ones as text.
            if len(current_heading) >= 24:
                for sentence in _sentences(current_heading):
                    rows.append({"sentence": sentence, "source": "official_article", "label": "", "position": len(rows)})
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
    # Many notices only say 詳如附件; parsed attachment text then carries the facts.
    for attachment in record.get("attachments") or []:
        if attachment.get("parse_status") != "parsed" or attachment.get("provenance") != "official_attachment":
            continue
        for sentence in _sentences(str(attachment.get("embedded_text") or "")[:20000])[:200]:
            rows.append({"sentence": sentence, "source": "official_attachment", "label": "", "position": len(rows)})
    return rows, structured_groups > 0 or numbered_count >= 2 or len(meaningful_headings) >= 2


def summarize_detail(record: dict, title: str = "") -> dict:
    candidates, explicit_multi = _candidate_rows(record)
    normalized_title = _clean(title or record.get("title"))
    candidates = [row for row in candidates if row["sentence"] != normalized_title and row["sentence"].strip("。") != normalized_title]
    safe_body_length = len(_clean(" ".join(
        str(block.get("text") or " ".join(map(str, block.get("items") or [])))
        for block in record.get("blocks") or []
    )))
    summary_limit = min(SUMMARY_MAX_CHARS, max(SUMMARY_MIN_CHARS, int(safe_body_length * .20)))
    # A very short, factual notice cannot yield a readable 20% summary.  It may
    # be relayed verbatim only when it contains no detected personal data.
    full_notice = _clean(" ".join(row["sentence"] for row in candidates))
    if 12 <= len(full_notice) <= SHORT_FACT_NOTICE_CHARS and not PERSONAL_DATA.search(full_notice) \
            and not PERSON_NAME.search(full_notice):
        sources = {row["source"] for row in candidates}
        return {"status": "extracted", "text": full_notice, "evidence": full_notice,
                "items": [], "provenance": sources.pop() if len(sources) == 1 else "official_article", "mode": "short_fact_notice",
                "version": SUMMARY_VERSION}
    if not candidates:
        return {"status": "insufficient", "text": "", "evidence": "",
                "items": [], "provenance": "", "version": SUMMARY_VERSION}
    title_terms = _title_terms(normalized_title)
    ranked = sorted(candidates, key=lambda row: (_score(row["sentence"], title_terms, row["position"], row["source"]), -row["position"]), reverse=True)
    selected: list[dict] = []
    for row in ranked:
        if any(_too_similar(row["sentence"], chosen["sentence"]) for chosen in selected): continue
        selected.append(row)
        if len(selected) >= (4 if explicit_multi else SINGLE_MAX_SENTENCES): break
    if not selected: selected = ranked[:1]
    if not explicit_multi:
        # Keep the best sentence plus useful runners-up, read in document order.
        best = selected[0]
        extra = [row for row in selected[1:] if not BOILERPLATE.search(row["sentence"])
                 and not PERSON_NAME.search(row["sentence"]) and not PERSONAL_DATA.search(row["sentence"])]
        selected = [best] + extra
    items = [{"label": row["label"], "text": _short(row["sentence"]), "evidence": row["sentence"], "provenance": row["source"]} for row in selected]
    evidence, source = selected[0]["sentence"], selected[0]["source"]
    if explicit_multi and len(items) > 1:
        # Every point stays in the text so search can find it.
        parts = [((item["label"] + "：") if item["label"] and not item["label"].startswith("項目 ") else "") + item["text"] for item in items]
        text = _short("；".join(parts), MULTI_MAX_CHARS)
    else:
        ordered = sorted(selected, key=lambda row: row["position"])
        text = _short(" ".join(LEAD_IN.sub("", row["sentence"], count=1) for row in ordered), summary_limit)
        items = items[:1]
    return {"status": "extracted", "text": text, "evidence": evidence, "items": items, "provenance": source, "version": SUMMARY_VERSION}
