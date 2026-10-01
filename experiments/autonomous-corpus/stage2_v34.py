"""Stage 2 consistency gate, not a numerical scorer or inference engine.

Native Work semantic inference supplies independent dimensions, cited reasons
and its four-class label. This gate checks that output against frozen generic
policy. It never reads human labels, IDs, titles or keywords to decide a class.
"""
import datetime as dt
import hashlib
import json
from pathlib import Path
import benchmark as b

STAGE1_FIELDS=('dates','citations','audience','actionability','temporal_state',
    'historical_reference','post_expiry_reference_value','source_conflicts','uncertainties')
DIMENSIONS={
 'current_applicability':{'active','upcoming','mixed','finished','undated','uncertain'},
 'direct_actionability':{'required_now','required_soon','available','none','expired','uncertain'},
 'opportunity_availability':{'open','upcoming_available','closed','capacity_unknown','undated_unverified','none','uncertain'},
 'operational_reference_value':{'active_resource','active_rule','current_term_operation','none','historical_only','uncertain'},
 'participant_continuation_value':{'plausible_future_process','confirmed_participant_process','none','uncertain'},
 'audience_eligibility':{'broadly_applicable','niche_but_possible','strong_requirements_unknown','clearly_not_applicable','uncertain'},
 'freshness_unread_priority':{'same_day','recent','stale','unknown'},
}

def policy_expected(d):
    if d['audience_eligibility']=='clearly_not_applicable':return 'should_hide'
    active_op=d['operational_reference_value'] in {'active_resource','active_rule','current_term_operation'}
    if d['audience_eligibility']=='strong_requirements_unknown' and not active_op:return 'optional'
    if d['urgent_direct'] or (d['important_current'] and d['freshness_unread_priority'] in {'same_day','recent'}):return 'must_show'
    if active_op:return 'useful'
    continuation=d['participant_continuation_value'] in {'plausible_future_process','confirmed_participant_process'}
    opportunity=d['opportunity_availability'] in {'open','upcoming_available','capacity_unknown'}
    if d['important_current'] and (continuation or opportunity):return 'useful'
    return 'optional' if d['residual_reference'] else 'should_hide'

def freshness(evidence,as_of):
    pub=[d for d in evidence['dates'] if d['kind']=='publication_date']
    if not pub:return 'unknown'
    age=(dt.date.fromisoformat(as_of)-dt.date.fromisoformat(pub[0]['value'])).days
    return 'same_day' if age==0 else 'recent' if 0<age<=5 else 'stale'

def validate_semantic(decision,evidence,as_of):
    d=decision['dimensions']
    for k,values in DIMENSIONS.items():
        if d.get(k) not in values:raise ValueError('dimension:'+k)
    for k in ['important_current','urgent_direct','residual_reference']:
        if type(d.get(k)) is not bool:raise ValueError('boolean:'+k)
    if d['freshness_unread_priority']!=freshness(evidence,as_of):raise ValueError('freshness evidence mismatch')
    if decision['label']!=policy_expected(d):raise ValueError('semantic label conflicts with frozen policy')
    if not decision['reasons']:raise ValueError('missing structured reason')
    for reason in decision['reasons']:
        if not reason['citations'] or not set(reason['citations'])<=set(evidence['citations']):raise ValueError('unsupported reason')
    refs=decision.get('dimension_citations',{})
    for k in [*DIMENSIONS,'important_current','urgent_direct','residual_reference']:
        if k not in refs or not refs[k] or not set(refs[k])<=set(evidence['citations']):raise ValueError('uncited dimension:'+k)
    return True

def assemble(decisions,stage1,corpus,policy_sha,batch_id):
    by={x['id']:x for x in stage1['outputs']};outputs=[]
    for decision in decisions:
        evidence={k:by[decision['id']][k] for k in STAGE1_FIELDS}
        validate_semantic(decision,evidence,corpus['as_of'])
        out={'id':decision['id'],**evidence,'label':decision['label'],
            'stage1_sha256':b.sha(b.canonical(evidence)),
            'stage2':decision,'structured_reasons':decision['reasons']}
        outputs.append(out)
    return {'schema_version':1,'candidate':'v3.4','batch_id':batch_id,
      'engine':{'kind':'native Work assistant','exact_model_identity':'unverified','external_api_used':False},
      'as_of':corpus['as_of'],'persona':corpus['persona'],
      'corpus_sha256':'0535de250b79a284cd9aa89f0a74fbe46da48e5c6f8e3a21a26389c161078a88',
      'stage1_parent_sha256':'60d59dd38d11882d416b9dac2974283dacdc54fa3f8c2aa8edc860e85bbc8ca4',
      'policy_sha256':policy_sha,'human_primitives_used':False,
      'human_labels_used_as_inference_input':False,
      'development_policy_informed_by_batch_a':True,
      'outputs':outputs,'frozen_at':dt.datetime.now(dt.timezone.utc).isoformat()}

def blind_input(queue,stage1):
    by={x['id']:x for x in stage1['outputs']}
    return {'as_of':queue['as_of'],'persona':queue['persona'],'records':[
       {**r,'stage1':{k:by[r['id']][k] for k in STAGE1_FIELDS}} for r in queue['records']]}
