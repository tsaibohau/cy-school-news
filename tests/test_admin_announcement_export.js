"use strict";
const assert = require("node:assert/strict");
const CSV = require("../tools/staging/announcement-csv.js");
const { createHandler } = require("../api/admin-announcement-export.js");
function parseCSV(text) {
  const rows = []; let row = [], cell = "", quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\r" && text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else cell += char;
  }
  return rows;
}
const body = '=這是原文,含「引號」"\r\n第二行\n' + "長文".repeat(20000);
const fixture = { id: "cysh-test", metadata: { school: "cysh", title: "測試公告", url: "https://school.example/1", date: "2026-12-01" }, detail: {
  blocks: [{ type: "paragraph", text: body }, { type: "table", rows: [["A", "B"]] }],
  summary: { text: "不可進入盲標資料" }, verified_dates: [{ label: "模型抽取結果" }],
  attachments: [{ filename: "未讀.pdf", parse_status: "unsupported", parse_reason: "size_limit" }, { filename: "已讀.pdf", embedded_text: "附件原文\n第二行" }],
}, updated_at: "2026-10-06T00:00:00Z" };
const text = CSV.csv([fixture], "2026-10-06T12:00:00Z");
assert(text.startsWith("\uFEFF"));
const [columns, values] = parseCSV(text), row = Object.fromEntries(columns.map((key, index) => [key, values[index]]));
assert.equal(values.length, columns.length);
assert.equal(row.body_content.slice(1), body + "\n\nA\tB", "Excel-safe prefix must be reversible without changing source text");
assert(JSON.parse(row.csv_escaped_columns).includes("body_content"));
assert.equal(row.published_at, "", "index dates must not become official publish dates");
assert.equal(row.source_index_date, "2026-12-01");
assert.equal(row.content_updated_at, fixture.updated_at);
assert.equal(JSON.parse(row.detail_json).blocks[0].text, body);
assert(!row.detail_json.includes("不可進入盲標資料"));
assert(!row.detail_json.includes("模型抽取結果"));
assert.equal(JSON.parse(row.attachment_content)[0].status, "unread");
assert.equal(JSON.parse(row.attachment_content)[0].reason, "size_limit");
assert.equal(JSON.parse(row.attachment_content)[1].text, "附件原文\n第二行");
assert.equal(CSV.project({ id: "cygsh-missing", detail: null }, "now").body_status, "missing");
assert.equal(CSV.project({ id: "cygsh-empty", detail: { blocks: [] } }, "now").body_status, "empty");
assert.throws(() => CSV.verifyBatch(["a", "b"], [{ id: "a" }]));
assert.throws(() => CSV.verifyBatch(["a", "b"], [{ id: "a" }, { id: "a" }]));
assert.throws(() => CSV.verifyBatch(["a"], [{ id: "b" }]));
assert.equal(parseCSV(CSV.csv(Array.from({ length: 1001 }, (_, i) => ({ ...fixture, id: "cysh-" + i, detail: { blocks: [] } })), "now")).length, 1002);
const catalog = new Map(Array.from({ length: 9 }, (_, i) => ["cysh-" + i, { school: "cysh", title: "公告 " + i }]));
function response() {
  return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; } };
}
async function invoke({ role = "owner", status = "approved", token = "a".repeat(30), ids = ["cysh-0"], failing = false, mismatch = false, method = "POST", authStatus = 200, oversized = false } = {}) {
  const calls = [];
  const handler = createHandler({ config: { url: "https://preview.example", key: "public" }, metadata: catalog,
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer " + token);
      assert(url.endsWith("/current_account_access") || url.endsWith("/member_announcement_detail"), "only existing read-only RPCs may be used");
      if (url.endsWith("/current_account_access")) return { ok: authStatus === 200, status: authStatus, json: async () => [{ status, admin_role: role }] };
      if (failing) return { ok: false, status: 500 };
      return { ok: true, json: async () => [{ announcement_id: mismatch ? "cysh-other" : JSON.parse(options.body).target_announcement_id, detail: oversized ? "a".repeat(3500001) : fixture.detail }] };
    } });
  const res = response(); await handler({ method, headers: { authorization: token ? "Bearer " + token : "" }, body: { ids } }, res);
  assert.equal(res.headers["Cache-Control"], "private, no-store, max-age=0");
  return { res, calls };
}
(async () => {
  for (const role of ["co_admin", "member", null]) {
    const { res, calls } = await invoke({ role }); assert.equal(res.code, 403); assert.equal(calls.length, 1);
  }
  assert.equal((await invoke({ status: "pending" })).res.code, 403);
  assert.equal((await invoke({ token: "" })).res.code, 401);
  assert.equal((await invoke({ authStatus: 401 })).res.code, 401);
  assert.equal((await invoke({ method: "GET" })).res.code, 405);
  for (const ids of [[], ["cysh-0", "cysh-0"], ["cysh-unknown"], ["../secret"], Array.from(catalog.keys())]) assert.equal((await invoke({ ids })).res.code, 400);
  const result = await invoke({ ids: Array.from(catalog.keys()).slice(0, 8) });
  assert.equal(result.res.code, 200); assert.equal(result.res.body.records.length, 8); assert.equal(result.calls.length, 9);
  assert.deepEqual(result.res.body.records.map(r => r.id), Array.from(catalog.keys()).slice(0, 8));
  assert.equal((await invoke({ failing: true })).res.code, 502);
  assert.equal((await invoke({ mismatch: true })).res.code, 502);
  assert.equal((await invoke({ oversized: true })).res.code, 413);
  process.env.VERCEL_ENV = "production"; assert.equal((await invoke()).res.code, 404); delete process.env.VERCEL_ENV;
  console.log("PASS: CSV round-trip, 1001 rows, dates, missing/attachments, owner authorization, batch integrity, errors, production guard");
})().catch(error => { console.error(error); process.exitCode = 1; });
