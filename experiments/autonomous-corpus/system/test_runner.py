"""Offline controls only; these fixtures never count as human model evidence."""
import copy
import unittest
from runner import registration_label, request_payload, validate

class Controls(unittest.TestCase):
    def test_registration_boundaries(self):
        self.assertEqual(registration_label('2026-10-04', '2026-10-20', '2026-10-03'), 'optional')
        self.assertEqual(registration_label('2026-10-01', '2026-10-09', '2026-10-03'), 'useful')
        self.assertEqual(registration_label('2026-10-01', '2026-10-08', '2026-10-03'), 'must_show')
        self.assertEqual(registration_label('2026-10-01', '2026-10-03', '2026-10-03T23:59:00+08:00'), 'must_show')
        self.assertEqual(registration_label('2026-10-01', '2026-10-03', '2026-10-04'), 'should_hide')
        self.assertEqual(registration_label('2026-10-01', '2026-10-03T12:00:00+08:00', '2026-10-03T12:01:00+08:00'), 'should_hide')
        self.assertIsNone(registration_label(None, '2026-10-20', '2026-10-03'))
        with self.assertRaises(ValueError): registration_label('2026-10-20', '2026-10-01', '2026-10-03')

    def test_source_whitelist(self):
        r = {'id': 'cysh-1', 'school': 'cysh', 'title': 'test', 'label': 'must_show',
             'human_features': {'answer': 'useful'}, 'reference_analysis': {'answer': 'optional'}}
        p = request_payload('explicit-model', r, {}, '2026-10-03', 'instructions', {})
        self.assertNotIn('human_features', p['input'])
        self.assertNotIn('reference_analysis', p['input'])
        self.assertNotIn('must_show', p['input'])
        self.assertFalse(p['store'])

    def fixture(self):
        r = {'id': 'cysh-1', 'school': 'cysh', 'title': 'notice', 'date': '2026-10-01',
             'body_content': [{'locator': 'body:1', 'text': '即日起至10月20日接受報名'}]}
        e = [{'source_id': 'body:0', 'quote': '即日起至10月20日接受報名'}, {'source_id': 'publication', 'quote': '2026-10-01'}]
        o = {'id': r['id'], 'label': 'useful', 'persona_applicability': 'applicable',
             'urgency': {'status': 'not_urgent', 'reason': 'open', 'evidence': e},
             'actionability': 'registration open', 'dates': [{'purpose': 'deadline', 'value': '2026-10-20', 'raw_expression': '10月20日', 'year_basis': 'publication', 'evidence': e}],
             'registration_windows': [{'purpose': 'registration', 'start': r['date'], 'end': '2026-10-20', 'start_basis': 'publication_immediate', 'applicability': 'applicable', 'label': 'useful', 'reason': 'open', 'evidence': e}],
             'today_reason': 'open', 'today_evidence': e,
             'reference_groups': [{'title': 'old dates', 'content_kind': 'cycle date', 'reference_class': 'cycle_only', 'scope': '2026', 'reason': 'historical only', 'allowed_questions': [], 'limitations': ['not future dates'], 'evidence': e}],
             'latest_source_status': 'not_checked', 'current_effect_status': 'not_verified', 'uncertainties': [], 'source_conflicts': []}
        return r, o

    def test_grounding_and_immediate_start(self):
        r, o = self.fixture(); self.assertTrue(validate(o, r, '2026-10-03'))
        o['dates'].append({'purpose': 'application_start', 'value': r['date'], 'raw_expression': '即日起', 'year_basis': 'publication', 'evidence': o['today_evidence']})
        self.assertTrue(validate(o, r, '2026-10-03'))
        bad = copy.deepcopy(o); bad['today_evidence'][0]['quote'] = 'invented'
        with self.assertRaises(ValueError): validate(bad, r, '2026-10-03')
        bad = copy.deepcopy(o); bad['registration_windows'][0]['start'] = '2026-10-02'
        with self.assertRaises(ValueError): validate(bad, r, '2026-10-03')
        bad = copy.deepcopy(o); bad['dates'][0]['value'] = '2027-10-20'
        with self.assertRaises(ValueError): validate(bad, r, '2026-10-03')
        bad = copy.deepcopy(o); bad['registration_windows'][0]['label'] = 'must_show'
        with self.assertRaises(ValueError): validate(bad, r, '2026-10-03')

if __name__ == '__main__': unittest.main()
