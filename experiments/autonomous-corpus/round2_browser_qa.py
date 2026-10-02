"""Training-only browser QA: synthetic edits; real review strictly read-only."""
import os,json,hashlib,base64,time,datetime as dt
from pathlib import Path
import requests
from playwright.sync_api import sync_playwright
BASE='https://sshovpnepgswzvjwjuyz.supabase.co/functions/v1/'
PREVIEW='https://cy-school-news-review-git-codex-28b6b3-tsaibohau-9644s-projects.vercel.app'
QUEUE_SHA='b5879ab4d33fa0578f271fdc4fcb759cd6ea69e94d632f8566cc4c6d6a8b69b4'
MODEL_SHA='aefb417eff8156b1c85495439c586e971a392dd24a897f4568b61a2db8779f4a'
CORPUS_SHA='5f902a3f0c255a19571d66943686fd4db143abe002028bf05d1d5d6f8c0741b1'
def canonical(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def oidc():
 u=os.environ['ACTIONS_ID_TOKEN_REQUEST_URL']+'&audience=cy-school-news-autonomous-training'
 r=requests.get(u,headers={'Authorization':'Bearer '+os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']},timeout=30);r.raise_for_status()
 token=r.json()['value'];print('::add-mask::'+token,flush=True);return token
def put(path,data):
 r=requests.post(BASE+'autonomous-corpus-gateway',headers={'Authorization':'Bearer '+oidc()},json={'op':'put','path':path,'data':base64.b64encode(data).decode(),'sha256':hashlib.sha256(data).hexdigest()},timeout=90)
 r.raise_for_status();out=r.json();assert out['verified'] and out['sha256']==hashlib.sha256(data).hexdigest();return out
checks={};prefix='runs/'+os.environ['GITHUB_RUN_ID']+'/round2-review-qa/'
def check(name,test):assert test,name;checks[name]=True
def no_leak(v):
 if isinstance(v,dict):
  forbidden={'label','model_label','confidence','citations','stage1','stage2','structured_reasons','score','original_human_label','rereview_label','metrics','disagreement_type','policy_classification'}
  return not(forbidden&set(v)) and all(no_leak(x) for x in v.values())
 if isinstance(v,list):return all(no_leak(x) for x in v)
 return True
try:
 r=requests.post(BASE+'autonomous-review-qa-access',headers={'Authorization':'Bearer '+oidc()},json={},timeout=40);r.raise_for_status();access=r.json()['access'];print('::add-mask::'+access,flush=True)
 with sync_playwright() as p:
  browser=p.chromium.launch();context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);page=context.new_page();page.set_default_timeout(15000)
  page.goto(PREVIEW+'/qa-round2.html#access=synthetic',wait_until='networkidle')
  page.locator('#title').wait_for(state='visible');payload=json.loads(page.locator('#exportText').input_value())
  check('synthetic_initial_0_of_15',len(payload['reviews'])==0 and not payload['completed'])
  page.get_by_role('button',name='規則不確定',exact=True).click();page.reload(wait_until='networkidle')
  page.locator('#title').wait_for(state='visible');payload=json.loads(page.locator('#exportText').input_value())
  check('autosave_reload',payload['reviews'][0]['label']=='policy_uncertain' and len(payload['reviews'])==1)
  page.get_by_role('button',name='有用',exact=True).click();page.get_by_role('button',name='復原',exact=True).click()
  check('undo_label_change',json.loads(page.locator('#exportText').input_value())['reviews'][0]['label']=='policy_uncertain')
  page.get_by_role('button',name='取消此筆',exact=True).click();check('clear_answer',len(json.loads(page.locator('#exportText').input_value())['reviews'])==0)
  page.get_by_role('button',name='復原',exact=True).click();check('undo_clear',len(json.loads(page.locator('#exportText').input_value())['reviews'])==1)
  names=['一定要看','有用','可選讀','今天隱藏','規則不確定']
  for i in range(15):
   page.get_by_role('button',name=names[i%5],exact=True).click()
   if i<14:page.get_by_role('button',name='下一筆',exact=True).click()
  payload=json.loads(page.locator('#exportText').input_value())
  check('synthetic_completed_15_export',payload['completed'] and len(payload['reviews'])==15 and len({x['id'] for x in payload['reviews']})==15)
  check('five_label_values',set(x['label'] for x in payload['reviews'])=={'must_show','useful','optional','should_hide','policy_uncertain'})
  with page.expect_download(timeout=10000) as download:
   page.get_by_role('link',name='下載 JSON 匯出檔',exact=True).click()
  d=download.value;d.save_as('/tmp/synthetic-round2-export.json')
  check('download_file_exact_payload',json.loads(Path('/tmp/synthetic-round2-export.json').read_bytes())==payload and d.suggested_filename=='human_round2_v35_batch_a.json')
  put(prefix+'synthetic-export.json',Path('/tmp/synthetic-round2-export.json').read_bytes())
  real=context.new_page();real.set_default_timeout(15000)
  responses=[]
  real.on('response',lambda response:responses.append(response) if 'autonomous-review-gateway' in response.url else None)
  real.goto(PREVIEW+'/round2.html#access='+access,wait_until='networkidle')
  real.locator('#title').wait_for(state='visible')
  check('real_no_login',real.locator('input[type=password]').count()==0 and '請登入' not in real.locator('body').inner_text())
  check('real_queue_response',len(responses)==1 and responses[0].status==200)
  queue=responses[0].json();check('real_queue_15',len(queue['records'])==15)
  check('real_queue_exact_sha',hashlib.sha256(canonical(queue)).hexdigest()==QUEUE_SHA)
  check('real_no_model_or_original_label_leak',no_leak(queue['records']))
  payload=json.loads(real.locator('#exportText').input_value())
  check('real_initial_0_of_15',len(payload['reviews'])==0 and not payload['completed'] and '已完成 0 筆' in real.locator('#status').inner_text())
  check('real_export_bindings',payload['batch_id']=='round2-v35-A' and payload['review_kind']=='round2_blind' and payload['queue_sha256']==QUEUE_SHA and payload['model_freeze_sha256']==MODEL_SHA and payload['corpus_sha256']==CORPUS_SHA and payload['as_of']=='2026-10-02')
  check('fixed_rubric_visible',all(x in real.locator('section[aria-label="固定判斷規則"]').inner_text() for x in ['截止 ≤5 天','考試 ≤7 天','是否已報名或參與未知','不是教師','規則不確定']))
  check('five_buttons_only',real.locator('#labels button').count()==5)
  check('source_and_body_visible',real.locator('#source').is_visible() and real.locator('#body').is_visible() and real.locator('#attachments').is_visible())
  proof=real.screenshot(full_page=False)
  put(prefix+'real-0-of-15.png',proof)
  # Read-only real navigation verifies attachment rendering; no label buttons clicked.
  real.get_by_role('button',name='下一筆',exact=True).click()
  check('real_attachment_readable',real.locator('#attachments pre').count()>0)
  real.get_by_role('button',name='上一筆',exact=True).click();real.reload(wait_until='networkidle');real.locator('#title').wait_for(state='visible')
  check('real_still_0_of_15',len(json.loads(real.locator('#exportText').input_value())['reviews'])==0)
  check('anon_queue_denied',requests.post(BASE+'autonomous-review-gateway',json={},timeout=20).status_code==401)
  check('static_page_contains_no_capability',access not in requests.get(PREVIEW+'/round2.html',timeout=20).text)
  report={'status':'PASS','checks':checks,'real_human_answers_written':0,'synthetic_labels_only':True,'preview_url':PREVIEW+'/round2.html','queue_sha256':QUEUE_SHA,'model_sha256':MODEL_SHA,'corpus_sha256':CORPUS_SHA,'as_of':'2026-10-02','viewport':{'width':390,'height':844},'run_id':os.environ['GITHUB_RUN_ID'],'commit':os.environ['GITHUB_SHA'],'verified_at':dt.datetime.now(dt.timezone.utc).isoformat(),'screenshot_path':prefix+'real-0-of-15.png','limitations':['Browser download and copyable JSON tested; native iPhone system Share sheet not exercised by Linux Chromium.']}
  receipt=put(prefix+'verification.json',canonical(report));print(json.dumps({'status':'PASS','checks':len(checks),'verification':receipt,'real_answers':0}),flush=True)
  browser.close()
except Exception as e:
 report={'status':'FAIL','checks':checks,'error_type':type(e).__name__,'real_human_answers_written':0,'run_id':os.environ['GITHUB_RUN_ID']}
 try:put(prefix+'failure.json',canonical(report))
 except Exception:pass
 print(json.dumps({'status':'FAIL','error_type':type(e).__name__,'checks_completed':list(checks)}),flush=True)
 raise SystemExit(1)
