const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const V=require("../docs/announcement-validity.js"),QA=require("../docs/assistant-qa.js"),AS_OF="2026-08-30",root=path.resolve(__dirname,"..");
function rows(file){const x=JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));return Array.isArray(x)?x:x.items||x.announcements||[];}
const all=rows("docs/data/announcements.json").concat(rows("docs/data/archive.json"));
function item(id){const x=all.find(r=>r.id===id);assert(x,`missing ${id}`);return x;}
function answer(q,ids){return QA.answer(q,ids.map(item),{},{asOf:AS_OF});}
function text(r){return[r.summary,...(r.answer_lines||[]),r.limitation].filter(Boolean).join(" ");}
const types={"cygsh-186371":"DEADLINE","fjsh-2367":"DEADLINE","cysh-130321":"REGULATION_AMENDMENT","cysh-136310":"EMERGENCY","cysh-130338":"REGULATION_AMENDMENT","cysh-131068":"REGULATION_AMENDMENT","cysh-132504":"GENERAL_INFORMATION","cygsh-186281":"GENERAL_INFORMATION","cysh-116561":"GENERAL_INFORMATION","cygsh-186347":"DEADLINE_MODIFICATION","cygsh-186385":"GENERAL_INFORMATION","cygsh-186135":"GENERAL_INFORMATION","cysh-136198":"DEADLINE","cysh-128907":"EMERGENCY"};
for(const[id,type]of Object.entries(types)){const a=V.analyze(item(id),null,{asOf:AS_OF});assert.equal(a.source,"human_review");assert.equal(a.document_type,type);assert(a.fragments.length);}
let r=answer("現在自主學習計畫怎麼填",["cygsh-186371"]);assert.match(text(r),/8 節次/);assert.match(text(r),/預設密碼/);
r=answer("現在能申請表演藝術補助嗎",["fjsh-2367"]);assert.match(text(r),/2026-09-01/);assert.match(text(r),/尚不能送件/);
r=answer("現在出差住宿費能報多少",["cysh-130321"]);assert.match(text(r),/規定存在/);assert.match(text(r),/不能.*推測/);
r=answer("下次豪雨時新生訓練怎麼辦",["cysh-136310"]);assert.match(text(r),/結束/);assert.equal(r.sources[0].validity.status,"EXPIRED");
r=answer("目前志願服務紀錄冊怎麼辦理",["cysh-130338","cysh-131068"]);assert.match(r.summary,/修正或補充/);assert.match(text(r),/基礎文件/);assert.match(text(r),/只更正/);
r=answer("115學年度新生現在怎麼訂制服",["cysh-132504"]);assert.equal(r.sources[0].validity.status,"EXPIRED");
r=answer("現在能報名跨越盃嗎",["cygsh-186281"]);assert.match(text(r),/無法確認/);
r=answer("現在校外維護要用哪種VPN",["cysh-116561"]);assert.match(text(r),/IPSec VPN/);
r=answer("現在還能報名海洋保育短影音競賽嗎",["cygsh-186347"]);assert.match(text(r),/延長至 2026-09-30/);
r=answer("這學期綜合活動怎麼安排",["cygsh-186385"]);assert.match(text(r),/08\.28 修正版/);
r=answer("目前音樂比賽鋼琴調音標準",["cygsh-186135"]);assert.match(text(r),/A=442Hz/);assert(!r.answer_lines.some(x=>/確切決賽日期/.test(x)));
r=answer("現在還能選多元選修嗎",["cysh-136198"]);assert.match(text(r),/不能再選課/);assert.match(text(r),/自動分發/);
r=answer("現在雙聯學制說明會何時舉行",["cysh-128907"]);assert.match(text(r),/結束|最新公告/);assert.equal(r.sources[0].validity.status,"EXPIRED");
console.log("Reviewed real-announcement validity cases passed");
