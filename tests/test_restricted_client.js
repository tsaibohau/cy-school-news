/* 管理員才合併私有 bucket 的其他學校資料；訪客不碰 storage、失敗退回公開資料（資料全為虛構）。 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const repo = path.join(__dirname, "..");
const Restricted = require("../docs/restricted-data.js");

function gz(obj) { return zlib.gzipSync(Buffer.from(JSON.stringify(obj), "utf8")); }
function fakeRegistry(on) { return { adminViewer: () => on.value }; }
function fakeClient(files, opts) {
  opts = opts || {};
  const calls = { downloads: [], sessions: 0 };
  return {
    calls,
    auth: { getSession: async () => { calls.sessions++; return { data: { session: opts.noSession ? null : { user: { id: "u" } } } }; } },
    storage: {
      from(bucket) {
        assert.strictEqual(bucket, "restricted-data");
        return {
          download: async (name) => {
            calls.downloads.push(name);
            if (opts.fail || !files[name]) return { data: null, error: { message: "denied" } };
            const buf = files[name];
            return { data: new Blob([buf]), error: null };
          },
        };
      },
    },
  };
}
function setup(admin, client) {
  const flag = { value: admin };
  Restricted.configure({ registry: fakeRegistry(flag), client: () => client, reset: true });
  return flag;
}

(async () => {
  // ── 合併規則（純函式）──
  const R = Restricted.RULES;
  const pub = { generated_at: "t", schools: [{ id: "cysh" }], items: [{ id: "cysh-1", school: "cysh" }] };
  const blob = { items: [{ id: "zzsh-1", school: "zzsh" }], schools: [{ id: "zzsh" }] };
  const merged = Restricted.mergeInto(pub, blob, R["data/announcements.json"]);
  assert.deepStrictEqual(merged.items.map((i) => i.id), ["cysh-1", "zzsh-1"]);
  assert.deepStrictEqual(merged.schools.map((s) => s.id), ["cysh", "zzsh"]);
  assert.strictEqual(merged.generated_at, "t", "top-level metadata stays from the public file");
  assert.strictEqual(pub.items.length, 1, "input is not mutated");
  assert.strictEqual(Restricted.mergeInto(pub, { items: [{ id: "cysh-1" }] }, R["data/archive.json"]).items.length, 1, "duplicate ids are not doubled");
  assert.deepStrictEqual(Restricted.mergeInto([{ school_id: "cysh" }], [{ school_id: "zzsh" }], R["data/calendar-events.json"]).map((e) => e.school_id), ["cysh", "zzsh"]);
  assert.deepStrictEqual(Restricted.mergeInto({ timetables: [{ school_id: "cysh" }] }, { timetables: [{ school_id: "zzsh" }] }, R["data/class-timetables.json"]).timetables.length, 2);
  const series = Restricted.mergeInto({ count: 1, series: [{ id: "a" }] }, { series: [{ id: "b" }, { id: "c" }] }, R["data/series.json"]);
  assert.strictEqual(series.count, 3);
  assert.deepStrictEqual(Restricted.mergeInto({ removed: [] }, { removed: [{ id: "x" }] }, R["data/removed-announcements.json"]).removed.length, 1);
  assert.deepStrictEqual(Restricted.mergeInto(null, { items: [{ id: "zzsh-info" }] }, Restricted.ruleFor("data/school-info/zzsh.json")).items.length, 1, "a school-info file missing from the public site is the blob");
  assert.strictEqual(Restricted.mergeInto(pub, null, R["data/archive.json"]), pub);
  assert.strictEqual(Restricted.mergeInto(pub, [1], R["data/archive.json"]), pub, "wrong shape leaves the public file alone");
  assert.strictEqual(Restricted.objectName("data/announcements.json?_=123"), "docs/data/announcements.json.gz");
  assert.strictEqual(Restricted.objectName("./data/school-info/zzsh.json"), "docs/data/school-info/zzsh.json.gz");
  assert.deepStrictEqual(Restricted.shardOf("data/schools/zzsh/archive.json"), { school: "zzsh", kind: "archive", url: "data/archive.json" });
  assert.strictEqual(Restricted.ruleFor("data/schools/manifest.json"), null);
  assert.strictEqual(Restricted.ruleFor("data/calendar.ics"), null);

  // ── gunzip 路徑（真的 gzip 位元組；Node 的 DecompressionStream；以及注入的 gunzip）──
  assert.deepStrictEqual(await Restricted.decodeBlob(new Blob([gz({ ok: 1 })])), { ok: 1 });
  assert.deepStrictEqual(await Restricted.decodeBlob(new Blob([Buffer.from('{"plain":true}')])), { plain: true }, "already-decoded JSON is accepted");

  // ── 訪客：完全不碰 storage ──
  let client = fakeClient({ "docs/data/announcements.json.gz": gz(blob) });
  let flag = setup(false, client);
  assert.strictEqual(Restricted.enabled(), false);
  assert.strictEqual(await Restricted.loadMerged("data/announcements.json", pub), pub);
  assert.strictEqual(await Restricted.fetchBlob("docs/data/announcements.json.gz"), null);
  assert.strictEqual(await Restricted.loadShard("data/schools/zzsh/current.json", pub), null);
  assert.strictEqual(Restricted.mergeCached("data/announcements.json", pub), pub);
  assert.strictEqual(client.calls.downloads.length, 0, "guests make zero storage calls");
  assert.strictEqual(client.calls.sessions, 0);

  // ── 管理員：合併結果 ──
  const files = {
    "docs/data/announcements.json.gz": gz(blob),
    "docs/data/archive.json.gz": gz({ items: [{ id: "zzsh-old", school: "zzsh" }] }),
    "docs/data/school-info/zzsh.json.gz": gz({ items: [{ id: "zzsh-handbook", school: "zzsh", kind: "school_handbook" }] }),
  };
  client = fakeClient(files);
  flag = setup(true, client);
  assert.strictEqual(Restricted.enabled(), true);
  const adminMerged = await Restricted.loadMerged("data/announcements.json?_=1", pub);
  assert.deepStrictEqual(adminMerged.items.map((i) => i.id), ["cysh-1", "zzsh-1"]);
  assert.deepStrictEqual(client.calls.downloads, ["docs/data/announcements.json.gz"]);
  await Restricted.loadMerged("data/announcements.json", pub);
  assert.strictEqual(client.calls.downloads.length, 1, "downloaded once per page load");
  assert.strictEqual(Restricted.mergeCached("data/announcements.json", pub).items.length, 2, "synchronous merge after the first load");
  await Restricted.loadMerged("data/announcements.json", pub, { force: true });
  assert.strictEqual(client.calls.downloads.length, 2, "force re-downloads");
  const info = await Restricted.loadMerged("data/school-info/zzsh.json", { items: [] });
  assert.strictEqual(info.items[0].id, "zzsh-handbook");
  const shard = await Restricted.loadShard("data/schools/zzsh/archive.json", { items: [] });
  assert.deepStrictEqual(shard, { school: "zzsh", items: [{ id: "zzsh-old", school: "zzsh" }] });
  assert.strictEqual(await Restricted.loadMerged("data/schools/manifest.json", { x: 1 }).then((v) => v.x), 1, "files without a rule are untouched");

  // ── 失敗一律退回公開資料，不丟例外 ──
  client = fakeClient(files, { fail: true });
  setup(true, client);
  assert.strictEqual(await Restricted.loadMerged("data/announcements.json", pub), pub, "download error: public unchanged");
  client = fakeClient(files, { noSession: true });
  setup(true, client);
  assert.strictEqual(await Restricted.loadMerged("data/announcements.json", pub), pub);
  assert.strictEqual(client.calls.downloads.length, 0, "no session, no download");
  client = fakeClient({ "docs/data/announcements.json.gz": Buffer.from([0x1f, 0x8b, 1, 2, 3]) });
  setup(true, client);
  assert.strictEqual(await Restricted.loadMerged("data/announcements.json", pub), pub, "corrupt gzip: public unchanged");
  Restricted.configure({ registry: fakeRegistry({ value: true }), client: () => { throw new Error("boom"); }, reset: true });
  assert.strictEqual(await Restricted.loadMerged("data/announcements.json", pub), pub, "client error: public unchanged");
  Restricted.configure({ registry: fakeRegistry({ value: true }), client: () => Promise.reject(new Error("no supabase")), reset: true });
  assert.strictEqual(await Restricted.loadMerged("data/announcements.json", pub), pub);
  Restricted.configure({ registry: { adminViewer() { throw new Error("x"); } }, reset: true });
  assert.strictEqual(Restricted.enabled(), false);

  // ── 接線（靜態檢查）──
  const app = fs.readFileSync(path.join(repo, "docs", "app.js"), "utf8");
  const index = fs.readFileSync(path.join(repo, "docs", "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(repo, "docs", "sw.js"), "utf8");
  assert.ok(index.indexOf('restricted-data.js?v=1') !== -1 && index.indexOf("restricted-data.js") < index.indexOf("app.js?v="), "loaded before app.js");
  assert.ok(sw.indexOf('"./restricted-data.js?v=1"') !== -1, "in the service worker shell");
  assert.match(app, /RESTRICTED\.useClient\(function \(\) \{ return auth\.getClient\(\); \}\)/);
  ["data/calendar-events.json", "data/calendar-source-status.json", "data/class-timetables.json", "data/series.json"].forEach((url) => {
    assert.ok(app.indexOf('restrictedMerge("' + url + '"') !== -1, url + " merges restricted rows");
  });
  assert.match(app, /mergeRestrictedLater\(result\.url, data, requestedSchool/, "public first paint, merge afterwards");
  assert.match(app, /onlySchool/, "a restricted school is built from the merged total file");

  console.log("restricted client ok");
})().catch((error) => { console.error(error); process.exit(1); });
