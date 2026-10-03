"""Evidence-backed public decision steps; source interpretation remains in offline.py.

Inputs are machine-extracted facts, never human-prepared features. The flow does
not equate historical utility with a current action, or force a class from missing
facts. This implements an inspectable procedure, not general language reasoning.
"""
def decide(facts):
    steps = []
    def step(question, status, answer, evidence):
        steps.append({'question': question, 'status': status, 'answer': answer, 'evidence': evidence})

    coverage = facts['coverage']
    step('資料是否讀到？', 'partial' if coverage['gaps'] else 'available',
         '有可讀正文／附件' if coverage['content_available'] else '只有標題，不能完成內容判斷', coverage['evidence'])
    intentions = facts['intentions']
    step('公告在說什麼事？', 'identified' if intentions else 'unknown',
         '、'.join(sorted({i['kind'] for i in intentions})) if intentions else '尚未辨識到明確事件或用途',
         [e for i in intentions for e in i['evidence']])
    step('是否適用高一學生？', facts['audience'],
         {'ineligible':'原文有不適用的限制', 'applicable':'已辨識適用對象', 'uncertain':'未充分確認資格；不假設已報名或未報名'}[facts['audience']], facts['audience_evidence'])
    windows = facts['windows']
    date_refs = [e for d in facts['dates'] for e in d['evidence']]
    step('每個時間對應什麼動作？', 'uncertain' if any(d['purpose']=='unknown' or not d['value'] for d in facts['dates']) else 'identified' if facts['dates'] else 'unknown',
         '保留每組日期用途；報名、活動與發文日期分開，不任意配對不同場次', date_refs)

    eligible = facts['audience'] != 'ineligible'
    actionable = [w for w in windows if w['label'] in {'must_show','useful'}]
    upcoming = [w for w in windows if w['label']=='optional']
    unresolved = [w for w in windows if w['label'] is None]
    continuation = facts['participant_processes']
    current = facts['current_operations']
    exams = facts['near_exams']
    changes = facts['urgent_changes']
    current_refs = [e for x in continuation+current+exams+changes for e in x['evidence']]
    step('今天還能／需要做什麼？', 'available' if actionable or continuation or current or exams or changes else 'uncertain' if unresolved else 'upcoming' if upcoming else 'none_identified',
         '報名提醒與參加者後續流程分開；報名結束不代表所有後續都結束',
         [e for w in windows for e in w['evidence']] + current_refs)
    urgent_windows = [w for w in actionable if w['label']=='must_show']
    urgent = bool(urgent_windows or exams or changes)
    step('是否到了急迫狀態？', 'urgent' if urgent else 'uncertain' if unresolved else 'not_urgent',
         '已開放且五天內截止／七天內考試／有近期時間依據的異動' if urgent else '未確認有急迫行動；單獨出現緊急詞不足以成立',
         [e for w in urgent_windows for e in w['evidence']] + [e for x in exams+changes for e in x['evidence']])
    groups = facts['reference_groups']
    step('哪些部分仍可參考？', 'partial_classification',
         '按段落分開保存用途及限制；舊時間保留年度，法規須核對現行效力，參考價值不提升Today',
         [e for g in groups for e in g['evidence']])

    label, reason, evidence = None, '必要依據不足，暫不強迫歸入四級', []
    if not eligible:
        label, reason, evidence = 'should_hide', '原文限制不適用高一學生', facts['audience_evidence']
    elif not coverage['content_available']:
        pass
    elif urgent:
        label, reason = 'must_show', '適用範圍內有近期急迫行動'
        evidence = [e for w in urgent_windows for e in w['evidence']] + [e for x in exams+changes for e in x['evidence']]
    elif actionable:
        label, reason, evidence = 'useful', '現在可報名／申請，尚未達急迫門檻', actionable[0]['evidence']
    elif continuation or current:
        x = (continuation+current)[0]
        label, reason, evidence = 'useful', '原文另有仍有效的後續流程／當期操作資訊', x['evidence']
    elif unresolved or facts['unparsed_registration'] or facts['material_conflict']:
        pass
    elif upcoming:
        label, reason, evidence = 'optional', '報名尚未開始，今天不能辦理', upcoming[0]['evidence']
    elif windows and all(w['label']=='should_hide' for w in windows):
        label, reason, evidence = 'should_hide', '已辨識報名均結束，未辨識到仍有效後續', windows[0]['evidence']
    elif groups and all(g['reference_class'] in {'targeted','cycle_only','no_reference'} for g in groups):
        label, reason, evidence = 'should_hide', '只辨識到歷史／單次資訊，沒有今天的行動依據', groups[0]['evidence']
    elif any(g['reference_class'] in {'conditional','verify_current'} for g in groups):
        g=next(g for g in groups if g['reference_class'] in {'conditional','verify_current'})
        label, reason, evidence = 'optional', '有條件參考價值，但未確認當期使用效力', g['evidence']
    # Preserve contradictions rather than allowing an earlier positive rule to hide them.
    if eligible and facts['material_conflict']:
        label, reason, evidence = None, '來源或時間互相矛盾，暫不作最終分類', []
    step('最後的重要性是什麼？', 'classified' if label is not None else 'unresolved', reason, evidence)
    return {'label':label, 'today_reason':reason, 'today_evidence':evidence,
            'urgency':'uncertain' if label is None else 'urgent' if label=='must_show' else 'not_urgent',
            'decision_status':'classified' if label is not None else 'unresolved', 'decision_steps':steps}
