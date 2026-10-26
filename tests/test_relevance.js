const assert = require("assert");
const Relevance = require("../docs/relevance.js");
const Profile = require("../docs/profile.js");
const Registry = require("../docs/school-registry.js");

assert.equal(Registry.find("pksh").short, "北港高中");
assert.equal(Registry.find("pksh").status, "damaged");
assert.equal(Registry.find("pksh").visible, false);
assert.equal(Registry.schools().some((school) => school.id === "pksh"), false);
assert.equal(Registry.mentionedSchool("北高課表"), null, "damaged school aliases are not public assistant scopes");

const audience = Relevance.extractAudience({ title: "高一新生 109班 物理競賽報名" });
assert.deepEqual(audience.grades, [1]);
assert(audience.classes.includes("109"));
assert.deepEqual(Relevance.extractAudience({ title: "101-116 報名資訊" }).classes, []);
assert.equal(Relevance.extractAudience({ title: "全校重要通知" }).all_school, true);

const strong = Relevance.calculate({
  school: "cysh", category: "競賽", title: "高一 109班 物理競賽報名", snippet: "物理",
}, Profile.normalize({ school_id: "cysh", grade_level: 1, class_name: "109", interests: ["物理"], tracked_categories: ["競賽"] }), Registry);
assert.equal(strong.tier, "strong");
assert(strong.reasons.some(x => x.rule === "school_match"));
assert(strong.reasons.some(x => x.rule === "grade_explicit"));
assert(strong.reasons.some(x => x.rule === "class_explicit"));
assert(strong.reasons.some(x => x.rule === "interest"));
assert(Relevance.label(strong).includes("嘉中"));

const mismatch = Relevance.calculate({ school: "cygsh", title: "高一物理競賽" }, Profile.normalize({ school_id: "cysh", grade_level: 1 }), Registry);
assert.equal(mismatch.school_mismatch, true);
assert(!mismatch.reasons.some(x => x.rule === "school_match"));
assert(mismatch.priority < 0);

const allSchool = Relevance.calculate({ school: "cygsh", title: "全校高一通知" }, Profile.normalize({ school_id: "cysh", grade_level: 1 }), Registry);
assert.equal(allSchool.school_mismatch, false);
assert(allSchool.reasons.some(x => x.rule === "grade_explicit"));

// Student-view rules from the 2026-10-26 manual review (嘉中高一).
const Reg = require("../docs/school-registry.js");
const me = { school_id: "cysh", grade_level: 1 };
const why = (title, category) => Relevance.calculate({ id: "x", school: "cysh", title, category }, me, Reg).not_for_me;
assert.equal(why("【複習考】115學年度第一學期高三第三次複習考時間表"), "other_grade");
assert.equal(why("嘉義縣政府辦理新興科技聯盟計畫中心學校教師研習"), "staff_only");
assert.equal(why("鼓勵本校師生及同仁踴躍報名參加講座"), "", "師生 includes students");
assert.equal(why("雲嘉南區國中數學競試－初試試題"), "other_school_level");
assert.equal(why("國立聯合大學116學年度學士班特殊選才招生訊息"), "senior_admission");
assert.equal(Relevance.calculate({ school: "cysh", title: "特殊選才招生簡章" }, { school_id: "cysh", grade_level: 3 }, Reg).not_for_me, "", "seniors still see admissions");
assert.equal(why("【成績校對】115學年度第一學期第一次期中考成績校對通知"), "");
assert.ok(Relevance.calculate({ school: "cysh", title: "400公尺決賽名單" }, me, Reg).reasons.some(r => r.rule === "student_action"));
console.log("Deterministic relevance and audience tests passed");
