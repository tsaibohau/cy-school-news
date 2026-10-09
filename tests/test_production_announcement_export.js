"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const Source = require("../docs/admin-announcement-export-source.js");
const CSV = require("../docs/announcement-csv.js");
const read = file => fs.readFileSync(require("node:path").join(__dirname, "..", file), "utf8");
const ids = Array.from({ length: 8 }, (_, i) => "cysh-" + i);
const catalog = ids.map(id => ({ id, metadata: { school: "cysh", title: id } }));
function auth(overrides = {}) {
  return { getVerifiedSession: async () => ({ user: { id: "owner" }, access_token: "real-session" }),
    getAccountAccess: async () => ({ status: "approved", admin_role: "owner" }),
    getMemberAnnouncementIndex: async () => [{ announcement_id: "cysh-database-only", summary: "not source text" }],
    getMemberAnnouncementDetail: async id => ({ announcement_id: id, detail: { announcement_id: id, blocks: [{ type: "paragraph", text: "完整原文\n" + "長文".repeat(20000) }] } }),
    onAuthStateChange: async () => {}, ...overrides };
}
async function uiFlow() {
  // Exercise the actual UI event handlers with an owner session, without a real DB.
  const nodes = new Map();
  class Element {
    constructor(id) { this.id = id; this.dataset = {}; this.listeners = {}; this.children = []; this.value = ""; this.hidden = false; if (id) nodes.set(id, this); }
    setAttribute(k, v) { this[k] = v; }
    removeAttribute(k) { delete this[k]; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.append(child); }
    replaceChildren() { this.children = []; }
    addEventListener(event, handler) { this.listeners[event] = handler; }
    querySelector() { return this; }
    insertAdjacentElement() {}
    set innerHTML(html) {
      for (const match of html.matchAll(/id="([^"]+)"/g)) new Element(match[1]);
      nodes.get("announcementExportSchool").value = "all";
      nodes.get("announcementExportScope").value = "filtered";
    }
  }
  const button = new Element("adminAnnouncementExportToggle"), heading = new Element();
  const controller = auth(); let listener, blob, revoked = false;
  controller.onAuthStateChange = async fn => { listener = fn; };
  const win = { CyNewsAnnouncementCSV: CSV, CyNewsAnnouncementExportSource: Source,
    CyNewsAccountAuth: { createController: () => controller }, addEventListener() {},
    fetch: async () => ({ ok: true, json: async () => ({ items: [{ id: "cysh-public", title: "公告" }] }) }) };
  const context = { window: win, document: { querySelector: () => heading, getElementById: id => nodes.get(id), createElement: () => new Element() },
    Set, Map, AbortController, Blob, URL: { createObjectURL: b => { blob = b; return "blob:test"; }, revokeObjectURL: () => { revoked = true; } } };
  vm.runInNewContext(read("docs/admin-announcement-csv-ui.js"), context);
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await flush(); assert.equal(button.hidden, false);
  button.listeners.click(); await flush();
  assert.match(nodes.get("announcementExportCount").textContent, /全部 2 筆/);
  await nodes.get("announcementExportStart").listeners.click();
  assert.equal(nodes.get("announcementExportDownload").hidden, false);
  assert.match(await blob.text(), /完整原文/);
  assert.match(await blob.text(), /authenticated_supabase/);
  controller.getVerifiedSession = async () => null; listener(); await flush();
  assert.equal(button.hidden, true); assert.equal(nodes.get("announcementExportDownload").hidden, true); assert(revoked);
  vm.runInNewContext(read("docs/admin-announcement-csv-ui.js"), { window: { CYNEWS_MOCK_ADMIN_MODE: true } });
}
(async () => {
  for (const role of ["co_admin", "member", null]) await assert.rejects(Source.requireOwner(auth({ getAccountAccess: async () => ({ status: "approved", admin_role: role }) })));
  await assert.rejects(Source.requireOwner(auth({ getVerifiedSession: async () => null })));
  await assert.rejects(Source.requireOwner(auth({ getVerifiedSession: async () => ({ user: { id: "mock" }, access_token: "mock.token" }) })));
  await assert.rejects(Source.requireOwner(auth({ getAccountAccess: async () => ({ status: "pending", admin_role: "owner" }) })));
  await assert.rejects(Source.requireOwner(auth(), "other-owner"));
  const rows = await Source.loadCatalog(auth(), async url => ({ ok: true, json: async () => ({ items: [{ id: "cysh-public", title: url, school: "cysh", snippet: "not source text" }] }) }), "owner");
  assert.deepEqual(rows.map(r => r.id), ["cysh-database-only", "cysh-public"]);
  assert.equal(rows[1].title, "data/announcements.json", "current metadata wins over archive");
  assert(!JSON.stringify(rows).includes("not source text"));
  await assert.rejects(Source.loadCatalog(auth(), async () => ({ ok: false })));
  await assert.rejects(Source.loadCatalog(auth({ getMemberAnnouncementIndex: async () => Array(10000).fill({ announcement_id: "cysh-a" }) }), async () => ({ ok: true, json: async () => ({ items: [] }) })));
  let active = 0, maximum = 0;
  const records = await Source.readBatch(auth({ getMemberAnnouncementDetail: async id => {
    active++; maximum = Math.max(maximum, active); await new Promise(resolve => setImmediate(resolve)); active--;
    return id === ids[0] ? null : { announcement_id: id, detail: { blocks: [{ type: "paragraph", text: id }] } };
  } }), ids, catalog, { uid: "owner" });
  assert(maximum <= 4); assert.deepEqual(records.map(r => r.id), ids);
  assert.equal(CSV.project(records[0], "now").body_status, "missing");
  assert(records.every(r => r.data_source === "authenticated_supabase"));
  await assert.rejects(Source.readBatch(auth(), [ids[0], ids[0]], catalog));
  await assert.rejects(Source.readBatch(auth(), ["cysh-unknown"], catalog));
  await assert.rejects(Source.readBatch(auth({ getMemberAnnouncementDetail: async () => { throw new Error("RPC failed"); } }), ids, catalog));
  await assert.rejects(Source.readBatch(auth({ getMemberAnnouncementDetail: async () => ({ announcement_id: "cysh-wrong" }) }), [ids[0]], catalog));
  await assert.rejects(Source.readBatch(auth({ getMemberAnnouncementDetail: async id => ({ announcement_id: id, source_hash: "new", detail: { source_hash: "old" } }) }), [ids[0]], catalog));
  const abort = new AbortController(); let calls = 0;
  await assert.rejects(Source.readBatch(auth({ getMemberAnnouncementDetail: async id => { calls++; abort.abort(); return { announcement_id: id }; } }), ids, catalog, { signal: abort.signal }));
  assert.equal(calls, 1, "cancellation stops scheduling further source reads");
  let checks = 0;
  await assert.rejects(Source.readBatch(auth({ getAccountAccess: async () => ({ status: "approved", admin_role: ++checks === 1 ? "owner" : "member" }) }), [ids[0]], catalog));
  // Both export suites exercise the canonical serializer; staging build tests verify the output bytes.
  const index = read("docs/index.html"), sw = read("docs/sw.js");
  assert.match(index, /id="adminAnnouncementExportToggle"[^>]*hidden>下載完整公告 CSV/);
  for (const asset of ["announcement-csv.js", "admin-announcement-export-source.js", "admin-announcement-csv-ui.js", "admin-announcement-export.css"]) {
    assert(index.includes(asset + "?v=1")); assert(sw.includes(asset + "?v=1"));
  }
  assert.match(sw, /cy-news-v99/);
  assert(!read("docs/admin-announcement-csv-ui.js").includes("/api/"), "Pages export uses existing authenticated reads instead of server routes");
  await uiFlow();
  console.log("PASS: Production owner button/download/logout, real-session guard, complete catalog union, bounded read-only export, cancellation/errors, identity checks, cache assets");
})().catch(error => { console.error(error); process.exitCode = 1; });
