"""Independent process replay: network disabled; content/metadata are local captures."""
import argparse
import hashlib
import json
import os
import socket
from pathlib import Path

os.environ.setdefault('GITHUB_RUN_ID','offline')
os.environ.setdefault('GITHUB_SHA','offline')
import acquire

def deny_network(*args,**kwargs):raise RuntimeError('offline replay forbids networking')
socket.socket=deny_network
socket.create_connection=deny_network
acquire.session.request=deny_network

def selection(corpus):
    records=corpus['records']
    only=[r for r in records if r['body_meaningful'] and not r['attachments']]
    # Replay text-layer samples across environments. OCR samples have additionally
    # been replayed in the pinned runner environment, with its Chinese language data.
    rich=[r for r in records if r['attachment_meaningful'] and not any('ocr' in u.get('parse_method','') for a in r['attachment_content'] for u in (a.get('content') or {}).get('units',[]))]
    if len(only)<5 or len(rich)<5:raise ValueError('offline coverage needs 5 body-only and 5 non-OCR attachment-rich')
    def two_school(rows):
        selected=[r for r in rows if r['school']=='cysh'][:3]+[r for r in rows if r['school']=='cygsh'][:2]
        if len(selected)<5:
            selected+=[r for r in rows if r['id'] not in {x['id'] for x in selected}][:5-len(selected)]
        return selected
    return two_school(only)+two_school(rich)

def main():
    p=argparse.ArgumentParser();p.add_argument('--corpus',required=True);p.add_argument('--raw-root',required=True);p.add_argument('--out',required=True);args=p.parse_args()
    corpus=json.loads(Path(args.corpus).read_bytes());root=Path(args.raw_root);selected=selection(corpus);checks=[]
    for r in selected:
        raw=(root/r['raw']['path']).read_bytes();assert acquire.digest(raw)==r['raw']['sha256']
        blocks=acquire.body_extract(raw,r['title']);assert acquire.digest(acquire.canonical(blocks))==r['body']['sha256']
        rebuilt={'id':r['id'],'body_content':blocks,'attachment_content':[]}
        for a in r['attachment_content']:
            if not a.get('extracted'):continue
            data=(root/a['raw']['path']).read_bytes();assert acquire.digest(data)==a['raw']['sha256']
            extracted=acquire.parse_attachment(data,a['extension']);assert acquire.digest(acquire.canonical(extracted))==a['extracted']['sha256']
            assert extracted==a['content']
            rebuilt['attachment_content'].append({'filename':a['filename'],'content':extracted})
        checks.append({'id':r['id'],'body_sha256':r['body']['sha256'],'attachments':len(rebuilt['attachment_content']),'rebuilt_input_sha256':acquire.digest(acquire.canonical(rebuilt))})
    result={'passed':True,'network_disabled':True,'independent_process':True,'body_only':5,'attachment_rich':5,'checks':checks,'corpus_sha256':hashlib.sha256(Path(args.corpus).read_bytes()).hexdigest(),'scope':'10 frozen samples replayed in Work; all captured sources also replayed within pinned runner'}
    Path(args.out).write_bytes(acquire.canonical(result));print(json.dumps(result))

if __name__=='__main__':main()
