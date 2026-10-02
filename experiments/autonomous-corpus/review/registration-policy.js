// Registration reminders only. Never infers persona eligibility or reference value.
function registrationDecision(start,end,asOf,urgentDays=5){
 const parse=x=>/^\d{4}-\d{2}-\d{2}$/.test(x||'')?Date.parse(x+'T00:00:00Z'):NaN;
 const s=parse(start),e=parse(end),now=parse(asOf);
 if(!Number.isFinite(now)||!Number.isFinite(e)||Number.isFinite(s)&&s>e)return {label:null,status:'unknown',reason:'報名起訖不足或矛盾，無法判斷。'};
 const left=(e-now)/86400000;
 if(now>e)return {label:'should_hide',status:'closed',days_remaining:left,reason:`判斷日 ${asOf} 已超過報名截止 ${end}，隱藏這個報名提醒。`};
 if(!Number.isFinite(s))return {label:null,status:'unknown',days_remaining:left,reason:`截止為 ${end}，但缺少開始日期，不能確認現在已開放。`};
 if(now<s)return {label:'optional',status:'upcoming',days_remaining:left,reason:`判斷日 ${asOf} 早於報名開始 ${start}，先列為可選讀／尚未開放。`};
 return left<=urgentDays?{label:'must_show',status:'urgent',days_remaining:left,reason:`${start} ≤ ${asOf} ≤ ${end}，目前可報名，距截止 ${left} 天（≤${urgentDays}天），一定要看。`}:{label:'useful',status:'open',days_remaining:left,reason:`${start} ≤ ${asOf} ≤ ${end}，目前可報名，距截止 ${left} 天（>${urgentDays}天），有用。`};
}
function registrationOverall(windows){
 if(!windows.length)return {label:null,status:'not_applicable',reason:'沒有找到可適用的報名／申請時間，這輪不替它判重要性。'};
 for(const status of ['urgent','open','unknown','upcoming','closed']){const chosen=windows.find(w=>w.decision.status===status);if(chosen)return {...chosen.decision,reason:windows.length>1?'這篇有多組報名時間；先採用仍開放的提醒，未開放與已截止場次分開列出。 '+chosen.decision.reason:chosen.decision.reason};}
}
if(typeof module!=='undefined')module.exports={registrationDecision,registrationOverall};
