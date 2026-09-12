"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const authApi = require("../docs/account-auth.js");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "docs", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "docs", "app.js"), "utf8");
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", "20260912061752_announcement_classification_v1_recovery.sql"), "utf8");

assert.match(html, /id="adminClassificationToggle"[^>]*>分類檢視/);
assert.match(html, /id="adminClassificationMain"/);
assert.match(html, /id="adminClassificationSub"/);
assert.match(html, /id="adminClassificationSchool"/);
assert.match(html, /id="adminClassificationYear"/);
assert.match(html, /id="adminClassificationConfidence"/);
assert.match(html, /id="adminClassificationLow"/);
assert.match(html, /id="adminClassificationUnclassified"/);
assert.match(app, /listAnnouncementClassifications\(classificationFilters\(\)\)/);
assert.match(app, /classification_sources/);
assert.match(migration, /create table if not exists private\.announcement_classification/);
assert.match(migration, /create table if not exists private\.announcement_classification_index/);
assert.match(migration, /create or replace function public\.admin_list_announcement_classifications/);

const calls = [];
const client = {
  rpc(name, params) {
    calls.push({ name, params });
    return Promise.resolve({
      data: [
        { announcement_id: "one", sub_category: "midterm", total_count: 2 },
        { announcement_id: "two", sub_category: "mock_exam", total_count: 2 },
      ],
      error: null,
    });
  },
};

authApi.createController({ client }).listAnnouncementClassifications({
  school: "cygsh",
  mainCategory: "academic_exam",
  subCategory: "mock_exam",
  academicYear: "115",
  confidenceMax: 0.6,
  unclassifiedOnly: false,
}).then((rows) => {
  assert.deepEqual(rows.map((row) => row.announcement_id), ["two"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "admin_list_announcement_classifications");
  assert.equal(calls[0].params.school_filter, "cygsh");
  assert.equal(calls[0].params.main_category_filter, "academic_exam");
  assert.equal(calls[0].params.academic_year_filter, 115);
  assert.equal(calls[0].params.confidence_max, 0.6);
  console.log("announcement classification admin contract passed");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
