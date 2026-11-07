# -*- coding: utf-8 -*-
"""Group the yearly editions of one recurring event into a "series" with a timeline.

Only public metadata is read (title, date, school, category); no body text is used and
nothing is sent anywhere.  Output: docs/data/series.json, written by the scrape job.

Pipeline
  1. normalize each title: strip office tags / forwarding words, extract year, edition and
     stage, drop organizer, fold synonyms -> a "series key" plus distinctive slots
     (subject, grade, level, gender) that must not differ inside one series.
  2. within one school, score candidate pairs with TF-IDF cosine over char 2-3-grams
     (rare-gram blocking), then merge greedily by group-level average linkage; hard
     vetoes: slot conflict, same year with different edition.  No plain union-find, so
     A~B~C chains cannot glue unrelated notices together.
  3. keep groups with >= 2 notices spanning >= 2 academic years, or >= 3 notices.
  4. name = majority 「」 name -> majority cleaned title -> stable tie-break; timeline =
     academic year, stage order, date; ids are stable (hash of school + first key, and
     re-used from the previous file by member overlap >= 0.5).
Manual fixes live in scraper/series_overrides.json (merge / split / exclude / rename).
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "docs" / "data"
OUT_PATH = DATA / "series.json"
OVERRIDES_PATH = Path(__file__).resolve().parent / "series_overrides.json"
SCHEMA_VERSION = 1

MATCH_SCORE = 0.62      # best link between two groups
AVG_SCORE = 0.50        # average link between two groups (group-level check)
CROSS_YEAR_BONUS = 0.04  # a different year is evidence for a recurring event
MIN_KEY = 3
QUOTE_DICE = 0.45
QUOTE_MAIN = 0.5
CONTAIN_MIN_LEN = 5      # a name this short or longer may be matched by containment
CONTAIN_MIN = 0.85
CONTAIN_WEIGHT = 0.80
ANCHOR_MIN, ANCHOR_MAX = 6, 16
ANCHOR_CAP_RATIO = 0.03
ANCHOR_SOLID = 0.6      # an anchor covering this much of the shorter key needs no further support
ANCHOR_RESIDUE = 0.2
RARE_DF_RATIO = 0.04
RARE_DF_MIN = 60
MAX_GROUP = 80

# ---------------------------------------------------------------- vocabulary
STAGES = [  # (word, label, rank)
    ("報名簡章", "簡章", 1), ("報名辦法", "簡章", 1), ("招生簡章", "簡章", 1), ("簡章", "簡章", 1), ("實施計畫", "簡章", 1), ("實施辦法", "簡章", 1), ("實施要點", "簡章", 1),
    ("競賽辦法", "簡章", 1), ("徵件辦法", "簡章", 1), ("辦法", "簡章", 1), ("須知", "簡章", 1), ("章程", "簡章", 1), ("規程", "簡章", 1),
    ("說明會", "說明會", 2), ("領隊會議", "說明會", 2), ("行前會議", "說明會", 2), ("行前說明", "說明會", 2),
    ("報名資訊", "報名", 3), ("報名表", "報名", 3), ("報名開始", "報名", 3), ("報名", "報名", 3), ("徵件", "報名", 3), ("徵稿", "報名", 3), ("徵選", "報名", 3), ("截止", "報名", 3),
    ("公告更正", "延期", 4), ("順延", "延期", 4), ("延期", "延期", 4), ("延長", "延期", 4), ("展延", "延期", 4), ("延後", "延期", 4), ("改期", "延期", 4),
    ("異動", "延期", 4), ("更正", "延期", 4), ("修正", "延期", 4), ("補充", "延期", 4), ("取消", "延期", 4), ("停辦", "延期", 4),
    ("校內初賽", "初賽", 5), ("校內賽", "初賽", 5), ("初賽", "初賽", 5), ("初選", "初賽", 5), ("預賽", "初賽", 5), ("資格賽", "初賽", 5),
    ("分區複賽", "複賽", 6), ("複賽", "複賽", 6), ("複選", "複賽", 6),
    ("選訓決賽營", "決賽", 7), ("決賽營", "決賽", 7), ("決選營", "決賽", 7), ("選拔營", "決賽", 7), ("選訓營", "決賽", 7), ("總決賽", "決賽", 7), ("決賽", "決賽", 7), ("決選", "決賽", 7), ("試題", "決賽", 7), ("解答", "決賽", 7),
    ("成績優異", "得獎", 8), ("優異", "得獎", 8), ("成績", "得獎", 8), ("結果", "得獎", 8), ("得獎名單", "得獎", 8), ("得獎", "得獎", 8), ("獲獎", "得獎", 8), ("獲得", "得獎", 8), ("錄取", "得獎", 8),
    ("入選", "得獎", 8), ("榜單", "得獎", 8), ("優勝", "得獎", 8), ("佳績", "得獎", 8), ("獲選", "得獎", 8), ("名單", "得獎", 8), ("榮獲", "得獎", 8),
    ("頒獎典禮", "頒獎", 9), ("頒獎", "頒獎", 9), ("表揚", "頒獎", 9), ("授獎", "頒獎", 9), ("成果發表", "頒獎", 9), ("成果展", "頒獎", 9),
    ("花絮", "頒獎", 9), ("紀實", "頒獎", 9), ("活動照片", "頒獎", 9), ("照片", "頒獎", 9),
]
STAGE_RANK = {label: rank for _w, label, rank in STAGES}
STAGE_RANK[""] = 3
STAGE_ORDER = ["簡章", "說明會", "報名", "延期", "初賽", "複賽", "決賽", "得獎", "頒獎"]
STAGE_RE = re.compile("|".join(re.escape(w) for w, _l, _r in sorted(STAGES, key=lambda s: -len(s[0]))))
STAGE_MAP = {w: (l, r) for w, l, r in STAGES}

# Office / forwarding words that say how a notice was sent, not what it is about.
PREFIX_RE = re.compile(r"^(?:\s*[\[【〔(（][^\]】〕)）]{0,14}[\]】〕)）]\s*|\s*(?:轉知|檢送|檢附|函轉|轉發|敬轉|公告|周知|週知|有關|關於|辦理|舉辦|惠請|敬請|本校|賀|恭喜|請|再次|補充|更正)\s*[:：、\-－]?\s*)+")
FILLER_RE = re.compile("|".join(sorted([
    "轉知", "檢送", "檢附", "函轉", "敬請", "惠請", "鼓勵", "踴躍", "歡迎", "請查照", "請參考", "請參閱", "查照", "周知", "週知", "一案", "乙案", "事宜", "相關",
    "資料", "訊息", "如附件", "詳如附件", "附件", "本校", "貴校", "學生", "同學", "師生", "有興趣", "報名參加", "報名參賽", "參加", "參與", "踴躍參加",
    "舉辦", "辦理", "主辦", "承辦", "協辦", "訂於", "將於", "即日起", "開始", "日期", "時間", "為止", "至", "止", "公告", "通知", "活動", "乙份", "1份", "一份",
    "敬邀", "邀請", "歡迎", "特此", "高級中等學校", "高級中學校", "高級中學", "第一階段", "第二階段", "國內", "國家代表隊", "代表隊", "狂賀", "恭喜", "賀", "榮獲", "佳績", "表現優異", "成績斐然", "斐然",
    "大放異彩", "亮眼", "勇奪", "金牌", "銀牌", "銅牌", "雙金", "同學", "本班", "全國第", "通過", "進入", "選手", "國手", "表現", "錄取人數", "人數",
], key=lambda s: -len(s))))
SINGLE_RE = re.compile(r"[之的及與暨和並等各請本至止於共]")
# Organizers: a small dictionary (leading position) plus "<name 大學/學院/…>辦理" before an anchor verb.
ORG_DICT = ["教育部", "國民及學前教育署", "國教署", "教育局", "教育處", "文化局", "文化部", "科技部", "國科會", "中央研究院", "行政院", "嘉義市政府", "嘉義縣政府",
            "雲林縣政府", "臺南市政府", "高雄市政府", "臺北市政府", "新北市政府", "財團法人", "社團法人", "基金會", "教育基金會", "文教基金會"]
ORG_LEAD_RE = re.compile(r"^(?:" + "|".join(sorted(map(re.escape, ORG_DICT), key=lambda s: -len(s))) + r")(?:辦理|舉辦|主辦|訂於|函|來函)?")
ORG_VERB_RE = re.compile(r"^[^「『《“\"]{2,24}?(?:大學|學院|基金會|協會|學會|研究院|博物館|科學館|文化局|教育局|教育處|政府|圖書館|中心|學系|系所|系|處|局|署|部|會)[^「『《“\"]{0,12}?(?:辦理|舉辦|主辦|訂於)")
# A university / college named at the very start is the organizer: two of them differ -> two events.
ORG_SLOT_RE = re.compile(r"^(?:(?:[一-鿿]{2,3}[市縣])?(?:國立|私立|縣立|市立|公立|財團法人)?([一-鿿]{2,8}?)(?<![升考上入進念讀報申])(?:科技大學|醫學大學|大學|學院)"
                         r"|(?:[一-鿿]{2,3}[市縣])?(?:國立|私立|縣立|市立|公立|財團法人)?([一-鿿]{2,8}?)(?:高級中等學校|高級中學|高級工業職業學校|高級商業職業學校|高級農業職業學校|高級職業學校|專科學校|護專)"
                         r"|(?:[一-鿿]{2,3}[市縣])?(?:國立|私立|縣立|市立|公立|財團法人)([一-鿿]{2,8}?)(?:高中|高職|高工|高商|國中|國小))")
NAME_MASK_RE = re.compile(r"[一-鿿][○〇Ｏ◎●Oo０0][一-鿿]")
ORG_TAIL_RE = re.compile(r"(?:大學|學院|學校|基金會|協會|學會|有限公司|中心|教育館|科學館|博物館|美術館|高中|高職|政府|署|局|處)$")
LEGAL_FORM_RE = re.compile(r"學校財團法人|財團法人|社團法人|股份有限公司|有限公司")
ORG_QUOTE_RE = re.compile(r"^(?:國立|私立|財團法人|社團法人)?[一-鿿]{2,14}?(?:館|中心|基金會|協會|學會|研究院|博物館|科學館|美術館|委員會|署|部|局|處|公司)(?=[「『《])")
QUOTE_RE = re.compile(r"[「『《“\"]([^」』》”\"]{3,60})[」』》”\"]")
SYNONYMS = [("競賽", "賽"), ("比賽", "賽"), ("大賽", "賽"), ("營隊", "營"), ("臺", "臺"), ("台", "臺"), ("徵文", "徵文"), ("暑期", "暑"), ("寒假", "寒"), ("夏令營", "營"),
            ("冬令營", "營")]
SYN_RE = re.compile("|".join(re.escape(a) for a, _b in SYNONYMS if a != _b))
SYN_MAP = dict(SYNONYMS)

# Distinctive slots.  Two titles that carry different values in one slot are never one series.
SLOTS = {
    "subject": [("物理", "物理"), ("化學", "化學"), ("生物", "生物"), ("地球科學", "地科"), ("地科", "地科"), ("數學", "數學"), ("資訊", "資訊"), ("資工", "資訊"),
                ("英文", "英文"), ("英語", "英文"), ("日文", "日文"), ("日語", "日文"), ("韓語", "韓文"), ("法語", "法文"), ("德語", "德文"), ("國文", "國文"),
                ("國語", "國文"), ("歷史", "歷史"), ("地理", "地理"), ("公民", "公民"), ("作文", "作文"), ("書法", "書法"), ("音樂", "音樂"), ("美術", "美術"),
                ("科學", "科學"), ("經濟學", "經濟"), ("語言學", "語言"), ("天文", "天文"), ("體育", "體育"), ("閩南語", "閩南語"), ("客語", "客語")],
    "grade": [("高一", "高一"), ("高二", "高二"), ("高三", "高三"), ("國一", "國一"), ("國二", "國二"), ("國三", "國三"), ("一年級", "一年級"), ("二年級", "二年級"),
              ("三年級", "三年級"), ("四年級", "四年級"), ("五年級", "五年級"), ("六年級", "六年級"), ("高中一年級", "高一"), ("高中二年級", "高二")],
    "level": [("國小", "國小"), ("國中", "國中"), ("高中", "高中"), ("高職", "高職"), ("大專", "大專"), ("教師", "教師"), ("教職員", "教師")],
    "scope": [("全國", "全國"), ("嘉義縣市", "嘉義縣市"), ("嘉義市", "嘉義市"), ("嘉義縣", "嘉義縣"), ("雲林縣", "雲林縣"), ("臺南市", "臺南市"), ("高雄市", "高雄市"), ("臺北市", "臺北市"), ("新北市", "新北市"), ("全市", "市")],
    "region": [("國際", "國際"), ("亞太", "亞太"), ("亞洲", "亞洲"), ("歐洲", "歐洲"), ("IMO", "國際")],
    "gender": [("男子", "男"), ("女子", "女"), ("男生", "男"), ("女生", "女"), ("男籃", "男"), ("女籃", "女"), ("男排", "男"), ("女排", "女")],
}
SLOT_NAMES = list(SLOTS) + ["org", "latin"]
LATIN_RE = re.compile(r"[A-Za-z][A-Za-z]{2,}")
LATIN_STOP = {"and", "the", "for", "pdf", "ppt", "doc", "docx", "odt", "line", "www", "http", "https", "com", "tw", "edu", "gov", "org", "html", "qa", "cve"}
SLOT_RE = {slot: re.compile("|".join(re.escape(w) for w, _c in sorted(vals, key=lambda s: -len(s[0])))) for slot, vals in SLOTS.items()}
SLOT_MAP = {slot: dict(vals) for slot, vals in SLOTS.items()}
GENERIC_KEYS = {"研習", "培訓", "講座", "招生", "說明", "成績", "考試", "會議", "課程", "名單", "計畫", "研習營", "活動", "報名", "競賽", "比賽"}

CN_DIGITS = {"零": 0, "〇": 0, "一": 1, "二": 2, "兩": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
EDITION_RE = re.compile(r"第\s*([0-9]+|[一二三四五六七八九十百零〇兩]+)\s*(?:屆|次|期|梯次?|回|季|場)")
WEEK_RE = re.compile(r"第\s*[0-9一二三四五六七八九十]+\s*週")
AY_RANGE_RE = re.compile(r"(?<!\d)\d{2,3}\s*[-–~～至]\s*(?=\d{2,3}\s*學年)")
AY_RE = re.compile(r"(?:中華民國|民國)?\s*(?<!\d)(\d{2,3})\s*學年度?(?:\s*第?\s*[12一二上下]\s*學期)?")
TERM_RE = re.compile(r"(?<![\d.])(1[0-3]\d)\s*[-–_]\s*[12](?!\d)")
ROC_RE = re.compile(r"(?:中華民國|民國)?\s*(?<!\d)(1[0-3]\d)\s*年度?")
AD_RE = re.compile(r"(?:西元)?\s*(?<!\d)(20[12]\d)\s*(?:年度?)?(?!\d)")
DATE_RES = [re.compile(p) for p in (r"\d+\s*[名位人場組件]", r"(?<![A-Za-z\d])\d{3}(?!\d)", r"[○〇Ｏ◎●]", r"(?<!\d)\d{6,8}(?!\d)", r"\d{1,4}\s*[/／.]\s*\d{1,2}(?:\s*[/／.]\s*\d{1,2})?", r"\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?(?:\s*[~～至到-]\s*\d{1,2}\s*[月日]?)?",
                                    r"\d{1,2}\s*日", r"[(（]\s*[一二三四五六日週星期]{1,4}\s*[)）]", r"\d{1,2}\s*[:：]\s*\d{2}", r"\d{1,2}\s*[點时時]")]
PUNCT_RE = re.compile(r"[\s\-—–_~～·・.,，。、:：;；!！?？\"'“”‘’「」『』《》〈〉()（）\[\]【】〔〕{}<>＜＞|｜/\\#＃*＊&＆+＋=＝@$%^`]")


def _num(text):
    text = text.strip()
    if text.isdigit():
        return int(text)
    total, cur = 0, 0
    for ch in text:
        if ch == "十":
            total += (cur or 1) * 10
            cur = 0
        elif ch == "百":
            total += (cur or 1) * 100
            cur = 0
        elif ch in CN_DIGITS:
            cur = cur * 10 + CN_DIGITS[ch] if cur else CN_DIGITS[ch]
    return total + cur


def _strip_prefix(text):
    prev = None
    while prev != text:
        prev = text
        text = PREFIX_RE.sub("", text, count=1).strip()
        text = ORG_LEAD_RE.sub("", text, count=1).strip()
    return text


def acad_year_of_date(date):
    m = re.match(r"^(\d{4})-(\d{2})-\d{2}", str(date or ""))
    if not m:
        return None
    y, mo = int(m.group(1)), int(m.group(2))
    return y - 1911 if mo >= 8 else y - 1912


def school_words(school):
    """Names a school calls itself in titles (boilerplate for that school's own series)."""
    name, short = str((school or {}).get("name") or ""), str((school or {}).get("short") or "")
    bare = re.sub(r"^.*?立", "", name) if "立" in name[:6] else name
    words = {name, short, bare, "國立" + bare}
    for w in list(words):
        for a, b in (("高級中學", "高中"), ("高級中等學校", "高中"), ("高級農工職業學校", "農工"), ("高級商業職業學校", "高商"), ("高級工業職業學校", "高工"), ("高級家事商業職業學校", "家商"), ("高級家事職業學校", "家職")):
            words.add(w.replace(a, b))
    return sorted((w for w in words if len(w) >= 3), key=lambda w: -len(w))


def parse_title(title, drop=()):
    """Return the structured form of one title (all fields derived from the title alone)."""
    raw = unicodedata.normalize("NFKC", str(title or "")).replace("台", "臺")
    raw = LEGAL_FORM_RE.sub("", raw)
    own = False
    for w in drop:
        if w in raw:
            own = True
            raw = raw.replace(w, "")
    text = _strip_prefix(raw)
    quoted = [q.strip() for q in QUOTE_RE.findall(text)]
    quoted = max(quoted, key=len) if quoted else ""
    # organizer before an anchor verb ("XX大學辦理「…」")
    m = ORG_VERB_RE.match(text)
    verb_org = ""
    if m:
        vo = ORG_SLOT_RE.match(m.group(0))
        verb_org = (vo.group(1) or vo.group(2) or vo.group(3)) if vo else ""
        text = text[m.end():]
    text = ORG_QUOTE_RE.sub("", text, count=1)
    years = {"ay": None, "cy": None}
    work = NAME_MASK_RE.sub(" ", AY_RANGE_RE.sub(" ", text))
    m = AY_RE.search(work)
    if m and 90 <= int(m.group(1)) <= 140:
        years["ay"] = int(m.group(1))
    work = AY_RE.sub(" ", work)
    m = TERM_RE.search(work)
    if m and years["ay"] is None:
        years["ay"] = int(m.group(1))
    work = TERM_RE.sub(" ", work)
    m = ROC_RE.search(work)
    if m:
        years["cy"] = int(m.group(1))
    work = ROC_RE.sub(" ", work)
    m = AD_RE.search(work)
    if m and years["cy"] is None:
        years["cy"] = int(m.group(1)) - 1911
    work = AD_RE.sub(" ", work)
    edition = None
    m = EDITION_RE.search(work)
    if m:
        edition = _num(m.group(1))
    work = WEEK_RE.sub(" ", EDITION_RE.sub(" ", work))
    for rx in DATE_RES:
        work = rx.sub(" ", work)
    # organizer: a university / school named first is kept as a slot and dropped from the key
    org_name = ""
    lead = re.match(r"[\s\-—–_~～.,，。、:：;；!！?？\[\]【】〔〕()（）「」『』《》]*", work).end()
    om = ORG_SLOT_RE.match(work[lead:])
    if om:
        org_name = om.group(1) or om.group(2) or om.group(3)
        work = work[lead + om.end():]
    # stages (the most "advanced" one names the notice; 延期 wins over everything)
    found = [STAGE_MAP[w] for w in STAGE_RE.findall(work)]
    stage, rank = "", STAGE_RANK[""]
    if found:
        late = [f for f in found if f[0] == "延期"]
        stage, rank = late[0] if late else max(found, key=lambda f: f[1])
    slots_src = work
    display = STAGE_RE.sub(" ", work)
    display = FILLER_RE.sub(" ", display)
    display = re.sub(r"^[\s\-—–_~～·・.,，。、:：;；!！?？「」『』《》〈〉()（）\[\]【】〔〕]+|[\s\-—–_~～·・.,，。、:：;；!！?？「」『』《》〈〉()（）\[\]【】〔〕]+$", "", display)
    display = re.sub(r"\s{2,}", " ", display)
    # slots come from the whole title, not just the quoted part
    slots = {}
    org_name = org_name or verb_org
    slots["org"] = frozenset([org_name or "本校"]) if (org_name or own) else frozenset()
    slots["latin"] = frozenset(w.lower() for w in LATIN_RE.findall(slots_src) if w.lower() not in LATIN_STOP)
    for slot, rx in SLOT_RE.items():
        vals = {SLOT_MAP[slot][w] for w in rx.findall(slots_src)}
        slots[slot] = frozenset(vals)
    body = display
    body = re.sub(r"[\s\-－_]*\d{1,2}$", "", body)
    key = PUNCT_RE.sub("", SINGLE_RE.sub("", body))
    key = SYN_RE.sub(lambda m: SYN_MAP[m.group(0)], key)
    return {"key": key, "display": tidy(body),
            "quoted": quoted, "ay": years["ay"], "cy": years["cy"], "edition": edition, "stage": stage, "rank": rank, "slots": slots}


def tidy(text):
    """Drop punctuation, keep a single space only between latin words."""
    text = PUNCT_RE.sub(lambda m: " " if m.group(0).isspace() else "", str(text or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return re.sub(r"(?<![A-Za-z0-9])\s|\s(?![A-Za-z0-9])", "", text)


def _clean_name(text):
    text = unicodedata.normalize("NFKC", str(text or "")).replace("台", "臺")
    for rx in (AY_RANGE_RE, AY_RE, TERM_RE, ROC_RE, AD_RE, EDITION_RE, WEEK_RE, *DATE_RES):
        text = rx.sub(" ", text)
    text = FILLER_RE.sub(" ", STAGE_RE.sub(" ", text))
    return tidy(text)


# ---------------------------------------------------------------- records
def item_record(item, drop=()):
    p = parse_title(item.get("title"), drop)
    date = str(item.get("date") or "")[:10]
    date_ok = item.get("date_status") != "unverified" and re.match(r"^\d{4}-\d{2}-\d{2}$", date)
    year = p["ay"] or p["cy"] or (acad_year_of_date(date) if date_ok else None)
    p.update({"id": str(item.get("id")), "school": str(item.get("school") or ""), "category": str(item.get("category") or ""),
              "date": date if date_ok else "", "year": year, "title": str(item.get("title") or "")})
    p["name"] = _clean_name(p["quoted"]) if p["quoted"] and len(_clean_name(p["quoted"])) >= MIN_KEY else ""
    p["quoted_name"] = bool(p["name"])
    p["qkey"] = SYN_RE.sub(lambda m: SYN_MAP[m.group(0)], SINGLE_RE.sub("", p["name"])) if p["quoted_name"] else ""
    if not p["name"]:
        p["name"] = p["display"]
    return p


def grams(key):
    out = Counter()
    for n in (2, 3):
        for i in range(len(key) - n + 1):
            out[key[i:i + n]] += 1
    return out


def _bigrams(text):
    return {text[i:i + 2] for i in range(len(text) - 1)}


def quotes_differ(a, b):
    """Both titles name their event in 「」 and the two names are about different things."""
    if not (a["quoted_name"] and b["quoted_name"]):
        return False
    x, y = a["qkey"], b["qkey"]
    # a 「」 part that is only a sub-item of a longer title (「實驗實作」 of a 甄選) does not name the event
    if len(x) < QUOTE_MAIN * len(a["key"]) or len(y) < QUOTE_MAIN * len(b["key"]):
        return False
    if x in y or y in x:
        return False
    gx, gy = _bigrams(x), _bigrams(y)
    return not gx or not gy or 2 * len(gx & gy) / (len(gx) + len(gy)) < QUOTE_DICE


def conflict(a, b):
    """Hard veto: distinctive slots, unrelated 「」 names, or same-year-different-edition."""
    if quotes_differ(a, b):
        return True
    for slot in SLOT_NAMES:
        x, y = a["slots"][slot], b["slots"][slot]
        if x and y and not (x & y):
            return True
        # product / vendor names: two sets that only share the brand are still different things
        if slot == "latin" and x and y and min(len(x), len(y)) >= 2 and len(x & y) / len(x | y) < 0.34:
            return True
    if a["year"] and a["year"] == b["year"] and a["edition"] and b["edition"] and a["edition"] != b["edition"]:
        return True
    return False


class Scorer:
    """TF-IDF cosine over char 2-3-grams, plus containment of a short name inside a longer title."""

    def __init__(self, records):
        self.vec, self.key = {}, {}
        df = Counter()
        for r in records:
            g = grams(r["key"])
            self.vec[r["id"]] = g
            self.key[r["id"]] = r["key"]
            df.update(g.keys())
        n = max(1, len(records))
        self.df = df
        self.idf = {g: math.log(1 + n / c) for g, c in df.items()}
        self.w, self.mass = {}, {}
        for rid, g in self.vec.items():
            w = {k: (1 + math.log(v)) * self.idf[k] for k, v in g.items()}
            norm = math.sqrt(sum(x * x for x in w.values())) or 1.0
            self.w[rid] = {k: x / norm for k, x in w.items()}
            self.mass[rid] = sum(self.idf[k] for k in g)
        self._cache = {}
        self.recur = Counter()
        for k in {r["key"] for r in records}:
            seen = {k[i:j] for i in range(len(k)) for j in range(i + ANCHOR_MIN, min(len(k), i + ANCHOR_MAX) + 1)}
            self.recur.update(seen)
        self.anchor_cap = max(12, int(n * ANCHOR_CAP_RATIO))

    def anchor(self, a, b):
        """Longest substring both keys share that also recurs elsewhere (an event name), as a score."""
        ka, kb = self.key[a], self.key[b]
        best, prev = "", [0] * (len(kb) + 1)
        for i in range(1, len(ka) + 1):
            cur = [0] * (len(kb) + 1)
            for j in range(1, len(kb) + 1):
                if ka[i - 1] == kb[j - 1]:
                    cur[j] = prev[j - 1] + 1
                    if cur[j] > len(best):
                        best = ka[i - cur[j]:i]
            prev = cur
        # accept it only when it is an event-sized name that is not boilerplate seen everywhere
        L = len(best)
        if L < ANCHOR_MIN or ORG_TAIL_RE.search(best) or self.recur[best] > self.anchor_cap or (L == ANCHOR_MIN and self.recur[best] < 3):
            return 0.0
        cov = L / max(1, min(len(ka), len(kb)))
        if cov < 0.45 and L < 8:
            return 0.0
        if cov < ANCHOR_SOLID:
            # the rest of both titles must not be about two different things (same organizer, different event)
            ra, rb = ka.replace(best, "", 1), kb.replace(best, "", 1)
            if len(ra) >= 3 and len(rb) >= 3:
                ga, gb = _bigrams(ra), _bigrams(rb)
                if not ga or not gb or 2 * len(ga & gb) / (len(ga) + len(gb)) < ANCHOR_RESIDUE:
                    return 0.0
        return 0.55 + 0.4 * min(1.0, cov)

    def cosine(self, a, b):
        wa, wb = self.w[a], self.w[b]
        if len(wa) > len(wb):
            wa, wb = wb, wa
        return sum(x * wb.get(k, 0.0) for k, x in wa.items())

    def containment(self, a, b):
        """Share of the shorter key's gram mass that the longer key also has."""
        if len(self.key[a]) > len(self.key[b]):
            a, b = b, a
        if len(self.key[a]) < CONTAIN_MIN_LEN:
            return 0.0
        ga, gb = self.vec[a], self.vec[b]
        hit = sum(self.idf[k] for k in ga if k in gb)
        return hit / self.mass[a] if self.mass[a] else 0.0

    def score(self, a, b):
        hit = self._cache.get((a, b) if a < b else (b, a))
        if hit is None:
            c = self.containment(a, b)
            hit = max(self.cosine(a, b), CONTAIN_WEIGHT * c if c >= CONTAIN_MIN else 0.0, self.anchor(a, b))
            self._cache[(a, b) if a < b else (b, a)] = hit
        return hit


def cluster_school(records, forced=(), apart=(), scorer=None):
    """Greedy group-level agglomeration.  forced: id groups merged up front; apart: id->label."""
    by_id = {r["id"]: r for r in records}
    cand = [r for r in records if len(r["key"]) >= MIN_KEY and r["key"] not in GENERIC_KEYS]
    scorer = scorer or Scorer(cand)
    n = max(1, len(cand))
    rare_cap = max(RARE_DF_MIN, int(n * RARE_DF_RATIO))
    index = defaultdict(list)
    for r in cand:
        for g in scorer.vec[r["id"]]:
            if scorer.df[g] <= rare_cap and len(g) >= 2:
                index[g].append(r["id"])
    shared = defaultdict(set)
    for g, ids in index.items():
        if len(ids) < 2:
            continue
        for i, a in enumerate(ids):
            for b in ids[i + 1:]:
                shared[(a, b) if a < b else (b, a)].add(g)
    pairs = []
    for (a, b), gs in shared.items():
        if len(gs) < 2 and not (len(by_id[a]["key"]) <= 6 and by_id[a]["key"] == by_id[b]["key"]):
            continue
        ra, rb = by_id[a], by_id[b]
        if conflict(ra, rb):
            continue
        s = scorer.score(a, b)
        if ra["year"] and rb["year"] and ra["year"] != rb["year"]:
            s += CROSS_YEAR_BONUS
        if s >= MATCH_SCORE:
            pairs.append((-s, a, b))
    pairs.sort()
    group_of = {r["id"]: r["id"] for r in cand}
    members = {r["id"]: [r["id"]] for r in cand}

    def merge(x, y):
        if len(members[x]) < len(members[y]):
            x, y = y, x
        for m in members[y]:
            group_of[m] = x
        members[x].extend(members.pop(y))
        return x

    for ids in forced:
        ids = [i for i in ids if i in group_of]
        for i in ids[1:]:
            if group_of[i] != group_of[ids[0]]:
                merge(group_of[ids[0]], group_of[i])

    def allowed(x, y):
        if len(members[x]) + len(members[y]) > MAX_GROUP:
            return False
        total, cnt = 0.0, 0
        for a in members[x]:
            for b in members[y]:
                ra, rb = by_id[a], by_id[b]
                if conflict(ra, rb):
                    return False
                if apart and apart.get(a) and apart.get(b) and apart[a] != apart[b]:
                    return False
                s = scorer.score(a, b)
                if ra["year"] and rb["year"] and ra["year"] != rb["year"]:
                    s += CROSS_YEAR_BONUS
                total += min(1.0, s)
                cnt += 1
        return cnt > 0 and total / cnt >= AVG_SCORE

    for _neg, a, b in pairs:
        x, y = group_of[a], group_of[b]
        if x != y and allowed(x, y):
            merge(x, y)
    return [[by_id[m] for m in ms] for ms in members.values()]


# ---------------------------------------------------------------- series
def timeline_key(r):
    return (r["year"] or 0, r["rank"], r["date"] or "9999-99-99", r["id"])


def _majority(values):
    count = Counter(v for v in values if v)
    if not count:
        return ""
    # most frequent, then longer (more specific), then lexicographic -> deterministic
    return sorted(count.items(), key=lambda kv: (-kv[1], -len(kv[0]), kv[0]))[0][0]


def series_name(group):
    quoted = [r["name"] for r in group if r["quoted_name"]]
    if quoted:
        return _majority(quoted)
    return _majority([r["name"] for r in group if len(r["name"]) >= MIN_KEY]) or _majority([r["key"] for r in group])


def is_series(group):
    years = {r["year"] for r in group if r["year"]}
    return (len(group) >= 2 and len(years) >= 2) or len(group) >= 3


def make_id(school, key):
    return "s_" + hashlib.sha1((school + ":" + key).encode("utf-8")).hexdigest()[:10]


def build_series(items, *, previous=None, overrides=None, exclude_ids=(), schools=()):
    overrides = overrides or {}
    skip = set(exclude_ids) | {str(i) for i in overrides.get("exclude", [])}
    drops = {str(sc.get("id")): school_words(sc) for sc in schools or []}
    records = [item_record(i, drops.get(str(i.get("school")), ())) for i in items if i.get("id") is not None and str(i.get("id")) not in skip]
    by_school = defaultdict(list)
    for r in records:
        by_school[r["school"]].append(r)
    forced = [[str(i) for i in (g.get("ids", []) if isinstance(g, dict) else g)] for g in overrides.get("merge", [])]
    apart = {}
    for label, ids in enumerate(overrides.get("split", []), 1):
        for i in (ids.get("ids", []) if isinstance(ids, dict) else ids):
            apart[str(i)] = label
    groups = []
    for school in sorted(by_school):
        for g in cluster_school(by_school[school], forced=forced, apart=apart):
            if is_series(g):
                groups.append((school, g))
    series = []
    for school, g in groups:
        g.sort(key=timeline_key)
        first = min(g, key=lambda r: (r["date"] or "9999", r["year"] or 9999, r["id"]))
        cat = _majority([r["category"] for r in g])
        years = sorted({r["year"] for r in g if r["year"]})
        series.append({
            "id": make_id(school, first["key"]),
            "name": series_name(g),
            "school": school,
            "category": cat,
            "years": [years[0], years[-1]] if years else [],
            "members": [{"id": r["id"], "year": r["year"], "stage": r["stage"]} for r in g],
        })
    reuse_ids(series, previous)
    apply_names(series, overrides)
    series.sort(key=lambda s: (s["school"], s["category"], s["name"], s["id"]))
    return series


def reuse_ids(series, previous):
    """Keep an old id when the new group shares >= 50% (Jaccard) of its members."""
    old = {s["id"]: {m["id"] for m in s.get("members", [])} for s in (previous or []) if s.get("id")}
    scored = []
    for i, s in enumerate(series):
        mine = {m["id"] for m in s["members"]}
        for oid, theirs in old.items():
            inter = len(mine & theirs)
            if inter:
                j = inter / len(mine | theirs)
                if j >= 0.5:
                    scored.append((-j, s["id"] == oid and 0 or 1, i, oid))
    scored.sort()
    used_old, used_new = set(), set()
    for _j, _x, i, oid in scored:
        if i in used_new or oid in used_old:
            continue
        series[i]["id"] = oid
        used_new.add(i)
        used_old.add(oid)
    # a brand new group could collide with an id that was just re-used elsewhere
    seen = Counter(s["id"] for s in series)
    for s in series:
        if seen[s["id"]] > 1:
            seen[s["id"]] -= 1
            s["id"] = make_id(s["school"], s["name"] + s["members"][0]["id"])


def apply_names(series, overrides):
    names = overrides.get("rename", {}) or {}
    by_member = {}
    for s in series:
        for m in s["members"]:
            by_member[m["id"]] = s
    for key, name in names.items():
        target = next((s for s in series if s["id"] == key), None) or by_member.get(str(key))
        if target and name:
            target["name"] = str(name)


# ---------------------------------------------------------------- io
def _load(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def public_schools(data_dir=DATA):
    return list((_load(data_dir / "announcements.json", {}) or {}).get("schools", []))


def public_items(data_dir=DATA):
    items = list((_load(data_dir / "announcements.json", {}) or {}).get("items", []))
    seen = {str(i.get("id")) for i in items}
    for i in (_load(data_dir / "archive.json", {}) or {}).get("items", []):
        if str(i.get("id")) not in seen:
            items.append(i)
    removed = {str(r.get("id")) for r in (_load(data_dir / "removed-announcements.json", {}) or {}).get("removed", [])}
    return [i for i in items if str(i.get("id")) not in removed]


def build_document(items, *, previous=None, overrides=None, now=None, schools=()):
    series = build_series(items, previous=(previous or {}).get("series"), overrides=overrides, schools=schools)
    return {"schema_version": SCHEMA_VERSION, "generated_at": (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "stage_order": STAGE_ORDER, "count": len(series), "series": series}


def main(data_dir=DATA, out_path=OUT_PATH, overrides_path=OVERRIDES_PATH):
    previous = _load(out_path, {})
    overrides = _load(overrides_path, {})
    doc = build_document(public_items(Path(data_dir)), previous=previous, overrides=overrides, schools=public_schools(Path(data_dir)))
    old = {k: v for k, v in (previous or {}).items() if k != "generated_at"}
    if old == {k: v for k, v in doc.items() if k != "generated_at"}:
        print("series: unchanged (%d series)" % doc["count"])
        return doc
    text = json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n"
    tmp = Path(str(out_path) + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(out_path)
    print("series: %d series, %d bytes" % (doc["count"], len(text.encode("utf-8"))))
    return doc


if __name__ == "__main__":
    main()
