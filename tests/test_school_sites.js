"use strict";
// 各校網站清單頁：由登錄表產生、可搜尋、連結安全。執行：node tests/test_school_sites.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "docs/schools.html"), "utf8");
const Registry = require("../docs/school-registry.js");
const config = JSON.parse(fs.readFileSync(path.join(root, "scraper/config.json"), "utf8"));

// 登錄表每校都有縣市與官網，且官網與爬蟲設定一致
for (const school of Registry.schools()) {
  assert(school.county, school.id + " has a county");
  const cfg = config.schools.find((row) => row.id === school.id);
  assert(cfg, school.id + " exists in config.json");
  assert.strictEqual(school.site.replace(/\/$/, ""), cfg.base.replace(/\/$/, ""), school.id + " site matches the scraper base");
}

// 在假 DOM 裡執行頁面腳本：依縣市分組、計數、搜尋
function makeDom() {
  const nodes = {};
  const listeners = {};
  function node(id) {
    return nodes[id] || (nodes[id] = { id, innerHTML: "", textContent: "", value: "",
      addEventListener(type, fn) { listeners[id + ":" + type] = fn; } });
  }
  return { nodes, listeners, document: { getElementById: node } };
}
const script = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));
const dom = makeDom();
vm.runInNewContext(script, { window: { CyNewsSchoolRegistry: Registry }, document: dom.document, URL });
const total = Registry.schools().length;
assert.strictEqual(dom.nodes.sitesCount.textContent, "共 " + total + " 校");
assert.match(dom.nodes.sitesList.innerHTML, /<h2 class="sites-county">嘉義市<\/h2>/);
assert.match(dom.nodes.sitesList.innerHTML, /<h2 class="sites-county">雲林縣<\/h2>/);
assert(dom.nodes.sitesList.innerHTML.indexOf("嘉義市") < dom.nodes.sitesList.innerHTML.indexOf("雲林縣"), "counties follow the fixed order");
assert.match(dom.nodes.sitesList.innerHTML, /href="https:\/\/www\.pksh\.ylc\.edu\.tw\/" target="_blank" rel="noopener"/);
dom.nodes.sitesSearch.value = "北港";
dom.listeners["sitesSearch:input"]();
assert.match(dom.nodes.sitesCount.textContent, /^2 \/ \d+ 校$/, "北港 matches 北港高中 and 北港農工");
assert.match(dom.nodes.sitesList.innerHTML, /國立北港高級中學/);
assert.match(dom.nodes.sitesList.innerHTML, /國立北港高級農工職業學校/);
assert.doesNotMatch(dom.nodes.sitesList.innerHTML, /嘉義女子/);
dom.nodes.sitesSearch.value = "不存在的學校";
dom.listeners["sitesSearch:input"]();
assert.match(dom.nodes.sitesList.innerHTML, /找不到符合的學校/);

// 頁面與快取
assert.match(html, /<script src="school-registry\.js\?v=\d+"><\/script>/);
assert.match(html, /內容、期限與效力一律以學校官網為準/);
const sw = fs.readFileSync(path.join(root, "docs/sw.js"), "utf8");
assert(sw.includes("./schools.html"), "service worker caches the school list page");
const indexReg = fs.readFileSync(path.join(root, "docs/index.html"), "utf8").match(/school-registry\.js\?v=(\d+)/)[1];
assert.strictEqual(html.match(/school-registry\.js\?v=(\d+)/)[1], indexReg, "both pages load the same registry version");
console.log("School sites page tests passed");
