// Experimental retrieval plan only. Does not query or change Production.
function referenceAnswerPlan({topic,school,intent,cycle,candidates,searchStatus='not_checked'}) {
 const matching=candidates.filter(c=>c.topic===topic&&c.school===school&&c.allowed_intents.includes(intent));
 const ordered=matching.filter(c=>/^\d{4}-\d{2}-\d{2}$/.test(c.published_at||'')).sort((a,b)=>b.published_at.localeCompare(a.published_at));
 const sameCycle=ordered.filter(c=>c.cycle===cycle);
 if(sameCycle.length&&['insufficient','no_reference'].includes(sameCycle[0].reference_class))return {mode:'insufficient',source_id:sameCycle[0].id,notice:'本期最新已知來源不足以回答；不能默默沿用同年度舊版。'};
 // Never answer a current legal rule without externally checked effect/version.
 const eligible=sameCycle.filter(c=>c.reference_class!=='insufficient'&&c.reference_class!=='no_reference');
 if(eligible.length){
  if(intent==='current_law'&&eligible[0].current_effect_verified!==true)return {mode:'insufficient',source_id:eligible[0].id,notice:'找到法規來源，但尚未核實其現行效力；不能跳回舊版當作現行規定。'};
  return {mode:'requested_cycle',source_id:eligible[0].id,cycle,notice:'使用符合問題年度與主題的最新已知來源；仍須遵守該來源限制。'};
 }
 const cycleYear=c=>/^\d{4}(?:$|[-/])/.test(c||'')?Number(c.slice(0,4)):null;
 const requestedYear=cycleYear(cycle);
 const history=ordered.filter(c=>c.reference_class!=='insufficient'&&c.reference_class!=='no_reference'&&c.cycle!==cycle&&requestedYear!==null&&cycleYear(c.cycle)!==null&&cycleYear(c.cycle)<requestedYear);
 if(!history.length)return {mode:'insufficient',source_id:null,notice:'沒有足以回答的適用來源；不能推定現行內容。'};
 const prefix=searchStatus==='official_confirmed_unpublished'?'官方已確認本期尚未公布':searchStatus==='searched_not_found'?'尚未找到本期公告':'本輪尚未查核本期最新公告';
 return {mode:'historical_fallback',source_id:history[0].id,cycle:history[0].cycle,notice:prefix+'；以下為前次資料，日期與辦法不能直接套用本期，仍以本期官方公告為準。'};
}
if(typeof module!=='undefined')module.exports={referenceAnswerPlan};
