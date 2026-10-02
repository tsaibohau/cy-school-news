"""Generic semantic consistency check. No ID/title/keyword/human-label mapping."""
import datetime as dt
from stage2_v34 import STAGE1_FIELDS, DIMENSIONS, freshness

REFERENCE_SCOPES={'none','archival_only','future_eligibility','general_learning','general_planning'}
PRIORITY={'none','fresh_unread','deadline_5','exam_7','urgent_change','direct_near_action'}

def policy_expected(d):
    reference=d['reference_scope'] in {'future_eligibility','general_learning','general_planning'}
    if d['audience_eligibility']=='clearly_not_applicable':
        return 'optional' if reference else 'should_hide'
    active=d['operational_reference_value'] in {'active_resource','active_rule','current_term_operation'} and d['current_applicability'] in {'active','upcoming','mixed'}
    if d['audience_eligibility']=='strong_requirements_unknown' and not active:return 'optional'
    if d['important_current'] and d['priority_basis']!='none':return 'must_show'
    if active:return 'useful'
    continuation=d['participant_continuation_value'] in {'plausible_future_process','confirmed_participant_process'}
    opportunity=d['opportunity_availability'] in {'open','upcoming_available','capacity_unknown'}
    if d['important_current'] and (continuation or opportunity):return 'useful'
    return 'optional' if d['residual_reference'] or reference else 'should_hide'

def validate_semantic(decision,evidence,as_of):
    d=decision['dimensions'];citations=evidence['citations']
    for key,values in DIMENSIONS.items():
        if d.get(key) not in values:raise ValueError('dimension:'+key)
    if d.get('reference_scope') not in REFERENCE_SCOPES or d.get('priority_basis') not in PRIORITY:raise ValueError('scope/priority')
    for key in ['important_current','urgent_direct','residual_reference']:
        if type(d.get(key)) is not bool:raise ValueError('boolean:'+key)
    if d['freshness_unread_priority']!=freshness(evidence,as_of):raise ValueError('freshness evidence mismatch')
    if decision['label']!=policy_expected(d):raise ValueError('semantic policy conflict')
    offsets=[(x['kind'],(dt.date.fromisoformat(x['value'])-dt.date.fromisoformat(as_of)).days) for x in evidence['dates']]
    if d['priority_basis']=='fresh_unread' and d['freshness_unread_priority'] not in {'recent','same_day'}:raise ValueError('unsupported freshness')
    if d['priority_basis']=='deadline_5' and not any(k in {'deadline','application_end'} and 0<=n<=5 for k,n in offsets):raise ValueError('deadline window')
    if d['priority_basis']=='exam_7' and not any(k=='event_date' and 0<=n<=7 for k,n in offsets):raise ValueError('exam window')
    refs=decision['dimension_citations']
    for key in [*DIMENSIONS,'important_current','urgent_direct','residual_reference','reference_scope','priority_basis']:
        if not refs.get(key) or not set(refs[key])<=set(citations):raise ValueError('uncited '+key)
    if not decision.get('reasons'):raise ValueError('missing structured reasons')
    for reason in decision['reasons']:
        if not reason.get('citations') or not set(reason['citations'])<=set(citations):raise ValueError('uncited reason')
    return True
