"use strict";
/* 過期公告改寫成整理版（scraper/announcement_prune.py 先重讀原文、標 condense_pending）。
   留標題、活動事項、注意事項、相關辦法；拿掉所有日期與時間（日期、星期、幾點、即日起…至…止）。
   原文的區塊與附件文字由整理版取代，會員資料庫同步後只剩整理版。 */
const fs = require("node:fs");
const path = require("node:path");
const Tokens = require("../docs/announcement-tokens.js");

const VERSION = 1;
const KEEP_KINDS = new Set(["required", "method", "audience", "place", "penalty", "allow", "deny", "contact", "fee"]);
const MAX_CHARS = 4000;

/* Dates and times, in the forms school notices use. */
const TIME_PATTERNS = [
  /(?:中華)?民國\s*\d{2,3}\s*年(?:\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*日)?)?/g,
  /\d{2,4}\s*[年.\/／-]\s*\d{1,2}\s*[月.\/／-]\s*\d{1,2}\s*日?/g,
  /\d{1,2}\s*月\s*\d{1,2}\s*[日號]/g,
  /\d{2,3}\s*學年度(?:第\s*[一二12]\s*學期)?/g,
  /\d{1,2}\s*[\/／]\s*\d{1,2}(?![\d\/／])/g,
  /[（(]\s*(?:星期|週|周|禮拜)?\s*[一二三四五六日天]\s*[)）]/g,
  /(?:星期|週|周|禮拜)[一二三四五六日天]/g,
  /(?:上午|下午|中午|晚上|早上)?\s*\d{1,2}\s*[:：]\s*\d{2}(?:\s*[-~～至到]\s*\d{1,2}\s*[:：]\s*\d{2})?/g,
  /(?:上午|下午|中午|晚上|早上)\s*\d{1,2}\s*[點時](?:\s*\d{1,2}\s*分)?/g,
  /\d{1,2}\s*[點時]\s*\d{1,2}\s*分/g,
  /即日起/g,
];
const LETTER = /函|字第|號令|號函|^依據|發文/;

function stripTimes(text) {
  const MARK = "⁣";
  let t = String(text || "");
  TIME_PATTERNS.forEach((re) => { t = t.replace(re, MARK); });
  t = t
    /* 「於…前」「自…起」「…至…止」 around a removed time go with it. */
    .replace(new RegExp("(?:於|在|自|從|訂於|定於)?\\s*" + MARK + "[\\s" + MARK + "]*(?:(?:[-~～至到]|起至)\\s*[\\s" + MARK + "]*" + MARK + "[\\s" + MARK + "]*)*(?:以前|之前|前|起|止|為止|截止)?", "g"), MARK)
    /* A label left with nothing: 「報名時間：，」 */
    .replace(new RegExp("[^，。、；：,;:\\s]{0,6}(?:時間|日期|期間|期限|時程|時段)\\s*(?:[：:]|為|是|訂為)\\s*" + MARK + "*\\s*(?=[，。、；,;]|$)[，。、；,;]?", "g"), "")
    .replace(new RegExp(MARK, "g"), " ")
    .replace(/[（(]\s*[)）]/g, "")
    .replace(/\s+/g, " ")
    .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, "$1")
    .replace(/\s*([，。、；：,;:])\s*/g, "$1")
    .replace(/([，、；,;])\1+/g, "$1")
    .replace(/[，、；,;]([。])/g, "$1")
    .replace(/^[，。、；：,;:\s]+|[，、；：,;:\s]+$/g, "")
    .trim();
  return t;
}

/* condense(record, title) → paragraphs to keep (no dates or times). */
function condense(record, title) {
  const kept = [];
  const seen = new Set();
  let total = 0;
  for (const seg of Tokens.segmentsOf(record)) {
    const text = seg.text;
    if (LETTER.test(text)) continue;
    const kinds = Tokens.kindsOf(text);
    const topics = Tokens.topicsOf(text);
    const useful = kinds.some((k) => KEEP_KINDS.has(k)) || (topics.length && !kinds.every((k) => k === "time" || k === "deadline"));
    if (!useful) continue;
    const out = stripTimes(text);
    if (out.length < 6 || seen.has(out)) continue;
    seen.add(out);
    total += out.length;
    if (total > MAX_CHARS) break;
    kept.push(out);
  }
  return kept;
}

function condensedRecord(record, item) {
  const paragraphs = condense(record, item.title);
  const out = {};
  for (const [key, value] of Object.entries(record || {})) {
    if (["blocks", "attachments", "verified_dates", "summary", "published_on", "dates", "calendar_events"].includes(key)) continue;
    out[key] = value;
  }
  out.blocks = paragraphs.map((text) => ({ type: "paragraph", text }));
  out.attachments = [];
  out.condensed = VERSION;
  return out;
}

function run(root) {
  const dataRoot = path.join(root, "docs", "data");
  let done = 0, empty = 0;
  for (const name of ["announcements.json", "archive.json"]) {
    const file = path.join(dataRoot, name);
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const item of doc.items || []) {
      if (item.condense_pending !== VERSION) continue;
      delete item.condense_pending;
      const ref = String(item.detail_ref || "");
      const sidecar = /^data\/details\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+\.json$/.test(ref) ? path.join(root, "docs", ref) : "";
      let record = null;
      try { record = sidecar ? JSON.parse(fs.readFileSync(sidecar, "utf8")) : null; } catch (_) { record = null; }
      if (!record || record.provenance !== "official_article") continue;
      const next = condensedRecord(record, item);
      fs.writeFileSync(sidecar, JSON.stringify(next, null, 1) + "\n");
      const first = next.blocks.slice(0, 2).map((b) => b.text).join(" ");
      item.summary = first.slice(0, 200);
      item.snippet = "";
      item.calendar_events = [];
      item.body_condensed = VERSION;
      done += 1;
      if (!next.blocks.length) empty += 1;
    }
    fs.writeFileSync(file, JSON.stringify(doc, null, 1));
  }
  console.log(`CONDENSED ${done} expired notices (${empty} kept the title only)`);
  return { done, empty };
}

module.exports = { VERSION, stripTimes, condense, condensedRecord, run };

if (require.main === module) run(path.resolve(process.argv[2] || path.join(__dirname, "..")));
