const fs = require('fs');
fs.mkdirSync('dist-autonomous-review', { recursive: true });
const ui = fs.readFileSync('experiments/autonomous-corpus/review/index.html', 'utf8');
fs.writeFileSync('dist-autonomous-review/index.html', ui);
// QA exercises the exact UI handlers with synthetic records only.
// No corpus, predictions, human reviews, or access tokens are build inputs.
const fixture = {
  batch_id: 'synthetic-qa-v34-B', as_of: '2026-10-01',
  corpus_sha256: '0'.repeat(64), model_freeze_sha256: '1'.repeat(64),
  records: Array.from({length:15}, (_,i)=>({
    id: 'synthetic-'+(i+1), school: 'cysh', title: '合成測試資料 '+(i+1)+'（非人工驗證）',
    url: 'https://example.com/', body_content:[{locator:'body:1',text:'這是合成測試資料，用來驗證介面操作。'}],
    attachment_content:[], metadata_content:[]
  }))
};
const qa = ui.replace("'use strict';", "'use strict';\nconst fetch=async()=>({ok:true,json:async()=>("+JSON.stringify(fixture)+")});");
fs.writeFileSync('dist-autonomous-review/qa-fixture.html', qa);

const rereview = fs.readFileSync('experiments/autonomous-corpus/review/policy-rereview.html','utf8');
fs.writeFileSync('dist-autonomous-review/policy-rereview.html',rereview);
const rubric = JSON.parse(fs.readFileSync('experiments/autonomous-corpus/batch-b-rereview-rubric.json','utf8'));
const rereviewManifest = JSON.parse(fs.readFileSync('experiments/autonomous-corpus/batch-b-rereview-freeze.json','utf8'));
const syntheticRereview = {...fixture, batch_id:'synthetic-policy-rereview-r1',review_kind:'policy_rereview',
 rubric_sha256:rereviewManifest.rubric_sha256,rubric,
 records:fixture.records.slice(0,12).map((r,i)=>({...r,id:'synthetic-rereview-'+(i+1)}))};
fs.writeFileSync('dist-autonomous-review/qa-rereview.html',rereview.replace("'use strict';",
 "'use strict';\nconst fetch=async()=>({ok:true,json:async()=>("+JSON.stringify(syntheticRereview)+")});"));


const pdfDisplay=fs.readFileSync('experiments/autonomous-corpus/review/pdf-display.js','utf8');
const round2=fs.readFileSync('experiments/autonomous-corpus/review/round2.html','utf8').replace('/*PDF_DISPLAY*/',pdfDisplay);
fs.writeFileSync('dist-autonomous-review/round2.html',round2);
const syntheticRound2={...fixture,schema_version:2,review_kind:'round2_blind',batch_id:'synthetic-round2-v35-A',as_of:'2026-10-02',persona:{grade:1,teacher:false,unread:true,interests:[],prior_actions:'unknown'}};
fs.writeFileSync('dist-autonomous-review/qa-round2.html',round2.replace("'use strict';", "'use strict';\nconst fetch=async()=>({ok:true,json:async()=>("+JSON.stringify(syntheticRound2)+")});"));

const timeCheck=fs.readFileSync('experiments/autonomous-corpus/review/time-check.html','utf8').replace('/*PDF_DISPLAY*/',pdfDisplay);
const registrationCheck=fs.readFileSync('experiments/autonomous-corpus/review/registration-check.html','utf8').replace('/*PDF_DISPLAY*/',pdfDisplay);
fs.writeFileSync('dist-autonomous-review/registration-check.html',registrationCheck);
const syntheticRegistration={...syntheticRound2,review_kind:'post_blind_registration_policy',batch_id:'synthetic-registration-v1',policy_version:'registration-time-v1',urgent_days:5,time_human_sha256:'4'.repeat(64),records:fixture.records.map(r=>({...r,registration_windows:[],registration_result:{label:'useful',status:'open',reason:'合成例：2026-09-01 ≤ 2026-10-02 ≤ 2026-10-08，距截止6天，為有用。'}}))};
fs.writeFileSync('dist-autonomous-review/qa-registration.html',registrationCheck.replace("'use strict';","'use strict';\nconst fetch=async()=>({ok:true,json:async()=>("+JSON.stringify(syntheticRegistration)+")});"));
fs.writeFileSync('dist-autonomous-review/time-check.html',timeCheck);
const syntheticTime={...syntheticRound2,batch_id:'synthetic-time-check',review_kind:'post_blind_temporal_diagnostic',human_labels_frozen:true,human_original_sha256:'3'.repeat(64),records:fixture.records.map((r,i)=>({...r,temporal_claims:i===0?[{claim_id:r.id+':date:0',kind:'application_end',value:'2026-10-08',raw_value:'115年10月8日',purpose:'Reading deadline',references:[{source_type:'attachment',filename:'synthetic.pdf',locator:'page:2',snippet:'報名截止為115年10月8日下午5時。'}]},{claim_id:r.id+':date:1',kind:'event_date',value:'2026-10-15',raw_value:'115年10月15日',purpose:'Initial assessment',references:[{source_type:'body',filename:'source.html',locator:'body:1',snippet:'活動日期為115年10月15日。'}]}]:[],source_conflicts:[],attachment_content:i===0?[{filename:'synthetic.pdf',content:{units:[{locator:'page:2',text:'.\n.\n.\n裝\n.\n.\n.\n訂\n.\n.\n.\n線\n.\n報名截止為115年10月8日下午5時。'}]}}]:[]}))};
fs.writeFileSync('dist-autonomous-review/qa-time-check.html',timeCheck.replace("'use strict';","'use strict';\nconst fetch=async()=>({ok:true,json:async()=>("+JSON.stringify(syntheticTime)+")});"));

const registrationV2=fs.readFileSync('experiments/autonomous-corpus/review/registration-check-v2.html','utf8').replace('/*PDF_DISPLAY*/',pdfDisplay);
fs.writeFileSync('dist-autonomous-review/registration-check-v2.html',registrationV2);

const referenceCheck=fs.readFileSync('experiments/autonomous-corpus/review/reference-check.html','utf8').replace('/*PDF_DISPLAY*/',pdfDisplay);
fs.writeFileSync('dist-autonomous-review/reference-check.html',referenceCheck);
const referencePolicy=JSON.parse(fs.readFileSync('experiments/autonomous-corpus/reference/policy-v1.json','utf8'));
const syntheticReference={...syntheticRound2,batch_id:'synthetic-historical-reference-v1',review_kind:'post_blind_reference_development',policy_version:referencePolicy.policy_version,as_of:referencePolicy.as_of,policy_sha256:'2'.repeat(64),reference_prediction_sha256:'5'.repeat(64),registration_human_sha256:'6'.repeat(64),source_registration_queue_sha256:'7'.repeat(64),reference_classes:referencePolicy.reference_classes,rubric:referencePolicy.rules,records:fixture.records.map(r=>({...r,reference_analysis:{id:r.id,content_kinds:['notice','procedure'],overview:'合成測試：本篇含可參考流程及過期時間。不是人類品質證據。',groups:[{group_id:r.id+':rules',title:'可參考流程（合成）',content_kind:'procedure',reference_class:'conditional',summary:'流程可作舊版參考。',reason:'流程與單次期限分開。',scope:'合成原年度',allowed_questions:['上次怎麼辦理？'],limitations:['查核本期最新版'],references:[{source_type:'body',filename:'合成正文',locator:'body:1',quote:r.body_content[0].text}]},{group_id:r.id+':dates',title:'過期日期（合成）',content_kind:'cycle_timing',reference_class:'cycle_only',summary:'原截止2025-01-01。',reason:'不能套用今年。',scope:'2025年原場次',allowed_questions:['前次何時截止？'],limitations:['本期尚未查核'],temporal_facts:[{claim_id:r.id+':date',value:'2025-01-01',purpose:'原場次截止',relation_to_as_of:'past'}],references:[{source_type:'attachment',filename:'synthetic.pdf',locator:'page:1',quote:'報名截止2025年1月1日。'}]}]}}))};
const syntheticReferenceSHA=require('crypto').createHash('sha256').update(JSON.stringify(syntheticReference)).digest('hex');
fs.writeFileSync('dist-autonomous-review/qa-reference.html',referenceCheck.replace(/const queueSHA='[a-f0-9]+';/,"const queueSHA='"+syntheticReferenceSHA+"';").replace("'use strict';","'use strict';\nconst fetch=async()=>({ok:true,json:async()=>("+JSON.stringify(syntheticReference)+")});"));
