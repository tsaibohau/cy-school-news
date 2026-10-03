"""Offline synthetic controls; never human evidence."""
import unittest
from offline import analyze,registration_label
def r(t,title='學生公告'):
 return {'id':'cysh-1','school':'cysh','title':title,'date':'2026-10-01','body_content':[{'locator':'body:1','text':t}],'attachment_content':[]}
class Controls(unittest.TestCase):
 def test_boundaries(self):
  for start,end,now,want in [('2026-10-04','2026-10-20','2026-10-03','optional'),('2026-10-01','2026-10-09','2026-10-03','useful'),('2026-10-01','2026-10-08','2026-10-03','must_show'),('2026-10-01','2026-10-03','2026-10-03T23:59:00+08:00','must_show'),('2026-10-01','2026-10-03T12:00:00+08:00','2026-10-03T12:01:00+08:00','should_hide'),(None,'2026-10-20','2026-10-03',None)]:self.assertEqual(registration_label(start,end,now),want)
 def test_immediate_year(self):
  o=analyze(r('報名即日起至10月20日截止。'),'2026-10-03');self.assertEqual(o['label'],'useful');self.assertEqual(o['registration_windows'][0]['start'],'2026-10-01');self.assertEqual(o['dates'][0]['value'],'2026-10-20')
 def test_persona(self):
  self.assertEqual(analyze(r('參加對象：高二學生。報名即日起至10月5日截止。'),'2026-10-03')['label'],'should_hide')
 def test_unknown(self):
  o=analyze(r('報名截止日期為10月20日。'),'2026-10-03');self.assertIsNone(o['registration_windows'][0]['label']);self.assertTrue(o['needs_review'])
 def test_reference_expiry(self):
  o=analyze(r('報名即日起至10月2日截止。活動辦法：應備文件為學生證。得獎名單僅供查閱。'),'2026-10-03');self.assertEqual(o['label'],'should_hide');self.assertIn('conditional',[g['reference_class'] for g in o['reference_groups']]);self.assertIn('targeted',[g['reference_class'] for g in o['reference_groups']])
 def test_negation(self):
  self.assertNotEqual(analyze(r('本次不延期，無須停課。'),'2026-10-03')['label'],'must_show')
 def test_attachments(self):
  rec=r('本活動報名資訊詳見附件。');rec['attachment_content']=[{'filename':'test.pdf','status':'parsed','content':{'units':[{'locator':'page:1','text':'第一場報名10月1日至10月8日。'},{'locator':'page:2','text':'第二場報名11月1日至11月20日。'}]}}];o=analyze(rec,'2026-10-03');self.assertEqual(len(o['registration_windows']),2);self.assertEqual(o['label'],'must_show');self.assertTrue(any(e['filename']=='test.pdf' for w in o['registration_windows'] for e in w['evidence']))
 def test_no_human(self):
  rec=r('學生操作指南提供流程。');o=analyze(rec,'2026-10-03');rec.update(label='must_show',human_features={'teacher_related':True},reference_analysis={'class':'no_reference'});self.assertEqual(o,analyze(rec,'2026-10-03'))
 def test_teacher_coordinator(self):
  self.assertNotEqual(analyze(r('對象：高一學生，教師協助報名。'),'2026-10-03')['persona_applicability'],'ineligible')
 def test_all_grades(self):
  self.assertEqual(analyze(r('參加對象：高一至高三學生。'),'2026-10-03')['persona_applicability'],'applicable')
 def test_same_clause_partial_reference(self):
  o=analyze(r('活動辦法包含應備文件，報名即日起至10月2日截止。'),'2026-10-03');kinds={g['reference_class'] for g in o['reference_groups']};self.assertIn('conditional',kinds);self.assertIn('cycle_only',kinds)
if __name__=='__main__':unittest.main()
