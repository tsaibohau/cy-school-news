const fs = require("node:fs");
const path = require("node:path");
const QA = require("../docs/assistant-qa.js");
const cases = require("../tests/fixtures/assistant-qa-cases.json");
const current = require("../tests/fixtures/benchmark-2026-08-30-current.json").items || [];
const archive = require("../tests/fixtures/benchmark-2026-08-30-archive.json").items || [];
const snapshotDetails = require("../tests/fixtures/benchmark-2026-08-30-assistant-details.json");

const seen = new Set();
const items = current.concat(archive).filter(item => item && item.id && !seen.has(item.id) && seen.add(item.id));
const details = snapshotDetails;

function outputText(answer) {
  return [answer.summary, ...(answer.answer_lines || []), answer.limitation].filter(Boolean).join(" ");
}

function judge(test) {
  const answer = QA.answer(test.query, items, details, { asOf: cases.as_of });
  const text = outputText(answer);
  const ids = (answer.sources || []).map(source => source.id);
  const checks = [];
  checks.push(answer.status === "answered");
  if (test.privacy_limited !== undefined) checks.push(Boolean(answer.privacy_limited) === test.privacy_limited);
  if (test.expected_source_ids) checks.push(test.expected_source_ids.every(id => ids.includes(id)));
  if (test.max_sources) checks.push(ids.length <= test.max_sources);
  for (const required of test.required || []) checks.push(text.includes(required));
  for (const forbidden of test.forbidden || []) checks.push(!text.includes(forbidden));
  return { query: test.query, pass: checks.every(Boolean), source_ids: ids, status: answer.status,
    privacy_limited: Boolean(answer.privacy_limited), answer: text };
}

function evaluate(split) {
  const rows = cases[split].map(judge);
  const passed = rows.filter(row => row.pass).length;
  return { split, passed, total: rows.length, accuracy: passed / rows.length, rows };
}

const report = { as_of: cases.as_of, train: evaluate("train"), validation: evaluate("validation") };
if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else for (const result of [report.train, report.validation]) {
  console.log(`${result.split}: ${result.passed}/${result.total}, accuracy=${result.accuracy.toFixed(3)}`);
  for (const row of result.rows.filter(row => !row.pass)) console.log(`  FAIL ${row.query} -> ${row.source_ids.join(",") || "none"}`);
}
if (process.argv.includes("--strict") && (report.train.passed !== report.train.total || report.validation.passed !== report.validation.total)) process.exitCode = 1;
