"use strict";
// 今日摘要：固定規則組句測試（不呼叫 AI）。執行：node tests/test_daily_brief.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Brief = require("../docs/daily-brief.js");
const Today = require("../docs/today.js");

const today = "2026-10-27";  // 星期二

// 空白的一天：日期句＋結尾提醒
{
  const r = Brief.compose({ today, projection: {}, announcementItems: [] });
  assert.deepStrictEqual(r.lines, ["今天是 10 月 27 日星期二。", "今天沒有已知需要特別注意的事項，祝你順利。"]);
  assert.strictEqual(r.text, r.lines.join(""));
}

// 停課／停班：今天或昨天的公告標題有關鍵字就放在日期句後面；前天的不算
{
  const items = [
    { id: "cysh-9", school: "cysh", school_name: "國立嘉義高級中學", title: "康芮颱風明(28)日停止上班上課", date: "2026-10-27" },
    { id: "cygsh-9", school: "cygsh", school_name: "國立嘉義女子高級中學", title: "因應豪雨停課公告", date: "2026-10-25" },
    { id: "fjsh-9", school: "fjsh", school_name: "私立輔仁高級中學", title: "防颱準備注意事項", date: "2026-10-26" },
  ];
  const r = Brief.compose({ today, projection: {}, announcementItems: items });
  assert.strictEqual(r.lines[1], "停課／停班消息：國立嘉義高級中學・康芮颱風明(28)日停止上班上課、私立輔仁高級中學・防颱準備注意事項。");
  const hidden = Brief.compose({ today, projection: {}, announcementItems: items, isVisible: (i) => i.school !== "fjsh" });
  assert(!hidden.text.includes("輔仁"), "hidden schools are not mentioned");
  assert.strictEqual(Brief.closureNotices(items, today).length, 2, "two-day-old notices are skipped");
}

// 完整的一天：行事曆、期限、待辦、新公告、相關公告、明天
{
  const projection = Today.build({
    today,
    officialEvents: [
      { title: "第一次段考", start_date: "2026-10-27", end_date: "2026-10-28", school_id: "cysh" },
      { title: "校慶預演", date: "2026-10-28", school_id: "cysh" },
    ],
    announcementItems: [
      { id: "cysh-1", title: "獎學金申請", calendar_events: [{ kind: "deadline", date: "2026-10-28", provenance: "verified_announcement_deadline" }] },
      { id: "cysh-2", title: "社團成果發表報名", calendar_events: [{ kind: "deadline", date: "2026-10-27", provenance: "verified_announcement_deadline" }] },
      { id: "cysh-3", title: "很久以後才截止", calendar_events: [{ kind: "deadline", date: "2026-11-05", provenance: "verified_announcement_deadline" }] },
    ],
    tasks: [
      { id: "t1", title: "繳交學習歷程", due_date: "2026-10-27", status: "open" },
      { id: "t2", title: "交週記", due_date: "2026-10-25", status: "open" },
      { id: "t3", title: "下週的事", due_date: "2026-11-02", status: "open" },
    ],
  });
  projection.relevantAnnouncements = [{ title: "高一數學競賽報名開始" }];
  const items = [
    { id: "cysh-10", school: "cysh", school_name: "嘉中", date: "2026-10-27", first_seen: "2026-10-27T08:00:00+08:00" },
    { id: "cysh-11", school: "cysh", school_name: "嘉中", date: "2026-10-26", first_seen: "2026-10-27T01:00:00+08:00" },
    { id: "pksh-1", school: "pksh", school_name: "北港高中", date: "2026-10-27", first_seen: "2026-10-27T09:00:00+08:00" },
    // 新上架學校一次收錄的舊公告：今天才收錄，但公告日期很舊 → 不算今天新增
    { id: "ccjh-1", school: "ccjh", school_name: "竹崎高中", date: "2026-07-01", first_seen: "2026-10-27T04:20:00Z" },
    // 隱藏中的公告不算
    { id: "pksh-2", school: "pksh", school_name: "北港高中", date: "2026-10-27", first_seen: "2026-10-27T09:00:00+08:00", hidden: true },
  ];
  const r = Brief.compose({
    today, nickname: "小明", projection, announcementItems: items, schoolShort: "嘉中",
    isVisible: (item) => !item.hidden,
  });
  assert.strictEqual(r.lines[0], "小明，今天是 10 月 27 日星期二。");
  assert(r.lines.includes("嘉中今天：第一次段考。"), r.lines);
  assert(r.lines.includes("快到期：社團成果發表報名（今天）、獎學金申請（明天）。"), r.lines);
  assert(!r.text.includes("很久以後才截止"), "超過 3 天的期限不放進摘要");
  assert(r.lines.includes("你的待辦有 2 件（含 1 件已過期）：繳交學習歷程、交週記。"), r.lines);
  assert(!r.text.includes("下週的事"));
  assert(r.lines.includes("今天新增 3 則公告：嘉中 2 則、北港高中 1 則。"), r.lines);
  assert(r.lines.includes("與你最相關：高一數學競賽報名開始。"), r.lines);
  assert(r.lines.includes("明天：校慶預演。"), r.lines);
  assert(!r.text.includes("今天沒有已知"), "有內容時不出現空白提醒");
}

// 名稱過多時只列前三項；長標題截短
{
  const events = ["甲", "乙", "丙", "丁", "戊"].map((t) => ({ title: t + "活動" }));
  const r = Brief.compose({ today, projection: { todayEvents: events } });
  assert.strictEqual(r.lines[1], "今天的行事曆：甲活動、乙活動、丙活動 等 5 項。");
  const long = Brief.compose({ today, projection: { relevantAnnouncements: [{ title: "這".repeat(40) }] } });
  assert(long.lines[1].endsWith("…。") && long.lines[1].length < 40);
}

// 今天新增：台灣時間換日（UTC 前一天 16:00 之後算台灣的今天）
{
  const n = Brief.newToday([
    { school_name: "嘉女", date: "2026-10-26", first_seen: "2026-10-26T16:30:00Z" },  // 台灣 10/27 00:30
    { school_name: "嘉女", date: "2026-10-26", first_seen: "2026-10-26T15:30:00Z" },  // 台灣 10/26 23:30
  ], today);
  assert.strictEqual(n.total, 1);
}

// 前端接線：首頁有摘要區、螢幕閱讀器有全文、尊重減少動態設定、不呼叫 AI
{
  const root = path.join(__dirname, "..");
  const index = fs.readFileSync(path.join(root, "docs/index.html"), "utf8");
  const app = fs.readFileSync(path.join(root, "docs/app.js"), "utf8");
  const sw = fs.readFileSync(path.join(root, "docs/sw.js"), "utf8");
  const brief = fs.readFileSync(path.join(root, "docs/daily-brief.js"), "utf8");
  assert.match(index, /id="dailyBrief"[\s\S]*id="dailyBriefText"[^>]*aria-hidden="true"[\s\S]*id="dailyBriefSr"/);
  assert(index.indexOf('src="daily-brief.js?v=2"') > index.indexOf('src="today.js'), "brief loads after today.js");
  assert(index.indexOf('src="daily-brief.js?v=2"') < index.indexOf('src="app.js'), "brief loads before app.js");
  assert(sw.includes("./daily-brief.js?v=2"), "service worker caches the brief module");
  assert.match(app, /prefers-reduced-motion: reduce/, "typewriter respects reduced motion");
  assert.match(app, /el\.dailyBriefSr\.textContent = brief\.text/, "screen readers get the full text at once");
  /* 2026-10-31: members with 問校務 now land on 問校務 (chat); others stay on 公告總庫. */
  assert.match(app, /if \(canAsk && !state\.userPickedTab && \(state\.tab === "latest" \|\| state\.tab === "home"\)\) switchTab\("assistant"\)/, "members with 問校務 land on it until they pick a tab themselves");
  assert.match(app, /el\.tabLatest\.addEventListener\("click", function \(\) \{ pickTab\("latest"\); \}\)/, "tapping a tab marks it as the user's own choice");
  assert.match(app, /if \(el\.nicknameDialog && el\.nicknameDialog\.open\) return;/, "typing waits while the first-run setup dialog is open");
  assert.match(app, /el\.nicknameDialog\.showModal\(\);\s*pauseBrief\(\);/, "opening the setup dialog mid-typing pauses and resets the brief");
  assert.match(app, /el\.nicknameDialog\.addEventListener\("close", function \(\) \{ if \(state\.tab === "home"\) playBrief\(\); \}\)/, "typing starts when the setup dialog closes");
  assert.doesNotMatch(brief + app, /anthropic|openai|claude-|\/v1\/messages/i, "no AI model calls");
}

console.log("Daily brief composer and wiring tests passed");
