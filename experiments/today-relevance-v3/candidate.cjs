"use strict";
// Offline ONLY. No import from docs/, Today, Query, Supabase or browser entrypoints.
const Base = require('./vendor/archived-v2-relevance.cjs');
const DAY = 86400000;
function date(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return null;
  const t = Date.parse(v + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v ? v : null;
}
function makeDate(y,m,d) { return date(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`); }
function temporalDates(text) {
  // Exact year-qualified dates with nearby ACTION evidence, never academic year alone.
  const result = [];
  const rx = /(?<!\d)(20\d{2}|1\d{2})\s*(?:年|[./-])\s*(\d{1,2})\s*(?:月|[./-])\s*(\d{1,2})\s*日?/g;
  for (const m of text.matchAll(rx)) {
    const year = Number(m[1]) + (m[1].length === 3 ? 1911 : 0);
    const value = makeDate(year,m[2],m[3]);
    const before = text.slice(Math.max(0,m.index-20),m.index);
    const after = text.slice(m.index+m[0].length,m.index+m[0].length+24);
    const kind = /(?:截止|期限|申請至|報名至|受理至|開放報名至)[^。；]{0,12}$/.test(before) ||
      /^(?:\([^)]*\)|（[^）]*）)?[^。；]{0,12}(?:前.*(?:確認|申請|報名|繳)|截止|止)/.test(after) ? 'deadline' :
      /(?:活動|考試|說明會|研習).{0,8}(?:於|日期|時間)[^。；]{0,8}$/.test(before) ? 'event' : null;
    if (value && kind) result.push({kind,date:value,evidence:m[0],precision:'day'});
  }
  return result;
}
function features(item, asOf) {
  const text = [item.title,item.official_summary,item.content].filter(Boolean).join(' ');
  const teacher = /教師|教職員|同仁|師資/.test(text);
  const student = /學生|同學|高中生|師生/.test(text);
  const teacherOnly = teacher && !student && /教師研習|教職員|教師.{0,6}(?:培訓|增能|訓練|研習)|同仁/.test(text);
  const grades = Base.extractAudience({title:text}).grades.map(Number);
  const source = item.source_observation || {};
  // timeout/403/fetch failure is uncertainty, NOT evidence of removal.
  const confirmedMissing = [404,410].includes(Number(source.http_status)) || source.confirmed_missing === true;
  const sourceUncertain = source.status === 'uncertain' || source.fetch_failed === true;
  const dates = temporalDates(text);
  for (const [key,kind] of [['deadline_date','deadline'],['application_end','deadline'],['event_date','event']]) {
    if (item[key+'_verified'] === true && date(item[key])) dates.push({kind,date:item[key],evidence:key,precision:'day'});
  }
  const future = dates.filter(x=>x.date >= asOf);
  const passed = dates.filter(x=>x.date < asOf);
  const reference = /注意事項|使用規範|提案流程|操作流程|辦法|法規|使用說明/.test(text);
  const explicitAction = /報名|申請|選填|繳交|必須|應於|請於|停課|停班|考程異動|時程異動/.test(text);
  const emergency = /停課|停班|緊急|考程異動|時程異動/.test(text);
  const published = date(item.published_date);
  const firstSeen = date(item.first_seen_date);
  return {confirmedMissing,sourceUncertain,dates,future,passed,reference,explicitAction,emergency,
    audience:{teacher_related:teacher,teacher_only:teacherOnly,student_explicit:student,grades,
      niche:/有興趣|自願|參賽者|參加者/.test(text)},
    publication_age_days:published ? Math.max(0,(Date.parse(asOf)-Date.parse(published))/DAY) : null,
    first_seen_age_days:firstSeen ? Math.max(0,(Date.parse(asOf)-Date.parse(firstSeen))/DAY) : null};
}
function score(item, profile, asOf, opts={}) {
  if (!date(asOf)) throw new Error('explicit valid as_of required');
  const f = features(item,asOf);
  // Explicit allowlist prevents labels/reasons/notes from reaching the reference scorer.
  const input = Object.fromEntries(['id','announcement_id','school','title','category','published_date','first_seen_date'].map(k=>[k,item[k]]));
  const result = Base.todayScore(input,profile,asOf);
  result.features=f;
  const suppress = code => {result.eligible=false;result.reasons.push({code,component:'eligibility'});};
  if(opts.availability) {
    if(f.confirmedMissing) suppress('confirmed_source_missing');
    if(f.sourceUncertain) { result.confidence=Math.min(result.confidence,0.65); result.reasons.push({code:'source_uncertain_not_missing'}); }
  }
  if(opts.temporal) {
    // A passed registration does not kill a separately supported future event/action.
    if(f.passed.length && !f.future.length && !f.emergency) suppress('confirmed_action_ended');
    // Uncertainty itself grants no score, urgency or action.
    const ongoing = f.future.some(x=>x.kind==='event');
    if(ongoing && result.reasons.some(x=>['deadline_passed','verified_date_passed'].includes(x.code))) {
      result.eligible=true; result.reasons=result.reasons.filter(x=>!['deadline_passed','verified_date_passed'].includes(x.code));
      // Reapply independent school/source exclusions after temporal restoration.
      if(input.school && profile.school_id && input.school!==profile.school_id) suppress('school_mismatch');
      if(opts.availability && f.confirmedMissing) suppress('confirmed_source_missing');
    }
  }
  if(opts.audience) {
    // Relation is not exclusivity. No universal teacher penalty; teacher profile stays eligible.
    if(f.audience.teacher_only && profile.role==='student') suppress('explicit_teacher_only_for_student');
    if(profile.grade_level && f.audience.grades.length && !f.audience.grades.includes(Number(profile.grade_level))) suppress('explicit_grade_mismatch');
  }
  if(opts.ageLongLived) {
    // Reference value is not Today action. No old=>hide blanket and no long_lived=>boost.
    if(f.reference && !f.future.length && !f.explicitAction && !f.emergency) suppress('reference_without_current_action');
    const ageReason=result.reasons.find(x=>x.code==='publication_age');
    if(ageReason && f.publication_age_days===null && !f.future.length && !f.emergency) {
      // first_seen means discovery, not publication. It belongs in Latest/unread,
      // not in a fabricated "fresh publication" boost for Today relevance.
      const w=VWeights(),a=ageReason.days;
      const old=a<=7?w.ageFresh:a<=30?w.ageRecent:a<=90?w.ageUseful:a<=180?w.ageStale:w.ageOld;
      result.score=Math.max(0,Math.min(100,result.score-old+w.unknownDate));
      result.components.temporal+=w.unknownDate-old;
      result.reasons.push({code:'publication_unknown_first_seen_not_freshness',component:'temporal'});
    }
    if(f.publication_age_days>90 && f.future.length) {
      const old=f.publication_age_days<=180?VWeights().ageStale:VWeights().ageOld;
      result.score=Math.max(0,Math.min(100,result.score-old));
      result.components.temporal-=old;
      result.reasons.push({code:'old_but_supported_future_action',component:'temporal'});
    }
  }
  // Recompose after primitive corrections to avoid arithmetic on a clipped score.
  result.score=Math.max(0,Math.min(100,result.components.importance+result.components.audience+result.components.temporal));
  return result;
}
function VWeights(){return Base.TodayRankingPolicy.weights;}
module.exports={score,features,date,temporalDates,policy:Base.TodayRankingPolicy};
