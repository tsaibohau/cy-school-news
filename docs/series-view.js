/* 活動系列（歷屆同名活動）的顯示資料：把 data/series.json 與已載入的公告配起來。
   series.json 只有公開的 id、名稱、學校、分類與成員 id；標題、日期、連結從公告取得。
   不呼叫任何外部服務。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsSeriesView = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var STAGE_ORDER = ["簡章", "說明會", "報名", "延期", "初賽", "複賽", "決賽", "得獎", "頒獎"];

  function yearRange(a, b) {
    if (!a && !b) return "";
    return a === b || !b ? String(a) : a + "–" + b;
  }
  /* 「聯合盃作文比賽（5 則・112–115 學年）」 */
  function label(name, count, years) {
    var range = yearRange(years[0], years[1]);
    return name + "（" + count + " 則" + (range ? "・" + range + " 學年" : "") + "）";
  }

  /* doc: series.json；options.category / school 篩選；options.items: id → 公告；options.hidden(id) → 已被刪除或失效。
     只回傳目前能對應到至少 2 則公告的系列，最近有動靜的排前面。 */
  function forCategory(doc, options) {
    var o = options || {}, items = o.items || {}, out = [];
    var list = doc && Array.isArray(doc.series) ? doc.series : [];
    list.forEach(function (s) {
      if (!s || !Array.isArray(s.members)) return;
      if (o.category && o.category !== "all" && s.category !== o.category) return;
      if (o.school && o.school !== "all" && s.school !== o.school) return;
      var rows = [];
      s.members.forEach(function (m) {
        var item = items[m.id];
        if (!item || (typeof o.hidden === "function" && o.hidden(item))) return;
        rows.push({ id: String(m.id), year: m.year || 0, stage: m.stage || "", title: item.title, url: item.url,
          date: String(item.date || "").slice(0, 10), school_name: item.school_name || "", item: item });
      });
      if (rows.length < 2) return;
      var years = rows.map(function (r) { return r.year; }).filter(Boolean).sort(function (a, b) { return a - b; });
      var groups = [], byYear = {};
      rows.forEach(function (r) {
        var key = r.year || 0;
        if (!byYear[key]) { byYear[key] = { year: key, rows: [] }; groups.push(byYear[key]); }
        byYear[key].rows.push(r);
      });
      groups.sort(function (a, b) { return (a.year || 9999) - (b.year || 9999); });
      var last = rows.map(function (r) { return r.date; }).sort().pop() || "";
      var span = [years[0] || 0, years[years.length - 1] || 0];
      out.push({ id: String(s.id), name: String(s.name || ""), school: s.school, category: s.category, count: rows.length, years: span,
        label: label(String(s.name || ""), rows.length, span), last_date: last, groups: groups });
    });
    out.sort(function (a, b) { return b.last_date.localeCompare(a.last_date) || b.count - a.count || a.name.localeCompare(b.name); });
    return out;
  }

  function yearTitle(year) { return year ? year + " 學年度" : "未標示學年度"; }

  return { forCategory: forCategory, label: label, yearTitle: yearTitle, STAGE_ORDER: STAGE_ORDER };
});
