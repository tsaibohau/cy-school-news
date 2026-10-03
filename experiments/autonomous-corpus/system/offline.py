"""Network-free contextual pattern candidate; no per-record or human answers."""
import argparse, datetime as dt, hashlib, json, re, unicodedata
from pathlib import Path
from decision_flow import decide
VERSION='v3.6-offline-evidence-flow-development'
TZ=dt.timezone(dt.timedelta(hours=8))
LEXICON={
 'registration':r'報名|申請|登記|受理|送件',
 'deadline':r'截止|截至|期限|最遲|收件',
 'event':r'舉行|活動日期|活動時間|比賽日期|考試日期|段考|期中考|期末考',
 'urgent':r'停課|延期|改期|取消|緊急|臨時異動',
 'resource':r'操作手冊|使用指南|操作指南|申請流程|辦理流程|使用說明|常見問題|作業程序',
 'rules':r'參加資格|申請資格|報名資格|活動辦法|競賽辦法|實施計畫|應備文件|申請表|報名表|評選方式|評分標準',
 'award':r'得獎名單|獲獎名單|得獎學生|獲獎學生|榮譽榜|成績公告',
 'law':r'第[一二三四五六七八九十百\d]+條|修正發布|發布令|廢止|施行細則|主管法規',
 'notice':r'通知|提醒|公告|集合|說明會'}
DATE=re.compile(r'(?<![0-9A-Za-z])(?:(?P<year>\d{3,4})\s*(?:年|[-/.])\s*)?(?P<month>\d{1,2})\s*(?:月|[-/])\s*(?P<day>\d{1,2})(?!\d)\s*日?')
def canonical(v):return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
def digest(v):return hashlib.sha256(v).hexdigest()
def norm(v):return unicodedata.normalize('NFKC',v)
def has(k,t):return bool(re.search(LEXICON[k],t))
def cite(u,q=None):return {k:u[k] for k in ['source_id','filename','locator']}|{'quote':u['text'] if q is None else q}
def sources(r):
 out=[{'source_id':'title','filename':'title','locator':'title:1','text':r['title']}]
 if r.get('date'):out.append({'source_id':'publication','filename':'source-index.json','locator':'publication_date','text':r['date']})
 for kind,blocks in [('metadata',r.get('metadata_content',[])),('body',r.get('body_content',[]))]:
  for i,b in enumerate(blocks):out.append({'source_id':f'{kind}:{i}','filename':'source.html','locator':b['locator'],'text':b['text']})
 for i,a in enumerate(r.get('attachment_content',[])):
  for j,u in enumerate((a.get('content') or {}).get('units',[])):out.append({'source_id':f'attachment:{i}:{j}','filename':a['filename'],'locator':u['locator'],'text':u['text']})
 return out
def publication(units):
 official=[]; fallback=next((u for u in units if u['source_id']=='publication'),None)
 for u in units:
  if not u['source_id'].startswith('metadata:'):continue
  for m in re.finditer(r'(?:發布日期|發佈日期|公告日期)\s*[:：]?\s*(\d{3,4})[-/年.](\d{1,2})[-/月.](\d{1,2})',norm(u['text'])):
   y,mo,d=map(int,m.groups());y=y+1911 if y<1911 else y
   try:official.append((dt.date(y,mo,d),cite(u)))
   except ValueError:pass
 if len({d for d,_ in official})>1:return None,[],['official publication conflict']
 if official:return official[0][0],[official[0][1]],['article/index publication conflict'] if fallback and fallback['text']!=official[0][0].isoformat() else []
 if fallback:
  try:return dt.date.fromisoformat(fallback['text']),[cite(fallback)],[]
  except ValueError:pass
 return None,[],['publication unavailable']
def moment(v,end=False):
 if len(v)==10:return dt.datetime.combine(dt.date.fromisoformat(v),dt.time.max if end else dt.time.min,TZ)
 x=dt.datetime.fromisoformat(v)
 if x.tzinfo is None:raise ValueError('time requires timezone')
 return x
def registration_label(start,end,as_of):
 if not end:return None
 now,close=moment(as_of),moment(end,True)
 if start and moment(start)>close:return None
 if now>close:return 'should_hide'
 if not start:return None
 if now<moment(start):return 'optional'
 return 'must_show' if (close.astimezone(TZ).date()-now.astimezone(TZ).date()).days<=5 else 'useful'
def extract_dates(u,pub,pub_refs):
 text=norm(u['text']);out=[]
 for m in DATE.finditer(text):
  if not (1<=int(m['month'])<=12 and 1<=int(m['day'])<=31):continue
  year=int(m['year']) if m['year'] else pub.year if pub else None
  if year and year<1911:year+=1911
  before,after=text[max(0,m.start()-45):m.start()],text[m.end():m.end()+35]
  nearby=before+m.group()+after
  cues=[(x.start(),k) for k in ['registration','event'] for x in re.finditer(LEXICON[k],before)]
  kind=max(cues)[1] if cues else 'event' if has('event',after[:15]) else 'registration' if has('registration',after[:15]) else 'unknown'
  value=None
  if year:
   try:value=dt.date(year,int(m['month']),int(m['day'])).isoformat()
   except ValueError:pass
  clock=re.match(r'\s*(?:\([^)]*\)|（[^）]*）)?\s*(上午|下午)?\s*(\d{1,2})(?:時|:)(\d{1,2})?\s*分?',after)
  if value and clock:
   h,mi=int(clock[2]),int(clock[3] or 0)
   if clock[1]=='下午' and h<12:h+=12
   if clock[1]=='上午' and h==12:h=0
   try:value=dt.datetime.combine(dt.date.fromisoformat(value),dt.time(h,mi),TZ).isoformat()
   except ValueError:value=None
  out.append({'purpose':kind,'value':value,'raw_expression':m.group(),'year_basis':'explicit' if m['year'] else 'official_publication' if pub else 'unknown','evidence':[cite(u)]+(pub_refs if not m['year'] else []),'_start':m.start(),'_end':m.end()})
 return out
def audience(units):
 for u in units:
  t=norm(u['text'])
  if re.search(r'(?:限|僅限|專供)\s*(?:本校)?(?:教師|教職員)|對象[:：]?(?:為|是)?\s*(?:本校)?(?:教師|教職員)|教師研習|教師甄選',t) and not re.search(r'師生|教師及學生|學生及教師|學生亦可|學生也可',t):return 'ineligible',[cite(u)]
  for s in re.split(r'[。；\n]',t):
   if not re.search(r'對象|資格|限|招收|專供',s):continue
   if re.search(r'不限年級|各年級|全校學生|高一[至到]高三',s):return 'applicable',[cite(u)]
   grades={int(v) for v in re.findall(r'高([123])',s)}|{v for k,v in [('一',1),('二',2),('三',3)] if '高'+k in s}
   if grades:return ('applicable' if 1 in grades else 'ineligible'),[cite(u)]
 return 'uncertain',[]
def reference_groups(u):
 out=[]
 for raw in re.split(r'[。；\n]+',u['text']):
  if len(raw.strip())<6:continue
  t=norm(raw);kind,cls,limit='unclassified','insufficient','本地規則尚未辨識用途'
  for key,ck,rc,lim in [('law','regulation_evidence','verify_current','須核對現行版本與效力'),('award','award_history','targeted','僅供歷年結果查詢；不能證明今年或全校實力'),('resource','procedure_resource','conditional','核對最新版與適用對象'),('rules','event_rules','conditional','資格、費用與辦法可能改變，先找本期新版')]:
   if has(key,t):kind,cls,limit=ck,rc,lim;break
  if kind=='unclassified':
   if DATE.search(t) and (has('registration',t) or has('event',t)):kind,cls,limit='cycle_dates','cycle_only','保留原年度／場次；不能直接套用本期'
   elif has('notice',t):kind,cls,limit='one_off_notice','no_reference','此段暫未辨識到可重用流程或資源'
  out.append({'content_kind':kind,'reference_class':cls,'scope':'原公告版本','reason':'本段詞彙及上下文規則命中，未查最新版','limitations':[limit],'evidence':[cite(u,raw)]})
  if kind!='cycle_dates' and DATE.search(t) and (has('registration',t) or has('event',t)):
   out.append({'content_kind':'cycle_dates','reference_class':'cycle_only','scope':'原公告版本','reason':'同段另含當期時間，與可參考辦法分開判斷','limitations':['時間僅適用原年度／場次'],'evidence':[cite(u,raw)]})
 return out
def analyze(record,as_of):
 units=sources(record);pub,pub_refs,conflicts=publication(units);elig,elig_refs=audience(units)
 dates=[];windows=[];groups=[];unknown=[]
 if elig=='uncertain':unknown.append('未明示高一資格，不能保證適用')
 for u in units:
  if u['source_id']=='publication' or u['source_id'].startswith('metadata:'):continue
  ds=extract_dates(u,pub,pub_refs);dates.extend(ds);t=norm(u['text']);reg=[d for d in ds if d['purpose']=='registration'];consumed=set()
  for i in range(len(reg)-1):
   a,b=reg[i],reg[i+1]
   if re.fullmatch(r'\s*(?:起|日起)?\s*(?:至|到|~|～|－|-)\s*',t[a['_end']:b['_start']]):
    consumed.update([i,i+1]);windows.append({'start':a['value'],'end':b['value'],'start_basis':'explicit_range','label':registration_label(a['value'],b['value'],as_of),'evidence':a['evidence']+b['evidence']})
  for i,d in enumerate(reg):
   if i in consumed:continue
   nearby=t[max(0,d['_start']-45):d['_end']+35]
   if not (has('deadline',nearby) or re.search(r'即日起.{0,25}(?:至|到)',nearby)):continue
   immediate='即日起' in nearby;start=pub.isoformat() if pub and immediate else None
   windows.append({'start':start,'end':d['value'],'start_basis':'publication_immediate' if start else 'unknown','label':registration_label(start,d['value'],as_of),'evidence':d['evidence']+(pub_refs if immediate else [])})
  if has('registration',t) and not reg:unknown.append('報名日期未解析：'+u['source_id'])
  groups.extend(reference_groups(u))
 for d in dates:
  if d['purpose']=='unknown' or not d['value']:unknown.append('日期用途或年份待確認：'+d['raw_expression'])
  d.pop('_start');d.pop('_end')
 if any(w['label'] is None for w in windows):unknown.append('報名起訖不足／矛盾，無法確認開放')
 for i,g in enumerate(groups):g['group_id']=record['id']+':reference:'+str(i)
 gaps=[a['filename'] for a in record.get('attachment_content',[]) if not (a.get('content') or {}).get('units')]
 if gaps:unknown.append('未讀到附件內容：'+'、'.join(gaps))
 intentions=[];operations=[];continuations=[];exams=[];changes=[]
 for u in units:
  if u['source_id']=='publication' or u['source_id'].startswith('metadata:'):continue
  t=norm(u['text'])
  for kind in ['registration','event','resource','rules','award','law','notice']:
   if has(kind,t):intentions.append({'kind':kind,'evidence':[cite(u)]})
  related=[d for d in dates if d['value'] and any(e['source_id']==u['source_id'] for e in d['evidence'])]
  future=[d for d in related if moment(d['value'],True)>=moment(as_of)]
  near=[d for d in future if d['purpose']=='event' and 0<=(moment(d['value']).date()-moment(as_of).date()).days<=7]
  fresh=pub is not None and 0<=(moment(as_of).date()-pub).days<=5
  if near and re.search(r'段考|期中考|期末考|考試日期',t):exams.append({'evidence':[cite(u)]+[e for d in near for e in d['evidence']]})
  for clause in re.split(r'[。；\n]+',t):
   clause_dates=[d for d in related if norm(d['raw_expression']) in clause]
   clause_future=[d for d in clause_dates if moment(d['value'],True)>=moment(as_of)]
   clause_near=[d for d in clause_future if 0<=(moment(d['value']).date()-moment(as_of).date()).days<=7]
   change=has('urgent',clause) and not re.search(r'無(?:須|需)?(?:停課|延期)|不(?:停課|延期)|未(?:取消|延期)',clause)
   if change and (clause_near or fresh and not clause_dates):changes.append({'evidence':[cite(u)]+pub_refs})
   if re.search(r'已報名者|錄取者|參賽者|參加者',clause) and re.search(r'報到|集合|繳費|領取|補件|後續',clause) and clause_future:
    continuations.append({'evidence':[cite(u)]+[e for d in clause_future for e in d['evidence']]})
  if has('resource',t) and re.search(r'本學期|本學年|現行|即日起適用',t) and pub and pub.year==moment(as_of).year and fresh:
   operations.append({'evidence':[cite(u)]+pub_refs})
 content=[u for u in units if u['source_id'].startswith(('body:','attachment:')) and u['text'].strip()]
 facts={'coverage':{'content_available':bool(content),'gaps':gaps,'evidence':[cite(u) for u in content]},
        'intentions':intentions,'audience':elig,'audience_evidence':elig_refs,'dates':dates,'windows':windows,
        'participant_processes':continuations,'current_operations':operations,'near_exams':exams,'urgent_changes':changes,
        'reference_groups':groups,'unparsed_registration':any(x.startswith('報名日期未解析') for x in unknown),
        'material_conflict':bool(conflicts) or any(w['start'] and w['end'] and moment(w['start'])>moment(w['end'],True) for w in windows)}
 decision=decide(facts)
 return {'id':record['id'],**decision,'machine_facts':facts,'persona_applicability':elig,'persona_evidence':elig_refs,
         'dates':dates,'registration_windows':windows,'reference_groups':groups,'latest_source_status':'not_checked',
         'current_effect_status':'not_verified','uncertainties':sorted(set(unknown)),'source_conflicts':conflicts,
         'needs_review':bool(unknown or conflicts or decision['label'] is None),'engine':VERSION}

def main():
 p=argparse.ArgumentParser();p.add_argument('--corpus',required=True);p.add_argument('--out',required=True);a=p.parse_args()
 raw=Path(a.corpus).read_bytes();corpus=json.loads(raw)
 if len({r['id'] for r in corpus['records']})!=len(corpus['records']):raise ValueError('duplicate IDs')
 persona=corpus.get('persona',{'grade':1,'role':'student'})
 if persona.get('grade',1)!=1 or persona.get('role','student')!='student':raise ValueError('candidate supports first-year student only')
 result={'candidate':VERSION,'corpus_sha256':digest(raw),'code_sha256':digest(Path(__file__).read_bytes()),'flow_sha256':digest((Path(__file__).parent/'decision_flow.py').read_bytes()),'as_of':corpus['as_of'],'persona':persona,'engine':'offline symbolic contextual NLP','network_calls':0,'human_features_used':False,'assistant_annotations_used':False,'outputs':[analyze(r,corpus['as_of']) for r in corpus['records']],'limitations':['Complex or unseen phrasing and Chinese numeral dates require validation.','Rule development; model weights not trained.']}
 data=canonical(result)
 with Path(a.out).open('xb') as f:f.write(data)
 print(json.dumps({'records':len(result['outputs']),'output_sha256':digest(data),'network_calls':0,'needs_review':sum(o['needs_review'] for o in result['outputs'])}))
if __name__=='__main__':main()
