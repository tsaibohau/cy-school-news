"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Detail = require("../docs/detail-ui.js");

assert.equal(Detail.safeUrl("javascript:alert(1)"), "");
assert.equal(Detail.safeUrl("data:text/html,x"), "");
assert.equal(Detail.safeUrl("http://example.test/a"), "");
assert.equal(Detail.safeUrl("https://example.test/a"), "https://example.test/a");
assert.equal(Detail.validDetailRef("data/details/cysh/cysh-1.json"), true);
assert.equal(Detail.validDetailRef("data/details/pksh/pksh-28123.json"), true);
assert.equal(Detail.validDetailRef("data/details/fjsh/fjsh-2373.json"), true);
for (const ref of ["https://evil.test/a.json", "//evil.test/a.json", "data/details/other/a.json", "data/details/cysh/../a.json", "data/details/cysh/a.json?x=1", "data/details/cysh/%2e%2e.json"]) {
  assert.equal(Detail.validDetailRef(ref), false, "unsafe detail ref rejected: " + ref);
}

const record = {
  announcement_id: "a-1", provenance: "official_article", parse_status: "parsed",
  summary: { status: "extracted", text: "官方擷取摘要 <safe>" },
  source_url: "https://school.example/a", source_hash: "rev",
  blocks: [
    { type: "heading", level: 1, text: "<img onerror=alert(1)>" },
    { type: "paragraph", text: "<script>alert(1)</script>", links: [
      { text: "bad", url: "javascript:alert(1)" }, { text: "good", url: "https://school.example/info" },
    ] },
    { type: "list", ordered: true, items: ["first", "<b>second</b>"] },
    { type: "table", header_rows: [0], rows: [["欄位", "值"], ["<svg/onload=x>", "安全"]] },
    { type: "raw_html", html: "<img src=x onerror=alert(1)>" },
  ],
  attachments: [
    { announcement_id: "a-1", provenance: "official_attachment", filename: "<x>.pdf", url: "https://school.example/a.pdf", extension: ".pdf", parse_status: "parsed", embedded_text: "截止日 <script>" },
    { announcement_id: "other", provenance: "official_attachment", filename: "foreign.pdf", url: "https://school.example/f.pdf" },
    { announcement_id: "a-1", provenance: "untrusted", filename: "bad.pdf", url: "https://school.example/b.pdf" },
    { announcement_id: "a-1", provenance: "official_attachment", filename: "scheme.pdf", url: "javascript:alert(1)" },
  ],
};
const html = Detail.render(record);
assert(!html.includes("<script>"));
assert(!html.includes("<img"));
assert(!html.includes("javascript:"));
assert(html.includes("&lt;script&gt;"));
assert(html.includes("<ol"));
assert(html.includes("<th>欄位</th>"));
assert(html.includes("<td>&lt;svg/onload=x&gt;</td>"));
assert(html.includes("&lt;x&gt;.pdf"));
assert(html.includes("閱讀 PDF 文字內容"));
assert(html.includes("截止日 &lt;script&gt;"));
assert(html.includes("重點摘要"));
assert(html.includes("官方擷取摘要 &lt;safe&gt;"));
const grouped = Detail.renderSummary({ status: "extracted", text: "摘要", items: [
  { label: "科學營", text: "九月五日前報名。" }, { label: "寫作工作坊", text: "九月十日前報名。" },
] });
assert(grouped.includes("分項重點") && grouped.includes("科學營") && grouped.includes("寫作工作坊"));
assert.equal((grouped.match(/<li>/g) || []).length, 2);
assert(html.includes(">開啟附件</a>"));
assert(!html.includes("開啟／下載"), "UI must not claim iOS downloaded an attachment");
assert(!html.includes("foreign.pdf"));
assert(!html.includes("bad.pdf"));
assert(html.includes('rel="noopener noreferrer"'));
assert.match(Detail.render(null), /無法驗證/);
assert.match(Detail.render({ provenance: "official_article", parse_status: "temporary_error", source_url: "https://school.example/a" }), /稍後會重試/);
for (const state of ["pending", "empty", "unsupported", "temporary_error", "permanent_error"]) assert(Detail.statusMessage(state));

const app = fs.readFileSync(path.join(__dirname, "..", "docs", "app.js"), "utf8");
const index = fs.readFileSync(path.join(__dirname, "..", "docs", "index.html"), "utf8");
const sw = fs.readFileSync(path.join(__dirname, "..", "docs", "sw.js"), "utf8");
assert(index.includes('id="detailDialog"') && index.includes('src="detail-ui.js?v=41"'));
assert(app.includes('button[data-detail-id]'), "detail fetch is delegated from an explicit open action");
assert(app.includes('displaySnippet(item) ? \'<p class="detail-paragraph">\''), "detail failure retains the safe existing summary");
assert(app.includes('fetch(item.detail_ref'), "selected sidecar is lazy fetched");
assert(app.includes("detailRequestGeneration"), "stale detail responses are generation guarded");
assert(app.includes("detailCache[cacheKey]"), "repeat opens reuse revision-scoped cache");
assert(sw.includes('detail-ui.js?v=41'));
console.log("Detail UI structured rendering tests passed");
