"""Weighted-scoring classifier for the site's display categories.

Replaces the old first-match-wins keyword chain with labeling-function style
voting: every rule votes for a category with a weight, text from the title
counts three times as much as text from the office / body, offices add a small
prior, context rules subtract score (negative words), and generic words such as
活動 / 辦法 carry very little weight.  The category with the top score wins; the
margin to the runner-up becomes a confidence value.

Category names are the existing display labels, so the site keeps working.
There is no separate "待分類" value: the site already treats 「一般」 as the
unsorted bucket, and it is used when no category reaches MIN_SCORE.  Callers
may store the returned confidence in an extra ``category_confidence`` field.

Pure Python, deterministic, no network or model: zero cost.
"""

from __future__ import annotations

import re

STAFF = "教職員"
UNSORTED = "一般"

TITLE_MULT = 3.0   # title hits weigh 3x
OFFICE_MULT = 1.0  # office (source category) text
BODY_MULT = 1.0    # optional body text
MIN_SCORE = 3.0    # below this no category is convincing -> UNSORTED

# Tie-break order (earlier wins), mirrors the old precedence.
ORDER = ("段考考試", STAFF, "升學", "獎助學金", "榮譽榜", "競賽", "社團", "選課",
         "生活學務", "研習活動", "招生編班", "行政公告")

_STUDENT = r"學生|同學|師生|高中生|高中職|青年|青少年|親子"
_CAMP = r"(?<![經運公國民軍自])營(?!養|運|業|造|利|收|銷|建|區|地|繕|隊長)"
_RESULT_WORDS = r"得獎|獲獎|榮獲|恭賀|狂賀|賀[！!~～\s]|^賀|佳績|優異|亮眼|卓越"

# (category, weight, regex).  weight is per-hit points before the source multiplier.
RULES = [
    # ---- 段考考試 -------------------------------------------------------
    ("段考考試", 3.0, r"段考|期中考|期末考|定期考|定期評量|補考|考試範圍|考試訊息"),
    ("段考考試", 4.0, r"模擬考|模考"),
    ("段考考試", 2.5, r"考程|考試日程|考試時程|試場|考場|准考證|應試時程|試程|期中評量|期末評量|考試成績"),
    ("段考考試", 2.0, r"重修|補修|重補修|成績查詢|成績確認|平時成績|學期成績|(?<![競比好佳優])成績(?!優異|優秀|斐然|亮眼|卓越|傑出)"),
    ("段考考試", 1.8, r"學測|分科測驗|統測|會考|英聽|英檢|GEPT|TOEIC|多益"),
    ("段考考試", 1.2, r"考試|測驗"),
    # ---- 教職員 ---------------------------------------------------------
    (STAFF, 4.0, r"漏洞預警|攻擊預警|資安訊息|資安通報|資通安全|會計月報|決算|預算|主計|請購|人事室|人事行政|提敘|"
                 r"教職員|教師甄選|代理教師|代課教師|人員甄選|助理人員|約用|約僱|臨時人員|招標|採購|徵才|"
                 r"子女教育補助|政策及業務宣導|在職專班|公務人員|公務員|退休|職務宿舍|員工協助|任用條例|出差|差旅|"
                 r"防貪|揭弊|政風|行政中立|學務創新人力|廉政|反賄選|公教人員|公保|會計室|教學準備日|校務會議|考績|敘薪|差勤|公文|研究進修日|返校日|職掌|"
                 r"增能|專業發展|專業社群|師資培育|輔導知能|管教知能|資安|教職同仁|職員|"
                 r"教師(?:解聘|成績考核|待遇|資遣|評審)|教育人員"),
    (STAFF, 4.5, r"(?:教師|教職員|教學|教案|教材|導師|教與學|課程與教學|授課)[^，。]{0,14}(?:研習|工作坊|增能|培力|培訓|分享會|交流|社群|徵選|認證|知能|指引|說明會)|"
                 r"(?:研習|工作坊|增能|培力)[^，。]{0,10}(?:教師|教學|教案)|教師研習|教師活動|種子教師|種子導師|教育家|賦能教與學|SEL|社會情緒學習"),
    (STAFF, 2.0, r"同仁|員工|公教|師長|教師|校長"),
    (STAFF, 1.5, r"請查照"),
    # ---- 升學 -----------------------------------------------------------
    ("升學", 3.0, r"升學|繁星|申請入學|特殊選才|個人申請|甄選入學|單獨招生|招生考試|大學先修|ColleGo|"
                 r"四技二專|二技|技優甄審|甄審|落點|校系|科系|入學管道|學習歷程|大學榜單"),
    ("升學", 2.5, r"學士班|學位學程|碩士班|博士班|碩、博士|分發|志願序|選填志願|志願選填"),
    ("升學", 1.5, r"招生|簡章"),
    # ---- 獎助學金 -------------------------------------------------------
    ("獎助學金", 3.0, r"(?<![得獲])獎學|(?<![得獲])獎助|(?<![協輔])助學|就學貸款|學雜費|補助金|圓夢|清寒|奮學|物資贊助|餐券"),
    ("獎助學金", 2.0, r"工讀|減免|獎勵金"),
    ("獎助學金", 1.0, r"補助|贊助"),
    # ---- 榮譽榜 ---------------------------------------------------------
    ("榮譽榜", 3.0, r"榮獲|恭賀|狂賀|恭喜|獲獎名單|得獎名單|金牌|銀牌|銅牌|冠軍|亞軍|季軍|捷報|榜首|榜單|賀[！!~～\s]|^賀|^[【\[(]?賀"),
    ("榮譽榜", 4.0, r"賀[！!~～\s]|^賀|^[【\[(]?賀|佳績|榮獲|狂賀|恭賀"),
    ("榮譽榜", 3.0, r"特別獎|佳作|優等|甲等|入圍"),
    ("榮譽榜", 2.0, r"特優|入選|表揚|優異|亮眼|卓越|獲獎|得獎|第[一二三四五六七八九十\d]名|錄取(?=[^，。]{0,40}(?:同學|大學|學系|學程|科大))"),
    # ---- 競賽 -----------------------------------------------------------
    ("競賽", 3.0, r"競賽|比賽|初賽|決賽|複賽|預賽|大賽|挑戰賽|大挑戰|邀請賽|選拔賽|錦標賽|聯賽|黑客松|檢定賽|"
                 r"奧林匹亞|科展|科學展覽|徵文|徵稿|徵件|盃|競技|競試|賽程"),
    ("競賽", 2.5, r"(?<![競比大決初複預錦邀聯挑檢參])賽(?!程)"),
    ("競賽", 1.8, r"運動會|選拔|(?<![頒得獲領])獎(?![助學勵金牌狀章])"),
    ("競賽", 0.9, r"遴選"),
    ("競賽", 2.5, r"能力檢定|檢定賽"),
    # ---- 社團 -----------------------------------------------------------
    ("社團", 3.0, r"社團(?!法人)|社課|社博|社慶|班聯會|校隊|迎新|轉社|選社|社員"),
    ("社團", 1.5, r"熱音|熱舞"),
    # ---- 選課 -----------------------------------------------------------
    ("選課", 3.0, r"選課|微課程|多元選修|加深加廣|彈性學習|彈性課程|加退選|課程異動|充實補強|自主學習(?!節)"),
    ("選課", 2.0, r"選修|教科書|分科自修|自修班|課業輔導|暑期輔導|寒假輔導"),
    ("選課", 1.0, r"本土語|課表"),
    ("選課", 2.5, r"課務|任課|調課|補課"),
    # ---- 生活學務 -------------------------------------------------------
    ("生活學務", 3.0, r"交通安全|駕訓|學生安全|校園安全|校服|制服|運動服|服儀|請假|出缺席|缺曠|學生證|疫苗|午餐|團膳|菜單|(?<!職務)宿舍|住宿|交通車|校車|專車"),
    ("生活學務", 2.5, r"座位表|留校自修"),
    ("生活學務", 2.0, r"健康檢查|健檢|晚自習|掃具|性別平等|電子煙|菸害|霸凌|整潔"),
    # ---- 研習活動 -------------------------------------------------------
    ("研習活動", 3.0, r"營隊|研習營|體驗營|令營|探索營|培訓營|選訓營|講座|演講|工作坊|參訪|博覽會|嘉年華|音樂會|演唱會|"
                     r"遊學|見學|教育旅行|模擬聯合國|OPEN DAY|Open Day|科學日|中學生日|自主學習節"),
    ("研習活動", 3.5, r"成果展"),
    ("研習活動", 2.5, r"研習|論壇|座談|研討會|策展|展覽|展示|體驗|志工|發布會|宣導|藝術節|科學週|闖關|劇場|影像|實境秀|人權日|結業式|開學典禮|衝刺班|培訓班|研習班|推廣教育|推廣課程|訓練班|職能訓練|訓練場"),
    ("研習活動", 2.0, r"發表會|典禮|培訓|培力|教育展|設計展|交流|閱讀|青年節|豐年祭|學程"),
    ("研習活動", 1.2, r"課程|說明會|分享會"),
    ("研習活動", 1.1, r"活動"),
    # ---- 招生編班 -------------------------------------------------------
    ("招生編班", 3.5, r"免試入學|續招|新生|編班|轉學|資優班|實驗班|藝才班|學習區|入學簡章|招生簡章"),
    ("招生編班", 2.0, r"報到|鑑定|入學"),
    ("招生編班", 1.5, r"錄取名單|錄取|招生"),
    ("招生編班", 1.8, r"招生說明會"),
    # ---- 行政公告 -------------------------------------------------------
    ("行政公告", 3.0, r"行事曆|校務行事|停電|施工|停班停課|停課|網站維護|系統維護|修繕|封鎖|放假|暫停服務|車輛管制"),
    ("行政公告", 3.0, r"演習|儲值"),
    ("行政公告", 2.0, r"暑假通知|寒假通知|澄清|回饋金|租賃|問卷|場地|停車"),
    ("行政公告", 0.4, r"辦法|規定|要點|公告"),
]

# Context adjustments: (regex, {category: delta}).  Deltas are in title points
# (i.e. they are scaled by the source multiplier like rule hits).
ADJUST = [
    # a result / congratulation notice is not the contest invitation itself
    (_RESULT_WORDS, {"競賽": -2.5, "段考考試": -2.0}),
    # 競賽成績 / 比賽成績 is a contest result, never the exam grades category
    (r"(?:競賽|比賽|運動會|整潔|盥洗)[^，。]{0,6}成績", {"段考考試": -3.0}),
    # university-side admission wording makes 招生/簡章/入學 a 升學 notice, not 新生編班
    (r"大學|學院|科大|學系|學士|碩士|博士|四技|二專|二技|技優|特殊選才|單獨招生", {"招生編班": -3.0}),
    # 新生 inside a daily-life or contest notice is not 新生編班
    (r"制服|校服|學號|學生證|交通車|專車|健檢|比賽|競賽|賽程|盃|大賽", {"招生編班": -3.5}),
    # staff-addressed notice that also addresses students is not staff-only
    (_STUDENT, {STAFF: -2.0}),
    # exam-room logistics of a contest are not school exams
    (r"競賽|奧林匹亞|科展", {"段考考試": -2.0}),
    # rules about teachers' grading/appraisal are not student grades
    (r"(?:教師|教職員|教育人員)[^，。]{0,14}(?:成績|考核)", {"段考考試": -4.0}),
    # scholarship notices that mention a contest are about the money
    (r"獎學金|助學金|獎助學金", {"競賽": -3.0, "研習活動": -2.0}),
    # events organised by or for clubs of an outside body
    (r"論壇|研討會|營隊|令營|研習|講座|工作坊", {"社團": -2.5}),
    # teacher / staff wording: this is training for staff, not a student activity
    (r"教師研習|教職員|教師.{0,6}(?:研習|工作坊|增能)|(?:研習|工作坊|增能).{0,6}教師", {"研習活動": -2.5, "社團": -2.5}),
]

# Office (處室 / source category) priors, in raw points.
OFFICE_PRIOR = [
    (r"^賀$|榮譽榜|大學榜單", {"榮譽榜": 3.0}),
    (r"獎助學金", {"獎助學金": 3.0}),
    (r"升學資訊|升學", {"升學": 3.0}),
    (r"輔導室|輔導處", {"升學": 0.8, "研習活動": 0.5}),
    (r"實習處", {"升學": 0.8}),
    (r"教務處|教學組|註冊組", {"選課": 0.5, "段考考試": 0.4}),
    (r"學務處|訓育組|衛生組|教官室|體育組|生輔組", {"生活學務": 0.8}),
    (r"課外活動組|活動競賽|學生研習|營隊", {"研習活動": 1.0}),
    (r"競賽", {"競賽": 1.5}),
    (r"教師研習|教師活動|人事|資安|主計|會計", {STAFF: 3.0}),
    (r"新生專區", {"招生編班": 3.0}),
    (r"社團評鑑", {"社團": 3.0}),
    (r"考試訊息", {"段考考試": 3.0}),
    (r"選課資訊", {"選課": 3.0}),
    (r"行事曆", {"行政公告": 3.0}),
]

_COMPILED_RULES = [(cat, w, re.compile(rx)) for cat, w, rx in RULES]
_COMPILED_ADJUST = [(re.compile(rx), d) for rx, d in ADJUST]
_COMPILED_OFFICE = [(re.compile(rx), d) for rx, d in OFFICE_PRIOR]
_CAMP_RE = re.compile(_CAMP)
_STUDENT_RE = re.compile(_STUDENT)


_CJK_GAP = re.compile(r"(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])")


def _clean(value):
    """Collapse whitespace; drop stray spaces inside Chinese words (「學生 證」)."""
    return _CJK_GAP.sub("", re.sub(r"\s+", " ", str(value or "")).strip())


def _score_text(text, mult, scores):
    if not text:
        return
    hits = {}
    for cat, weight, rx in _COMPILED_RULES:
        if rx.search(text):
            hits.setdefault(cat, []).append(weight)
    if _CAMP_RE.search(text):
        hits.setdefault("研習活動", []).append(3.0)
    # Diminishing returns: the strongest hit counts fully, further hits in the
    # same category count 1/2, 1/4 ... so piling up generic words cannot win.
    for cat, weights in hits.items():
        total = sum(w * 0.5 ** i for i, w in enumerate(sorted(weights, reverse=True)))
        scores[cat] = scores.get(cat, 0.0) + total * mult
    for rx, deltas in _COMPILED_ADJUST:
        if rx.search(text):
            for cat, delta in deltas.items():
                scores[cat] = scores.get(cat, 0.0) + delta * mult


def score_categories(title, office="", body=""):
    """Return {category: score}; scores may be negative before clamping."""
    scores = {}
    _score_text(_clean(title), TITLE_MULT, scores)
    _score_text(_clean(office), OFFICE_MULT, scores)
    _score_text(_clean(body)[:2000], BODY_MULT, scores)
    office_text = _clean(office)
    for rx, priors in _COMPILED_OFFICE:
        if rx.search(office_text):
            for cat, points in priors.items():
                scores[cat] = scores.get(cat, 0.0) + points
    return scores


def score_category(title, office="", body=""):
    """Classify one announcement.

    Returns ``{"category", "confidence", "margin", "score", "scores"}``.
    ``confidence`` is in [0, 1]: the margin over the runner-up relative to the
    winning score, damped when the winning score itself is small.
    """
    scores = score_categories(title, office, body)
    ranked = sorted(((s, -ORDER.index(c), c) for c, s in scores.items() if c in ORDER and s > 0), reverse=True)
    if not ranked or ranked[0][0] < MIN_SCORE:
        top = ranked[0][0] if ranked else 0.0
        return {"category": UNSORTED, "confidence": 0.0, "margin": round(top, 2), "score": round(top, 2),
                "scores": {c: round(s, 2) for c, s in scores.items() if s > 0}}
    top, _, category = ranked[0]
    second = ranked[1][0] if len(ranked) > 1 else 0.0
    margin = top - second
    confidence = min(1.0, margin / top) * min(1.0, top / 9.0)
    return {"category": category, "confidence": round(confidence, 2), "margin": round(margin, 2),
            "score": round(top, 2), "scores": {c: round(s, 2) for c, s in scores.items() if s > 0}}
