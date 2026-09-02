const Search = require("../docs/search-query.js");
const Validity = require("../docs/announcement-validity.js");
const cases = require("../tests/fixtures/search-ranking-cases.json");
const current = require("../docs/data/announcements.json").items || [];
const archive = require("../docs/data/archive.json").items || [];

const seen = new Set();
const items = current.concat(archive).filter(item => item && item.id && !seen.has(item.id) && seen.add(item.id));

function judge(test) {
  const rows = Search.select(items, test.query, { asOf: cases.as_of, validity: Validity });
  const top = rows[0];
  const checks = [];
  if (test.expected_top_ids) checks.push(Boolean(top && test.expected_top_ids.includes(top.item.id)));
  if (test.expected_top_status) {
    const wanted = rows.slice(0, test.top_status_count || 1);
    checks.push(Boolean(wanted.length && wanted.every(row => row.validity && row.validity.status === test.expected_top_status)));
  }
  if (test.forbidden_title) {
    const forbidden = new RegExp(test.forbidden_title);
    checks.push(!rows.some(row => forbidden.test(row.item.title || "")));
  }
  const expectedRank = test.expected_top_ids
    ? rows.findIndex(row => test.expected_top_ids.includes(row.item.id)) + 1
    : (checks.every(Boolean) ? 1 : 0);
  return {
    query: test.query,
    pass: checks.length > 0 && checks.every(Boolean),
    reciprocal_rank: expectedRank ? 1 / expectedRank : 0,
    top_id: top && top.item.id,
    top_title: top && top.item.title,
    result_count: rows.length
  };
}

function evaluate(split) {
  const rows = cases[split].map(judge);
  const passed = rows.filter(row => row.pass).length;
  return {
    split,
    passed,
    total: rows.length,
    accuracy: passed / rows.length,
    mrr: rows.reduce((sum, row) => sum + row.reciprocal_rank, 0) / rows.length,
    rows
  };
}

const report = { as_of: cases.as_of, train: evaluate("train"), validation: evaluate("validation") };
if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  for (const result of [report.train, report.validation]) {
    console.log(`${result.split}: ${result.passed}/${result.total}, accuracy=${result.accuracy.toFixed(3)}, MRR=${result.mrr.toFixed(3)}`);
    result.rows.filter(row => !row.pass).forEach(row => console.log(`  FAIL ${row.query} -> ${row.top_id || "none"} ${row.top_title || ""}`));
  }
}

if (process.argv.includes("--strict") && (report.train.passed !== report.train.total || report.validation.passed !== report.validation.total)) process.exitCode = 1;
