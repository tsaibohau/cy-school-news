"""Validate and preserve a completed human export before any comparison.
Never overwrites previous human exports or reruns frozen predictions.
"""
import argparse,json,sys,hashlib
from pathlib import Path
import benchmark as b

def validate(export,queue):
    for k in ['schema_version','batch_id','corpus_sha256','model_freeze_sha256','as_of']:
        if export.get(k)!=queue.get(k):raise ValueError('export identity mismatch: '+k)
    if export.get('completed') is not True:raise ValueError('export incomplete')
    rows=export.get('reviews',[]);expected={r['id'] for r in queue['records']}
    if len(expected)!=15 or len(rows)!=15:raise ValueError('must contain exactly 15 reviews')
    seen=set()
    for r in rows:
        if r['id'] not in expected or r['id'] in seen:raise ValueError('unknown or duplicate id')
        if r['label'] not in b.LABELS+['uncertain']:raise ValueError('invalid label')
        if not r.get('reviewed_at'):raise ValueError('review timestamp missing')
        seen.add(r['id'])
    if seen!=expected:raise ValueError('coverage mismatch')
    return [r['id'] for r in queue['records']]

def main():
    p=argparse.ArgumentParser();p.add_argument('--export',required=True);p.add_argument('--queue',required=True);p.add_argument('--model',required=True);p.add_argument('--out-dir',required=True);a=p.parse_args()
    raw=Path(a.export).read_bytes();e=json.loads(raw);q=json.loads(Path(a.queue).read_text());ids=validate(e,q)
    model_raw=Path(a.model).read_bytes()
    if hashlib.sha256(model_raw).hexdigest()!=q['model_freeze_sha256']:raise ValueError('frozen model hash mismatch')
    model=json.loads(model_raw)
    if model['corpus_sha256']!=q['corpus_sha256']:raise ValueError('model corpus mismatch')
    directory=Path(a.out_dir);directory.mkdir(parents=True,exist_ok=True)
    h=hashlib.sha256(raw).hexdigest()
    with (directory/('human-original-'+h+'.json')).open('xb') as f:f.write(raw)
    result=b.evaluate(model['outputs'],e['reviews'],ids);result.update(human_export_sha256=h,batch_id=q['batch_id'],model_freeze_sha256=q['model_freeze_sha256'],corpus_sha256=q['corpus_sha256'])
    with (directory/('evaluation-'+h+'.json')).open('xb') as f:f.write(b.canonical(result))
    print(json.dumps({k:v for k,v in result.items() if k!='disagreements'}))

if __name__=='__main__':main()
