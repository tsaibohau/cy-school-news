"""Re-extract stored raw sources before inference; never contacts official sites.

The preliminary freeze is invalidated for a boilerplate content-gate defect.
Its objects remain immutable. Selection is unchanged except objective content PASS.
"""
import copy
import json
import os
import socket
from pathlib import Path
os.environ.setdefault('GITHUB_RUN_ID','offline')
os.environ.setdefault('GITHUB_SHA','offline')
import acquire

def blocked(*args,**kwargs):raise RuntimeError('offline repair cannot use network')
socket.socket=blocked;socket.create_connection=blocked;acquire.session.request=blocked

root=Path('/tmp/autonomous-private')
records=json.loads((root/'acquisition-records.json').read_bytes())
revision='runs/36820362487/article-scoped-v2/'
outdir=root/'article-scoped-v2';outdir.mkdir(exist_ok=True)
payload={};updates=[];corrections=[]
for original in records:
    record=copy.deepcopy(original)
    if not record.get('raw'):updates.append(record);continue
    raw=(root/record['raw']['path']).read_bytes()
    assert acquire.digest(raw)==record['raw']['sha256']
    blocks=acquire.body_extract(raw,record['title']);b=acquire.canonical(blocks)
    body={'path':revision+record['id']+'/body.json','sha256':acquire.digest(b),'size':len(b),'readback_verified':False}
    local=outdir/record['id'];local.mkdir(exist_ok=True);(local/'body.json').write_bytes(b)
    record['body']=body;record['metadata_content']=acquire.metadata_extract(raw)
    record['body_parser_version']=acquire.METHOD_VERSION
    record['body_meaningful']=acquire.meaningful('\n'.join(x['text'] for x in blocks),record['title'])
    record['body_reproducible']=acquire.digest(acquire.canonical(acquire.body_extract(raw,record['title'])))==body['sha256']
    record['reproducible']=record['body_reproducible'] and all(a.get('reproducible',True) for a in record.get('attachments',[]))
    record['gate']='PASS' if record['reproducible'] and (record['body_meaningful'] or record.get('attachment_meaningful')) else 'FAIL'
    if body['sha256']!=original['body']['sha256']:corrections.append({'id':record['id'],'old_body_sha256':original['body']['sha256'],'new_body_sha256':body['sha256'],'old_gate':original['gate'],'new_gate':record['gate']})
    payload[record['id']]=blocks;updates.append(record)
chosen=acquire.freeze(updates)
report={'revision':'article-scoped-v2','candidate_pool':len(records),'pass_pool':sum(r['gate']=='PASS' for r in updates),'pass_by_school':{s:sum(r['gate']=='PASS' and r['school']==s for r in updates) for s in ['cysh','cygsh']},'frozen_count':len(chosen or []),'body_coverage':sum(r['body_meaningful'] for r in chosen or []),'attachment_coverage':sum(r['attachment_meaningful'] for r in chosen or []),'boilerplate_gate_corrections':len(corrections),'inference_before_repair':0,'network_disabled':True,'reproducible':all(r['reproducible'] for r in chosen or []),'corrections':corrections,'preliminary_corpus_status':'INVALIDATED_CONTENT_GATE','preliminary_corpus_sha256':'db5cc48753a26ba18d87e55105141f5197361c956eea1281c4b2813c805af353'}
(outdir/'records.json').write_bytes(acquire.canonical(updates));(outdir/'manifest.json').write_bytes(acquire.canonical(chosen));(outdir/'repair-report.json').write_bytes(acquire.canonical(report))
print(json.dumps({k:v for k,v in report.items() if k!='corrections'}))
if not chosen:raise RuntimeError('corrected pool requires metadata-selected extension')
(outdir/'selected-bodies.json').write_bytes(acquire.canonical({r['id']:payload[r['id']] for r in chosen}))
