#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Python 3.10+ offline announcement classifier; no network or auto-install.
CLI: python offline_classifier.py announcements.json --as-of 2026-10-03
PDF text requires preinstalled pypdf. OCR is opt-in (--ocr), requires existing
pdf2image/pytesseract and their local executables. No downloads are performed.
"""
from __future__ import annotations
import argparse
import calendar
import datetime as dt
import hashlib
import importlib
import json
import re
import tempfile
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

VERSION = 'offline-evidence-flow-0.3'
TZ = dt.timezone(dt.timedelta(hours=8))
LABELS = ['must_show', 'useful', 'optional', 'should_hide']
REFERENCE_CLASSES = {
    'conditional': '可參考，須核對新版', 'cycle_only': '只適用原年度／場次',
    'targeted': '只供特定歷史問題', 'verify_current': '須確認現行版本／效力',
    'no_reference': '一般查詢不需取用', 'insufficient': '無法確認',
}
# All semantic vocabulary/weights live here; --config accepts an offline JSON override.
CONFIG = {
    'features': {
        'registration': {'pattern': r'報名|申請|登記|受理|送件|收件|遴選|推薦|甄選', 'weight': 2.0},
        'deadline': {'pattern': r'截止|截至|最遲|期限|收件至|受理至|即日起至|請於[^。；\n]{0,40}前|務必於|逾期不候|日前|日止|延期至|延長至|展延至|順延至|延至', 'weight': 2.0},
        'event': {'pattern': r'活動日期|活動時間|舉行|比賽日期', 'weight': 1.0},
        'exam': {'pattern': r'段考|期中考|期末考|考試日期', 'weight': 3.0},
        'change': {'pattern': r'停課|停班|延期|改期|臨時異動|停止上課|不上課|補課|調課|補假|彈性放假|(?:放假|休假)(?:[一二兩三\d]+天|日|通知|公告)|(?<!如需)(?<!欲)(?<!若要)(?<!如要)取消(?!報名|資格|申請|登記|選課|訂位)|緊急(?!聯絡|連絡|電話|聯繫)', 'weight': 3.0},
        'procedure': {'pattern': r'操作手冊|使用指南|操作指南|申請流程|辦理流程|使用說明|常見問題|作業程序', 'weight': 2.0},
        'rules': {'pattern': r'參加資格|申請資格|報名資格|活動辦法|競賽辦法|實施計畫|應備文件|申請表|報名表|評選方式|評分標準', 'weight': 2.0},
        'award': {'pattern': r'得獎名單|獲獎名單|得獎學生|獲獎學生|榮譽榜|成績公告|錄取名單', 'weight': 2.0},
        'law_article': {'pattern': r'第[一二三四五六七八九十百\d]+條', 'weight': 1.0},
        'law_formal': {'pattern': r'修正發布|發布令|施行細則|主管法規|依法|法律|條例', 'weight': 3.0},
        'notice': {'pattern': r'通知|提醒|公告|集合|說明會', 'weight': 0.5},
        'action': {'pattern': r'繳交|繳費|領取|報到|補件', 'weight': 2.0},
        'contact': {'pattern': r'洽詢', 'weight': 0.5},
    },
    'roles': {
        'application_start': r'報名開始|申請開始|開始受理|開放報名',
        'application_end': r'報名截止|申請截止|收件至|受理至|截止日期',
        'registration': r'報名|申請|登記|受理|送件|收件|遴選|推薦|甄選',
        'event': r'活動日期|活動時間|比賽日期|舉行',
        'exam': r'考試日期|段考|期中考|期末考',
        'action': r'繳交|繳費|領取|報到|補件',
        'school_start': r'開學日|開學日期',
    },
    'negated_change': r'(?:不|未|無|無須|無需)(?:再|予以)?(?:停課|停班|延期|改期|取消|停止上課|補課|調課)|照常上課',
    'closed_action': r'停止受理|停止報名|不接受報名|報名已截止|報名已結束|活動取消|取消辦理',
    'immediate': r'即日起',
    'participant': r'已報名者|錄取者|參賽者|參加者',
    'participant_action': r'集合|報到|補件|繳費|領取|後續',
    'attachment_pointer': r'詳見附件|參閱附件|如附件',
    'audience_restriction': r'對象|資格|僅限|限招|招收|專供|限於',
    'excluded_first_grade': r'(?:不含|不包括|排除|非)(?:高1|高一|1年級|一年級)|(?:高1|高一|1年級|一年級)(?:不適用|不得參加)',
    'teacher_only': r'全校(?:教師|教職員)|(?:僅限|限|專供)\s*(?:本校)?(?:教師|教職員)|對象[:：]?(?:為|是)?\s*(?:本校)?(?:教師|教職員)',
    'both_audiences': r'師生|教師及學生|學生及教師|學生亦可|學生也可',
    'whole_school': r'全體學生|全校|各班(?!導師)|各年級|不限年級|高一[至到]高三|1[至到]3年級',
    'teacher_directed': r'教師研習|各處室|各班導師|導師會議|教職員工|全體教師|敬請各位老師|行政人員|教師共同',
    'relay_verbs': r'協助|宣導|轉知|提醒學生|通知學生|轉達',
    'freshman': r'高一新生|高1新生|(?<![非不])新生',
    'special_qualification': r'低收入|身心障礙|原住民|特定資格|需具備|須具備',
    'publication': r'發布日期|發佈日期|公告日期',
    'heading_words': r'期間|日期|時間|報名|申請|活動|考試|開學|截止|繳費|領取|報到|資格|對象',
    'table_header': r'日期|時間|期間|項目|內容|名稱|開始|截止|報名|活動|資格|對象',
}
CN_DIGITS = {'零':0,'〇':0,'一':1,'二':2,'兩':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}
CN_CHARS = '零〇一二兩三四五六七八九十百千廿卅'
_DATE_RE = re.compile(
    r'(?<![0-9A-Za-z])(?:'
    r'(?:(?:民國)?(?P<y1>\d{3,4})\s*年\s*)?(?P<m1>\d{1,2})\s*月\s*(?P<d1>\d{1,2})(?!\d)\s*日?'
    r'|(?P<y2>\d{3,4})\s*[-/.]\s*(?P<m2>\d{1,2})\s*[-/.]\s*(?P<d2>\d{1,2})(?!\d)\s*日?'
    r'|(?P<m3>\d{1,2})\s*/\s*(?P<d3>\d{1,2})(?![\d/])\s*日?)')


class _DateMatch:
    def __init__(self, m):
        self._m = m
        g = m.groupdict()
        for i in '123':
            if g.get('m' + i):
                self._v = {'year': g.get('y' + i), 'month': g['m' + i], 'day': g['d' + i]}
                break

    def __getitem__(self, key):
        return self._v[key]

    def group(self, *a):
        return self._m.group(*a)

    def start(self):
        return self._m.start()

    def end(self):
        return self._m.end()


class _DateFinder:
    """月日須有「月」，或有 3–4 位年份；僅「10/20」型允許無年份斜線。避免 3-5、1-3 被當日期。"""
    def finditer(self, t):
        return (_DateMatch(m) for m in _DATE_RE.finditer(t))

    def search(self, t):
        m = _DATE_RE.search(t)
        return _DateMatch(m) if m else None


DATE = _DateFinder()
PARTIAL_DAY = re.compile(r'(?<![\d月/-])(?P<day>\d{1,2})日(?:前|止)?')
CLOCK = re.compile(r'^\s*(?:\([^)]*\))?\s*(上午|下午)?\s*(\d{1,2})(?:時|:)(\d{1,2})?\s*分?')
NUMBERED_HEADING = re.compile(r'^\s*(?:[一二三四五六七八九十]+[、.．]|\d+[、.．])')
MAX_BYTES = 10_000_000
MAX_UNITS = 3000


def canonical(v):
    return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def sha(v):
    return hashlib.sha256(v).hexdigest()


def chinese_number(value):
    """Conservative Chinese numerals; reject malformed/repeated units."""
    s = str(value).replace('廿', '二十').replace('卅', '三十')
    if s.isascii() and s.isdigit():
        return int(s)
    if not s or any(c not in CN_DIGITS and c not in '十百千' for c in s):
        raise ValueError('不支援的中文數字')
    if all(c in CN_DIGITS for c in s):
        return int(''.join(str(CN_DIGITS[c]) for c in s))
    total, digit, last_unit = 0, None, 10000
    for c in s:
        if c in CN_DIGITS:
            if digit is not None and digit != 0:
                raise ValueError('位值數字順序不明')
            digit = CN_DIGITS[c]
        else:
            unit = {'十':10, '百':100, '千':1000}[c]
            if unit >= last_unit:
                raise ValueError('位值重複或逆序')
            total += (1 if digit is None else digit) * unit
            digit, last_unit = None, unit
    return total + (digit or 0)


def normalize_dates(text):
    text = unicodedata.normalize('NFKC', str(text))
    text = re.sub(r'(?<=日)\s*\((?:星期|週|周)?[一二三四五六日天]\)', '', text)
    def convert(m):
        try:
            return str(chinese_number(m.group()))
        except ValueError:
            return m.group()
    return re.sub(f'[{CN_CHARS}]+(?=[年月日天週周])', convert, text)


def matches(kind, text, config=CONFIG):
    return bool(re.search(config['features'][kind]['pattern'], text))


def role(text, config=CONFIG):
    # Specific start/end headings take precedence over generic registration.
    for name in ['application_start','application_end','school_start','exam','event','action','registration']:
        if re.search(config['roles'][name], text):
            return name
    return None


def quote(unit, text=None):
    return {'source_type':unit['source_type'], 'source':unit.get('source', 'text'),
            'filename':unit['filename'], 'locator':unit['locator'],
            'quote':unit['text'] if text is None else text}


def evidence(unit):
    return unit.get('raw_refs') or [quote(unit)]


def unique_refs(refs):
    return list({json.dumps(r, sort_keys=True, ensure_ascii=False):r for r in refs}.values())


def moment(value, end=False):
    if len(value) == 10:
        return dt.datetime.combine(dt.date.fromisoformat(value), dt.time.max if end else dt.time.min, TZ)
    x = dt.datetime.fromisoformat(value)
    if x.tzinfo is None:
        raise ValueError('具有時刻的日期須附時區')
    return x.astimezone(TZ)


def unit(text, source_type='body', filename='公告正文', locator='body:1', **extra):
    return {'text':str(text), 'source_type':source_type, 'filename':filename,
            'locator':locator, 'source':'text', **extra}


def merge_pdf_lines(u):
    """Merge only date fragments; never join arbitrary short lines or new headings."""
    lines = [(s, i+1) for i,s in enumerate(u['text'].splitlines()) if s.strip()]
    result = []
    for raw, n in lines:
        current = {**u, 'text':raw, 'locator':f"{u['locator']}:line:{n}"}
        if result:
            prior = result[-1]
            a, b = normalize_dates(prior['text']), normalize_dates(raw)
            can_join = (len(a) <= 35 and len(b) <= 24 and not NUMBERED_HEADING.match(raw)
                        and re.search(r'(?:\d年|\d月|至|到|~|～)\s*$', a)
                        and re.match(r'\s*\d+(?:月|日|年)', b))
            if can_join:
                refs = evidence(prior) + evidence(current)
                result[-1] = {**prior, 'text':prior['text']+raw, 'raw_refs':refs}
                continue
        result.append(current)
    return result


def contextual_sentences(units, config=CONFIG):
    out, heading = [], None
    last_file = None
    for u in units:
        key = (u['source_type'],u['filename'])
        if key != last_file:
            heading = None
            last_file = key
        chunks = merge_pdf_lines(u) if u.get('pdf') or '\n' in u['text'] else [u]
        for chunk in chunks:
            for i, raw in enumerate(re.split(r'[。；！？\n]+', chunk['text'])):
                if not raw.strip():
                    continue
                current = {**chunk, 'text':raw, 'sentence_id':f"{chunk['locator']}:sentence:{i+1}"}
                # Table-generated display strings never replace original-cell quotes.
                current['raw_refs'] = chunk.get('raw_refs') or [quote(current)]
                text = normalize_dates(raw)
                is_heading = (len(text) <= 65 and not DATE.search(text)
                              and (NUMBERED_HEADING.match(raw) or text.rstrip().endswith((':','：')))
                              and (NUMBERED_HEADING.match(raw) or re.search(config['heading_words'],text)))
                if is_heading:
                    heading = {'role':role(text,config), 'text':text, 'refs':evidence(current),
                               'key':current['sentence_id']}
                table_role = role(normalize_dates(chunk.get('context_text','')), config)
                inherited = table_role or (heading['role'] if heading else None)
                own_role = role(text, config)
                current['role_hint'] = own_role or inherited
                current['context_refs'] = (chunk.get('context_refs',[]) if table_role
                                          else heading['refs'] if heading and heading['role'] and not own_role else [])
                current['context_text'] = chunk.get('context_text','') if table_role else (heading['text'] if heading else '')
                current['association'] = chunk.get('association') or (heading['key'] if heading else current['sentence_id'])
                current['is_heading'] = bool(is_heading)
                out.append(current)
    return out


def safe_path(root, path):
    p = (root/str(path)).resolve()
    try:
        p.relative_to(root.resolve())
    except ValueError:
        raise ValueError('附件須位於輸入目錄內')
    if not p.is_file() or p.stat().st_size > MAX_BYTES:
        raise ValueError('找不到附件或超過大小限制')
    return p


def read_docx(path, filename, config=CONFIG):
    ns = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    def txt(node):
        return ''.join(n.text or '' for n in node.findall('.//w:t',ns))
    result = []
    with zipfile.ZipFile(path) as z:
        if sum(x.file_size for x in z.infolist()) > 40_000_000:
            raise ValueError('DOCX 解壓縮內容過大')
        root = ET.fromstring(z.read('word/document.xml'))
    body = root.find('w:body',ns)
    if body is None:
        raise ValueError('DOCX 無正文')
    tables, paras = 0, 0
    for child in body:
        if child.tag.endswith('}p'):
            paras += 1
            if txt(child).strip():
                result.append(unit(txt(child),'attachment',filename,f'paragraph:{paras}'))
        elif child.tag.endswith('}tbl'):
            tables += 1
            rows = [[txt(c) for c in row.findall('w:tc',ns)] for row in child.findall('w:tr',ns)]
            if not rows:
                continue
            header = rows[0]
            has_header = (not any(DATE.search(normalize_dates(c)) for c in header)
                          and any(re.search(config['table_header'],c) for c in header))
            for ri, cells in enumerate(rows[1:] if has_header else rows, start=2 if has_header else 1):
                row_hint = cells[0] if cells and role(normalize_dates(cells[0]),config) else ''
                for ci, cell in enumerate(cells):
                    if not cell.strip():
                        continue
                    loc = f'table:{tables}:row:{ri}:cell:{ci+1}'
                    raw = unit(cell,'attachment',filename,loc)
                    name = header[ci] if has_header and ci < len(header) else f'欄{ci+1}'
                    context_refs = []
                    if has_header and ci < len(header):
                        context_refs.append(quote(unit(name,'attachment',filename,f'table:{tables}:row:1:cell:{ci+1}')))
                    if row_hint and ci != 0:
                        context_refs.append(quote(unit(row_hint,'attachment',filename,f'table:{tables}:row:{ri}:cell:1')))
                    result.append({**raw, 'text':f'{name}：{cell}', 'display_text':f'{name}：{cell}',
                                   'raw_refs':[quote(raw)], 'context_text':name if role(normalize_dates(name),config) else row_hint,
                                   'context_refs':context_refs, 'association':f'{filename}:table:{tables}:row:{ri}'})
    return result


def ocr_pdf_page(path, page, filename):
    """Opt-in only. Existing modules/executables are required; failure is a gap."""
    try:
        pyt = importlib.import_module('pytesseract')
        pdf = importlib.import_module('pdf2image')
    except ImportError:
        raise ValueError('OCR 套件未安裝；不自動安裝')
    pyt.get_tesseract_version()  # Verify local executable, not a remote service.
    images = pdf.convert_from_path(str(path), first_page=page, last_page=page,
                                   dpi=200, thread_count=1, timeout=45)
    if not images:
        raise ValueError('PDF 頁面無法轉成影像')
    text = pyt.image_to_string(images[0], lang='chi_tra+eng', timeout=45)
    if not text.strip():
        raise ValueError('OCR 未取得文字')
    return unit(text,'attachment',filename,f'page:{page}',source='ocr',pdf=True)


def read_pdf(path, filename, allow_ocr=False):
    try:
        Reader = importlib.import_module('pypdf').PdfReader
    except ImportError:
        if not allow_ocr:
            raise ValueError('pypdf 未安裝，PDF 未讀取')
        try:
            pdf = importlib.import_module('pdf2image')
            count = int(pdf.pdfinfo_from_path(str(path),timeout=45)['Pages'])
        except Exception as e:
            raise ValueError('無法取得本地OCR頁數：'+str(e))
        if not 1 <= count <= 60:
            raise ValueError('PDF頁數超出限制')
        result,gaps=[],[]
        for page in range(1,count+1):
            try:
                result.append(ocr_pdf_page(path,page,filename))
            except Exception as e:
                gaps.append({'filename':filename,'locator':f'page:{page}','reason':str(e)})
        return result,gaps
    pages = Reader(str(path)).pages
    if len(pages)>60:
        raise ValueError('PDF 超過60頁限制')
    result, gaps = [], []
    for i,p in enumerate(pages,1):
        text = p.extract_text() or ''
        if len(re.sub(r'\s','',text)) >= 8:
            result.append(unit(text,'attachment',filename,f'page:{i}',pdf=True))
        elif allow_ocr:
            try:
                result.append(ocr_pdf_page(path,i,filename))
            except Exception as e:
                gaps.append({'filename':filename,'locator':f'page:{i}','reason':str(e)})
        else:
            gaps.append({'filename':filename,'locator':f'page:{i}','reason':'未取得PDF文字；OCR未啟用'})
    return result,gaps


def read_sources(record, root, allow_ocr=False, config=CONFIG):
    out = [unit(record.get('title',''),'title','title','title:1')]
    body = record.get('body_content', record.get('body',''))
    if isinstance(body,str):
        body = [{'text':body,'locator':'body:1'}]
    for i,b in enumerate(body or []):
        if isinstance(b,str): b={'text':b}
        if str(b.get('text','')).strip():
            out.append(unit(b['text'],locator=b.get('locator',f'body:{i+1}')))
    for i,b in enumerate(record.get('metadata_content',[]) or []):
        out.append(unit(b.get('text',''),'metadata','公告發文資訊',b.get('locator',f'metadata:{i+1}')))
    gaps = []
    for a in record.get('attachment_content',record.get('attachments',[])) or []:
        name = a.get('filename','未命名附件')
        parsed = (a.get('content') or {}).get('units',a.get('units'))
        if parsed:
            for i,b in enumerate(parsed):
                if str(b.get('text','')).strip():
                    out.append(unit(b['text'],'attachment',name,b.get('locator',f'unit:{i+1}'),
                                    source='ocr' if b.get('source')=='ocr' or 'ocr' in b.get('parse_method','') else 'text',
                                    pdf=name.lower().endswith('.pdf')))
            continue
        if a.get('text'):
            out.append(unit(a['text'],'attachment',name,'text:1',source=a.get('source','text'),pdf=name.lower().endswith('.pdf')))
            continue
        try:
            path = safe_path(root,a.get('path',''))
            ext = path.suffix.lower()
            if ext in {'.txt','.md'}:
                out.append(unit(path.read_text(encoding='utf-8-sig'),'attachment',name,'text:1'))
            elif ext=='.docx':
                out.extend(read_docx(path,name,config))
            elif ext=='.pdf':
                found, missed = read_pdf(path,name,allow_ocr)
                out.extend(found); gaps.extend(missed)
            else:
                raise ValueError('附件格式未支援')
        except Exception as e:
            gaps.append({'filename':name,'reason':str(e)})
    if len(out)>MAX_UNITS:raise ValueError('來源單元過多')
    return out,gaps


def publication_date(record, units, config=CONFIG):
    found = []
    pattern = re.compile(r'(?:'+config['publication']+r')\s*[:：]?\s*(?:民國)?(\d{2,4})[-/年.](\d{1,2})[-/月.](\d{1,2})')
    for u in units:
        if u['source_type']!='metadata':continue
        for m in pattern.finditer(normalize_dates(u['text'])):
            y,mo,d=map(int,m.groups());y=y+1911 if y<1911 else y
            try:found.append((dt.date(y,mo,d),evidence(u)))
            except ValueError:pass
    fallback = record.get('published_at') or record.get('date')
    fb = None
    if fallback:
        try:fb=dt.date.fromisoformat(str(fallback)[:10])
        except ValueError:pass
    if len({d for d,_ in found})>1:return None,[],['官方發文日期互相矛盾']
    if found:return found[0][0],found[0][1],['發文來源互相矛盾'] if fb and fb!=found[0][0] else []
    if fb:return fb,[{'source_type':'metadata','source':'text','filename':'輸入公告資料','locator':'published_at/date','quote':str(fallback)}],[]
    return None,[],[]


def detect_audience(sentences, config=CONFIG):
    positives, negatives, uncertain, teacher_dir = [],[],[],[]
    for s in sentences:
        t=normalize_dates(s['text']);refs=evidence(s)
        both=re.search(config['both_audiences'],t)
        if re.search(config['excluded_first_grade'],t):
            negatives.extend(refs);continue
        if re.search(config['teacher_only'],t) and not both:
            negatives.extend(refs);continue
        if re.search(config['teacher_directed'],t) and not both and not re.search(config['relay_verbs'],t):
            teacher_dir.extend(refs);continue
        grade_mentions = set()
        for m in re.finditer(r'(?:高)?([123一二三])(?:年級)?',t):
            near=t[max(0,m.start()-6):m.end()+8]
            if m.group().startswith('高') or '年級' in near:
                grade_mentions.add(int(m[1]) if m[1].isdigit() else {'一':1,'二':2,'三':3}[m[1]])
        whole=re.search(config['whole_school'],t)
        if grade_mentions:
            if 1 in grade_mentions:positives.extend(refs)
            elif whole:uncertain.extend(refs)   # 「全校」與「僅列其他年級」並存：不猜
            else:negatives.extend(refs)
            continue
        if whole:positives.extend(refs);continue
        if re.search(config['freshman'],t) and not re.search(r'非新生|不含新生|不含高1|不含一年級',t):
            positives.extend(refs);continue
        if re.search(config['audience_restriction'],t) and re.search(config['special_qualification'],t):
            uncertain.extend(refs)
    if positives and negatives:return 'uncertain',unique_refs(positives+negatives),True
    if negatives:return 'ineligible',unique_refs(negatives),False
    if uncertain:return 'uncertain',unique_refs(uncertain),True
    if positives:return 'applicable',unique_refs(positives),False
    if teacher_dir:return 'uncertain',unique_refs(teacher_dir),True
    return 'unspecified',[],False


def date_role(sentence, start, end, config=CONFIG):
    t=normalize_dates(sentence['text']);before=t[max(0,start-45):start];after=t[end:end+20]
    positions=[]
    for name,p in config['roles'].items():
        for m in re.finditer(p,before):positions.append((m.end(), len(m.group()),name))
    if positions:
        pos,_,name=max(positions)
        return name,len(before)-pos
    if sentence.get('role_hint'):return sentence['role_hint'],0
    for name in ['exam','event','action','registration']:
        m=re.search(config['roles'][name],after)
        if m and m.start()<=10:return name,m.start()
    return 'unknown',None


def extract_dates(sentence, pub, pub_refs, anchors=None, config=CONFIG):
    t=normalize_dates(sentence['text']);out=[];previous=None;anchors=anchors or {}
    refs=unique_refs(evidence(sentence)+sentence.get('context_refs',[]))
    def add(value,raw,start,end,basis,purpose=None,extra_refs=None,boundary='inclusive'):
        kind,distance=date_role(sentence,start,end,config)
        item={'purpose':purpose or kind,'value':value,'raw_expression':raw,'year_basis':basis,
              'basis':'relative' if basis=='relative' else 'absolute','boundary':boundary,
              'keyword_distance':distance,'evidence':unique_refs(refs+(extra_refs or [])),
              'association':sentence['association'],'_start':start,'_end':end,'_sentence':sentence['sentence_id']}
        out.append(item);return item
    for m in DATE.finditer(t):
        mo,d=int(m['month']),int(m['day'])
        if not(1<=mo<=12 and 1<=d<=31):continue
        if m['year']:
            y=int(m['year']);y=y+1911 if y<1911 else y;basis='explicit'
        elif previous:
            y=previous[0];basis='same_sentence_explicit_year' if previous[3] in {'explicit','same_sentence_explicit_year'} else previous[3]
            # 同句區間跨年：10–12 月接 1–6 月，且相隔不超過 200 天。
            if y and (mo,d)<(previous[1],previous[4]) and previous[1]>=10 and mo<=6:
                try:
                    gap=(dt.date(y+1,mo,d)-dt.date(y,previous[1],previous[4])).days
                except ValueError:gap=None
                if gap is not None and gap<=200:y+=1;basis='inferred_next_year'
        else:y=pub.year if pub else None;basis='official_publication_year' if pub else 'unknown'
        value=None
        if y:
            try:value=dt.date(y,mo,d).isoformat()
            except ValueError:pass
        # 未標年份且早於發文日：只有「10–12 月發文、1–6 月日期、200 天內」才推定下一年。
        # 超出範圍則年份不明（None），不當成已過去也不當成未來。
        if basis=='official_publication_year' and value and pub and dt.date.fromisoformat(value)<pub and pub.month>=10 and mo<=6:
            try:nxt=dt.date(y+1,mo,d)
            except ValueError:nxt=None
            if nxt and 0<=(nxt-pub).days<=200:
                y+=1;value=nxt.isoformat();basis='inferred_next_year'
            else:value=None;basis='unknown_year'
        clock=CLOCK.match(t[m.end():])
        if value and clock:
            hour,minute=int(clock[2]),int(clock[3] or 0)
            if clock[1]=='下午' and hour<12:hour+=12
            if clock[1]=='上午' and hour==12:hour=0
            try:value=dt.datetime.combine(dt.date.fromisoformat(value),dt.time(hour,minute),TZ).isoformat()
            except ValueError:value=None
        # 「X日前／止」含當天；只有「早於X日」「未滿X日」才排除當天。
        boundary='before_day' if re.search(r'(?:早於|未滿)\s*$',t[max(0,m.start()-4):m.start()]) and not clock else 'inclusive'
        item=add(value,m.group(),m.start(),m.end(),basis,extra_refs=pub_refs if basis in {'official_publication_year','inferred_next_year'} else [],boundary=boundary)
        previous=(y,mo,m.end(),basis,d)
    # Only the latter half of a SAME-SENTENCE range can inherit month/year.
    full_spans=[(x['_start'],x['_end']) for x in out]
    for m in PARTIAL_DAY.finditer(t):
        if any(a<=m.start()<b for a,b in full_spans):continue
        earlier=[x for x in out if x['_end']<=m.start() and x['value']]
        first=earlier[-1] if earlier else None
        if first and re.fullmatch(r'\s*(?:起|日起)?\s*(?:至|到|~|～|-)\s*',t[first['_end']:m.start()]):
            startday=moment(first['value']).date();value=None
            try:value=startday.replace(day=int(m['day'])).isoformat()
            except ValueError:pass
            add(value,m.group(),m.start(),m.end(),'inferred_next_year' if first.get('year_basis')=='inferred_next_year' else 'same_sentence_range',extra_refs=first['evidence'],
                boundary='inclusive')
        else:add(None,m.group(),m.start(),m.end(),'unknown')
    relatives=[(r'本月底','month_end'),(r'下[週周]([一二三四五六日天1-7])','next_week'),
               (r'開學後(\d+)[週周]內','school_weeks')]
    for pattern,kind in relatives:
        for m in re.finditer(pattern,t):
            value=None;extra=[]
            if kind=='month_end' and pub:
                value=pub.replace(day=calendar.monthrange(pub.year,pub.month)[1]).isoformat();extra=pub_refs
            elif kind=='next_week' and pub:
                n=int(m[1])-1 if m[1].isdigit() else {'一':0,'二':1,'三':2,'四':3,'五':4,'六':5,'日':6,'天':6}[m[1]]
                value=(pub-dt.timedelta(days=pub.weekday())+dt.timedelta(days=7+n)).isoformat();extra=pub_refs
            elif kind=='school_weeks' and anchors.get('school_start'):
                anchor=anchors['school_start'];value=(dt.date.fromisoformat(anchor['value'][:10])+dt.timedelta(weeks=int(m[1]))).isoformat();extra=anchor['evidence']
            add(value,m.group(),m.start(),m.end(),'relative',extra_refs=extra)
    return sorted(out,key=lambda x:x['_start'])


def closing_time(value, boundary='inclusive'):
    if boundary=='before_day' and len(value)==10:
        return moment(value)-dt.timedelta(microseconds=1)
    return moment(value,True)


def registration_state(start,end,now,urgent_days=5,boundary='inclusive'):
    if not end:return 'unknown',None
    close=closing_time(end,boundary)
    if start and moment(start)>close:return 'conflict',None
    if now>close:return 'closed','should_hide'
    if not start:return 'unknown',None
    if now<moment(start):return 'upcoming','optional'
    return ('urgent','must_show') if (close.date()-now.date()).days<=urgent_days else ('open','useful')


def registration_windows(sentences,dates,pub,pub_refs,now,urgent_days,config=CONFIG):
    bysentence={s['sentence_id']:s for s in sentences};out=[];consumed=set()
    def add(start,end,basis,refs,distance,boundary='inclusive',inferred=False):
        state,label=registration_state(start,end,now,urgent_days,boundary)
        out.append({'start':start,'end':end,'start_basis':basis,'state':state,'reminder_label':label,'inferred_year':inferred,
                    'boundary':boundary,'support_score':round(6-min((distance or 0)/20,2),2),'evidence':unique_refs(refs)})
    registration=[d for d in dates if d['purpose'] in {'registration','application_start','application_end'}]
    for i,a in enumerate(registration):
        if i in consumed:continue
        s=bysentence[a['_sentence']];t=normalize_dates(s['text'])
        if i+1<len(registration):
            b=registration[i+1]
            same_sentence=a['_sentence']==b['_sentence']
            same_row=a['association']==b['association']
            is_range=same_sentence and re.fullmatch(r'\s*(?:起|日起)?\s*(?:至|到|~|～|-)\s*',t[a['_end']:b['_start']])
            is_columns=same_row and a['purpose']=='application_start' and b['purpose']=='application_end'
            if is_range or is_columns:
                add(a['value'],b['value'],'explicit_range',a['evidence']+b['evidence'],max(a['keyword_distance'] or 0,b['keyword_distance'] or 0),b['boundary'],
                    'inferred_next_year' in {a.get('year_basis'),b.get('year_basis')});consumed.update([i,i+1]);continue
        near=t[max(0,a['_start']-40):a['_end']+30]+s.get('context_text','')
        immediate=bool(re.search(config['immediate'],near))
        is_end=(a['purpose']=='application_end' or matches('deadline',near,config)
                or immediate and re.search(r'至|到',near))
        if is_end:
            add(pub.isoformat() if pub and immediate else None,a['value'],
                'publication_immediate' if pub and immediate else 'unknown',a['evidence']+(pub_refs if immediate else []),a['keyword_distance'],a['boundary'],a.get('year_basis')=='inferred_next_year')
    return out


def reference_aspects(s,config=CONFIG):
    t=normalize_dates(s['text']);refs=evidence(s);out=[]
    def add(cls,kind,reason):out.append({'class':cls,'kind':kind,'reason':reason,'evidence':refs})
    if matches('law_formal',t,config):add('verify_current','regulation_evidence','有正式規範線索，須核對現行效力')
    elif matches('law_article',t,config):add('insufficient','article_number_only','只有條次，不能認定為法規')
    if matches('rules',t,config) or matches('procedure',t,config):add('conditional','rules_or_procedure','可能可參考，須核對新版、資格與費用')
    if matches('award',t,config):add('targeted','historical_result','特定歷年結果可查，不代表今年或全校實力')
    if matches('contact',t,config):add('conditional','contact_pointer','洽詢入口須確認仍可用；不提高Today重要性')
    if (DATE.search(t) or re.search(r'本月底|下[週周]|開學後',t)) and s.get('role_hint'):
        add('cycle_only','cycle_time','保留原年度／場次，不直接套用下一期')
    if not out:add('insufficient','unclassified_content','未辨識用途，不據此宣稱沒有參考價值')
    return out


def classify(record,units,gaps,as_of,urgent_days=5,minimum_score=4,config=CONFIG):
    now=moment(as_of);pub,pub_refs,conflicts=publication_date(record,units,config)
    if pub and pub>now.date():conflicts.append('發文日期晚於判斷時間')
    sentences=contextual_sentences([u for u in units if u['source_type']!='metadata'],config)
    audience,aud_refs,aud_blocked=detect_audience(sentences,config)
    dates=[d for s in sentences for d in extract_dates(s,pub,pub_refs,config=config)]
    school=[d for d in dates if d['purpose']=='school_start' and d['value']]
    anchors={}
    if school and len({d['value'] for d in school})==1:anchors['school_start']=school[0]
    if anchors:dates=[d for s in sentences for d in extract_dates(s,pub,pub_refs,anchors,config)]
    windows=registration_windows(sentences,dates,pub,pub_refs,now,urgent_days,config)
    reference=[{'group_id':s['sentence_id'],'source':evidence(s),'aspects':reference_aspects(s,config)} for s in sentences if s['source_type']!='title']
    scores=[];exams=[];changes=[];continuation=[];actions=[];closed=[];unsupported=[]
    for s in sentences:
        t=normalize_dates(s['text']);refs=unique_refs(evidence(s)+s.get('context_refs',[]));features=[];score=0
        for name,f in config['features'].items():
            m=re.search(f['pattern'],t)
            if not m:continue
            weight=float(f['weight'])
            if name=='change' and re.search(config['negated_change'],t):weight=-weight
            score+=weight;features.append({'feature':name,'weight':weight,'matched':m.group()})
        scores.append({'source':refs,'score':score,'features':features})
        local=[d for d in dates if d['_sentence']==s['sentence_id']]
        future=[d for d in local if d['value'] and closing_time(d['value'],d['boundary'])>=now]
        near=[d for d in future if 0<=(moment(d['value']).date()-now.date()).days<=7]
        if any(d['purpose']=='exam' for d in near):exams.append({'score':6,'evidence':refs,'reason':'七天內考試'})
        fresh=pub and 0<=(now.date()-pub).days<=5
        if matches('change',t,config) and not re.search(config['negated_change'],t) and (near or fresh and not local):
            changes.append({'score':5,'evidence':unique_refs(refs+pub_refs),'reason':'近期異動有時間依據'})
        if re.search(config['participant'],t) and re.search(config['participant_action'],t) and future:
            continuation.append({'score':5,'evidence':refs,'reason':'仍有參加者後續；不假設已報名'})
        if s.get('role_hint')=='action' and future:
            actions.append({'score':5,'evidence':refs,'reason':'原文明確要求後續行動','urgent':any((moment(d['value']).date()-now.date()).days<=urgent_days for d in future)})
        if re.search(config['closed_action'],t):closed.extend(refs)
        if matches('registration',t,config) and not s['is_heading'] and not re.search(config['attachment_pointer'],t) and not any(d['value'] for d in local):unsupported.extend(refs)
    if any(w['state']=='conflict' for w in windows):conflicts.append('報名起訖矛盾；不自動推定跨年')
    warnings=[]
    if gaps:warnings.append('有未讀取的附件或頁面')
    if audience=='unspecified':warnings.append('未明示高一資格，不能預設適用')
    if any(not d['value'] or d['purpose']=='unknown' for d in dates):warnings.append('有日期用途／月份／年份／相對基準未確認')
    if any(d.get('year_basis')=='inferred_next_year' for d in dates):warnings.append('有日期年份由「下一年」推定，僅作暫定')
    if any(d.get('year_basis')=='unknown_year' for d in dates):warnings.append('有日期年份無法判定，未推定')
    has_ocr=any(u.get('source')=='ocr' for u in units)
    if has_ocr:warnings.append('使用OCR文字，辨識可能有誤')
    available=any(u['source_type'] in {'body','attachment'} and u['text'].strip() for u in units)
    label=None;support=0;refs=[];reason='必要證據不足，無法確認'
    open_windows=[w for w in windows if w['state'] in {'open','urgent'} and w['support_score']>=minimum_score]
    unknown_windows=[w for w in windows if w['state'] in {'unknown','conflict'}]
    if audience=='ineligible':label,support,refs,reason='should_hide',6,aud_refs,'原文限制不適用高一'
    elif not available:reason='缺少正文／附件，不只靠標題猜測'
    elif aud_blocked or conflicts:reason='資格或來源日期矛盾／不明，暫不分類'
    elif changes or exams:
        selected=(changes+exams)[0];label='must_show';support=selected['score'];refs=selected['evidence'];reason=selected['reason']
    elif open_windows and not closed:
        w=min(open_windows,key=lambda x:0 if x['state']=='urgent' else 1);label='must_show' if w['state']=='urgent' else 'useful';support=w['support_score'];refs=w['evidence'];reason='仍可報名且已達急迫門檻' if label=='must_show' else '仍可報名，未達急迫門檻'
        if w.get('inferred_year') and label=='must_show':label='useful';reason='仍可報名；年份為推定，上限為有用'
    elif continuation or actions:
        x=(continuation+actions)[0];label='must_show' if x.get('urgent') else 'useful';support=x['score'];refs=x['evidence'];reason=x['reason']
    elif unknown_windows:reason='報名起訖或相對日期基準不足，不能假設已開放'
    elif closed:label,support,refs,reason='should_hide',5,closed,'原文明示停止；未辨識仍有效後續'
    elif any(w['state']=='upcoming' for w in windows):
        w=next(w for w in windows if w['state']=='upcoming');label,support,refs,reason='optional',5,w['evidence'],'尚未開放'
    elif windows and all(w['state']=='closed' for w in windows) and not any(w.get('inferred_year') for w in windows):label,support,refs,reason='should_hide',5,windows[0]['evidence'],'報名均截止，未辨識有效後續'
    elif unsupported:reason='申請／報名文字尚未完整連結時間'
    else:
        usable=[a for g in reference for a in g['aspects'] if a['class'] in {'conditional','verify_current'}]
        if usable:label,support,refs,reason='optional',4,usable[0]['evidence'],'有條件參考價值，未確認今日行動'
    if support<minimum_score:
        label=None
        if support>0:reason='支持度低於門檻，無法確認；'+reason
    if not refs:
        refs=unique_refs([r for d in dates for r in d['evidence']] + aud_refs + pub_refs)
        if not refs:
            refs=unique_refs([r for u in units for r in evidence(u)])
    status='unresolved' if label is None else 'provisional' if warnings or has_ocr else 'classified'
    steps=[{'question':'資料是否讀到？','answer':available,'evidence':[r for u in units if u['source_type'] in {'body','attachment'} for r in evidence(u)]},
           {'question':'公告用途？','answer':scores}, {'question':'適用高一？','answer':audience,'evidence':aud_refs},
           {'question':'日期對應哪個動作？','answer':dates}, {'question':'今天還能做什麼？','answer':{'windows':windows,'continuation':continuation,'actions':actions}},
           {'question':'是否急迫？','answer':'uncertain' if label is None else 'urgent' if label=='must_show' else 'not_urgent','evidence':refs},
           {'question':'哪些部分可參考？','answer':reference}, {'question':'最後分類？','answer':label,'reason':reason,'evidence':refs}]
    for d in dates:
        for k in ['_start','_end','_sentence']:d.pop(k,None)
    return {'id':record['id'],'label':label,'decision_status':status,'support_score':support,'score_is_probability':False,
            'reason':reason,'evidence':refs,'dates':dates,'registration_windows':windows,'reference_groups':reference,
            'decision_steps':steps,'warnings':warnings,'source_conflicts':conflicts,'attachment_gaps':gaps,
            'ocr_used':has_ocr,'persona_applicability':audience,'persona_evidence':aud_refs,'latest_source_status':'not_checked','current_legal_effect':'not_verified'}


def clean_display(text):
    lines=str(text).splitlines();horizontal=re.compile(r'^[.．·。\-─\s]*裝[.．·。\-─\s]*訂[.．·。\-─\s]*線[.．·。\-─\s]*$')
    remove=set()
    for i in range(len(lines)-2):
        if [x.strip() for x in lines[i:i+3]]==['裝','訂','線']:remove.update(range(i,i+3))
    return '\n'.join(s for i,s in enumerate(lines) if i not in remove and not horizontal.fullmatch(s))


def make_review(records,identity):
    encoded=json.dumps({'records':records,'identity':identity},ensure_ascii=False).replace('<','\\u003c')
    return '''<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>離線全盲覆核</title>
<style>body{font:17px system-ui;max-width:850px;margin:auto;padding:15px;background:#f5f6f8}section{background:white;padding:16px;margin:12px 0;border-radius:10px}button,select,input{font:inherit;padding:10px;margin:4px}pre{white-space:pre-wrap;font:inherit;overflow-wrap:anywhere}label{display:block}textarea{width:100%;height:160px}.active{background:#234f76;color:white}</style>
<h1>離線全盲覆核</h1><p>僅有原始來源，沒有程式答案。高一學生、未讀、是否已報名未知。</p><div id="progress"></div><div id="view"></div><button id="prev">上一則</button><button id="next">下一則</button><button id="undo">復原</button><button id="export">匯出</button><textarea id="backup" readonly></textarea>
<script>const DATA='''+encoded+''';const LABELS={must_show:'一定要看',useful:'有用',optional:'可選讀',should_hide:'今天隱藏',uncertain:'無法確認'};const REF={conditional:'可參考須核對新版',cycle_only:'只適用原年度／場次',targeted:'特定歷史問題',verify_current:'須確認現行效力',no_reference:'一般查詢不需取用',insufficient:'無法確認'};const key='offline-blind-'+DATA.identity.predictions_sha256;let index=0,state={},history=[];try{state=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){};const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function ensure(r){if(!state[r.id])state[r.id]={reference:{},dates:[],missing_information:false};return state[r.id]}function save(){try{localStorage.setItem(key,JSON.stringify(state))}catch(e){alert('無法自動保存，請匯出備份')}}function edit(fn){history.push(JSON.stringify(state));fn();save();render()}function complete(r){const x=state[r.id];return !!(x&&x.label&&x.urgency&&r.sections.every(s=>(x.reference[s.section_id]||[]).length)&&x.dates.every(d=>d.value&&d.section_id))}function render(){const r=DATA.records[index],x=ensure(r);document.querySelector('#progress').textContent=DATA.records.filter(complete).length+'/'+DATA.records.length+' 完成｜第 '+(index+1)+' 則｜判斷日 '+DATA.identity.as_of;let h='<section><h2>'+esc(r.title)+'</h2><p>'+esc(r.school)+'｜發文日期 '+esc(r.published_at||'未知')+'</p></section>';for(const s of r.sections){h+='<section><small>'+esc(s.filename)+' '+esc(s.locator)+'</small><pre>'+esc(s.display_text)+'</pre><p>本段參考用途，可複選：</p>';for(const [v,t] of Object.entries(REF)){h+='<label><input type="checkbox" data-section="'+esc(s.section_id)+'" value="'+v+'" '+((x.reference[s.section_id]||[]).includes(v)?'checked':'')+'>'+t+'</label>'}h+='</section>'}h+='<section><h3>今日重要性</h3>';for(const [v,t] of Object.entries(LABELS))h+='<button data-label="'+v+'" class="'+(x.label===v?'active':'')+'">'+t+'</button>';h+='<h3>急迫性</h3>';for(const [v,t] of Object.entries({urgent:'急迫',not_urgent:'不急迫',uncertain:'無法確認'}))h+='<button data-urgency="'+v+'" class="'+(x.urgency===v?'active':'')+'">'+t+'</button>';h+='<label><input id="missing" type="checkbox" '+(x.missing_information?'checked':'')+'>資料缺漏</label><p>自行找到的日期：</p><div id="dates"></div><button id="add">新增日期</button></section>';document.querySelector('#view').innerHTML=h;document.querySelectorAll('[data-label]').forEach(b=>b.onclick=()=>edit(()=>ensure(r).label=b.dataset.label));document.querySelectorAll('[data-urgency]').forEach(b=>b.onclick=()=>edit(()=>ensure(r).urgency=b.dataset.urgency));document.querySelectorAll('[data-section]').forEach(b=>b.onchange=()=>edit(()=>{const v=new Set(ensure(r).reference[b.dataset.section]||[]);b.checked?v.add(b.value):v.delete(b.value);ensure(r).reference[b.dataset.section]=[...v]}));document.querySelector('#missing').onchange=e=>edit(()=>ensure(r).missing_information=e.target.checked);document.querySelector('#add').onclick=()=>edit(()=>ensure(r).dates.push({kind:'application_end',value:'',section_id:''}));x.dates.forEach((d,i)=>{const div=document.createElement('div');div.innerHTML='<select class="kind">'+Object.entries({application_start:'報名開始',application_end:'報名截止',event:'活動日期',exam:'考試日期',action:'其他行動時間',other:'其他'}).map(([v,t])=>'<option value="'+v+'" '+(d.kind===v?'selected':'')+'>'+t+'</option>').join('')+'</select><input class="date" type="date" value="'+esc(d.value)+'"><select class="source"><option value="">選擇原文位置</option>'+r.sections.map(s=>'<option value="'+esc(s.section_id)+'" '+(d.section_id===s.section_id?'selected':'')+'>'+esc(s.filename+' '+s.locator)+'</option>').join('')+'</select><button class="remove">移除</button>';div.querySelector('.kind').onchange=e=>edit(()=>ensure(r).dates[i].kind=e.target.value);div.querySelector('.date').onchange=e=>edit(()=>ensure(r).dates[i].value=e.target.value);div.querySelector('.source').onchange=e=>edit(()=>ensure(r).dates[i].section_id=e.target.value);div.querySelector('.remove').onclick=()=>edit(()=>ensure(r).dates.splice(i,1));document.querySelector('#dates').appendChild(div)})}document.querySelector('#prev').onclick=()=>{index=Math.max(0,index-1);render()};document.querySelector('#next').onclick=()=>{index=Math.min(DATA.records.length-1,index+1);render()};document.querySelector('#undo').onclick=()=>{if(history.length){state=JSON.parse(history.pop());save();render()}};document.querySelector('#export').onclick=()=>{const value={schema_version:2,review_kind:'offline_full_blind',...DATA.identity,completed:DATA.records.every(complete),exported_at:new Date().toISOString(),reviews:DATA.records.map(r=>({id:r.id,...ensure(r)}))};const text=JSON.stringify(value,null,2);document.querySelector('#backup').value=text;const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='human_offline_blind_review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};render();</script></html>'''


def load_records(path):
    raw=Path(path).read_bytes();v=json.loads(raw);records=v if isinstance(v,list) else v['records']
    if not records:raise ValueError('輸入没有公告')
    ids=[]
    for i,r in enumerate(records):
        r['id']=str(r.get('id') or f'local-{i+1:03d}');ids.append(r['id'])
    if len(set(ids))!=len(ids):raise ValueError('公告ID重複')
    return raw,records


def run_classification(path,as_of,urgent_days=5,minimum_score=4,allow_ocr=False,config=CONFIG):
    raw,records=load_records(path);outputs=[];review=[]
    for r in records:
        # The classifier reads source fields only; labels/features are not inputs.
        units,gaps=read_sources(r,Path(path).resolve().parent,allow_ocr,config)
        outputs.append(classify(r,units,gaps,as_of,urgent_days,minimum_score,config))
        sections=[]
        for s in contextual_sentences([u for u in units if u['source_type'] not in {'metadata','title'}],config):
            sections.append({'section_id':s['sentence_id'],'filename':s['filename'],'locator':s['sentence_id'],
                             'display_text':clean_display(s.get('display_text',s['text']))})
        for i,g in enumerate(gaps):sections.append({'section_id':f'gap:{i}','filename':g['filename'],'locator':g.get('locator','未讀取'),'display_text':'附件未讀取：'+g['reason']})
        review.append({'id':r['id'],'school':r.get('school',''),'title':r.get('title',''),'published_at':r.get('published_at') or r.get('date'),'sections':sections})
    return raw,outputs,review


def generate_outputs(path,as_of,urgent_days=5,minimum_score=4,allow_ocr=False,config=CONFIG):
    moment(as_of)
    if not 0<=urgent_days<=30 or minimum_score<=0:raise ValueError('門檻超出範圍')
    raw,outputs,review=run_classification(path,as_of,urgent_days,minimum_score,allow_ocr,config)
    payload={'schema_version':2,'candidate':VERSION,'as_of':as_of,'outputs':outputs,'network_calls':0,'human_features_used':False,
             'limitations':['規則候選版本，沒有真實標註成績即不宣稱語義準確率。','複雜條件、版面及模糊基準仍可能無法辨識。']}
    data=canonical(payload)
    identity={'batch_id':'local-'+sha(raw)[:12], 'candidate':VERSION,'as_of':as_of,'urgent_days':urgent_days,
              'minimum_score':minimum_score,'input_sha256':sha(raw),'program_sha256':sha(Path(__file__).read_bytes()),
              'config_sha256':sha(canonical(config)),'ocr_enabled':allow_ocr,'ocr_used':any(x['ocr_used'] for x in outputs),
              'predictions_sha256':sha(data),'ids':[x['id'] for x in outputs]}
    review_html=make_review(review,identity)
    manifest={**identity,'review_html_sha256':sha(review_html.encode()),'status':'LOCAL_CANDIDATE_GENERATED_NOT_VALIDATED',
              'created_at':dt.datetime.now(TZ).isoformat(),'record_count':len(outputs),'unresolved_count':sum(x['label'] is None for x in outputs),
              'provisional_count':sum(x['decision_status']=='provisional' for x in outputs),'production_impact':'NONE'}
    folder=Path(tempfile.mkdtemp(prefix='offline-announcement-review-'))
    for name,b in [('predictions.json',data),('manifest.json',canonical(manifest)),('blind_review.html',review_html.encode())]:
        with (folder/name).open('xb') as f:f.write(b)
    return folder,manifest


def load_config(path):
    if not path:return CONFIG
    v=json.loads(Path(path).read_text(encoding='utf-8'));cfg=json.loads(json.dumps(CONFIG));cfg.update(v)
    for f in cfg['features'].values():re.compile(f['pattern']);float(f['weight'])
    for p in cfg['roles'].values():re.compile(p)
    return cfg


def main():
    p=argparse.ArgumentParser();p.add_argument('input',type=Path);p.add_argument('--as-of',required=True)
    p.add_argument('--urgent-days',type=int,default=5);p.add_argument('--minimum-score',type=float,default=4)
    p.add_argument('--ocr',action='store_true');p.add_argument('--config',type=Path);a=p.parse_args()
    folder,manifest=generate_outputs(a.input,a.as_of,a.urgent_days,a.minimum_score,a.ocr,load_config(a.config))
    print('隔離輸出目錄：',folder);print('未確認分類數：',manifest['unresolved_count'])
    print('人工覆核前不要開啟 predictions.json；請備份整個暫存目錄。')

if __name__=='__main__':main()
