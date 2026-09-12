"""Deterministic announcement classifier compatible with classification v1."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date

from classification_taxonomy import (
    ALIASES,
    CLASSIFICATION_VERSION,
    canonical_main_category,
    valid_subcategory,
)


LEGACY_CATEGORY_RULES = {
    "段考考試": ("academic_exam", "midterm"),
    "課程選修": ("course_selection", "course_selection"),
    "升學": ("admission", "department_event"),
    "學務": ("student_affairs", "other"),
    "社團": ("club", "club_notice"),
    "競賽": ("competition", "external_competition"),
    "研習活動": ("event_learning", "activity"),
    "獎助學金": ("scholarship", "external_scholarship"),
    "榮譽榜": ("honor_roll", "student_honor"),
    "招生編班": ("enrollment", "admission"),
    "行政公告": ("administration", "general_notice"),
}

# Specific rules precede broad rules.  The first match in the first available
# source wins, so the result is stable across machines and repeated runs.
RULES = (
    ("academic_exam", "make_up_exam", ("補考", "補測")),
    ("academic_exam", "remedial_course", ("重修", "補修", "重補修", "不及格")),
    ("academic_exam", "mock_exam", ("模擬考", "學測模考", "分科模考")),
    ("academic_exam", "exam_schedule_room", ("考程", "考試日程", "考場", "試場")),
    ("academic_exam", "midterm", ("定期考查", "段考", "期中考", "期末考")),
    ("academic_exam", "grades", ("成績", "學期成績", "成績查詢")),
    ("course_selection", "multiple_elective", ("多元選修", "跑班")),
    ("course_selection", "micro_course", ("微課程", "微課")),
    ("course_selection", "course_change", ("加退選", "改選", "換課")),
    ("course_selection", "course_selection", ("選課", "課程選填")),
    ("admission", "stars", ("繁星推薦", "繁星")),
    ("admission", "personal_application", ("個人申請", "個申")),
    ("admission", "special_selection", ("特殊選才", "甄選入學")),
    ("admission", "subject_test", ("分科測驗", "學測", "統測")),
    ("scholarship", "internal_scholarship", ("校內獎學金",)),
    ("scholarship", "identity_based_scholarship", ("清寒獎學金", "原住民獎學金", "身心障礙獎學金")),
    ("scholarship", "external_scholarship", ("獎學金", "助學金")),
    ("club", "club_transfer", ("社團轉社", "轉社")),
    ("club", "club_selection", ("社團選填", "選社")),
    ("club", "club_notice", ("社團",)),
    ("honor_roll", "student_honor", ("榮譽榜", "得獎", "獲獎", "賀！", "賀:")),
    ("competition", "competition_result", ("競賽結果", "比賽結果", "獲獎名單")),
    ("competition", "internal_competition", ("校內競賽", "校內比賽")),
    ("competition", "external_competition", ("競賽", "比賽", "徵件")),
    ("enrollment", "class_assignment", ("編班", "班級名單")),
    ("enrollment", "transfer_student", ("轉學生", "轉學考")),
    ("enrollment", "admission", ("招生", "新生報到", "錄取名單")),
    ("student_affairs", "leave", ("請假", "缺曠")),
    ("student_affairs", "merit_demerit", ("獎懲", "記功", "記過")),
    ("student_affairs", "dress_code", ("服裝儀容", "服儀")),
    ("student_affairs", "student_id", ("學生證",)),
    ("rules_policy", "school_rule", ("校規", "學生獎懲規定", "服裝儀容規定")),
    ("rules_policy", "procedure", ("要點", "辦法", "規定", "實施計畫")),
    ("administration", "calendar", ("行事曆", "校務行事")),
    ("administration", "holiday", ("放假", "補假", "停班停課")),
    ("administration", "class_suspension", ("停課", "調課")),
    ("campus_service", "system", ("系統維護", "校務系統", "帳號啟用")),
    ("campus_service", "venue", ("場地借用", "教室借用")),
    ("campus_service", "equipment", ("設備借用", "器材借用")),
    ("event_learning", "workshop", ("工作坊",)),
    ("event_learning", "lecture", ("講座", "演講")),
    ("event_learning", "camp", ("營隊",)),
    ("event_learning", "training", ("研習", "培訓")),
    ("event_learning", "activity", ("活動", "參訪")),
)

ACTION_RULES = (
    ("club_transfer", ("轉社",)),
    ("make_up_exam", ("補考", "補測")),
    ("course_selection", ("選課", "選填", "加退選")),
    ("registration", ("報名", "登記")),
    ("application", ("申請", "提出申請")),
    ("participate", ("參加", "參與")),
    ("submit", ("繳交", "提交")),
    ("download", ("下載",)),
    ("query", ("查詢",)),
    ("payment", ("繳費",)),
    ("leave", ("請假",)),
    ("modify", ("修正", "更新", "異動")),
)

FIELD_TERMS = {
    "date": ("日期", "時間", "何時", "截止"),
    "location": ("地點", "場地", "教室", "會議室"),
    "procedure": ("流程", "方式", "如何", "辦法"),
    "eligibility": ("資格", "對象"),
    "required_documents": ("文件", "資料", "證明"),
    "amount": ("金額", "獎金"),
    "schedule": ("日程", "時程", "課表"),
    "grade": ("年級", "高一", "高二", "高三"),
}


def _clean(value, limit=20000):
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _unique(values, limit):
    result = []
    for value in values:
        value = _clean(value, 180)
        if value and value not in result:
            result.append(value)
        if len(result) >= limit:
            break
    return result


def _expand_aliases(text, aliases):
    expanded, matched = text, []
    for term in sorted(aliases, key=lambda value: (-len(value), value)):
        canonical = aliases[term]
        if term in text:
            matched.append(term)
            expanded += " " + canonical
    return expanded, matched


def _extract_academic_year(text):
    match = re.search(r"(?<!\d)(\d{2,3})\s*學年度", text)
    if not match:
        return None
    value = int(match.group(1))
    if 1911 <= value <= 2211:
        value -= 1911
    return value if 80 <= value <= 300 else None


def _extract_semester(text):
    if re.search(r"(?:第\s*)?一\s*學期|上學期", text):
        return 1
    if re.search(r"(?:第\s*)?二\s*學期|下學期", text):
        return 2
    return None


def _iso_date(year, month, day):
    try:
        return date(int(year), int(month), int(day)).isoformat()
    except ValueError:
        return None


def _extract_dates(text, publish_date=None):
    mentions = []
    seen = set()
    for match in re.finditer(r"(?<!\d)(20\d{2})[年/\-.](\d{1,2})[月/\-.](\d{1,2})日?", text):
        value = _iso_date(*match.groups())
        if not value or value in seen:
            continue
        context = text[max(0, match.start() - 10):match.end() + 10]
        role = "application_deadline" if re.search(r"截止|申請|報名", context) else "exam_date" if re.search(r"考試|考查|補考|模擬考", context) else "event_date" if re.search(r"活動|講座|研習|營隊", context) else "mention"
        mentions.append({"role": role, "value": value})
        seen.add(value)
    for match in re.finditer(r"(?<!\d)(1\d{2})年(\d{1,2})月(\d{1,2})日", text):
        value = _iso_date(int(match.group(1)) + 1911, match.group(2), match.group(3))
        if value and value not in seen:
            mentions.append({"role": "mention", "value": value})
            seen.add(value)
    return {"publish_date": publish_date or None, "mentions": mentions[:30]}


def _extract_audience(text):
    audience = []
    for token, patterns in (
        ("grade_1", ("高一", "一年級")),
        ("grade_2", ("高二", "二年級")),
        ("grade_3", ("高三", "三年級")),
        ("all_students", ("全校學生", "全體學生")),
        ("teachers", ("教師", "教職員")),
        ("parents", ("家長",)),
        ("applicants", ("考生", "申請人", "報名者")),
        ("club_members", ("社團成員", "社員")),
    ):
        if any(pattern in text for pattern in patterns):
            audience.append(token)
    if re.search(r"\d{3,4}\s*班", text):
        audience.append("specific_class")
    return _unique(audience, 20)


def _extract_location(item, text):
    explicit = _clean(item.get("location"), 500)
    if explicit:
        return explicit
    match = re.search(r"(?:地點|場地|上課地點)\s*[：:]\s*([^，。；;\n]{2,60})", text)
    return _clean(match.group(1), 500) if match else None


def _choose_category(sources):
    for source_name, text in sources:
        for main_category, sub_category, keywords in RULES:
            if any(keyword in text for keyword in keywords):
                return main_category, sub_category, source_name
    return "other", "other", "deterministic_rules"


def _source_hash(payload):
    stable = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(stable.encode("utf-8")).hexdigest()


def classify_announcement(item, aliases=None):
    """Classify one announcement without network or database access.

    The returned object intentionally omits override columns.  The deployed
    upsert RPC updates only automatic fields, preserving every manual override.
    """
    if not isinstance(item, dict):
        raise TypeError("announcement must be an object")
    announcement_id = _clean(item.get("announcement_id") or item.get("id"), 180)
    if not announcement_id:
        raise ValueError("announcement_id is required")
    aliases = dict(ALIASES if aliases is None else aliases)
    title = _clean(item.get("title"), 500)
    school = _clean(item.get("school") or item.get("school_id"), 40)
    if not school:
        raise ValueError("school is required")
    existing_category = _clean(item.get("category") or item.get("existing_category"), 160)
    department = _clean(item.get("department") or item.get("source_category"), 240) or None
    body = _clean(item.get("body") or item.get("content"))

    raw_sources = (
        ("existing_category", existing_category),
        ("title", title),
        ("department", department or ""),
        ("body", body),
    )
    expanded_sources, matched_aliases = [], []
    for name, value in raw_sources:
        expanded, matched = _expand_aliases(value, aliases)
        expanded_sources.append((name, expanded))
        matched_aliases.extend(matched)

    # A known legacy category is the first source of truth. Generic/unknown
    # categories such as 一般 do not mask a more specific title or body rule.
    legacy = LEGACY_CATEGORY_RULES.get(existing_category)
    if legacy:
        main_category, sub_category, matched_source = legacy[0], legacy[1], "existing_category"
    else:
        main_category, sub_category, matched_source = _choose_category(expanded_sources[1:])
    if main_category == "other" and department and re.search(r"教務處|學務處|總務處|圖書館|人事室|主計室|秘書室", department):
        main_category, sub_category, matched_source = "administration", "general_notice", "department"

    full_text = " ".join(value for _, value in expanded_sources)
    academic_year = _extract_academic_year(full_text)
    semester = _extract_semester(full_text)
    dates = _extract_dates(full_text, _clean(item.get("date") or item.get("publish_date"), 10) or None)
    audience = _extract_audience(full_text)
    actions = [action for action, terms in ACTION_RULES if any(term in full_text for term in terms)]
    requested_fields = [field for field, terms in FIELD_TERMS.items() if any(term in title for term in terms)]
    location = _extract_location(item, body)
    available_fields = []
    if dates["mentions"]:
        available_fields.append("date")
    if location:
        available_fields.append("location")
    if department:
        available_fields.append("office")
    if academic_year:
        available_fields.append("grade")
    if actions:
        available_fields.append("procedure")

    topics = [sub_category]
    if main_category == "rules_policy" and "校規" in full_text:
        topics.extend(("school_rule", "校規"))
    if sub_category == "club_transfer":
        topics.extend(("club_transfer", "轉社"))
    if matched_aliases:
        topics.extend(aliases[term] for term in matched_aliases)

    event_types = []
    if main_category == "academic_exam":
        event_types.append(sub_category)
    elif main_category in ("competition", "event_learning", "admission"):
        event_types.append(sub_category)

    confidence = {
        "title": 0.92,
        "existing_category": 0.82,
        "department": 0.62,
        "body": 0.74,
        "deterministic_rules": 0.35,
    }.get(matched_source, 0.35)
    if matched_aliases and confidence < 0.95:
        confidence = min(0.95, confidence + 0.03)
    sources = [matched_source]
    for name, value in raw_sources:
        if value and name not in sources:
            sources.append(name)
    if matched_aliases:
        sources.append("aliases")
    sources.append("deterministic_rules")

    source_payload = {
        "announcement_id": announcement_id,
        "title": title,
        "school": school,
        "existing_category": existing_category,
        "department": department,
        "body": body,
        "aliases": sorted((term, aliases[term]) for term in matched_aliases),
        "classification_version": CLASSIFICATION_VERSION,
    }
    reference_value = "HIGH" if main_category == "rules_policy" else "MEDIUM" if main_category in ("academic_exam", "administration") else "LOW" if main_category != "other" else "NONE"
    unresolved = item.get("unresolved_terms") if isinstance(item.get("unresolved_terms"), list) else []

    return {
        "announcement_id": announcement_id,
        "title": title,
        "school": school,
        "main_category": canonical_main_category(main_category),
        "sub_category": valid_subcategory(main_category, sub_category),
        "event_types": _unique(event_types, 20),
        "audience": audience,
        "topics": _unique(topics, 40),
        "actions": _unique(actions, 20),
        "requested_fields": _unique(requested_fields, 30),
        "available_fields": _unique(available_fields, 30),
        "academic_year": academic_year,
        "semester": semester,
        "dates": dates,
        "department": department,
        "location": location,
        "reference_value": reference_value,
        "classification_confidence": round(confidence, 3),
        "classification_sources": _unique(sources, 12),
        "classification_version": CLASSIFICATION_VERSION,
        "classification_source_hash": _source_hash(source_payload),
        "matched_aliases": _unique(matched_aliases, 30),
        "unresolved_terms": _unique(unresolved, 30),
    }
