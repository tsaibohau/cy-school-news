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


const round2=fs.readFileSync('experiments/autonomous-corpus/review/round2.html','utf8');
fs.writeFileSync('dist-autonomous-review/round2.html',round2);
const syntheticRound2={...fixture,schema_version:2,review_kind:'round2_blind',batch_id:'synthetic-round2-v35-A',as_of:'2026-10-02',persona:{grade:1,teacher:false,unread:true,interests:[],prior_actions:'unknown'}};
fs.writeFileSync('dist-autonomous-review/qa-round2.html',round2.replace("'use strict';", "'use strict';\nconst fetch=async()=>({ok:true,json:async()=>("+JSON.stringify(syntheticRound2)+")});"));
