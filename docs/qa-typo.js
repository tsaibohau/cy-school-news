/* 問校務打錯字：「段烤」「學身證」「請價」→ 段考、學生證、請假。
   只改一個字，而且只在改完會變成學校用詞時才改：
   只接受同音、近音字（烤／考、價／假、積／績…），避免把正確的詞改成別的詞（缺曠 ≠ 缺席）。
   不呼叫外部服務。 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsTypo = api;
})(typeof window !== "undefined" ? window : this, function (root) {
  "use strict";
  var Synonyms = root && root.CyNewsSynonyms;
  if (!Synonyms && typeof module !== "undefined" && module.exports) Synonyms = require("./qa-synonyms.js");
  var Taxonomy = root && root.CyNewsSearchTaxonomy;
  if (!Taxonomy && typeof module !== "undefined" && module.exports) Taxonomy = require("./search-taxonomy.js");

  /* Characters typed for one another (同音、近音、注音選錯). */
  var SOUND_GROUPS = ["考烤拷", "試式事市", "假價架駕嫁", "請情清晴", "繳角腳", "交教膠焦", "證正政症", "課顆科棵", "績積跡蹟", "費廢",
    "補捕", "曆歷力立", "選線", "獎講槳", "狀壯", "社設射涉", "團糰", "學穴", "生聲升身", "期其奇棋旗", "末沫莫", "測側策廁", "驗研煙",
    "報抱暴", "名明鳴", "資姿", "格隔", "規歸龜", "定訂", "懲成程", "罰閥", "週周洲", "節結潔捷", "班般搬", "級極及急", "導倒",
    "師失詩施", "校笑效孝", "園員圓原", "宿速", "舍捨設", "餐參", "營迎贏", "隊對", "賽塞", "幹乾", "部步布", "處觸", "室式適",
    "徵征", "申身伸深", "辦半伴扮", "法發", "簽籤千", "升生陞", "登燈", "記紀計技季", "警景境敬", "誡戒界介", "曠礦況", "缺卻確", "點典電店", "今金巾斤", "議儀義意易", "儀宜", "容榮融", "業夜頁", "禮理裡李里", "典點", "書輸舒", "館管", "借介屆", "還環", "制治致質", "服福復", "裝莊", "午五舞", "旅律", "遊游油", "熱惹", "寒韓含", "暑鼠屬", "開凱", "註住柱助", "冊策側", "雜砸", "減檢簡剪", "免面勉", "校效"];
  var SAME_SOUND = {};
  SOUND_GROUPS.forEach(function (group) {
    var chars = group.split("");
    chars.forEach(function (a) { chars.forEach(function (b) { if (a !== b) SAME_SOUND[a + b] = true; }); });
  });
  var EXTRA = ["學生證", "請假", "段考", "期中考", "期末考", "模擬考", "補考", "重補修", "成績單", "獎學金", "行事曆", "課表", "選課", "社團",
    "畢業典禮", "開學", "寒假", "暑假", "放假", "服儀", "服裝儀容", "制服", "運動服", "遲到", "早退", "曠課", "記過", "警告", "嘉獎",
    "小功", "大功", "申誡", "銷過", "愛校服務", "圖書館", "借書", "還書", "宿舍", "住宿", "午餐", "營養午餐", "校車", "學雜費", "減免",
    "註冊", "繳費", "畢業旅行", "校外教學", "體育課", "游泳課", "健康檢查", "輔導室", "教務處", "學務處", "總務處", "教官", "導師"];
  var VOCAB = null;
  /* Question and filler words are never a typo of a school word (「怎麼辦」 is not 「怎麼去」). */
  var QUESTION = /[怎麼什哪嗎呢吧啊喔嘛誰幾多少要不可以會能]/;
  function compact(s) { return String(s == null ? "" : s).replace(/[\s　]+/g, "").toLowerCase(); }
  function vocab() {
    if (VOCAB) return VOCAB;
    var set = {};
    function add(w) { w = compact(w); if (w.length >= 2 && w.length <= 6 && /^[㐀-鿿]+$/.test(w)) { if (!QUESTION.test(w)) set[w] = true; } }
    (Synonyms && Synonyms.SAME || []).forEach(function (g) { g.forEach(add); });
    (Synonyms && Synonyms.INCLUDES ? Object.keys(Synonyms.INCLUDES) : []).forEach(add);
    ((Taxonomy && Taxonomy.topics) || []).forEach(function (t) { (t.terms || []).forEach(add); });
    EXTRA.forEach(add);
    VOCAB = { set: set, byLength: {} };
    Object.keys(set).forEach(function (w) { (VOCAB.byLength[w.length] = VOCAB.byLength[w.length] || []).push(w); });
    return VOCAB;
  }
  function oneOff(window, word) {
    var diff = -1;
    for (var i = 0; i < word.length; i++) if (window[i] !== word[i]) { if (diff !== -1) return -1; diff = i; }
    return diff;
  }
  /* fix(query) → { query, fixes: [{ from, to }] } (fixes empty when nothing changed). */
  function fix(query) {
    var q = String(query == null ? "" : query), v = vocab(), fixes = [];
    var lengths = Object.keys(v.byLength).map(Number).sort(function (a, b) { return b - a; });
    var spans = [];
    Object.keys(v.byLength).forEach(function (len) {
      len = Number(len);
      for (var i = 0; i + len <= q.length; i++) if (v.set[q.slice(i, i + len)]) spans.push([i, i + len]);
    });
    lengths.forEach(function (len) {
      for (var start = 0; start + len <= q.length; start++) {
        var win = q.slice(start, start + len);
        if (!/^[㐀-鿿]+$/.test(win) || v.set[win] || QUESTION.test(win)) continue;
        /* Leave it alone when any of its characters already belongs to a correct word
           (「期中考是」: 考 is part of 期中考, so 「考是」 is not a typo of 考試). */
        /* A correct word inside the window (服裝 in 服裝議容) is fine; one reaching outside it is not. */
        var end = start + len;
        if (spans.some(function (sp) { return sp[0] < end && sp[1] > start && (sp[0] < start || sp[1] > end); })) continue;
        /* A correct word plus the next character (「期中考」+「是」) is not a typo of a longer word. */
        if (spans.some(function (sp) { return sp[0] >= start && sp[1] <= end && sp[1] - sp[0] >= len - 1; })) continue;
        var best = null;
        (v.byLength[len] || []).some(function (word) {
          var at = oneOff(win, word);
          if (at === -1) return false;
          if (!SAME_SOUND[win[at] + word[at]]) return false;
          best = word;
          return true;
        });
        if (best) { fixes.push({ from: win, to: best }); q = q.slice(0, start) + best + q.slice(start + len); spans.push([start, start + len]); }
      }
    });
    return { query: q, fixes: fixes };
  }
  return { fix: fix, vocab: vocab, SAME_SOUND: SAME_SOUND };
});
