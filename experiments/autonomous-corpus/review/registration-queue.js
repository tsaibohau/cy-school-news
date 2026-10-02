function registrationWindows(record,asOf){
 const reminders=record.temporal_claims.filter(d=>d.kind==='application_end'||d.kind==='deadline'&&/registration|submission|application|nomination|grant/i.test(d.purpose));
 return reminders.map((d,i)=>{
  let start=null,startEvidence=null;
  // Both endpoints must appear in the same explicit range in the cited source.
  for(const ref of d.references){const compact=ref.snippet.replace(/\s/g,'');const ranges=compact.matchAll(/(\d{2,4})年(\d{1,2})月(\d{1,2})日[^。至]*?至(?:(\d{2,4})年)?(\d{1,2})月(\d{1,2})日/g);
   for(const m of ranges){const year=x=>Number(x)<1911?Number(x)+1911:Number(x);const iso=(y,month,day)=>`${year(y)}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;if(iso(m[4]||m[1],m[5],m[6])!==d.value)continue;start=iso(m[1],m[2],m[3]);startEvidence={...ref,range_quote:m[0]};}
  }
  return {window_id:record.id+':registration:'+i,purpose:d.purpose,start,end:d.value,start_basis:start?'同一引用原文明確寫出的起訖期間':'未找到可確定的開始日期',end_claim_id:d.claim_id,references:d.references,start_evidence:startEvidence,decision:registrationDecision(start,d.value,asOf)};
 });
}
if(typeof module!=='undefined')module.exports={registrationWindows};
