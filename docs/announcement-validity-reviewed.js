/* Human-reviewed validity records. These annotations never authorize deletion. */
(function(root,factory){var api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;root.CyNewsAnnouncementValidityReviewed=api;})(typeof window!=="undefined"?window:this,function(){
"use strict";
var R={
"cygsh-186371":{document_type:"DEADLINE",fragments:[
 {id:"plan",text:"自主學習計畫須於 2026-08-31 晚上 12:00 前填寫完畢。",valid_until:"2026-08-31",keywords:"自主學習 計畫 怎麼填 截止"},
 {id:"room",text:"共學或特殊教室需求須於 2026-08-31 中午 12:00 前填寫表單。",valid_until:"2026-08-31",keywords:"自主學習 計畫 共學 特殊教室 表單"},
 {id:"credentials",text:"本次系統更新後，帳號與預設密碼目前都是學號，登入後應更改密碼。",valid_until:"2026-08-31",keywords:"自主學習 計畫 怎麼填 帳號 預設密碼"},
 {id:"weeks",text:"本次自主學習計畫可填 8 節次（8 週）；空白週次仍須填寫「無」才能送出。",valid_until:"2026-08-31",keywords:"自主學習 計畫 怎麼填 8週 週次"}]},
"fjsh-2367":{document_type:"DEADLINE",warnings:["申請資格與完整細節仍須核對附件。"],fragments:[
 {id:"window",text:"本次補助申請自 2026-09-01 起至 2026-09-30 止；2026-08-30 尚不能送件。",valid_from:"2026-09-01",valid_until:"2026-09-30",keywords:"表演藝術 補助 申請 報名 送件"},
 {id:"prep",text:"申請前可先閱讀審查須知、準備表件並自行接洽演出場地。",valid_until:"2026-09-30",keywords:"表演藝術 補助 申請 準備 表件 場地"},
 {id:"venue",text:"116年度音樂廳與文化廣場不開放申請；演講廳自 2027-04-01 起開放申請。",valid_until:"2027-12-31",keywords:"表演藝術 場地 音樂廳 演講廳"}]},
"cysh-130321":{document_type:"REGULATION_AMENDMENT",warnings:["附件尚未取得可讀文字，不能猜測具體金額。"],fragments:[
 {id:"rule",text:"嘉義高中差旅費支給標準及補充規定自 2025-01-01 生效，目前可確認規定存在。",valid_from:"2025-01-01",persistence:"until_superseded",keywords:"差旅費 出差 住宿費 標準 規定"},
 {id:"amount",text:"具體住宿費金額位於尚未讀取的附件，不能由目前資料推測。",status:"UNCONFIRMED",answer_policy:"warn",keywords:"差旅費 出差 住宿費 金額"}]},
"cysh-136310":{document_type:"EMERGENCY",status_override:"EXPIRED",warnings:["本次臨時措施已結束；下次豪雨必須查找最新公告。"],fragments:[{id:"event",text:"本公告只處理 2026-08-25 至 2026-08-27 的豪雨與新生訓練、健康檢查調整。",valid_from:"2026-08-25",valid_until:"2026-08-27",keywords:"豪雨 新生訓練 健康檢查"}]},
"cysh-130338":{document_type:"REGULATION_AMENDMENT",warnings:["辦理細節位於尚未讀取的附件。"],fragments:[{id:"base",text:"2024-11-12 發布的志願服務證及服務紀錄冊管理辦法修正版仍是基礎文件。",valid_from:"2024-11-12",persistence:"until_superseded",keywords:"志願服務 服務紀錄冊 管理辦法 辦理"}],relations:[{type:"CORRECTED_BY",target_id:"cysh-131068",scope:"第四條、第十一條及其對照表"}]},
"cysh-131068":{document_type:"REGULATION_AMENDMENT",warnings:["更正後的完整條文仍須讀取附件。"],fragments:[{id:"errata",text:"本文件只更正原管理辦法的第四條、第十一條及修正條文對照表；其餘內容仍沿用原修正版。",valid_from:"2025-02-21",persistence:"until_superseded",keywords:"志願服務 服務紀錄冊 勘誤 辦理"}],relations:[{type:"CORRECTS_PART",target_id:"cysh-130338",scope:"第四條、第十一條及其對照表"}]},
"cysh-132504":{document_type:"GENERAL_INFORMATION",status_override:"EXPIRED",warnings:["115學年度新生不可沿用 2025 年表單，應查找 2026 公告。"],fragments:[
 {id:"order",text:"2025 新生制服線上訂購表單已於 2025-07-16 截止。",valid_until:"2025-07-16",keywords:"新生 制服 訂購 表單"},
 {id:"change",text:"2025 訂購數量更改已於 2025-07-17 截止。",valid_until:"2025-07-17",keywords:"新生 制服 更改 數量"},
 {id:"batch",text:"尺寸更換與不得退貨的限制只適用 2025 年這一批訂購。",valid_until:"2025-12-31",keywords:"新生 制服 尺寸 退換"}]},
"cygsh-186281":{document_type:"GENERAL_INFORMATION",warnings:["應提供官方入口並核對附件後再確認報名狀態。"],fragments:[
 {id:"exists",text:"可確認 2027 第3屆跨越盃全國數學能力競賽存在。",status:"ACTIVE",keywords:"跨越盃 數學 競賽"},
 {id:"registration",text:"報名期限與競賽日期只在尚未讀取的附件中，目前無法確認是否可報名。",status:"UNCONFIRMED",answer_policy:"warn",keywords:"跨越盃 數學 競賽 報名 日期"},
 {id:"disaster",text:"天災條款只是備用處理方式，不能據此判定競賽已延期。",status:"ACTIVE",keywords:"跨越盃 天災 延期"}]},
"cysh-116561":{document_type:"GENERAL_INFORMATION",fragments:[
 {id:"procedure",text:"校外維護校內設備須使用 VPN，帳號密碼需另行申請並提供維修設備 IP。",persistence:"until_superseded",keywords:"VPN 校外 維護 帳號"},
 {id:"ssl",text:"SSL VPN 僅適用至 2026-06-19，之後不再是現行方法。",valid_until:"2026-06-19",keywords:"SSL VPN 校外 維護"},
 {id:"ipsec",text:"自 2026-06-20 起，校外維護改用 IPSec VPN。",valid_from:"2026-06-20",persistence:"until_superseded",keywords:"IPSec VPN 校外 維護 現在 哪種 方法"}]},
"cygsh-186347":{document_type:"DEADLINE_MODIFICATION",fragments:[
 {id:"deadline",text:"2026 海洋保育創意短影音競賽報名期限已由 2026-08-21 延長至 2026-09-30，目前仍可報名。",valid_until:"2026-09-30",keywords:"海洋保育 短影音 競賽 報名 延長"},
 {id:"guide",text:"其他規則應以修訂後活動簡章為準；未修訂部分可能繼續有效。",valid_until:"2026-09-30",keywords:"海洋保育 短影音 簡章 規則"}],relations:[{type:"EXTENDS_DEADLINE",target_id:null,scope:"報名截止日"}]},
"cygsh-186385":{document_type:"GENERAL_INFORMATION",fragments:[{id:"schedule",text:"115學年度第一學期綜合活動應使用 08.28 修正版配當表；整張表只適用本學期。",valid_from:"2026-08-28",valid_until:"2027-01-31",keywords:"綜合活動 配當表 安排 修正版 本學期"}],relations:[{type:"REPLACES_PART",target_id:null,scope:"08.28 修正的格子"}]},
"cygsh-186135":{document_type:"GENERAL_INFORMATION",fragments:[
 {id:"tuning",text:"學生音樂比賽鋼琴調音標準為 A=442Hz；此規則跨學年度有效，直到官方修正。",persistence:"until_superseded",keywords:"音樂比賽 鋼琴 調音 A 442Hz 標準"},
 {id:"finals",text:"115學年度決賽預定於 2027 年 3 月辦理，2026-08-30 尚未開始。",valid_from:"2027-03-01",valid_until:"2027-03-31",keywords:"音樂比賽 決賽 賽程 日期"},
 {id:"schedule",text:"確切決賽日期與賽程尚未公布，預計於 2027-01-15 前公告。",status:"UNCONFIRMED",answer_policy:"warn",keywords:"音樂比賽 決賽 賽程 日期"}]},
"cysh-136198":{document_type:"DEADLINE",fragments:[
 {id:"window",text:"115-1 高一多元選修選課窗口已於 2026-08-27 23:59 結束，現在不能再選課。",valid_from:"2026-08-25",valid_until:"2026-08-27",answer_policy:"current_negative",keywords:"高一 多元選修 選課 現在 還能"},
 {id:"assignment",text:"未選填者由系統自動分發，且不接受事後換課。",valid_from:"2026-08-28",valid_until:"2027-01-31",keywords:"高一 多元選修 選課 現在 還能 自動分發 換課"},
 {id:"outline",text:"公告附件中的課程大綱只供 115-1 本學期使用。",valid_until:"2027-01-31",keywords:"高一 多元選修 課程大綱"}]},
"cysh-128907":{document_type:"EMERGENCY",status_override:"EXPIRED",warnings:["兩年前的延期承諾只保留歷史；目前日期必須查找最新公告。"],fragments:[{id:"cancelled",text:"2024-08-05 的雙聯學制實體說明會已取消。",valid_until:"2024-08-05",keywords:"雙聯學制 說明會 取消"},{id:"unknown",text:"舊公告只承諾延期，沒有可供目前使用的新日期。",status:"EXPIRED",answer_policy:"exclude",keywords:"雙聯學制 說明會 延期 日期"}]}
};
function clone(v){return v?JSON.parse(JSON.stringify(v)):null;}function get(id){return clone(R[String(id||"")]);}return{get:get,ids:function(){return Object.keys(R);}};
});
