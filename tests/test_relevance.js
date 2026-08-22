const assert = require("assert");
const Relevance = require("../docs/relevance.js");
const Profile = require("../docs/profile.js");
const Registry = require("../docs/school-registry.js");

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
console.log("Deterministic relevance and audience tests passed");
