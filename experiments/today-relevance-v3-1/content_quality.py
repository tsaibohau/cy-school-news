"""Deterministic first-pass page quality; final semantic extraction remains model-owned."""
from __future__ import annotations

import re

BOILERPLATE = re.compile(
    r"(?::::|首頁|網站導覽|回首頁|跳到主要內容|字體大小調整|字型大小|"
    r"瀏覽數\s*[:：]?|列印|分享|上一頁|下一頁|回上頁|本頁附件|"
    r"facebook|line分享|powered by|登入|無障礙網頁)", re.I
)


def _norm(text: str) -> str:
    return re.sub(r"[\W_]+", "", text or "", flags=re.UNICODE).lower()


def assess_content(body: str | None, title: str, *, fetch_succeeded: bool) -> dict:
    raw = re.sub(r"\s+", " ", body or "").strip()
    if not fetch_succeeded:
        return {"content_quality": "unavailable", "usable_content": False, "quality_confidence": 0.99, "text": ""}
    if not raw:
        return {"content_quality": "uncertain", "usable_content": False, "quality_confidence": 0.65, "text": ""}
    title_norm = _norm(title)
    segments = [x.strip() for x in re.split(r"(?:::+|\s{2,}|[。；;])", raw) if x.strip()]
    meaningful = [x for x in segments if len(_norm(BOILERPLATE.sub("", x))) >= 8]
    core_segments = [x for x in meaningful if title_norm and title_norm not in _norm(x)]
    core = "\n".join(core_segments).strip()
    cleaned_all = BOILERPLATE.sub(" ", raw)
    cleaned_all = re.sub(r"\s+", " ", cleaned_all).strip()
    cleaned_norm = _norm(cleaned_all)
    if title_norm and (cleaned_norm == title_norm or
                       (title_norm in cleaned_norm and len(cleaned_norm) <= len(title_norm) * 3)):
        quality = "title_only"
        result_text = ""
    elif not meaningful or not cleaned_norm:
        quality = "boilerplate_only"
        result_text = ""
    elif title_norm and len(_norm(core)) < 24 and (len(_norm(raw)) < 220 or not core_segments):
        quality = "title_only"
        result_text = ""
    else:
        # A short article can still be complete when it contains a concrete sentence.
        substantial = len(_norm(core or cleaned_all)) >= 120 or (len(meaningful) >= 2 and len(_norm(core)) >= 55)
        quality = "full" if substantial else "partial" if len(_norm(core or cleaned_all)) >= 28 else "uncertain"
        result_text = core or cleaned_all if quality in {"full", "partial"} else ""
    return {"content_quality": quality, "usable_content": quality in {"full", "partial"},
            "quality_confidence": 0.88 if quality in {"title_only", "boilerplate_only"} else 0.68,
            "text": result_text[:120_000]}
