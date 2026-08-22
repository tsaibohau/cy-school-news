const assert = require("assert");
const Profile = require("../docs/profile.js");
const Sync = require("../docs/account-sync.js");

const empty = Profile.empty();
assert.equal(empty.schema_version, 1);
assert.equal(empty.grade_level, null);
assert.deepEqual(empty.interests, []);

const cysh = Profile.normalize({
  school_id: "cysh", grade_level: "1", class_name: "109",
  interests: "物理,物理", tracked_categories: ["競賽", "競賽"],
  tracked_keywords: "物理競賽, 選課",
});
assert.deepEqual(cysh, {
  schema_version: 1, school_id: "cysh", grade_level: 1, class_name: "109",
  interests: ["物理"], tracked_categories: ["競賽"],
  tracked_keywords: ["物理競賽", "選課"],
});
assert.equal(Profile.normalize({ grade_level: "10" }).grade_level, null);

const store = { data: {}, getItem(k) { return this.data[k] || null; }, setItem(k, v) { this.data[k] = v; } };
const baseline = { subscriptions: [], reads: [], preferences: { schema_version: 1, preferences: {} } };
const lifecycle = new Sync.AccountLifecycle(baseline, store);
const a = lifecycle.login("uid-a", { subscriptions: [], reads: [], preferences: { schema_version: 1, updated_at: "2026-08-23T00:00:00Z", preferences: { profile: cysh } } });
assert.equal(a.preferences.preferences.profile.school_id, "cysh");
lifecycle.logout();
const b = lifecycle.login("uid-b", { subscriptions: [], reads: [], preferences: { schema_version: 1, updated_at: "2026-08-23T00:00:00Z", preferences: { profile: Profile.normalize({ school_id: "cygsh", grade_level: 2 }) } } });
assert.equal(b.preferences.preferences.profile.school_id, "cygsh");
lifecycle.logout();
const aAgain = lifecycle.login("uid-a");
assert.equal(aAgain.preferences.preferences.profile.school_id, "cysh");
console.log("Profile schema and account namespace tests passed");
