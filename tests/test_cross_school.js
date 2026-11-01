/* 跨校比對：同一項活動在不同學校的公告歸成一組，不同活動不可合併。 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const X = require("../docs/cross-school.js");
const registry = require("../docs/school-registry.js");

const schools = registry.schools();
const item = (id, school, school_name, title, date, extra) => Object.assign({ id, school, school_name, title, date, category: "競賽", url: "https://example.edu.tw/" + id }, extra || {});

/* Same activity, forwarded with different wording, a school's own tag, AD vs ROC year. */
let groups = X.build([
  item("a1", "cysh", "嘉中", "【元智大學】2026 AI妙用大挑戰", "2026-10-28", { first_seen: "2026-10-28T10:12:15+08:00", calendar_events: [{ kind: "deadline", date: "2026-11-15" }] }),
  item("a2", "cygsh", "嘉女", "【轉知】元智大學「2026 AI妙用大挑戰」高中組，歡迎同學踴躍組隊參加", "2026-10-28", { first_seen: "2026-10-28T17:34:56+08:00" }),
  item("a3", "shsh", "正心高中", "元智大學 2026 AI妙用大挑戰－高中組", "2026-10-29"),
  item("a4", "pksh", "北港高中", "轉知-元智大學「2026 AI妙用大挑戰」高中組活動海報", "2026-10-30"),
  /* not the same: another activity by the same university */
  item("b1", "cysh", "嘉中", "元智大學「2026 程式設計營」", "2026-10-28"),
  /* school-internal notices never group across schools */
  item("c1", "cysh", "嘉中", "115學年度第1學期第二次段考考程表", "2026-10-20"),
  item("c2", "cygsh", "嘉女", "115學年度第1學期第二次段考考程表", "2026-10-21"),
], { schools, today: "2026-10-31" });
assert.equal(groups.length, 1, JSON.stringify(groups.map(g => g.name)));
let g = groups[0];
assert.deepEqual(g.schools.map(s => s.school), ["cysh", "cygsh", "shsh", "pksh"], "ordered by posting date");
assert.equal(g.first_date, "2026-10-28");
assert.equal(g.last_date, "2026-10-30");
assert.equal(g.spread_days, 2);
assert.deepEqual(g.schools.map(s => s.lag_days), [0, 0, 1, 2]);
assert.equal(g.organizer, "元智大學");
assert.equal(g.deadline, "2026-11-15", "verified deadline is shared with the whole group");
assert.match(g.name, /AI妙用大挑戰/);

/* Editions, sessions, organizers and years keep look-alike notices apart. */
groups = X.build([
  item("e1", "cysh", "嘉中", "正修科技大學「第七屆競化盃電競錦標賽」", "2026-10-20"),
  item("e2", "cygsh", "嘉女", "正修科技大學「第七屆競化盃電競錦標賽」", "2026-10-21"),
  item("e3", "fjsh", "輔仁高中", "正修科技大學2026「第八屆競化盃電競錦標賽」", "2026-10-23"),
  item("e4", "pksh", "北港高中", "正修科技大學「第八屆競化盃電競錦標賽」", "2026-10-24"),
  item("s1", "cysh", "嘉中", "115年度學生學習歷程檔案分享會系列活動第2場次分享會實施計畫", "2026-09-22"),
  item("s2", "cygsh", "嘉女", "【轉知】115年度學生學習歷程檔案分享會系列活動第2場次分享會實施計畫", "2026-09-23"),
  item("s3", "shsh", "正心高中", "115年度學生學習歷程檔案分享會系列活動第3場次分享會實施計畫", "2026-10-28"),
  item("s4", "pksh", "北港高中", "【轉知】115年度學生學習歷程檔案分享會系列活動第3場次分享會實施計畫", "2026-10-29"),
  item("u1", "cysh", "嘉中", "國立中正大學116學年度學士班特殊選才招生資訊", "2026-10-22"),
  item("u2", "cygsh", "嘉女", "【轉知】國立中正大學116學年度學士班特殊選才招生資訊", "2026-10-22"),
  item("u3", "shsh", "正心高中", "真理大學116學年度學士班特殊選才招生資訊", "2026-10-22"),
  item("u4", "pksh", "北港高中", "轉知：真理大學116學年度學士班特殊選才招生資訊", "2026-10-23"),
], { schools });
const sets = groups.map(x => x.schools.map(s => s.id).sort().join(",")).sort();
assert.deepEqual(sets, ["e1,e2", "e3,e4", "s1,s2", "s3,s4", "u1,u2", "u3,u4"], sets.join(" | "));

/* A deadline before anyone posted is an old date, not this group's. */
groups = X.build([
  item("d1", "cysh", "嘉中", "南華大學116學年度學士班特殊選才招生簡章", "2026-10-27", { calendar_events: [{ kind: "deadline", date: "2026-10-06" }] }),
  item("d2", "cygsh", "嘉女", "【轉知】南華大學116學年度學士班特殊選才招生簡章", "2026-10-28"),
], { schools });
assert.equal(groups[0].deadline, "");

/* Notices more than 60 days apart are different rounds. */
groups = X.build([
  item("r1", "cysh", "嘉中", "「青年百億海外圓夢基金計畫」成果展", "2026-07-01"),
  item("r2", "cygsh", "嘉女", "「青年百億海外圓夢基金計畫」成果展", "2026-07-20"),
  item("r3", "shsh", "正心高中", "「青年百億海外圓夢基金計畫」成果展", "2026-08-25"),
  item("r4", "pksh", "北港高中", "「青年百億海外圓夢基金計畫」成果展", "2026-10-20"),
], { schools });
groups.forEach(x => assert.ok(x.spread_days <= 60, x.first_date + "~" + x.last_date));

/* School speed and 「還沒公告」. */
const fixed = X.build([
  item("a1", "cysh", "嘉中", "國家太空中心辦理「2027 ATZ-G 零重力實驗提案競賽」", "2026-10-28"),
  item("a2", "cygsh", "嘉女", "【轉知】國家太空中心「2027 ATZ-G 零重力實驗提案競賽」", "2026-10-30"),
  item("a3", "shsh", "正心高中", "2027 ATZ-G 零重力實驗提案競賽", "2026-10-31"),
], { schools });
assert.equal(X.missingFor(fixed, "pksh").length, 1);
assert.equal(X.missingFor(fixed, "cysh").length, 0);
const speed = X.schoolSpeed(fixed, 1);
assert.equal(speed[0].school, "cysh");
assert.equal(speed[0].first_count, 1);

/* 問校務: 「哪些學校有公告 …」 finds the group and answers with the timeline. */
assert.ok(X.asksAcrossSchools("哪些學校有公告 ATZ-G 零重力實驗提案競賽？"));
assert.ok(!X.asksAcrossSchools("ATZ-G 零重力實驗提案競賽什麼時候截止"));
const found = X.find(fixed, "哪些學校有公告 ATZ-G 零重力實驗提案競賽？");
assert.ok(found);
const reply = X.answer(found, { today: "2026-10-31", schoolId: "pksh", query: "哪些學校有公告" });
assert.match(reply.reply.text, /有 3 間學校公告過（國家太空中心）。最早是嘉中 10\/28，最晚是正心高中 10\/31，前後差 3 天/);
assert.match(reply.reply.text, /你的學校還沒公告這項/);
assert.deepEqual(reply.sources.map(s => s.note), ["最早", "晚 2 天", "晚 3 天"]);
assert.equal(X.find(fixed, "哪些學校有公告 社團博覽會"), null);

/* Real data: fast enough for a phone, and no group mixes two editions or spans > 60 days. */
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "docs", "data", "announcements.json"), "utf8"));
const items = data.items || data;
const started = Date.now();
const real = X.build(items, { schools });
const took = Date.now() - started;
assert.ok(took < 4000, "cross-school matching took " + took + "ms");
real.forEach(x => {
  assert.ok(x.schools.length >= 2);
  assert.ok(x.spread_days <= 60, x.name);
  /* Each title's own editions (one title may name two: 「第27屆亞洲…及第57屆國際…」). */
  const editionSets = new Set(x.schools.map(s => X.editions(s.title).filter(e => e.startsWith("屆")).sort().join("+")).filter(Boolean));
  const lists = [...editionSets].map(v => v.split("+"));
  assert.ok(lists.every(a => lists.every(b => a.some(e => b.includes(e)))), x.name + " mixes " + [...editionSets].join(" / "));
  assert.ok(!x.deadline || x.deadline >= x.first_date, x.name + " deadline before first post");
});
console.log("cross-school tests passed (" + real.length + " groups, " + took + "ms)");
