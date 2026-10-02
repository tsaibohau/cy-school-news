// V2 keeps original temporal claims immutable.
function publicationEvidence(record){
 for(const u of record.metadata_content||[]){
  const m=u.text.match(/(?:發佈日期|發布日期|公告日期)\s*[:：]?\s*(\d{2,4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if(m){const y=Number(m[1])<1911?Number(m[1])+1911:Number(m[1]);const value=`${y}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;if(Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value)return {value,source_type:'metadata',filename:'公告發布資訊',locator:u.locator,snippet:u.text};}
 }
 return null;
}
function registrationWindows(record,asOf){
 const publication=publicationEvidence(record);
 const reminders=record.temporal_claims.filter(d=>d.kind==='application_end'||d.kind==='deadline'&&/registration|submission|application|nomination|grant/i.test(d.purpose));
 return reminders.map((d,i)=>{
  let start=null,startEvidence=null,end=d.value,immediate=null,endBasis=d.year_basis?'原時間分析的年份依據：'+d.year_basis:'原文明確年份';
  // Both endpoints must appear in the same explicit range in the cited source.
  for(const ref of d.references){const compact=ref.snippet.replace(/\s/g,'');const ranges=compact.matchAll(/(?:(\d{2,4})年)?(\d{1,2})月(\d{1,2})日[^。至]*?至(?:(\d{2,4})年)?(\d{1,2})月(\d{1,2})日/g);
   for(const m of ranges){if(!m[1]&&!publication)continue;const rangeYear=m[1]||publication.value.slice(0,4);const year=x=>Number(x)<1911?Number(x)+1911:Number(x);const iso=(y,month,day)=>`${year(y)}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;if(iso(m[4]||rangeYear,m[5],m[6])!==d.value)continue;start=iso(rangeYear,m[2],m[3]);startEvidence={...ref,range_quote:m[0]};if(!m[1])endBasis='起訖原文未標年份，以公告發布年份補足';}
  }
  // Immediate opening must be paired with this deadline, not an unrelated clause.
  const md=d.value.slice(5).split('-').map(Number);
  const datePattern=new RegExp(`(?:0?${md[0]}月0?${md[1]}日|0?${md[0]}[./]0?${md[1]})(?![0-9])`);
  const searchRefs=[...d.references,...(record.body_content||[]).map(u=>({source_type:'body',filename:'公告正文',locator:u.locator,snippet:u.text})),...(record.attachment_content||[]).flatMap(a=>(a.content?.units||[]).map(u=>({source_type:'attachment',filename:a.filename,locator:u.locator,snippet:u.text})))];
  for(const ref of searchRefs){
   for(const compact of ref.snippet.replace(/\s/g,'').split(/[。；;]/)){
    if(new RegExp('即日起[^。；]{0,40}?(?:至|到|～|~)[^。；]{0,15}?'+datePattern.source).test(compact))immediate={...ref,range_quote:compact};
   }
  }
  const explicitYear=/\d{2,4}\s*(?:年|[./-]\d{1,2}[./-])/.test(d.raw_value||'');
  if(!explicitYear&&!d.year_basis&&!start){
   const m=(d.raw_value||'').match(/(\d{1,2})\s*(?:月|[/.-])\s*(\d{1,2})/);
   if(m&&publication){end=publication.value.slice(0,4)+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0');endBasis='原文未標年份，以公告發布年份補足；不自動改成隔年';}
   else if(m){end=null;endBasis='原文未標年份，也缺少可核實的公告發布日，不能補年';}
  }
  if(!start&&immediate&&publication){start=publication.value;startEvidence=immediate;}
  const startBasis=start?(immediate&&start===publication?.value?'原文寫「即日起」，以公告發布日推定開始；轉貼日可能晚於原始開放日':'同一引用原文明確寫出的起訖期間'+(endBasis.includes('公告發布年份')?'；年份以公告發布年份補足':'')):(immediate?'已找到「即日起」，但缺少可核實的公告發布日，開始日仍未知':'未找到可確定的開始日期');
  return {window_id:record.id+':registration:'+i,purpose:d.purpose,start,end,start_basis:startBasis,end_basis:endBasis,end_claim_id:d.claim_id,references:d.references,start_evidence:startEvidence,immediate_evidence:immediate,publication_evidence:publication,decision:registrationDecision(start,end,asOf)};
 });
}
if(typeof module!=='undefined')module.exports={registrationWindows,publicationEvidence};
