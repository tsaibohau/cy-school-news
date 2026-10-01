"""Offline freeze, citation integrity and label evaluation. No model inference here."""
import argparse
import datetime as dt
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

LABELS=['must_show','useful','optional','should_hide']
POSITIVE=set(LABELS[:2])
REFERENCE=['none','limited','useful_reference','long_term_reference','uncertain']
ACTIONS=['action_required_now','action_required_soon','action_available_later','information_only','action_completed','action_expired','uncertain']
DATE_KINDS=['publication_date','deadline','event_date','application_start','application_end','effective_until']

def canonical(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def sha(x):return hashlib.sha256(x).hexdigest()
def norm(x):return re.sub(r'\s+','',str(x))

def sources(record):
    result={('title','title','title:1'):record['title']}
    if record.get('date'):result[('metadata','source-index.json','publication_date')]=record['date']
    for b in record.get('metadata_content',[]):result[('metadata','source.html',b['locator'])]=b['text']
    for b in record['body_content']:result[('body','source.html',b['locator'])]=b['text']
    for a in record['attachment_content']:
        for u in (a.get('content') or {}).get('units',[]):result[('attachment',a['filename'],u['locator'])]=u['text']
    return result

def cite_audit(citation,index):
    key=tuple(citation.get(k,'') for k in ['source_type','filename','locator'])
    if key not in index:return 'source_or_locator_missing'
    if not citation.get('snippet') or norm(citation['snippet']) not in norm(index[key]):return 'quote_not_in_source'
    if not 0<=citation.get('confidence',-1)<=1:return 'invalid_confidence'
    return None

def audit(corpus,outputs):
    rows={r['id']:r for r in corpus['records']};seen=set();errors=[];count=0;flags=[]
    for out in outputs:
        aid=out['id']
        if aid in seen:errors.append({'id':aid,'error':'duplicate_output'})
        seen.add(aid)
        if aid not in rows:errors.append({'id':aid,'error':'unknown_id'});continue
        index=sources(rows[aid]);citations=out.get('citations',{})
        for cid,c in citations.items():
            count+=1;e=cite_audit(c,index)
            if e:errors.append({'id':aid,'citation':cid,'error':e})
        if out.get('label') not in LABELS:errors.append({'id':aid,'error':'label'})
        for field in ['historical_reference','post_expiry_reference_value']:
            if out.get(field) not in REFERENCE:errors.append({'id':aid,'error':field})
        if out.get('actionability') not in ACTIONS:errors.append({'id':aid,'error':'actionability'})
        for reason in out.get('structured_reasons',[]):
            if not reason.get('citations'):errors.append({'id':aid,'error':'reason_without_citation'})
            for cid in reason.get('citations',[]):
                if cid not in citations:errors.append({'id':aid,'error':'claim_citation_missing','citation':cid})
        for date in out.get('dates',[]):
            if date.get('kind') not in DATE_KINDS:errors.append({'id':aid,'error':'date_kind'});continue
            try:value=dt.date.fromisoformat(date['value'])
            except Exception:errors.append({'id':aid,'error':'date_invalid'});continue
            refs=[citations[cid] for cid in date.get('citations',[]) if cid in citations]
            quote=' '.join(c['snippet'] for c in refs)
            raw=date.get('raw_value','')
            if not refs or not raw or norm(raw) not in norm(quote):errors.append({'id':aid,'error':'date_value_not_quoted'});continue
            numbers=[int(v) for v in re.findall(r'\d+',norm(raw))]
            # Full-date or explicitly cited year + month/day only. An inferred year
            # must be declared and cited independently, never silently supplied.
            full=(value.year in numbers or value.year-1911 in numbers) and value.month in numbers and value.day in numbers
            partial=value.month in numbers and value.day in numbers and date.get('year_basis') and any(str(value.year) in c['snippet'] or str(value.year-1911) in c['snippet'] for c in refs)
            if not full and not partial:errors.append({'id':aid,'error':'unsupported_date_components'})
            delta=(value-dt.date.fromisoformat(corpus['as_of'])).days
            date['days_until']=delta;date['days_since']=-delta
        if out.get('actionability')=='action_completed' and corpus['persona'].get('prior_actions')=='unknown':
            flags.append({'id':aid,'flag':'persona_completion_requires_evidence'})
        supported_recent=False
        explicit_publication=[d for d in out.get('dates',[]) if d.get('kind')=='publication_date']
        try:
            publication=explicit_publication[0]['value'] if explicit_publication else rows[aid]['date']
            age=(dt.date.fromisoformat(corpus['as_of'])-dt.date.fromisoformat(publication)).days
            supported_recent=0<=age<=5
        except Exception:pass
        urgent_date=any(d.get('kind') in ['deadline','application_end'] and 0<=d.get('days_until',999)<=5 for d in out.get('dates',[]))
        if out.get('label')=='must_show' and not supported_recent and not urgent_date and not out.get('urgency_basis'):
            flags.append({'id':aid,'flag':'must_show_requires_other_supported_urgency'})
        if out.get('source_conflicts'):
            flags.append({'id':aid,'flag':'source_conflict_requires_resolution','count':len(out['source_conflicts'])})
    if seen!=set(rows):errors.append({'error':'id_coverage','missing':sorted(set(rows)-seen)})
    return {'passed':not errors,'records':len(outputs),'citations':count,'errors':errors,'semantic_flags':flags,
        'label_distribution':dict(Counter(o['label'] for o in outputs)),
        'actionability_distribution':dict(Counter(o['actionability'] for o in outputs)),
        'historical_reference_distribution':dict(Counter(o['historical_reference'] for o in outputs)),
        'dates':sum(len(o.get('dates',[])) for o in outputs),
        'limitations':['Structural audit verifies sources, quotations, and date components. Semantic interpretation and source conflicts also require model review; structural pass alone is not evidence quality approval.']}

def evaluate(outputs,reviews,expected_ids):
    by={o['id']:o['label'] for o in outputs};human={};uncertain=[]
    for r in reviews:
        aid=r['id'];label=r['label']
        if aid in human or aid in uncertain:raise ValueError('duplicate human review')
        if aid not in expected_ids:raise ValueError('outside batch')
        if label=='uncertain':uncertain.append(aid)
        elif label in LABELS:human[aid]=label
        else:raise ValueError('invalid label')
    matrix={h:{m:0 for m in LABELS} for h in LABELS}
    for aid,h in human.items():matrix[h][by[aid]]+=1
    n=len(human);agreement=sum(matrix[l][l] for l in LABELS)
    tp=sum(matrix[h][m] for h in POSITIVE for m in POSITIVE)
    predicted=sum(matrix[h][m] for h in LABELS for m in POSITIVE)
    actual=sum(matrix[h][m] for h in POSITIVE for m in LABELS)
    def ratio(a,b):return {'numerator':a,'denominator':b,'rate':a/b if b else None}
    def recall(label):return ratio(sum(matrix[label][m] for m in POSITIVE),sum(matrix[label].values()))
    disagreements=[{'id':aid,'human':h,'model':by[aid]} for aid,h in human.items() if by[aid]!=h]
    return {'reviewed':n,'uncertain':uncertain,'missing':sorted(set(expected_ids)-set(human)-set(uncertain)),
        'confusion_matrix':matrix,'model_human_agreement':ratio(agreement,n),
        'positive_precision':ratio(tp,predicted),'positive_recall':ratio(tp,actual),
        'must_show_recall':recall('must_show'),'useful_recall':recall('useful'),
        'must_show_exact_class_recall':ratio(matrix['must_show']['must_show'],sum(matrix['must_show'].values())),
        'useful_exact_class_recall':ratio(matrix['useful']['useful'],sum(matrix['useful'].values())),
        'should_hide_positive_leakage':recall('should_hide'),'optional_positive_leakage':recall('optional'),
        'should_hide_any_display_leakage':ratio(sum(matrix['should_hide'][m] for m in LABELS[:3]),sum(matrix['should_hide'].values())),
        'disagreement_count':len(disagreements),'disagreements':disagreements,
        'interpretation':'uncertain excluded from accuracy denominators; undefined denominators are null; Batch A becomes development pilot if revised; only untouched Batch B/new set is unbiased validation'}

def main():
    p=argparse.ArgumentParser();p.add_argument('operation',choices=['audit','evaluate']);p.add_argument('--corpus',required=True);p.add_argument('--outputs',required=True);p.add_argument('--reviews');p.add_argument('--batch',choices=['A','B'],default='A');p.add_argument('--out',required=True);args=p.parse_args()
    corpus=json.loads(Path(args.corpus).read_text());outputs=json.loads(Path(args.outputs).read_text())
    if args.operation=='audit':result=audit(corpus,outputs)
    else:
        reviews=json.loads(Path(args.reviews).read_text())['reviews'];ids=[r['id'] for r in corpus['records']]
        # Alternate schools in each 15-record batch. Order fixed before human labels.
        cysh=ids[:15];cygsh=ids[15:];order=[x for pair in zip(cysh,cygsh) for x in pair];batch=order[:15] if args.batch=='A' else order[15:]
        result=evaluate(outputs,reviews,batch)
    Path(args.out).write_bytes(canonical(result));print(json.dumps({k:v for k,v in result.items() if k not in ['errors','disagreements']},ensure_ascii=False))

if __name__=='__main__':main()
