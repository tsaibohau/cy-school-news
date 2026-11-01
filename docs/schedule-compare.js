/* 跨校行程比較：「哪間學校段考最早」「各校什麼時候放寒假」「嘉中跟嘉女誰先期末考」。
   日期只取學校公開的行事曆，以及公告標題裡明寫的日期；看不出日期的學校照實說，
   並列出它們跟這件事有關的公告（考程表等），不猜日期。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsScheduleCompare = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  /* What can be compared. match: calendar or title text that is this event; skip: related but not it. */
  var TOPICS = [
    { id: "exam", label: "段考", ask: /段考|期中考|期末考|月考/, match: /段考|期中考|期末考/,
      skip: /成績|繳交|補考|監考|名單|自習|範圍|檢討|精準|說明|輔導課|座位|試場|英文作文|英文閱讀|英聽|藝能科|作文|解析|模擬|題目|試題|詳解|閱卷|工作坊|研習|計畫/ },
    { id: "midterm", label: "期中考", ask: /期中考/, match: /段考|期中考/, skip: null },
    { id: "final", label: "期末考", ask: /期末考/, match: /期末考|第三次段考/, skip: null },
    /* No 「寒假」 entry: the 結業式／休業式 in Jan–Feb (break starts the next day). */
    { id: "winter", label: "寒假", ask: /寒假/, match: /寒假/, skip: /輔導|營|研習|作業|活動|返校|開學考/, fallback: /結業式|休業式/, fallbackMonths: ["01", "02"] },
    { id: "summer", label: "暑假", ask: /暑假/, match: /暑假/, skip: /輔導|營|研習|作業|活動|返校|開學考/, fallback: /結業式|休業式/, fallbackMonths: ["06", "07"] },
    { id: "start", label: "開學", ask: /開學|始業式/, match: /開學|始業式/, skip: /準備|會議|前|開學考/ },
    { id: "close", label: "休業式", ask: /休業式|結業式/, match: /休業式|結業式/, skip: null },
    { id: "anniversary", label: "校慶", ask: /校慶/, match: /校慶/, skip: /籌備|會議|預演|彩排|補假/ },
    { id: "graduation", label: "畢業典禮", ask: /畢業典禮/, match: /畢業典禮/, skip: /預演|彩排|籌備|會議/ },
    { id: "mock", label: "模擬考", ask: /模擬考|模考/, match: /模擬考|模考/, skip: /成績|範圍|檢討/ }
  ];
  TOPICS[1].skip = TOPICS[0].skip; TOPICS[2].skip = TOPICS[0].skip;
  var COMPARE = /哪(?:一)?(?:間|所|個)學校|各校|各學校|每間學校|學校之間|哪些學校|誰(?:先|比較早|比較晚|最早|最晚)|比較早|比較晚|最早|最晚|先放|先考|跟.{1,8}(?:比|差)|和.{1,8}(?:比|差)/;
  var LATE = /最晚|比較晚|後(?:考|放)|最後/;

  function clean(text) { return String(text || "").replace(/\s+/g, " ").trim(); }
  function day(value) { var d = String(value || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ""; }
  function md(d) { return Number(d.slice(5, 7)) + "/" + Number(d.slice(8, 10)); }
  function span(from, to) { return to && to !== from ? md(from) + "–" + (from.slice(0, 7) === to.slice(0, 7) ? Number(to.slice(8, 10)) : md(to)) : md(from); }

  /* The topic of a question that compares schools; null otherwise. */
  function asks(question, namedSchools) {
    var q = clean(question);
    var topic = null;
    for (var i = 1; i < TOPICS.length && !topic; i++) if (TOPICS[i].ask.test(q)) topic = TOPICS[i];
    if (!topic && TOPICS[0].ask.test(q)) topic = TOPICS[0];
    if (!topic) return null;
    if (!COMPARE.test(q) && !((namedSchools || []).length >= 2 && /早|晚|先|後|比|差/.test(q))) return null;
    return { topic: topic, ordinal: ordinalOf(q), late: LATE.test(q) };
  }
  var CN = { "一": 1, "二": 2, "三": 3, "1": 1, "2": 2, "3": 3 };
  function ordinalOf(text) { var m = String(text).match(/第\s*([一二三123])\s*次/); return m ? CN[m[1]] : 0; }
  function gradeTag(text) {
    var t = String(text);
    if (/高三|【高三】|三年級/.test(t)) return "高三";
    if (/高一高二|高一二|【高一二】|高一、高二/.test(t)) return "高一高二";
    if (/高一|【高一】/.test(t)) return "高一";
    if (/高二|【高二】/.test(t)) return "高二";
    return "";
  }
  /* 「【全校】第一次期中考」→「第一次期中考」, 「高三期末考」→「期末考（高三）」 */
  function eventLabel(title, topic) {
    var t = clean(title).replace(/【[^】]*】/g, "").replace(/[（(][^）)]*[）)]/g, "");
    var m = t.match(/第\s*[一二三123]\s*次\s*(?:期中考|段考)|期末考|期中考|段考/);
    var base = m ? m[0].replace(/\s+/g, "") : topic.label;
    if (topic.id !== "exam" && topic.id !== "midterm" && topic.id !== "final") {
      var mm = t.match(topic.match);
      base = mm ? t.slice(Math.max(0, mm.index - 4), mm.index + mm[0].length + 4).replace(/^[，、；\s]+|[，、；\s]+$/g, "") : topic.label;
    }
    var grade = gradeTag(title);
    return grade && base.indexOf(grade) === -1 ? grade + base : base;
  }
  function examOrdinal(label) {
    var m = label.match(/第\s*([一二三123])\s*次/);
    if (m) return CN[m[1]];
    return /期末考/.test(label) ? 3 : 0;
  }

  /* Dated occurrences per school from calendars and announcement titles. */
  function occurrences(plan, options) {
    var topic = plan.topic, out = [];
    (options.calendarEvents || []).forEach(function (ev) {
      var title = clean(ev && ev.title), start = day(ev && (ev.start_date || ev.date));
      if (start && topic.fallback && topic.fallback.test(title) && topic.fallbackMonths.indexOf(start.slice(5, 7)) !== -1) {
        var next = addDays(day(ev.end_date) || start, 1);
        out.push({ school: ev.school_id, from: next, to: next, label: "結業式 " + md(start) + "，隔天起放" + topic.label, source: "行事曆", title: title, fallback: true });
        return;
      }
      if (!start || !topic.match.test(title) || (topic.skip && topic.skip.test(title))) return;
      if (topic.id === "midterm" && /期末/.test(title)) return;
      if (topic.id === "final" && !/期末|第三次/.test(title)) return;
      out.push({ school: ev.school_id, from: start, to: day(ev.end_date) || start, label: eventLabel(title, topic), source: "行事曆", title: title });
    });
    (options.items || []).forEach(function (item) {
      var title = clean(item && item.title);
      if (!title || !topic.match.test(title) || (topic.skip && topic.skip.test(title)) || typeof options.titleDates !== "function") return;
      (options.titleDates(item) || []).forEach(function (d) {
        if (d.kind !== "event") return;
        out.push({ school: item.school, from: d.from, to: d.to || d.from, label: eventLabel(title, topic), source: "公告", title: title, id: item.id });
      });
    });
    /* One row per school, label and start day (行事曆 first). */
    var seen = {};
    return out.sort(function (a, b) { return a.from.localeCompare(b.from) || (a.source === "行事曆" ? -1 : 1); }).filter(function (row) {
      var key = row.school + "|" + row.label + "|" + row.from;
      if (seen[key]) return false; seen[key] = true; return true;
    });
  }
  /* Which occurrence to compare at each school: 第N次 if asked; else the next one from today
     (or the latest past one when none is ahead). A grade-specific one counts only when the
     school has nothing for the whole school. */
  function pick(rows, plan, today, grade) {
    if (!rows.length) return null;
    var pool = rows.filter(function (row) { return !gradeTag(row.label) || !grade || gradeTag(row.label).indexOf(grade.replace("高", "")) !== -1 || gradeTag(row.label) === grade; });
    if (!pool.length) pool = rows;
    if (plan.ordinal && /exam|midterm/.test(plan.topic.id)) {
      var nth = pool.filter(function (row) { return examOrdinal(row.label) === plan.ordinal; });
      return nth[0] || null;
    }
    /* A real 「寒假」 entry beats the 結業式 stand-in. */
    if (pool.some(function (row) { return !row.fallback; })) pool = pool.filter(function (row) { return !row.fallback; });
    var ahead = pool.filter(function (row) { return (row.to || row.from) >= today; });
    var rank = function (row) { var g = gradeTag(row.label); return !g ? 0 : grade && g.indexOf(grade.replace("高", "")) !== -1 ? 0 : g === "高一高二" ? 1 : 2; };
    var best = function (list) { return list.slice().sort(function (a, b) { return rank(a) - rank(b) || a.from.localeCompare(b.from); })[0]; };
    return ahead.length ? best(ahead) : pool[pool.length - 1];
  }

  /* Result in the shape of CyNewsAssistantQA answers. options: { calendarEvents, items, schools,
     today, titleDates, onlySchools, grade }. */
  function compare(question, plan, options) {
    options = options || {};
    var today = day(options.today) || new Date().toISOString().slice(0, 10);
    var schools = (options.schools || []).filter(function (s) { return !(options.onlySchools || []).length || options.onlySchools.indexOf(s.id) !== -1; });
    var rows = occurrences(plan, options), bySchool = {};
    rows.forEach(function (row) { (bySchool[row.school] = bySchool[row.school] || []).push(row); });
    var picked = [], unknown = [];
    schools.forEach(function (school) {
      var row = pick(bySchool[school.id] || [], plan, today, options.grade);
      if (!row) { unknown.push(school); return; }
      /* The same exam on another day for another grade (高三期末考 earlier). */
      var other = (bySchool[school.id] || []).filter(function (o) { return o !== row && gradeTag(o.label) && gradeTag(o.label) !== gradeTag(row.label) && o.label.replace(/高[一二三]+/g, "") === row.label.replace(/高[一二三]+/g, "") && Math.abs(Date.parse(o.from) - Date.parse(row.from)) < 40 * 86400000; })[0];
      picked.push(Object.assign({ name: school.short, other: other || null }, row));
    });
    picked.sort(function (a, b) { return plan.late ? b.from.localeCompare(a.from) : a.from.localeCompare(b.from); });
    var label = plan.ordinal && /exam|midterm/.test(plan.topic.id) ? "第" + "一二三"[plan.ordinal - 1] + "次" + (plan.topic.id === "midterm" ? "期中考" : "段考") : plan.topic.label;
    var text, bullets = picked.map(function (row) {
      var when = span(row.from, row.to), past = (row.to || row.from) < today;
      return row.name + "　" + when + "　" + row.label + (past ? "（已過）" : "") + (row.source === "公告" ? "（公告標題）" : "") +
        (row.other ? "；" + row.other.label + " " + span(row.other.from, row.other.to) : "");
    });
    if (!picked.length) {
      text = "各校的" + label + "日期我都看不出來：公開的行事曆和公告標題都沒寫。";
    } else {
      var first = picked[0], tied = picked.filter(function (row) { return row.from === first.from; });
      var word = plan.late ? "最晚" : "最早";
      var lead = picked.length === 1 ? "只看得到" + first.name + "的：" + span(first.from, first.to) + "（" + first.label + "）。"
        : tied.length > 1 ? tied.map(function (r) { return r.name; }).join("、") + "的" + label + "都在 " + md(first.from) + "，" + (tied.length === picked.length ? "同一天" : "並列" + word) + "。"
        : word + "的是" + first.name + "，" + span(first.from, first.to) + "（" + first.label + "）。";
      var ahead = picked.some(function (row) { return (row.to || row.from) >= today; });
      text = (plan.ordinal ? "" : ahead ? "看接下來的" + label + "：" : "") + lead;
    }
    var related = [], note = "";
    if (unknown.length) {
      var names = unknown.slice(0, 6).map(function (s) { return s.short; }).join("、") + (unknown.length > 6 ? "等 " + unknown.length + " 間" : "");
      note = (picked.length ? "其他學校（" + names + "）" : "") + "的" + label + "日期沒寫在公開的行事曆或公告標題裡" + (/exam|midterm|final/.test(plan.topic.id) ? "（多半在考程表附件裡）" : "");
      var unknownIds = {};
      unknown.forEach(function (s) { unknownIds[s.id] = true; });
      related = (options.items || []).filter(function (item) {
        var title = clean(item && item.title);
        /* 考程表、時間分配表、考試範圍 are exactly where the dates are; results and outside events are not. */
        var exam = /exam|midterm|final/.test(plan.topic.id);
        return unknownIds[item.school] && plan.topic.ask.test(title) && !(!exam && plan.topic.skip && plan.topic.skip.test(title)) &&
          !/補考|成績|名單|檢討|精準|工作坊|研習|計畫|轉知|營|大學|基金會|輔導課|自習|解析|轉學考|重修|補修/.test(title) && day(item.date) >= addDays(today, -90);
      }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 8)
        .map(function (item) { return { id: item.id, title: item.title, date: day(item.date), school_name: item.school_name, url: item.url || "", note: "看附件裡的日期" }; });
      note += related.length ? "；下面是它們的相關公告，點開看附件。" : "。";
      if (!picked.length) { text += related.length ? "下面是各校相關的公告，點開看附件。" : ""; note = ""; }
    }
    return { status: picked.length ? "answered" : "insufficient", mode: "browse", query: question, summary: text + note,
      reply: { text: text, bullets: bullets, tail: note }, sources: related, evidence: [], schedule_compare: { topic: plan.topic.id, picked: picked, unknown: unknown.map(function (s) { return s.id; }) } };
  }
  function addDays(d, n) { return new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10); }

  return { asks: asks, compare: compare, occurrences: occurrences, eventLabel: eventLabel, TOPICS: TOPICS };
});
