/* 跨校比對：把不同學校轉知的同一項活動（同一場比賽、營隊、招生、講座）歸成一組，
   整理共同的資訊（主辦單位、截止日、類別），並列出每間學校公告的時間點。
   只用公開的公告標題、日期、分類與已驗證的截止日；不呼叫任何外部服務。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsCrossSchool = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var MAX_GAP_DAYS = 45;          // the same notice is forwarded within weeks, not months
  var MIN_KEY = 6;                 // shorter titles say too little to be matched safely
  var MATCH_DICE = 0.62;           // bigram overlap needed without a shared 「name」
  var MAX_SPAN_DAYS = 60;          // a whole group, first post to last

  /* Words that say how a school forwards a notice, not what the notice is. */
  var FILLER = /轉知|函轉|轉發|轉貼|轉載|檢送|檢附|惠請|敬請|請鼓勵|鼓勵|歡迎|踴躍|報名參加|報名參賽|組隊參加|參加|報名|同學|學生們?|師生|教師|老師|家長|本校|貴校|有興趣者?|相關|資訊|訊息|活動海報|宣傳海報|海報|簡章|實施計畫|實施要點|計畫書?|辦理|舉辦|主辦|承辦|訂於|公告|宣導|周知|週知|一案|乙案|如附件|詳如附件|請查照|請參閱|請參考|敬邀|邀請|即日起|開始|線上|資料|說明|延長|截止|日期|時間|一則|最新消息|校外訊息|校外活動|活動訊息/g;
  var BRACKET_NOISE = /^(?:轉知|轉發|公告|宣導|重要|最新|校外|活動|競賽|研習|徵稿|招生|升學|獎學金|學務處|教務處|輔導室|總務處|圖書館|訓育組|註冊組|實研組|設備組|生輔組|衛生組|體育組|課外活動組|學輔|教官室|人事室|主計室|資訊組|.{0,3}組)$/;
  /* School-internal notices share titles across schools without being the same thing. */
  var INTERNAL = /段考|期中考|期末考|考程|考試範圍|課表|作息|菜單|午餐|營養午餐|便當|班級|導師|週會|朝會|校慶|運動會|畢業典禮|家長日|親師|註冊|繳費|學雜費|補考|重補修|成績單|放假|停課|補課|調課|請假|公假|社團選|選社|點名|榮譽榜|賀[！!]|恭喜|喜訊|榜單|錄取名單|得獎名單|校內|班際|新生|返校|開學|休業式|始業式|工程|招標|採購|會議紀錄|行事曆|退休|教職同仁|陳核|彙辦/;
  var ORGANIZER = /([一-鿿（）()]{2,18}?(?:科技大學|大學|學院|基金會|協會|學會|研究院|研究中心|博物館|科學館|美術館|文化中心|教育部|教育局|教育處|縣政府|市政府|政府|文化部|國防部|衛生福利部|衛福部|內政部|經濟部|勞動部|環境部|農業部|數位發展部|國科會|警察局|消防局|地方法院|地檢署|監理站|稅務局|國稅局|銀行|公司|中心|署|館))/;

  function clean(text) { return String(text || "").replace(/\s+/g, " ").trim(); }
  function day(value) { var d = String(value || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ""; }
  function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }

  /* 2026 → 115 so 「2026 AI妙用大挑戰」 and 「115年 AI妙用大挑戰」 meet. */
  function rocYears(text) {
    return String(text).replace(/(?:西元)?(20\d{2})(?=\s*年|\s*[^\d]|$)/g, function (_, y) { return String(Number(y) - 1911); }).replace(/民國\s*/g, "");
  }
  function normalize(text, schoolWords) {
    var t = rocYears(clean(text).normalize ? clean(text).normalize("NFKC") : clean(text));
    if (schoolWords && schoolWords.re) t = t.replace(schoolWords.re, "");
    else (schoolWords || []).forEach(function (w) { if (w) t = t.split(w).join(""); });
    t = t.replace(FILLER, "");
    return t.replace(/[\s\-—–_~～·・.,，。、:：;；!！?？"'“”‘’「」『』《》〈〉()（）\[\]【】{}<>＜＞|｜\/\\#＃*＊&＆+＋=＝]/g, "").toLowerCase();
  }
  /* The activity's own name: the longest 「…」 or 『…』 part. */
  function quotedName(title) {
    var best = "";
    String(title || "").replace(/[「『《"“]([^」』》"”]{3,60})[」』》"”]/g, function (_, inner) { if (inner.length > best.length) best = inner; return _; });
    return clean(best);
  }
  /* Drop 【轉知】-style tags; keep 【元智大學】-style ones (they name the organizer). */
  function stripTags(title) {
    return clean(String(title || "").replace(/^\s*(?:[【\[]([^】\]]{1,12})[】\]]\s*)+/, function (all) {
      return all.replace(/[【\[]([^】\]]{1,12})[】\]]/g, function (tag, inner) { return BRACKET_NOISE.test(inner) ? "" : inner + " "; });
    }).replace(/^(?:轉知|轉發|函轉|檢送|敬轉)\s*[-－:：、]?\s*/, ""));
  }
  function bigrams(text) {
    var out = [], seen = new Set();
    for (var i = 0; i < text.length - 1; i++) {
      var g = text.substr(i, 2);
      if (!seen.has(g)) { seen.add(g); out.push(g); }
    }
    return out;
  }
  function toSet(list) { return new Set(list); }
  function dice(a, b, bSet) {
    if (!a.length || !b.length) return 0;
    var set = bSet || toSet(b), shared = 0;
    for (var i = 0; i < a.length; i++) if (set.has(a[i])) shared++;
    return 2 * shared / (a.length + b.length);
  }
  function dayNumber(d) { return Math.round(Date.parse(d + "T00:00:00Z") / 86400000); }
  function organizerOf(title) {
    var m = stripTags(title).replace(/^(?:檢送|轉知|函轉|有關|關於|敬邀|邀請)/, "").match(ORGANIZER);
    if (!m) return "";
    var name = m[1].replace(/^(?:轉知|檢送|函轉|有關|關於|本校|貴校|[（(][^）)]*[）)])+/, "");
    return name.length >= 3 && !/辦理|舉辦|活動|比賽|競賽/.test(name) ? name : "";
  }
  function deadlineOf(item, titleDeadline) {
    var dates = (item.calendar_events || []).filter(function (ev) { return ev && ev.kind === "deadline" && day(ev.date); }).map(function (ev) { return day(ev.date); });
    if (!dates.length && typeof titleDeadline === "function") { try { var t = day(titleDeadline(item)); if (t) dates.push(t); } catch (_) {} }
    return dates.sort()[0] || "";
  }
  function majority(values) {
    var count = {}, best = "", top = 0;
    values.forEach(function (v) { if (!v) return; count[v] = (count[v] || 0) + 1; if (count[v] > top || (count[v] === top && v.length < best.length)) { top = count[v]; best = v; } });
    return best;
  }

  function Union(n) { this.p = []; for (var i = 0; i < n; i++) this.p.push(i); }
  Union.prototype.find = function (x) { while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; } return x; };
  Union.prototype.join = function (a, b) { a = this.find(a); b = this.find(b); if (a !== b) this.p[Math.max(a, b)] = Math.min(a, b); };

  /* items: announcements; options: { schools: registry list, titleDeadline, today }.
     Returns groups seen at two or more schools, newest activity first. */
  function build(items, options) {
    options = options || {};
    var schoolWords = [];
    (options.schools || []).forEach(function (s) {
      [s.name, s.short].concat(s.aliases || []).forEach(function (w) { if (w && w.length >= 2) schoolWords.push(normalizeWord(w)); });
    });
    schoolWords.sort(function (a, b) { return b.length - a.length; });
    schoolWords.re = schoolWords.length ? new RegExp(uniq(schoolWords).map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|"), "g") : null;
    var rows = [];
    (items || []).forEach(function (item) {
      if (!item || !item.id || !item.school || !day(item.date || item.first_seen)) return;
      var title = clean(item.title);
      if (!title || INTERNAL.test(title)) return;
      var name = quotedName(title), key = normalize(stripTags(title), schoolWords), nameKey = name ? normalize(name, schoolWords) : "";
      if (key.length < MIN_KEY && nameKey.length < 4) return;
      var date = day(item.date || item.first_seen), grams = bigrams(key), shortName = nameKey.length >= 4 ? nameKey : "", nameGrams = bigrams(shortName);
      rows.push({ item: item, date: date, dayNum: dayNumber(date), key: key, nameKey: shortName, grams: grams, gramSet: toSet(grams), nameGrams: nameGrams, nameSet: toSet(nameGrams),
        organizer: organizerKey(organizerOf(title)), editions: editions(title), years: yearsOf(title) });
    });
    /* Candidates share a rare bigram (one that few titles use). */
    var index = new Map();
    rows.forEach(function (row, i) { row.grams.forEach(function (g) { var list = index.get(g); if (!list) index.set(g, list = []); list.push(i); }); });
    /* Score every candidate pair, then merge strongest first. A merge that would put two
       organizers, two editions (第七屆／第八屆, 第2場／第3場), two years, or more than
       MAX_SPAN_DAYS into one group is refused, so chains of look-alike titles stay apart. */
    var limit = Math.max(30, rows.length * 0.01), pairs = [];
    /* Only pairs sharing at least two rare bigrams are scored: real matches share many. */
    var shared = new Int32Array(rows.length), touched = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      touched.length = 0;
      for (var gi = 0; gi < row.grams.length; gi++) {
        var g = row.grams[gi];
        var list = index.get(g);
        if (list.length > limit) continue;
        for (var k = 0; k < list.length; k++) {
          var j = list[k];
          if (j <= i) continue;
          if (shared[j] === 0) touched.push(j);
          shared[j]++;
        }
      }
      for (var t = 0; t < touched.length; t++) {
        var jj = touched[t], count = shared[jj];
        shared[jj] = 0;
        if (count < 2) continue;
        var other = rows[jj];
        if (Math.abs(row.dayNum - other.dayNum) > MAX_GAP_DAYS) continue;
        var score = matchScore(row, other);
        if (score) pairs.push([score, i, jj]);
      }
    }
    pairs.sort(function (a, b) { return b[0] - a[0]; });
    var union = new Union(rows.length), info = rows.map(function (row) {
      return { from: row.date, to: row.date, organizers: row.organizer ? [row.organizer] : [], editions: row.editions.slice(), years: row.years.slice() };
    });
    pairs.forEach(function (pair) {
      var a = union.find(pair[1]), b = union.find(pair[2]);
      if (a === b) return;
      var x = info[a], y = info[b], strongName = pair[0] >= 1;
      var from = x.from < y.from ? x.from : y.from, to = x.to > y.to ? x.to : y.to;
      if (daysBetween(from, to) > MAX_SPAN_DAYS) return;
      if (!strongName && x.organizers.length && y.organizers.length && !overlaps(x.organizers, y.organizers)) return;
      if (x.editions.length && y.editions.length && !overlaps(x.editions, y.editions)) return;
      if (x.years.length && y.years.length && !overlaps(x.years, y.years)) return;
      union.join(a, b);
      var root = union.find(a);
      info[root] = { from: from, to: to, organizers: uniq(x.organizers.concat(y.organizers)), editions: uniq(x.editions.concat(y.editions)), years: uniq(x.years.concat(y.years)) };
    });
    var groups = {};
    rows.forEach(function (row, i) { var root = union.find(i); (groups[root] = groups[root] || []).push(row); });
    var out = [];
    Object.keys(groups).forEach(function (rootKey) {
      var members = groups[rootKey], schools = {};
      members.forEach(function (row) { if (!schools[row.item.school] || row.date < schools[row.item.school].date) schools[row.item.school] = row; });
      var list = Object.keys(schools).map(function (k) { return schools[k]; }).sort(function (a, b) {
        /* Same day: the one the scraper saw first was posted first. */
        return a.date.localeCompare(b.date) || String(a.item.first_seen || "").localeCompare(String(b.item.first_seen || "")) || String(a.item.school).localeCompare(String(b.item.school));
      });
      if (list.length < 2) return;
      out.push(summarize(members, list, options));
    });
    return out.sort(function (a, b) { return b.last_date.localeCompare(a.last_date) || b.schools.length - a.schools.length; });
  }
  function normalizeWord(w) { return rocYears(String(w).normalize ? String(w).normalize("NFKC") : String(w)).replace(/\s+/g, "").toLowerCase(); }
  /* 0 = not the same activity; 1 = same 「name」; below 1 = title similarity. */
  function matchScore(a, b) {
    if (a.nameKey && b.nameKey) {
      if (a.nameKey === b.nameKey && a.nameKey.length >= 6) return 1;
      var shortName = a.nameKey.length <= b.nameKey.length ? a.nameKey : b.nameKey, longName = shortName === a.nameKey ? b.nameKey : a.nameKey;
      if (shortName.length >= 6 && longName.indexOf(shortName) !== -1) return 1;
      /* Two different 「names」 (two separate camps from one organizer) never merge on the rest. */
      if (dice(a.nameGrams, b.nameGrams, b.nameSet) < 0.5) return 0;
    }
    if (a.key === b.key && a.key.length >= MIN_KEY) return 0.99;
    if (Math.min(a.key.length, b.key.length) < 8) return 0;
    var score = dice(a.grams, b.grams, b.gramSet);
    return score >= MATCH_DICE ? score : 0;
  }
  var CN_DIGIT = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10 };
  function cnNumber(text) {
    if (/^\d+$/.test(text)) return Number(text);
    if (text.length === 1) return CN_DIGIT[text] || 0;
    if (text[0] === "十") return 10 + (CN_DIGIT[text[1]] || 0);
    if (text[1] === "十") return (CN_DIGIT[text[0]] || 0) * 10 + (CN_DIGIT[text[2]] || 0);
    return 0;
  }
  /* 「第八屆」「第 3 場次」「第二梯」 → "屆8", "場3", "梯2". */
  function editions(title) {
    var out = [];
    String(title || "").replace(/第\s*([0-9]{1,3}|[一二三四五六七八九十]{1,3})\s*(屆|場|梯|期|波|季|回|次)/g, function (_, n, kind) {
      var value = cnNumber(n); if (value) out.push((kind === "次" ? "場" : kind) + value); return _;
    });
    return uniq(out);
  }
  /* Years the title is about (ROC): 「116學年度」「2026」「115年度」. */
  function yearsOf(title) {
    var out = [], text = rocYears(String(title || ""));
    text.replace(/(?:^|[^\d])(1[01]\d)\s*(?:學年度|年度|年|學年)/g, function (_, y) { out.push(y); return _; });
    return uniq(out);
  }
  function organizerKey(name) { return String(name || "").replace(/^(?:國立|私立|市立|縣立|財團法人|社團法人)/, "").replace(/\s+/g, ""); }
  function overlaps(a, b) { return a.some(function (v) { return b.indexOf(v) !== -1 || b.some(function (w) { return v.length >= 3 && w.length >= 3 && (v.indexOf(w) !== -1 || w.indexOf(v) !== -1); }); }); }
  function uniq(list) { var seen = {}; return list.filter(function (v) { if (seen[v]) return false; seen[v] = true; return true; }); }
  function summarize(members, list, options) {
    var titles = members.map(function (row) { return row.item.title; });
    var names = members.map(function (row) { return quotedName(row.item.title); }).filter(Boolean);
    var display = majority(names) || stripTags(titles.slice().sort(function (a, b) { return a.length - b.length; })[0]);
    var first = list[0].date, last = list[list.length - 1].date;
    /* A 「deadline」 before anyone posted the notice is an old date in a title, not this one's. */
    var deadlines = members.map(function (row) { return deadlineOf(row.item, options.titleDeadline); }).filter(function (d) { return d && d >= first; });
    var lags = list.map(function (row) { return daysBetween(first, row.date); });
    var sortedLags = lags.slice().sort(function (a, b) { return a - b; });
    var id = "x-" + list.map(function (row) { return row.item.id; }).sort()[0];
    return {
      id: id,
      name: display,
      organizer: majority(titles.map(organizerOf)),
      category: majority(members.map(function (row) { return row.item.category; }).filter(function (c) { return c && c !== "一般"; })) || "",
      deadline: majority(deadlines),
      deadline_votes: deadlines.length,
      first_date: first,
      last_date: last,
      spread_days: daysBetween(first, last),
      median_lag: sortedLags[Math.floor((sortedLags.length - 1) / 2)],
      announcement_ids: members.map(function (row) { return row.item.id; }),
      schools: list.map(function (row, i) {
        return { school: row.item.school, school_name: row.item.school_name || row.item.school, date: row.date, lag_days: lags[i], id: row.item.id, title: row.item.title, url: row.item.url || "" };
      })
    };
  }

  /* How quickly each school forwards notices that several schools post: median days after the first. */
  function schoolSpeed(groups, minGroups) {
    var lags = {}, names = {}, firsts = {};
    (groups || []).forEach(function (g) {
      g.schools.forEach(function (s) {
        (lags[s.school] = lags[s.school] || []).push(s.lag_days); names[s.school] = s.school_name;
        if (s.lag_days === 0) firsts[s.school] = (firsts[s.school] || 0) + 1;
      });
    });
    return Object.keys(lags).filter(function (k) { return lags[k].length >= (minGroups || 5); }).map(function (k) {
      var v = lags[k].slice().sort(function (a, b) { return a - b; });
      return { school: k, school_name: names[k], groups: v.length, median_lag: v[Math.floor((v.length - 1) / 2)], first_count: firsts[k] || 0 };
    }).sort(function (a, b) { return a.median_lag - b.median_lag || b.first_count / b.groups - a.first_count / a.groups; });
  }

  /* Groups that other schools posted but this school has not (yet). */
  function missingFor(groups, schoolId) {
    return (groups || []).filter(function (g) { return !g.schools.some(function (s) { return s.school === schoolId; }); });
  }

  /* 「哪些學校有公告 AI妙用大挑戰」「AI妙用大挑戰各校什麼時候公告」: the group a question is about. */
  var ASK = /哪些學校|哪幾間|幾間學校|幾所學校|多少學校|各校|其他學校|別的學校|別校|他校|跨校|每間學校|各學校|哪間學校先|誰先公告|最早公告/;
  function asksAcrossSchools(question) { return ASK.test(String(question || "")); }
  function find(groups, question, options) {
    var q = normalize(String(question || "").replace(ASK, "").replace(/有沒有|有公告|公告了?|什麼時候|何時|哪天|嗎|呢|[？?]/g, ""), (options && options.schoolWords) || []);
    if (q.length < 3) return null;
    var qg = bigrams(q), best = null, bestScore = 0;
    (groups || []).forEach(function (g) {
      var key = normalize(g.name, []), score = key.indexOf(q) !== -1 || q.indexOf(key) !== -1 ? 1 : dice(qg, bigrams(key));
      if (score > bestScore || (score === bestScore && best && g.schools.length > best.schools.length)) { best = g; bestScore = score; }
    });
    return bestScore >= 0.5 ? best : null;
  }
  function md(d) { return Number(d.slice(5, 7)) + "/" + Number(d.slice(8, 10)); }
  /* A 問校務 answer for one group, in the same shape as CyNewsAssistantQA results. */
  function answer(group, options) {
    var today = day(options && options.today) || new Date().toISOString().slice(0, 10);
    var n = group.schools.length, first = group.schools[0], last = group.schools[n - 1];
    var text = "「" + group.name + "」有 " + n + " 間學校公告過" + (group.organizer ? "（" + group.organizer + "）" : "") + "。最早是" + first.school_name + " " + md(first.date) +
      (n > 1 ? "，最晚是" + last.school_name + " " + md(last.date) + (group.spread_days ? "，前後差 " + group.spread_days + " 天" : "，同一天") : "") + "。";
    if (group.deadline) {
      var left = daysBetween(today, group.deadline);
      text += "截止日 " + md(group.deadline) + (left > 0 ? "（還有 " + left + " 天）" : left === 0 ? "（就是今天）" : "（已經過了）") + "。";
    }
    var mine = options && options.schoolId;
    if (mine && !group.schools.some(function (s) { return s.school === mine; })) text += "你的學校還沒公告這項，但可以照其他學校的公告去報名。";
    return {
      status: "answered", mode: "browse", query: options && options.query || group.name,
      summary: text, reply: { text: text + "各校的公告依時間列在下面，點開看內容：", bullets: [] },
      sources: group.schools.map(function (s) { return { id: s.id, title: s.title, date: s.date, school_name: s.school_name, url: s.url, note: s.lag_days ? "晚 " + s.lag_days + " 天" : "最早" }; }),
      evidence: [], cross_school: group
    };
  }

  return { build: build, schoolSpeed: schoolSpeed, missingFor: missingFor, find: find, answer: answer, asksAcrossSchools: asksAcrossSchools,
    normalize: normalize, quotedName: quotedName, stripTags: stripTags, organizerOf: organizerOf, editions: editions };
});
