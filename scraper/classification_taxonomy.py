"""Stable announcement classification taxonomy (version 1).

The wire values deliberately mirror the already-deployed Preview database.
`activity` and `honor` remain accepted compatibility names, but records are
stored as `event_learning` and `honor_roll` respectively.
"""

CLASSIFICATION_VERSION = 1

MAIN_CATEGORIES = (
    "academic_exam",
    "course_selection",
    "admission",
    "student_affairs",
    "club",
    "competition",
    "event_learning",
    "scholarship",
    "honor_roll",
    "enrollment",
    "administration",
    "rules_policy",
    "campus_service",
    "other",
)

MAIN_CATEGORY_ALIASES = {
    "activity": "event_learning",
    "honor": "honor_roll",
}

SUBCATEGORIES = {
    "academic_exam": (
        "midterm", "mock_exam", "make_up_exam", "remedial_course",
        "exam_schedule_room", "grades", "other",
    ),
    "course_selection": (
        "course_selection", "multiple_elective", "micro_course", "course_change", "other",
    ),
    "admission": (
        "stars", "personal_application", "special_selection", "subject_test",
        "department_event", "other",
    ),
    "student_affairs": ("leave", "merit_demerit", "dress_code", "student_id", "other"),
    "club": ("club_notice", "club_transfer", "club_selection", "other"),
    "competition": ("external_competition", "internal_competition", "competition_result", "other"),
    "event_learning": ("activity", "training", "workshop", "lecture", "camp", "other"),
    "scholarship": (
        "external_scholarship", "internal_scholarship", "identity_based_scholarship", "other",
    ),
    "honor_roll": ("student_honor", "other"),
    "enrollment": ("admission", "class_assignment", "transfer_student", "other"),
    "administration": ("general_notice", "calendar", "holiday", "class_suspension", "other"),
    "rules_policy": ("school_rule", "procedure", "other"),
    "campus_service": ("system", "venue", "equipment", "other"),
    "other": ("other",),
}

ALIASES = {
    "一模": "第一次模擬考",
    "一段": "第一次定期考查",
    "三段": "第三次定期考查",
    "二模": "第二次模擬考",
    "二段": "第二次定期考查",
    "個申": "個人申請",
    "寒輔": "寒假輔導",
    "微課": "微課程",
    "暑輔": "暑期輔導",
    "段考": "定期考查",
    "繁星": "繁星推薦",
    "被當": "不及格／補考／重修",
    "跑班": "多元選修／跑班",
    "轉社": "社團轉社",
    "重補修": "重修／補修",
}

INDEX_DIMENSIONS = (
    "school", "main_category", "sub_category", "topic", "audience",
    "event_type", "action", "available_field", "academic_year", "semester", "date",
)


def canonical_main_category(value):
    value = str(value or "").strip()
    value = MAIN_CATEGORY_ALIASES.get(value, value)
    return value if value in MAIN_CATEGORIES else "other"


def valid_subcategory(main_category, value):
    main_category = canonical_main_category(main_category)
    value = str(value or "").strip()
    return value if value in SUBCATEGORIES[main_category] else "other"

