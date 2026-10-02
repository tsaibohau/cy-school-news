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
