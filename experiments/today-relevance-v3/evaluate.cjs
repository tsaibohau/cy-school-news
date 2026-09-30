"use strict";
const fs=require('fs'),crypto=require('crypto'),assert=require('assert/strict');
const V=require('./candidate.cjs'),Base=require('./vendor/archived-v2-relevance.cjs');
const filename=process.argv[2]||__dirname+'/fixtures/01-manual-ranking-label-view-2026-09-26-reviewed.json';
const bytes=fs.readFileSync(filename),d=JSON.parse(bytes),rows=d.records;
const labels=['must_show','useful','optional','should_hide'];
assert.equal(rows.length,150);assert.equal(new Set(rows.map(r=>r.announcement_id)).size,150);
assert.deepEqual(labels.map(l=>rows.filter(r=>r.human_label===l).length),[18,36,26,70]);
assert(rows.every(r=>'teacher_related' in r && 'announcement_missing' in r));
const experiments={A:{},B:{availability:true},C:{temporal:true},D:{audience:true},E:{ageLongLived:true},F:{availability:true,temporal:true},G:{availability:true,temporal:true,audience:true,ageLongLived:true}};
function metrics(selected){const n=selected.length,c=labels.map(l=>selected.filter(x=>x.human_label===l).length),pos=c[0]+c[1];return {displayed_count:n,displayed_label_counts:c,positive_precision:n?pos/n:null,positive_recall:pos/54,must_show_recall:c[0]/18,useful_recall:c[1]/36,should_hide_leakage:c[3]/70,optional_positive_leakage:c[2]/26};}
const input=r=>Object.fromEntries(['announcement_id','school','title','category','source_category','published_date','first_seen_date','official_summary'].map(k=>[k,r[k]]));
function run(opts,oracle=false){let selected=[],results=[];
 for(const school of ['cysh','cygsh']){
  const scored=rows.filter(r=>r.school===school).map(r=>{const x=input(r);
   if(oracle) x.source_observation={confirmed_missing:r.announcement_missing===true};
   const result=V.score(x,{school_id:school,role:'student'},d.snapshot.as_of,opts);
   results.push({id:r.announcement_id,human_label:r.human_label,...result});return {record:r,result};});
  selected.push(...scored.filter(x=>x.result.eligible&&x.result.score>=V.policy.threshold).sort((a,b)=>b.result.score-a.result.score||a.record.announcement_id.localeCompare(b.record.announcement_id)).slice(0,V.policy.maximumItems).map(x=>x.record));
 }
 return {...metrics(selected),displayed_ids:selected.map(x=>x.announcement_id),results:results.map(x=>({id:x.id,human_label:x.human_label,eligible:x.eligible,score:x.score,reasons:x.reasons.map(r=>r.code)}))};}
const raw=Object.fromEntries(Object.entries(experiments).map(([k,o])=>[k,run(o)]));
for(const [k,v] of Object.entries(raw))v.delta_vs_A=Object.fromEntries(Object.keys(metrics([])).filter(n=>n!=='displayed_label_counts').map(n=>[n,v[n]===null?null:v[n]-raw.A[n]]));
// Historical compatibility only; this intentionally admits human-derived flags.
const old=[];for(const school of ['cysh','cygsh'])old.push(...Base.rankToday(rows.filter(r=>r.school===school),{school_id:school},d.snapshot.as_of).map(x=>x.item));
console.log(JSON.stringify({development_integrity:{count:150,unique_ids:150,label_counts:[18,36,26,70],sha256:crypto.createHash('sha256').update(bytes).digest('hex'),reviewed_true:rows.filter(r=>r.reviewed===true).length,labels_are_authoritative:true},
 context:{as_of:d.snapshot.as_of,school_contexts:2,maximum_per_school:10,threshold:45,baseline:'archived local numeric v2 policy, NOT frozen Round1 prompt',primary_inputs:'objective title/source metadata only; human flags withheld',sample_is_not_prevalence_representative:true,classification_vs_top_k:'Round1 label positive is not comparable to displayed top10'},
 coverage:{source_observations:0,content_bodies:0,human_missing_oracle_count:rows.filter(r=>r.announcement_missing).length},experiments:raw,
 oracle_availability_diagnostic:{B:run(experiments.B,true),F:run(experiments.F,true),G:run(experiments.G,true)},
 historical_v2_human_flags_compatibility:metrics(old),freeze:false,freeze_reason:'Combined useful recall falls from 27.8% to 13.9%; no frozen numeric v2 artifact; objective availability coverage=0. No threshold or weight search.'},null,2));
