"""Training-only real API inference. No assistant annotation input, no default model.

Outputs must stay in private scratch/Training Storage, never repo/static/artifacts.
The live path is deliberately gated by explicit payment authorization. No retries.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
import re
from pathlib import Path
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
LABELS = ['must_show', 'useful', 'optional', 'should_hide']
CLASSES = ['conditional', 'cycle_only', 'targeted', 'verify_current', 'no_reference', 'insufficient']

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()

def digest(data):
    return hashlib.sha256(data).hexdigest()

def obj(properties):
    return {'type': 'object', 'properties': properties, 'required': list(properties), 'additionalProperties': False}

def arr(item):
    return {'type': 'array', 'items': item}

S = {'type': 'string'}
NULLSTR = {'type': ['string', 'null']}
EVIDENCE = arr(obj({'source_id': S, 'quote': S}))
DATE = obj({'purpose': S, 'value': NULLSTR, 'raw_expression': S, 'year_basis': S, 'evidence': EVIDENCE})
WINDOW = obj({'purpose': S, 'start': NULLSTR, 'end': NULLSTR,
              'start_basis': {'type': 'string', 'enum': ['explicit', 'publication_immediate', 'unknown']},
              'applicability': {'type': 'string', 'enum': ['applicable', 'ineligible', 'uncertain']},
              'label': {'type': ['string', 'null'], 'enum': [*LABELS, None]},
              'reason': S, 'evidence': EVIDENCE})
GROUP = obj({'title': S, 'content_kind': S, 'reference_class': {'type': 'string', 'enum': CLASSES},
             'scope': S, 'reason': S, 'allowed_questions': arr(S), 'limitations': arr(S), 'evidence': EVIDENCE})
SCHEMA = obj({'id': S, 'label': {'type': 'string', 'enum': LABELS},
              'persona_applicability': {'type': 'string', 'enum': ['applicable', 'ineligible', 'uncertain']},
              'urgency': obj({'status': {'type': 'string', 'enum': ['urgent', 'not_urgent', 'uncertain']},
                              'reason': S, 'evidence': EVIDENCE}),
              'actionability': S, 'dates': arr(DATE), 'registration_windows': arr(WINDOW),
              'today_reason': S, 'today_evidence': EVIDENCE, 'reference_groups': arr(GROUP),
              'latest_source_status': {'type': 'string', 'enum': ['not_checked']},
              'current_effect_status': {'type': 'string', 'enum': ['not_verified']},
              'uncertainties': arr(S), 'source_conflicts': arr(S)})

def units(record):
    out = [{'source_id': 'title', 'filename': 'title', 'locator': 'title:1', 'text': record['title']}]
    if record.get('date'):
        out.append({'source_id': 'publication', 'filename': 'source-index.json',
                    'locator': 'publication_date', 'text': record['date']})
    for kind, blocks in [('metadata', record.get('metadata_content', [])), ('body', record.get('body_content', []))]:
        for i, b in enumerate(blocks):
            out.append({'source_id': f'{kind}:{i}', 'filename': 'source.html', 'locator': b['locator'], 'text': b['text']})
    for i, a in enumerate(record.get('attachment_content', [])):
        for j, u in enumerate((a.get('content') or {}).get('units', [])):
            out.append({'source_id': f'attachment:{i}:{j}', 'filename': a['filename'], 'locator': u['locator'], 'text': u['text']})
    return out

def check_schema(value, schema):
    typ = schema['type']; allowed = typ if isinstance(typ, list) else [typ]
    actual = 'null' if value is None else 'object' if isinstance(value, dict) else 'array' if isinstance(value, list) else 'string' if isinstance(value, str) else 'invalid'
    if actual not in allowed or 'enum' in schema and value not in schema['enum']:
        raise ValueError('invalid output type/enum')
    if actual == 'object':
        if set(value) != set(schema['properties']): raise ValueError('output keys')
        for k, v in value.items(): check_schema(v, schema['properties'][k])
    if actual == 'array':
        for v in value: check_schema(v, schema['items'])

def instant(value, end=False):
    if len(value) == 10:
        day = dt.date.fromisoformat(value)
        return dt.datetime.combine(day, dt.time.max if end else dt.time.min, dt.timezone(dt.timedelta(hours=8)))
    parsed = dt.datetime.fromisoformat(value)
    if parsed.tzinfo is None: raise ValueError('explicit time requires timezone')
    return parsed

def registration_label(start, end, as_of):
    if not end: return None
    now = instant(as_of); close = instant(end, end=True)
    if start and instant(start) > close: raise ValueError('reversed registration range')
    if now > close: return 'should_hide'
    if not start: return None
    if now < instant(start): return 'optional'
    days = (close.astimezone(dt.timezone(dt.timedelta(hours=8))).date() - now.astimezone(dt.timezone(dt.timedelta(hours=8))).date()).days
    return 'must_show' if days <= 5 else 'useful'

def validate(output, record, as_of):
    check_schema(output, SCHEMA)
    if output['id'] != record['id']: raise ValueError('output record identity')
    index = {u['source_id']: u['text'] for u in units(record)}
    def evidence(refs):
        if not refs: raise ValueError('uncited claim')
        for r in refs:
            if not r['quote'] or r['source_id'] not in index or r['quote'] not in index[r['source_id']]:
                raise ValueError('quote/source mismatch')
    evidence(output['today_evidence']); evidence(output['urgency']['evidence'])
    for d in output['dates']:
        evidence(d['evidence'])
        if d['raw_expression'] and not any(d['raw_expression'] in e['quote'] for e in d['evidence']):
            raise ValueError('date expression absent from quote')
        if d['value']:
            value = instant(d['value']); nums = [int(n) for n in re.findall(r'\d+', d['raw_expression'])]
            immediate = '即日起' in d['raw_expression']
            if immediate:
                if d['value'] != record.get('date') or not any(e['source_id'] == 'publication' for e in d['evidence']):
                    raise ValueError('unsupported immediate date')
            elif value.month not in nums or value.day not in nums: raise ValueError('unsupported month/day')
            if value.year not in nums and value.year - 1911 not in nums:
                quotes = ''.join(e['quote'] for e in d['evidence'])
                if not d['year_basis'] or not any(str(y) in quotes for y in [value.year, value.year - 1911]):
                    raise ValueError('missing year evidence')
    for g in output['reference_groups']: evidence(g['evidence'])
    if not output['reference_groups']: raise ValueError('reference coverage missing')
    for w in output['registration_windows']:
        evidence(w['evidence'])
        if w['start_basis'] == 'unknown' and w['start'] is not None: raise ValueError('unsupported start')
        if w['start_basis'] == 'publication_immediate':
            quote = ''.join(r['quote'] for r in w['evidence'])
            if '即日起' not in quote: raise ValueError('immediate start evidence absent')
            if not record.get('date') or w['start'] != record['date'] or not any(r['source_id'] == 'publication' for r in w['evidence']):
                raise ValueError('publication start evidence absent/conflict')
        expected = registration_label(w['start'], w['end'], as_of)
        if w['label'] != expected: raise ValueError('registration arithmetic/policy mismatch')
    return True

def request_payload(model, record, persona, as_of, instructions, reference_policy):
    # Whitelist only source material: no copied labels, assistant features or prior answers.
    source = {'id': record['id'], 'school': record['school'], 'persona': persona,
              'as_of': as_of, 'source_units': units(record),
              'attachment_coverage': [{'filename': a['filename'], 'status': a.get('status', 'unknown')} for a in record.get('attachment_content', [])]}
    return {'model': model, 'store': False, 'max_output_tokens': 6000,
            'instructions': instructions + '\nReference policy:\n' + json.dumps(reference_policy, ensure_ascii=False),
            'input': json.dumps(source, ensure_ascii=False),
            'text': {'format': {'type': 'json_schema', 'name': 'announcement_v36', 'strict': True, 'schema': SCHEMA}}}

def infer(payload, key):
    req = urllib.request.Request('https://api.openai.com/v1/responses', data=canonical(payload),
                                  headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    # Never print HTTP bodies (may include private source text). No automatic retries.
    try:
        with urllib.request.urlopen(req, timeout=180) as r: response = json.load(r)
    except urllib.error.HTTPError as e: raise RuntimeError('model request failed HTTP ' + str(e.code)) from None
    if response.get('status') != 'completed': raise ValueError('incomplete model response')
    texts = [c['text'] for o in response.get('output', []) for c in o.get('content', []) if c.get('type') == 'output_text']
    if any(c.get('type') == 'refusal' for o in response.get('output', []) for c in o.get('content', [])): raise ValueError('model refusal')
    return json.loads(''.join(texts)), {'response_id': response['id'], 'model_returned': response['model'], 'usage': response.get('usage', {})}

def main():
    p = argparse.ArgumentParser(); p.add_argument('--corpus', required=True); p.add_argument('--out', required=True)
    p.add_argument('--model', required=True); p.add_argument('--execute-authorized-paid-run', action='store_true')
    a = p.parse_args(); dest = Path(a.out)
    if dest.exists(): raise ValueError('refuse overwrite/rerun')
    raw = Path(a.corpus).read_bytes(); corpus = json.loads(raw)
    if not 1 <= len(corpus['records']) <= 30: raise ValueError('bounded run max 30 records')
    if len({r['id'] for r in corpus['records']}) != len(corpus['records']): raise ValueError('duplicate corpus ID')
    if any(not re.fullmatch(r'(cysh|cygsh)-\d+', r['id']) for r in corpus['records']): raise ValueError('invalid record ID')
    instructions = (ROOT / 'instructions-v36.md').read_text()
    reference_raw = (ROOT.parent / 'reference/policy-v1.json').read_bytes()
    plan = {'candidate': 'v3.6-executable-development', 'corpus_sha256': digest(raw), 'model_requested': a.model,
            'instructions_sha256': digest(instructions.encode()), 'reference_policy_sha256': digest(reference_raw),
            'schema_sha256': digest(canonical(SCHEMA)), 'runner_sha256': digest(Path(__file__).read_bytes()),
            'record_count': len(corpus['records']), 'max_output_tokens_per_record': 6000,
            'paid_calls_made': 0, 'status': 'PREPARED_NOT_EXECUTED'}
    if not a.execute_authorized_paid_run:
        print(json.dumps(plan)); return
    key = os.environ.get('OPENAI_API_KEY')
    if not key: raise ValueError('OPENAI_API_KEY absent; no request made')
    # O_EXCL claim is durable within private work; failed runs keep all response evidence.
    dest.mkdir(mode=0o700, parents=True, exist_ok=False)
    (dest / 'run-plan.json').write_bytes(canonical(plan))
    outputs = []; receipts = []
    for r in corpus['records']:
        answer, receipt = infer(request_payload(a.model, r, corpus['persona'], corpus['as_of'], instructions, json.loads(reference_raw)), key)
        receipts.append(receipt)
        (dest / (r['id'] + '-response.json')).write_bytes(canonical({'answer': answer, 'receipt': receipt}))
        validate(answer, r, corpus['as_of']); outputs.append(answer)
    result = {**plan, 'status': 'INFERENCE_COMPLETE_NOT_BLIND_RELEASED', 'paid_calls_made': len(outputs),
              'engine': 'OpenAI Responses API invoked by runner.py', 'as_of': corpus['as_of'],
              'completed_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'outputs': outputs, 'receipts': receipts,
              'human_labels_used': False, 'assistant_annotations_used': False,
              'limitations': ['Structural checks are not semantic accuracy.', 'Private upload/readback and immutable freeze required before blind queue release.']}
    data = canonical(result); (dest / 'model-output.json').write_bytes(data)
    print(json.dumps({'status': result['status'], 'sha256': digest(data), 'records': len(outputs)}))

if __name__ == '__main__': main()
