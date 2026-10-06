"use strict";
const fs = require("node:fs"), path = require("node:path");
const { loadCorpus } = require("./preview-system-corpus.js");
function buildMockSystem(output, revision) {
  const corpus = loadCorpus();
  const dataDir = path.join(output, "mock-data"); fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "announcements.json"), JSON.stringify(corpus));
  fs.writeFileSync(path.join(dataDir, "archive.json"), JSON.stringify({ ...corpus, items: [] }));
  fs.writeFileSync(path.join(dataDir, "manifest.json"), JSON.stringify({ ...corpus, items: [], schools: corpus.schools.map(s => ({ ...s, current: "mock-data/announcements.json" })) }));
  for (const file of ["mock-system-config.js", "mock-system-auth.js"]) fs.copyFileSync(path.join(__dirname, file), path.join(output, file));
  // Patch only the generated Preview copy. docs/app.js remains byte-for-byte unchanged.
  const app = fs.readFileSync(path.join(output, "app.js"), "utf8")
    .replaceAll('"data/announcements.json', '"mock-data/announcements.json')
    .replaceAll('"data/archive.json', '"mock-data/archive.json')
    .replaceAll('"data/schools/manifest.json', '"mock-data/manifest.json')
    .replace('if ("serviceWorker" in navigator)', 'if (false)')
    .replace('"會員摘要如下；完整原文請前往官方來源。"', '"此分支只有真實公告索引，尚未取得正文；請查看官方來源。"')
    .replace('status("已同步")', 'status("模擬資料僅存本頁")');
  fs.writeFileSync(path.join(output, "mock-system-app.js"), app);
  let html = fs.readFileSync(path.join(output, "index.html"), "utf8")
    .replace('<head>', '<head>\n<meta http-equiv="Content-Security-Policy" content="connect-src \'self\'; form-action \'self\'; object-src \'none\'">')
    .replace(/src="account-config\.js[^\"]*"/, 'src="mock-system-config.js?v=' + revision + '"')
    .replace(/<script src="app\.js[^\"]*"><\/script>/, '<script src="mock-system-auth.js?v=' + revision + '"></script>\n<script src="mock-system-app.js?v=' + revision + '"></script>')
    .replace(/<script src="acceptance-user-tasks\.js[^\"]*" defer><\/script>/, '')
    .replace(/<div class="cynews-staging-banner"[^>]*>.*?<\/div>/, '<div class="cynews-staging-banner" role="status">完整系統 Preview｜模擬帳號・真實分支公告索引 ' + corpus.items.length + ' 則（含歷史）・正文尚未取得｜所有管理操作只改本頁模擬資料</div>')
    .replace('由資料庫 RPC 同步強制執行', '只作用於本頁模擬資料')
    .replaceAll('id="publicAccountSignUp"', 'id="publicAccountSignUp" disabled title="模擬站只使用交付的臨時帳密"');
  // This is the full existing app, not the synthetic 12-record demo.
  fs.writeFileSync(path.join(output, "mock-system.html"), html);
  const capabilities = fs.readFileSync(path.join(output, "capability-layer.js"), "utf8");
  fs.writeFileSync(path.join(output, "mock-system-capabilities.js"), capabilities.replaceAll("並由資料庫 RPC 同步強制執行", "只作用於本頁模擬資料").replaceAll("已儲存", "已儲存本頁模擬設定"));
  const configPath = path.join(output, "mock-system-config.js");
  fs.writeFileSync(configPath, fs.readFileSync(configPath, "utf8").replace("capability-layer.js", "mock-system-capabilities.js?v=" + revision));
  return corpus.items.length;
}
module.exports = { buildMockSystem };
