"""Verify decision ordering and abstention with synthetic sources only."""
import unittest
from offline import analyze
from test_runner import r

class FlowControls(unittest.TestCase):
    def test_public_steps(self):
        o=analyze(r('報名即日起至10月20日截止。'),'2026-10-03')
        self.assertEqual(len(o['decision_steps']),8)
        self.assertEqual(o['decision_steps'][-1]['status'],'classified')
        self.assertTrue(o['today_evidence'])

    def test_unknown_is_not_optional(self):
        o=analyze(r('報名截止日期為10月20日。'),'2026-10-03')
        self.assertIsNone(o['label'])
        self.assertEqual(o['decision_status'],'unresolved')
        self.assertEqual(o['urgency'],'uncertain')

    def test_closed_registration_with_continuation(self):
        o=analyze(r('報名即日起至10月2日截止。已報名者於10月10日集合報到。'),'2026-10-03')
        self.assertEqual(o['label'],'useful')
        self.assertTrue(o['machine_facts']['participant_processes'])

    def test_no_assumed_registration(self):
        o=analyze(r('報名即日起至10月2日截止。活動日期10月10日。'),'2026-10-03')
        self.assertEqual(o['label'],'should_hide')
        self.assertFalse(o['machine_facts']['participant_processes'])

    def test_reference_does_not_become_useful(self):
        o=analyze(r('活動辦法：應備文件為學生證。'),'2026-10-03')
        self.assertEqual(o['label'],'optional')

    def test_conflict_abstains(self):
        rec=r('報名即日起至10月20日截止。')
        rec['metadata_content']=[{'locator':'article_metadata','text':'發布日期：2026-09-01'}]
        o=analyze(rec,'2026-10-03')
        self.assertIsNone(o['label'])

    def test_event_and_application_roles(self):
        o=analyze(r('報名即日起至10月20日截止。活動日期11月1日。'),'2026-10-03')
        self.assertIn('event',[d['purpose'] for d in o['dates']])
        self.assertIn('registration',[d['purpose'] for d in o['dates']])

    def test_negation_is_local(self):
        o=analyze(r('本次不延期。因颱風緊急停課。'),'2026-10-03')
        self.assertEqual(o['label'],'must_show')

    def test_title_only_abstains(self):
        rec=r('');rec['title']='操作指南'
        self.assertIsNone(analyze(rec,'2026-10-03')['label'])

if __name__=='__main__':unittest.main()
