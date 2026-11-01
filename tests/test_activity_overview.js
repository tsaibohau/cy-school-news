/* 活動總覽：所有學校還能報名的活動，不分學校，依類別與截止日排序；同一活動只列一次。 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const A = require("../docs/activity-overview.js");
const X = require("../docs/cross-school.js");
const registry = require("../docs/school-registry.js");

const today = "2026-11-01";
const item = (id, school, school_name, title, date, category, extra) => Object.assign({ id, school, school_name, title, date, category, url: "https://example.edu.tw/" + id }, extra || {});
const deadline = (date) => ({ calendar_events: [{ kind: "deadline", date }] });
const items = [
  /* one activity, three schools, worded differently */
  item("a1", "cysh", "嘉中", "【元智大學】2026 AI妙用大挑戰", "2026-10-28", "一般", deadline("2026-11-15")),
  item("a2", "cygsh", "嘉女", "【轉知】元智大學「2026 AI妙用大挑戰」高中組，歡迎同學踴躍組隊參加", "2026-10-28", "研習活動"),
  item("a3", "shsh", "正心高中", "元智大學 2026 AI妙用大挑戰－高中組", "2026-10-29", "競賽"),
  item("c1", "cysh", "嘉中", "2027全國高中生中醫體驗營-華佗營", "2026-10-25", "競賽", deadline("2026-11-05")),
  item("s1", "pksh", "北港高中", "社團法人亞信台灣樂學築夢獎助學金開始申請", "2026-10-20", "獎助學金"),
  item("u1", "cysh", "嘉中", "國立中正大學116學年度學士班特殊選才招生資訊", "2026-10-22", "升學", deadline("2026-11-03")),
  /* not activities: closed, results, teachers only, one school's own event, internal */
  item("x1", "cysh", "嘉中", "2026 全國科展報名", "2026-10-01", "競賽", deadline("2026-10-20")),
  item("x2", "cygsh", "嘉女", "賀！本校同學榮獲全國科展第一名", "2026-10-28", "榮譽榜"),
  item("x3", "shsh", "正心高中", "教師數位教學工作坊", "2026-10-28", "研習活動"),
  item("x4", "pksh", "北港高中", "72週年校慶運動會報名表", "2026-10-28", "一般"),
  item("x5", "cysh", "嘉中", "第二次段考考程表", "2026-10-28", "段考考試"),
  item("x6", "cysh", "嘉中", "小論文及閱讀心得切結書繳交提醒", "2026-10-28", "研習活動"),
  /* no deadline: open only while recent */
  item("o1", "cygsh", "嘉女", "國立臺灣師範大學2027教育營「小木偶奇育記」", "2026-10-20", "研習活動"),
  item("o2", "cygsh", "嘉女", "2026 暑期海洋營", "2026-08-01", "研習活動"),
];
const groups = X.build(items, { schools: registry.schools() });
const entries = A.build(items, { groups, today, normalize: (t) => X.normalize(t, []) });
const names = entries.map((e) => e.name);

const ai = entries.find((e) => /AI妙用/.test(e.name));
assert.ok(ai, names.join(" | "));
assert.equal(entries.filter((e) => /AI妙用/.test(e.name)).length, 1, "one entry for one activity");
assert.deepEqual(ai.schools.map((s) => s.school), ["cysh", "cygsh", "shsh"]);
assert.equal(ai.category, "contest", "the title decides: 挑戰 is a contest");
assert.equal(ai.deadline, "2026-11-15");
assert.equal(ai.days_left, 14);
assert.equal(A.deadlineLabel(ai), "11/15 截止・剩 14 天");
assert.equal(entries.find((e) => /華佗營/.test(e.name)).category, "camp", "a camp is a camp even when a school filed it under 競賽");
assert.equal(entries.find((e) => /獎助學金/.test(e.name)).category, "scholarship");
assert.equal(entries.find((e) => /特殊選才/.test(e.name)).category, "admission");
for (const gone of ["全國科展報名", "榮獲", "教師數位", "校慶", "段考", "切結書", "海洋營"]) {
  assert.ok(!names.some((n) => n.includes(gone)), gone + " should not be listed: " + names.join(" | "));
}
const undated = entries.find((e) => /小木偶/.test(e.name));
assert.equal(undated.deadline, "");
assert.equal(A.deadlineLabel(undated), "截止日請看公告");

/* Sorted by category, then soonest deadline, undated last within each category. */
const order = A.CATEGORIES.map((c) => c.id);
entries.forEach((e, i) => { if (i) assert.ok(order.indexOf(entries[i - 1].category) <= order.indexOf(e.category), "category order"); });
const camps = entries.filter((e) => e.category === "camp");
assert.deepEqual(camps.map((e) => e.deadline ? "dated" : "undated"), ["dated", "undated"]);
const flat = A.sort(entries, "deadline");
assert.deepEqual(flat.filter((e) => e.deadline).map((e) => e.deadline), ["2026-11-03", "2026-11-05", "2026-11-15"]);
assert.equal(flat[flat.length - 1].deadline, "");

/* Real data: every listed activity is still open. */
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "docs", "data", "announcements.json"), "utf8"));
const all = data.items || data;
/* "today" = when the data was last scraped (some notices carry future dates). */
const latest = all.map((i) => String(i.first_seen || "").slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
const realToday = latest;
const real = A.build(all, { groups: X.build(all, { schools: registry.schools() }), today: realToday, normalize: (t) => X.normalize(t, []) });
assert.ok(real.length > 20, "real data lists activities");
real.forEach((e) => {
  assert.ok(!e.deadline || e.deadline >= realToday, e.name + " is closed");
  assert.ok(e.schools.length >= 1 && e.name.trim(), "entry has a name and a school");
});
console.log("activity overview tests passed (" + real.length + " open activities)");
