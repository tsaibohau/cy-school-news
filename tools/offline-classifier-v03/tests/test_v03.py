import sys, pathlib, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import offline_classifier as oc


def run(body, pub="2026-10-01", asof="2026-10-03", title="公告"):
    r = {"id": "t", "school": "s", "title": title, "published_at": pub, "body": body}
    u, g = oc.read_sources(r, pathlib.Path("."))
    return oc.classify(r, u, g, asof)


def dates(body, pub="2026-10-01"):
    return run(body, pub)["dates"]


class CrossYear(unittest.TestCase):
    def test_january_deadline_in_december_not_hidden(self):
        o = run("報名截止日期：1月10日。", "2026-12-20", "2026-12-22")
        self.assertNotEqual(o["label"], "should_hide")

    def test_inferred_next_year_value_and_basis(self):
        d = dates("報名即日起至1月10日截止。", "2026-12-20")
        self.assertEqual(d[0]["value"], "2027-01-10")
        self.assertEqual(d[0]["year_basis"], "inferred_next_year")

    def test_inferred_year_capped_at_useful_and_provisional(self):
        o = run("報名即日起至1月3日截止。", "2026-12-28", "2026-12-30")
        self.assertEqual(o["label"], "useful")
        self.assertEqual(o["decision_status"], "provisional")

    def test_inferred_year_never_hides_after_deadline(self):
        o = run("報名即日起至1月10日截止。", "2026-12-20", "2027-01-20")
        self.assertNotEqual(o["label"], "should_hide")

    def test_far_future_month_is_unknown_year_not_guessed(self):
        d = dates("報名截止日期：6月30日。", "2026-10-01")
        self.assertIsNone(d[0]["value"])

    def test_past_date_same_year_without_wrap_stays_past(self):
        d = dates("9月20日之活動已結束。", "2026-10-01")
        self.assertEqual(d[0]["value"], "2026-09-20")

    def test_same_sentence_range_crosses_year(self):
        d = dates("報名12月20日至1月10日。", "2026-12-01")
        self.assertEqual([x["value"] for x in d[:2]], ["2026-12-20", "2027-01-10"])

    def test_no_wrap_when_published_in_spring(self):
        d = dates("報名截止日期：2月1日。", "2026-03-01")
        self.assertEqual(d[0]["value"], "2026-02-01")


class DeadlineInclusive(unittest.TestCase):
    def test_qian_includes_deadline_day(self):
        self.assertEqual(run("報名即日起至10月3日前。", "2026-09-25")["label"], "must_show")

    def test_qian_with_weekday_includes_deadline_day(self):
        self.assertEqual(run("報名即日起至10月3日(五)前。", "2026-09-25")["label"], "must_show")

    def test_qian_fullwidth_weekday(self):
        self.assertEqual(run("報名即日起至10月3日（五）前。", "2026-09-25")["label"], "must_show")

    def test_day_after_deadline_is_hidden(self):
        self.assertEqual(run("報名即日起至10月3日前。", "2026-09-25", "2026-10-04")["label"], "should_hide")

    def test_zaoyu_excludes_day(self):
        d = dates("報名須早於10月3日。")
        self.assertEqual(d[0]["boundary"], "before_day")

    def test_partial_day_qian_inclusive(self):
        d = dates("報名10月1日至20日前。")
        self.assertEqual(d[-1]["boundary"], "inclusive")


class WeekdayParen(unittest.TestCase):
    def test_range_with_weekday(self):
        self.assertEqual(run("報名時間：10月1日(三)至10月20日(五)。")["label"], "useful")

    def test_range_with_fullwidth_weekday(self):
        self.assertEqual(run("報名時間：10月1日（三）至10月20日（五）。")["label"], "useful")

    def test_range_with_xingqi(self):
        self.assertEqual(run("報名時間：10月1日(星期三)至10月20日(星期五)。")["label"], "useful")

    def test_quote_keeps_original_text(self):
        o = run("報名時間：10月1日(三)至10月20日(五)。")
        self.assertIn("(三)", o["registration_windows"][0]["evidence"][0]["quote"])

    def test_non_weekday_paren_untouched(self):
        self.assertIn("(備註)", oc.normalize_dates("10月1日(備註)"))


class ChangeVocabulary(unittest.TestCase):
    def test_emergency_contact_not_change(self):
        self.assertNotEqual(run("本活動緊急聯絡電話為0912。", "2026-10-02")["label"], "must_show")

    def test_cancel_registration_instruction_not_change(self):
        self.assertNotEqual(run("如需取消報名，請洽承辦人。", "2026-10-02")["label"], "must_show")

    def test_cancel_event_is_change(self):
        self.assertEqual(run("本次校外教學活動取消。", "2026-10-02")["label"], "must_show")

    def test_stop_class(self):
        self.assertEqual(run("明日停止上課，請同學注意。", "2026-10-02")["label"], "must_show")

    def test_holiday_within_week(self):
        self.assertEqual(run("10月10日放假一天。", "2026-10-02")["label"], "must_show")

    def test_make_up_class(self):
        self.assertEqual(run("10月5日補課，請同學準時到校。", "2026-10-02")["label"], "must_show")

    def test_not_stop_class_is_negated(self):
        self.assertNotEqual(run("明日不停課，照常上課。", "2026-10-02")["label"], "must_show")

    def test_emergency_notice_still_counts(self):
        self.assertEqual(run("緊急通知：明日集合時間改期。", "2026-10-02")["label"], "must_show")


class Audience(unittest.TestCase):
    def test_whole_school_with_only_grade2_not_applicable(self):
        o = run("全校高二學生報名，即日起至10月20日截止。")
        self.assertIsNone(o["label"])

    def test_pure_grade2_hidden(self):
        self.assertEqual(run("僅限高二學生報名，即日起至10月20日截止。")["label"], "should_hide")

    def test_grade1_applicable(self):
        o = run("對象：高一學生，報名即日起至10月20日截止。")
        self.assertEqual(o["persona_applicability"], "applicable")

    def test_whole_school_alone_applicable(self):
        o = run("全校學生均可報名，即日起至10月20日截止。")
        self.assertEqual(o["persona_applicability"], "applicable")

    def test_teacher_training_not_assumed_for_student(self):
        o = run("教師研習報名，即日起至10月20日截止。", title="教師研習")
        self.assertIsNone(o["label"])

    def test_homeroom_relay_is_not_teacher_directed(self):
        o = run("全校學生報名，請各班導師協助宣導。即日起至10月20日截止。")
        self.assertEqual(o["persona_applicability"], "applicable")

    def test_each_class_teacher_not_whole_school(self):
        o = run("請各班導師出席會議。")
        self.assertNotEqual(o["persona_applicability"], "applicable")

    def test_teacher_and_students_both(self):
        o = run("教師及學生均可報名，即日起至10月20日截止。")
        self.assertEqual(o["persona_applicability"], "unspecified")


class DateSyntax(unittest.TestCase):
    def test_dotted_roc(self):
        d = dates("報名即日起至115.10.20截止。")
        self.assertIn("2026-10-20", [x["value"] for x in d])

    def test_slash_roc(self):
        d = dates("報名即日起至115/10/20截止。")
        self.assertIn("2026-10-20", [x["value"] for x in d])

    def test_month_day_slash(self):
        d = dates("報名即日起至10/20截止。")
        self.assertIn("2026-10-20", [x["value"] for x in d])

    def test_class_range_hyphen_not_date(self):
        self.assertEqual(dates("參加班級：高1-3班。"), [])

    def test_period_range_hyphen_not_date(self):
        self.assertEqual(dates("第2-4節課。"), [])

    def test_fraction_not_date(self):
        self.assertEqual(dates("名額85/100。"), [])

    def test_iso_date(self):
        d = dates("報名即日起至2026-10-20截止。")
        self.assertIn("2026-10-20", [x["value"] for x in d])


class DeadlineVocabulary(unittest.TestCase):
    def test_extension_phrase_is_deadline(self):
        self.assertTrue(oc.matches("deadline", "報名延長至10月25日"))

    def test_other_extension_phrases(self):
        for w in ["展延至", "順延至", "延期至"]:
            self.assertTrue(oc.matches("deadline", f"報名{w}10月25日"))

    def test_extension_window_has_end(self):
        o = run("報名延長至10月25日。")
        self.assertEqual(o["registration_windows"][0]["end"], "2026-10-25")


class Regression(unittest.TestCase):
    def test_baseline_range_still_works(self):
        self.assertEqual(run("報名即日起至10月20日截止。")["label"], "useful")

    def test_urgent_within_five_days(self):
        self.assertEqual(run("報名即日起至10月6日截止。")["label"], "must_show")

    def test_closed_is_hidden(self):
        self.assertEqual(run("報名即日起至9月30日截止。", "2026-09-20")["label"], "should_hide")

    def test_chinese_numeral_date(self):
        d = dates("報名即日起至十月二十日截止。")
        self.assertIn("2026-10-20", [x["value"] for x in d])

    def test_deadline_only_remains_unresolved(self):
        self.assertIsNone(run("報名截止日期：10月20日。")["label"])

    def test_exam_within_week(self):
        self.assertEqual(run("期中考試日期為10月7日(三)。")["label"], "must_show")

    def test_title_only_not_classified(self):
        self.assertIsNone(run("", title="報名即日起至10月20日截止")["label"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
