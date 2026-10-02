"""Build blind <=15 queues only after immutable model freeze; no truth input."""
import argparse,datetime as dt,json
from pathlib import Path
import benchmark as b

FORBIDDEN={'label','model_label','confidence','citations','stage1','stage2','structured_reasons','score','original_human_label','rereview_label','disagreement_type','metrics','policy_classification'}
def build(corpus,model_sha,corpus_sha,letter):
    schools=[[r for r in corpus['records'] if r['school']==s] for s in ['cysh','cygsh']]
    if [len(x) for x in schools]!=[15,15]:raise ValueError('school coverage')
    order=[r for pair in zip(*schools) for r in pair];selected=order[:15] if letter=='A' else order[15:]
    records=[]
    for r in selected:
        record={k:r[k] for k in ['id','school','title','url','body_content','metadata_content']}
        record['source_index_date']=r.get('date','');record['captured_at']=r['captured_at']
        record['attachment_content']=[{'filename':a['filename'],'extension':a['extension'],'status':a['status'],'content':a.get('content')} for a in r['attachment_content']]
        records.append(record)
    def check(v):
        if isinstance(v,dict):
            if set(v)&FORBIDDEN:raise ValueError('model/original leakage')
            for child in v.values():check(child)
        elif isinstance(v,list):
            for child in v:check(child)
    check(records)
    return {'schema_version':2,'review_kind':'round2_blind','batch_id':'round2-v35-'+letter,'as_of':corpus['as_of'],'persona':corpus['persona'],'corpus_sha256':corpus_sha,'model_freeze_sha256':model_sha,'records':records}

def main():
    p=argparse.ArgumentParser();p.add_argument('--corpus',required=True);p.add_argument('--model',required=True);p.add_argument('--freeze',required=True);p.add_argument('--outdir',required=True);a=p.parse_args()
    cb=Path(a.corpus).read_bytes();mb=Path(a.model).read_bytes();freeze=json.loads(Path(a.freeze).read_bytes());assert (freeze.get('model_sha256') or freeze['model']['sha256'])==b.sha(mb) and freeze['corpus_sha256']==b.sha(cb) and freeze['private_model_readback_verified']
    corpus=json.loads(cb);out=Path(a.outdir);out.mkdir(parents=True,exist_ok=True)
    for letter in ['A','B']:
        data=b.canonical(build(corpus,b.sha(mb),b.sha(cb),letter));(out/f'batch-{letter.lower()}-review-v35.json').write_bytes(data);print(letter,len(json.loads(data)['records']),b.sha(data))
if __name__=='__main__':main()
