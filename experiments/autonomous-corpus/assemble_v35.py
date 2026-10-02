"""Offline serialization/audit of native semantic annotations, not an engine.

Input annotations are authored by the available Work assistant after reading
all source units. This module resolves explicit quotes, checks citations,
computes temporal offsets and policy consistency; it does not infer labels.
No human files or network APIs are accepted.
"""
import argparse,datetime as dt,json
from pathlib import Path
import benchmark as b
import stage2_v35 as s

def assemble(corpus,annotations,corpus_sha,policy_sha):
    rows={r['id']:r for r in corpus['records']};outputs=[]
    if set(rows)!={a['id'] for a in annotations} or len(annotations)!=len(rows):raise ValueError('annotation coverage')
    for a in annotations:
        r=rows[a['id']];index=b.sources(r);citations={}
        for cid,c in a['citations'].items():
            key=tuple(c[k] for k in ['source_type','filename','locator']);text=index[key]
            if b.norm(c['snippet']) not in b.norm(text):raise ValueError('native quote mismatch '+a['id']+' '+cid)
            citations[cid]={**c,'confidence':c.get('confidence',0.95)}
        o={k:a[k] for k in ['id','label','audience','actionability','temporal_state','historical_reference','post_expiry_reference_value','dates','source_conflicts','uncertainties','structured_reasons']}
        o['citations']=citations
        for date in o['dates']:
            offset=(dt.date.fromisoformat(date['value'])-dt.date.fromisoformat(corpus['as_of'])).days;date['days_until']=offset;date['days_since']=-offset
        o['stage2']=a['stage2'];s.validate_semantic(o['stage2'],o,corpus['as_of']);outputs.append(o)
    audit=b.audit(corpus,outputs)
    if not audit['passed']:raise ValueError(json.dumps(audit['errors']))
    return {'schema_version':1,'candidate':'v3.5','round_id':'round2-fresh','as_of':corpus['as_of'],'persona':corpus['persona'],'corpus_sha256':corpus_sha,'policy_sha256':policy_sha,'engine':{'kind':'native Work assistant','exact_model_identity':'unverified','external_api_used':False},'human_primitives_used':False,'human_labels_used_as_inference_input':False,'frozen_at':dt.datetime.now(dt.timezone.utc).isoformat(),'outputs':outputs},audit

def main():
    p=argparse.ArgumentParser();p.add_argument('--corpus',required=True);p.add_argument('--annotations',required=True);p.add_argument('--policy',required=True);p.add_argument('--output',required=True);p.add_argument('--audit',required=True);args=p.parse_args()
    data=Path(args.corpus).read_bytes();model,audit=assemble(json.loads(data),json.loads(Path(args.annotations).read_bytes()),b.sha(data),b.sha(Path(args.policy).read_bytes()));Path(args.output).write_bytes(b.canonical(model));Path(args.audit).write_bytes(b.canonical(audit));print(json.dumps({'output_sha256':b.sha(Path(args.output).read_bytes()),'audit_passed':audit['passed'],'records':audit['records'],'citations':audit['citations'],'dates':audit['dates']}))
if __name__=='__main__':main()
