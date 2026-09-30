import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from source_resolver import resolve_source
from content_quality import assess_content
from temporal import normalize_temporal
from pipeline import make_stage1_payload, run_inference


class FakeStructuredProvider:
    """Contract fixture only. It is not evidence of model capability or accuracy."""
    def extract_evidence(self, payload):
        ann = payload['announcement']
        src = next(x for x in payload['evidence_sources'] if x['source_id']=='body')
        facts = {"announcement_id":ann['announcement_id'],
          "source_status":payload['resolved_source_status'],"content_quality":payload['resolved_content_quality'],
          "dates":{"published_date":None,"deadline_date":"2026-10-12","event_dates":[],"application_start":None,"application_end":None,"effective_until":None,"exam_date":None,"registration_start":None,"registration_end":None,"date_spans":[]},
          "affected_audience":["grade_3"],"teacher_related":False,
          "actions":[{"action":"register","status":"open","deadline":"2026-10-12","audience":["grade_3"]}],
          "actionability_status":"action_required_soon","temporal_status":"active",
          "long_lived_information":False,"historical_reference":False,"post_expiry_reference_value":"none",
          "evidence":[{"field":"dates.deadline_date","value":"2026-10-12","source_id":src['source_id'],"source_type":src['source_type'],"source_name":src['source_name'],"evidence_text":"報名截止日期為2026年10月12日","confidence":.99},
          {"field":"affected_audience","value":["grade_3"],"source_id":src['source_id'],"source_type":src['source_type'],"source_name":src['source_name'],"evidence_text":"限高三學生報名","confidence":.93},
          {"field":"actions","value":"register","source_id":src['source_id'],"source_type":src['source_type'],"source_name":src['source_name'],"evidence_text":"限高三學生報名","confidence":.9},
          {"field":"teacher_related","value":False,"source_id":src['source_id'],"source_type":src['source_type'],"source_name":src['source_name'],"evidence_text":"限高三學生報名","confidence":.7},
          {"field":"temporal_status","value":"active","source_id":src['source_id'],"source_type":src['source_type'],"source_name":src['source_name'],"evidence_text":"報名截止日期為2026年10月12日","confidence":.9},
          {"field":"long_lived_information","value":False,"source_id":src['source_id'],"source_type":src['source_type'],"source_name":src['source_name'],"evidence_text":"報名截止日期為2026年10月12日","confidence":.8},
          {"field":"historical_reference","value":False,"source_id":src['source_id'],"source_type":src['source_type'],"source_name":src['source_name'],"evidence_text":"報名截止日期為2026年10月12日","confidence":.8},
          {"field":"post_expiry_reference_value","value":"none","source_id":src['source_id'],"source_type":src['source_type'],"source_name":src['source_name'],"evidence_text":"報名截止日期為2026年10月12日","confidence":.8}],
          "confidence":{k:.9 for k in ["source_status","content_quality","dates","audience","actions","temporal_status","historical_reference"]}}
        return facts
    def reason_relevance(self, payload):
        return {"announcement_id":payload['announcement_id'],"today_label":"useful",
          "reasoning_factors":{"actionability":"medium","urgency":"later","audience_relevance":"direct","temporal_relevance":"upcoming","source_reliability":"high","reference_value":"none"},
          "reason_codes":["action_required"],"confidence":{k:.9 for k in ["label","actionability","urgency","audience_relevance","temporal_relevance","source_reliability","reference_value"]}}


class PipelineTests(unittest.TestCase):
    def test_source_precedence_and_cache_never_live(self):
        self.assertEqual(resolve_source({"http_status":404,"body_text":"cached-looking text"})['canonical_status'],'missing_confirmed')
        self.assertEqual(resolve_source({"status":"timeout"},{"body_text":"old page"})['canonical_status'],'temporarily_unreachable')
        self.assertEqual(resolve_source({"status":"fetch_failed","fetch_error":"ReadTimeout"})['canonical_status'],'temporarily_unreachable')
        self.assertEqual(resolve_source({"status":"fetch_failed","fetch_error":"ParserFailure"})['canonical_status'],'unknown')
        old=resolve_source(None,{"body_text":"cached only"})
        self.assertEqual(old['canonical_status'],'unknown'); self.assertFalse(old['page_available'])
        self.assertEqual(resolve_source({"http_status":200,"body_text":"正文"})['canonical_status'],'available')

    def test_content_quality_removes_title_and_controls(self):
        title="【公告】活動通知"
        q=assess_content(title+" ::: 首頁 ::: 字體大小調整 ::: 瀏覽數",title,fetch_succeeded=True)
        self.assertEqual(q['content_quality'],'title_only')
        b=assess_content(title+" ::: 首頁 ::: 瀏覽數 ::: "+"這是活動內容與報名辦法。"*15,title,fetch_succeeded=True)
        self.assertIn(b['content_quality'],{'full','partial'}); self.assertTrue(b['usable_content'])
        self.assertEqual(assess_content('',title,fetch_succeeded=False)['content_quality'],'unavailable')

    def test_dates_and_action_status_are_deterministic(self):
        old=normalize_temporal({"dates":{"deadline_date":"2026-09-20"},"actions":[{"action":"register","deadline":"2026-09-20"}],"actionability_status":"action_required_soon"},"2026-09-30")
        self.assertEqual(old['temporal_calculation']['days_since_deadline'],10)
        self.assertEqual(old['actionability_status'],'action_expired')
        due=normalize_temporal({"dates":{"deadline_date":"2026-10-02"},"actions":[{"action":"register","deadline":"2026-10-02"}],"actionability_status":"action_required_soon"},"2026-09-30")
        self.assertEqual(due['temporal_calculation']['days_until_deadline'],2); self.assertEqual(due['actionability_status'],'action_required_now')

    def test_two_stages_citations_and_no_human_fields(self):
        item={"announcement_id":"synthetic-1","school":"cysh","title":"活動","category":"競賽","teacher_related":True,"human_label":"should_hide","human_deadline_date":"2000-01-01"}
        body="限高三學生報名，報名截止日期為2026年10月12日。"*15
        provider=FakeStructuredProvider()
        out=run_inference(item,provider,current_observation={"http_status":200,"body_text":body},as_of="2026-09-30")
        self.assertEqual(out['relevance']['today_label'],'useful')
        self.assertEqual(out['temporal']['temporal_calculation']['days_until_deadline'],12)
        payload=make_stage1_payload(item,current_observation={"http_status":200,"body_text":body},as_of="2026-09-30")
        encoded=str(payload)
        self.assertNotIn('human_label',encoded); self.assertNotIn('teacher_related',encoded); self.assertNotIn('human_deadline_date',encoded)

    def test_chain_of_thought_shape_is_rejected(self):
        provider=FakeStructuredProvider()
        original=provider.reason_relevance
        provider.reason_relevance=lambda p:{**original(p),"reasoning":"private chain"}
        with self.assertRaises(ValueError):
            run_inference({"announcement_id":"synthetic-1","title":"活動"},provider,
                          current_observation={"http_status":200,"body_text":"報名截止日期為2026年10月12日，限高三學生報名。"*15},as_of="2026-09-30")


if __name__=='__main__': unittest.main(verbosity=2)
