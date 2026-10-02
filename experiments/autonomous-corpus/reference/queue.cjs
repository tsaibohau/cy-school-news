const fs=require('fs'),crypto=require('crypto');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const compact=value=>String(value).replace(/\s/g,'');
function auditReferences(source,output){
 const errors=[];let total=0;
 for(const row of output.records){const record=source.records.find(r=>r.id===row.id);if(!record){errors.push(row.id+': unknown ID');continue;}
  for(const g of row.groups){if(!g.references?.length)errors.push(g.group_id+': no source');
   for(const ref of g.references||[]){total++;let text;
    if(ref.source_type==='body')text=record.body_content.find(u=>u.locator===ref.locator)?.text;
    else if(ref.source_type==='attachment')text=record.attachment_content.find(a=>a.filename===ref.filename)?.content?.units?.find(u=>u.locator===ref.locator)?.text;
    else if(ref.source_type==='title')text=record.title;
    else if(ref.source_type==='metadata')text=record.metadata_content.find(u=>u.locator===ref.locator)?.text;
    if(!text)errors.push(g.group_id+': missing '+ref.filename+' '+ref.locator);
    // Existing temporal citations were frozen separately; retain their literal citation,
    // and require identity with a frozen claim as well as a real locator.
    const frozenTemporal=(g.temporal_facts||[]).length&&record.temporal_claims.some(d=>g.temporal_facts.some(f=>f.claim_id===d.claim_id)&&d.references.some(x=>x.source_type===ref.source_type&&x.filename===ref.filename&&x.locator===ref.locator&&x.snippet===ref.quote));
    if(text&&!compact(text).includes(compact(ref.quote))&&!frozenTemporal)errors.push(g.group_id+': quote is not in source');
   }
  }
 }
 return {references:total,errors,structural_only:true,semantic_correctness_not_proven:true};
}
function buildReferenceQueue(source,output,policy,identities){
 if(output.records.length!==15||new Set(output.records.map(r=>r.id)).size!==15||source.records.map(r=>r.id).sort().join()!==output.records.map(r=>r.id).sort().join())throw Error('A ID identity mismatch');
 const audit=auditReferences(source,output);if(audit.errors.length)throw Error(JSON.stringify(audit));
 const allowed=new Set(Object.keys(policy.reference_classes));
 for(const r of output.records)for(const g of r.groups)if(!allowed.has(g.reference_class)||!g.reason||!g.scope||!g.limitations.length)throw Error('Incomplete semantic group');
 const records=source.records.map(r=>({id:r.id,school:r.school,title:r.title,url:r.url,body_content:r.body_content,attachment_content:r.attachment_content,metadata_content:r.metadata_content,source_conflicts:r.source_conflicts||[],reference_analysis:output.records.find(x=>x.id===r.id)}));
 return {schema_version:1,batch_id:'round2-A-historical-reference-v1',review_kind:'post_blind_reference_development',policy_version:policy.policy_version,as_of:policy.as_of,corpus_sha256:source.corpus_sha256,model_freeze_sha256:source.model_freeze_sha256,...identities,scope:'Exposed A only; no B; semantic groups are provisional development analysis, not ground truth',reference_classes:policy.reference_classes,rubric:policy.rules,records};
}
if(require.main===module){const source=JSON.parse(fs.readFileSync(process.argv[2]));const output=JSON.parse(fs.readFileSync(process.argv[3]));const policyText=fs.readFileSync(process.argv[4],'utf8');const policy=JSON.parse(policyText);const identities={source_registration_queue_sha256:sha(fs.readFileSync(process.argv[2])),reference_prediction_sha256:sha(fs.readFileSync(process.argv[3])),policy_sha256:sha(policyText),registration_human_sha256:process.argv[5]};const queue=buildReferenceQueue(source,output,policy,identities);const body=JSON.stringify(queue);fs.writeFileSync(process.argv[6],body);console.log(JSON.stringify({queue_sha256:sha(body),policy_sha256:identities.policy_sha256,reference_prediction_sha256:identities.reference_prediction_sha256,records:queue.records.length,groups:queue.records.reduce((n,r)=>n+r.reference_analysis.groups.length,0),audit:auditReferences(source,output)}));}
module.exports={buildReferenceQueue,auditReferences};
