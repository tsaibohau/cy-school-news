/* 問校務同義詞資料庫：學生的說法 ↔ 學校規定、行事曆、公告裡的寫法。
   same：同一件事的不同說法（彼此互通）。
   includes：大詞包含的小詞（問「段考」也要找「期中考」「期末考」；問「期中考」不會反過來找「期末考」）。
   新增詞條時只改這個檔；搜尋（search-query.js）與問校務（assistant-qa.js）都從這裡讀。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsSynonyms = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var SAME = [
    /* 考試與成績 */
    ["段考", "定期考", "定期考查", "定期評量", "定期考試", "定期性考試"],
    ["期中考", "期中評量", "期中考查"],
    ["期末考", "期末評量", "期末考查"],
    ["模擬考", "模考"],
    ["複習考", "複習測驗"],
    ["補考", "補行考試"],
    ["重補修", "重修", "補修"],
    ["考試範圍", "考試進度", "命題範圍", "段考範圍"],
    ["考程表", "考試日程", "考試時間表", "考程"],
    ["學測", "學科能力測驗"],
    ["統測", "統一入學測驗"],
    ["分科測驗", "分科考試", "指考"],
    ["英檢", "全民英檢", "GEPT"],
    ["成績單", "成績通知單"],
    ["學期成績", "學業成績"],
    /* 請假與出缺席 */
    ["請假", "假單", "請假單"],
    ["曠課", "翹課", "蹺課", "缺曠"],
    ["遲到", "晚到"],
    ["早退", "提早離校", "提前離校"],
    ["公假", "公差假"],
    ["生理假", "生理日假"],
    ["身心調適假", "身心假"],
    ["出缺席", "出勤", "缺席紀錄"],
    ["全勤", "全勤獎"],
    /* 獎懲 */
    ["作弊", "舞弊", "夾帶小抄", "偷看答案", "代考", "代人考試"],
    /* Students say 奧林匹克; the notices say 奧林匹亞. */
    ["奧林匹亞", "奧林匹克", "奧賽"],
    ["地科", "地球科學"],
    /* Misconduct words students use vs. the words the 獎懲規定 uses. */
    ["打架", "鬥毆", "互毆", "毆打", "打人", "肢體衝突"],
    ["抽菸", "吸菸", "抽煙", "吸煙", "菸品", "電子煙", "香菸"],
    ["喝酒", "飲酒", "酗酒", "酒類"],
    ["偷竊", "偷東西", "竊取", "竊盜", "偷拿"],
    ["賭博", "賭錢", "賭具"],
    ["說謊", "欺騙", "偽造", "冒用", "塗改"],
    ["頂撞師長", "頂撞老師", "辱罵師長", "辱罵老師", "罵老師", "對師長不敬", "侮辱"],
    ["破壞公物", "毀損公物", "損壞公物"],
    ["服裝不整", "服儀不整", "服儀違規", "違反服儀"],
    ["記過", "懲處", "處分"],
    ["嘉獎", "敘獎", "記功"],
    ["銷過", "改過銷過", "銷過自新", "消過"],
    ["愛校服務", "勞動服務"],
    /* 服儀與生活 */
    ["服儀", "服裝儀容", "服裝規定"],
    ["制服", "校服"],
    ["運動服", "體育服", "體育服裝"],
    ["便服", "便服日"],
    ["髮型", "髮式", "頭髮", "髮禁"],
    ["手機", "行動電話", "智慧型手機", "行動載具", "3C"],
    ["平板", "平板電腦"],
    ["作息", "作息時間", "作息時間表", "上課時間"],
    ["早自習", "早修"],
    ["晚自習", "夜自習", "夜讀"],
    ["自修室", "自習室", "K書中心"],
    ["午休", "午睡"],
    ["放學", "放學時間", "離校時間"],
    ["到校時間", "幾點到校", "上學時間"],
    ["升旗", "朝會", "升旗典禮"],
    ["打掃", "掃地", "打掃時間", "清潔工作", "整潔"],
    ["午餐", "營養午餐", "團膳", "訂餐", "便當"],
    ["合作社", "福利社"],
    ["校車", "交通車", "專車"],
    ["腳踏車", "自行車", "單車"],
    ["機車", "摩托車"],
    ["停車", "車棚", "停車證"],
    ["宿舍", "住宿", "學生宿舍", "寢室"],
    ["學生證", "識別證", "數位學生證"],
    ["失物", "失物招領", "遺失物", "東西掉了", "弄丟", "遺失"],
    ["冷氣", "空調", "冷氣卡", "冷氣費"],
    ["網路", "無線網路", "wifi", "WiFi"],
    ["置物櫃", "個人櫃", "鞋櫃"],
    /* 費用與補助 */
    ["學雜費", "註冊費", "代收代辦費", "繳費單"],
    ["獎學金", "獎助學金", "助學金"],
    ["學雜費減免", "減免學雜費", "學費減免"],
    ["就學貸款", "學貸"],
    ["費用", "收費", "多少錢", "要繳多少"],
    /* 課程 */
    ["課表", "功課表", "班級課表"],
    ["選課", "選修", "加退選", "選課系統"],
    ["多元選修", "多選"],
    ["彈性學習", "彈性學習時間"],
    ["自主學習", "自主學習計畫"],
    ["加深加廣", "加深加廣選修"],
    ["微課程", "微學分"],
    ["課輔", "課業輔導", "輔導課", "第八節"],
    ["暑輔", "暑期輔導", "暑期課業輔導"],
    ["寒輔", "寒假輔導", "寒假課業輔導"],
    ["補課", "補上課", "補行上課"],
    ["體育課", "體育課程"],
    ["游泳課", "游泳"],
    ["社團", "社課", "社團活動"],
    ["學習歷程", "學習歷程檔案", "學歷檔案", "學習檔案"],
    ["小論文", "專題論文"],
    ["閱讀心得", "讀書心得", "心得報告", "閱讀心得報告", "讀書報告"],
    ["選組", "類組", "選類組"],
    /* 升學 */
    ["繁星", "繁星推薦"],
    ["申請入學", "個人申請"],
    ["特殊選才", "特選"],
    ["四技二專", "技專校院"],
    ["志願", "選填志願", "填志願"],
    /* 行事曆 */
    ["開學", "開學日", "開學典禮", "始業式"],
    ["結業式", "休業式", "期末結業"],
    ["寒假", "寒休"],
    ["暑假", "暑休"],
    ["放假", "休假", "停課", "不用上課"],
    ["颱風假", "停班停課", "颱風停課"],
    ["補假", "補休"],
    ["連假", "長假"],
    ["校慶", "校慶日", "週年校慶"],
    ["運動會", "校慶運動會", "校運會", "校運", "體育表演會"],
    ["畢業典禮", "畢典"],
    ["畢業旅行", "畢旅"],
    ["校外教學", "戶外教學"],
    ["健康檢查", "健檢", "體檢"],
    ["家長日", "親師座談", "班親會", "親師日"],
    ["週會", "班週會"],
    ["班會", "班會課"],
    /* 處室與人 */
    ["教務處", "教務"],
    ["學務處", "訓導處", "學務"],
    ["總務處", "總務"],
    ["輔導室", "輔導處", "學生輔導中心", "輔導中心"],
    ["教官室", "生輔組", "生活輔導組"],
    ["註冊組", "註冊"],
    ["圖書館", "圖書室", "圖書資訊中心", "圖資中心"],
    ["健康中心", "保健室", "醫護室"],
    ["導師", "班導", "班導師"],
    ["家長", "父母", "爸媽", "監護人"],
    ["申訴", "陳情", "投訴"],
    ["霸凌", "欺負", "霸凌事件"],
    /* 動作 */
    ["借書", "借閱", "借還書"],
    ["還書", "歸還"],
    ["續借", "延長借期"],
    ["借期", "借多久", "借閱期限", "借幾天", "借閱期間"],
    ["報名", "登記參加", "報名參加"],
    ["繳交", "交件", "送交", "上傳", "繳件"],
    ["截止", "截止日", "最後一天", "期限", "收件截止"],
    ["轉學", "轉學考", "轉入"],
    ["休學", "暫停學籍"],
    ["復學", "回復學籍"],
    ["志工", "志願服務", "服務學習", "服務時數"],
    /* 校名與機構簡稱：學生說簡稱，公告寫全名（台／臺在 compact 時已視為相同） */
    ["亞大", "亞洲大學"],
    ["中研院", "中央研究院"],
    ["聯大", "聯合大學", "國立聯合大學"],
    ["北教大", "臺北教育大學", "國立臺北教育大學"],
    ["中教大", "臺中教育大學", "國立臺中教育大學"],
    ["交大", "陽明交通大學", "陽明交大", "國立陽明交通大學"],
    ["成大", "成功大學", "國立成功大學", "ncku"],
    ["中山", "中山大學", "國立中山大學", "nsysu"],
    ["台大", "臺灣大學", "國立臺灣大學", "ntu"],
    ["清大", "清華大學", "國立清華大學", "nthu"],
    ["政大", "政治大學", "國立政治大學", "nccu"],
    ["師大", "臺灣師範大學", "國立臺灣師範大學", "ntnu"],
    ["海大", "海洋大學", "國立臺灣海洋大學"],
    ["中興", "中興大學", "國立中興大學", "nchu"],
    ["中正", "中正大學", "國立中正大學"],
    ["嘉大", "嘉義大學", "國立嘉義大學"],
    ["東華", "東華大學", "國立東華大學"],
    ["中央大學", "國立中央大學"],
    ["北科大", "臺北科技大學", "國立臺北科技大學"],
    ["高科大", "高雄科技大學", "國立高雄科技大學"],
    ["雲科大", "雲林科技大學", "國立雲林科技大學"],
    ["勤益", "勤益科大", "勤益科技大學"],
    ["弘光", "弘光科大", "弘光科技大學"],
    ["元智", "元智大學"],
    ["比賽", "競賽"],
    ["諾貝爾", "nobel"],
    ["中一中", "臺中一中", "臺中第一高級中等學校", "臺中市立臺中第一高級中等學校"],
    ["中二中", "臺中二中", "臺中第二高級中等學校"],
    ["南一中", "臺南一中", "臺南第一高級中等學校"],
    ["雄中", "高雄中學", "高雄高級中學"],
    ["竹中", "新竹高中", "新竹高級中學"],
    ["北一女", "臺北市立第一女子高級中學"],
    ["開放日", "open day", "校園開放日", "open house"],
    /* 活動與主題用語 */
    ["ai代理人", "ai agent", "aiagent", "ai代理", "智慧代理人"],
    ["社會情緒學習", "sel"],
    ["有獎問答", "有獎徵答", "有獎活動"],
    ["電競", "電子競技", "電競賽"],
    ["展覽", "特展", "展出"],
    ["科普", "科學普及", "科學傳播"],
    ["旅遊", "觀光"],
    ["無人機", "空拍機"],
    ["投影片", "簡報"],
    ["英聽", "英語聽力", "英文聽力"],
    ["英閱", "英文閱讀", "英語閱讀"],
    ["性平", "性別平等"],
    ["母語", "本土語", "本土語文", "本土語言"],
    ["零重力", "微重力"]
  ];
  var INCLUDES = {
    "段考": ["期中考", "期末考", "第一次段考", "第二次段考", "第三次段考"],
    "考試": ["段考", "期中考", "期末考", "模擬考", "複習考", "補考", "小考"],
    "大考": ["學測", "統測", "分科測驗"],
    "請假": ["病假", "事假", "公假", "喪假", "生理假", "身心調適假"],
    "獎懲": ["嘉獎", "小功", "大功", "警告", "小過", "大過", "記過", "銷過"],
    /* 「會被記過」 is answered by a clause that says 記小過、記大過 or 警告. */
    "記過": ["記小過", "記大過", "小過", "大過", "記警告", "警告", "申誡"],
    "放假": ["寒假", "暑假", "補假", "連假", "颱風假", "國定假日"],
    "升學": ["學測", "統測", "繁星", "申請入學", "特殊選才", "分科測驗"],
    "處室": ["教務處", "學務處", "總務處", "輔導室", "教官室", "圖書館"],
    "費用": ["學雜費", "冷氣費", "代收代辦費", "午餐費"],
    "借書": ["借期", "續借", "借幾本", "逾期"],
    "出缺席": ["遲到", "早退", "曠課", "請假"],
    "作息": ["放學", "遲到", "早退", "到校時間", "午休", "早自習", "升旗", "打掃", "上課時間"],
    "服儀": ["髮型", "制服", "運動服", "便服", "外套"],
    "生活": ["服儀", "作息", "請假", "手機"],
    "學習歷程": ["多元表現", "課程學習成果", "勾選"],
    "選課": ["多元選修", "加深加廣", "彈性學習", "自主學習"]
  };

  function compact(value) {
    return String(value == null ? "" : value).toLowerCase().replace(/[^0-9a-z㐀-鿿]+/g, "").replace(/臺/g, "台");
  }
  var groupsOf = {}, allTerms = [];
  SAME.forEach(function (group, index) {
    group.forEach(function (term) {
      var key = compact(term);
      if (!key) return;
      (groupsOf[key] = groupsOf[key] || []).push(index);
      if (allTerms.indexOf(key) === -1) allTerms.push(key);
    });
  });
  Object.keys(INCLUDES).forEach(function (term) { var key = compact(term); if (allTerms.indexOf(key) === -1) allTerms.push(key); });
  allTerms.sort(function (a, b) { return b.length - a.length; });
  function unique(rows) { var seen = {}; return rows.filter(function (row) { if (!row || seen[row]) return false; seen[row] = true; return true; }); }

  /* Every way to say this term (itself first). includes=true also adds the narrower terms. */
  function expand(term, options) {
    var key = compact(term), out = [key];
    (groupsOf[key] || []).forEach(function (index) { SAME[index].forEach(function (t) { out.push(compact(t)); }); });
    if (!options || options.includes !== false) {
      var narrower = INCLUDES[key] || [];
      (groupsOf[key] || []).forEach(function (index) { SAME[index].forEach(function (t) { narrower = narrower.concat(INCLUDES[compact(t)] || []); }); });
      narrower.forEach(function (t) { out.push(compact(t)); (groupsOf[compact(t)] || []).forEach(function (index) { SAME[index].forEach(function (s) { out.push(compact(s)); }); }); });
    }
    return unique(out);
  }
  /* Known terms inside a phrase, longest first, without overlaps: 「閱讀心得報告要交」 → [閱讀心得報告]. */
  function find(phrase) {
    var text = compact(phrase), found = [];
    allTerms.forEach(function (term) {
      if (term.length < 2) return;
      var at = text.indexOf(term);
      if (at === -1) return;
      found.push(term);
      text = text.slice(0, at) + "\u0001".repeat(term.length) + text.slice(at + term.length);
    });
    return found;
  }
  /* The phrase rewritten with each synonym of the terms it contains (at most `limit` variants):
     「閱讀心得報告」 → 閱讀心得、讀書心得、心得報告… so a title written either way matches. */
  function variants(phrase, limit) {
    var base = compact(phrase), out = [base], max = limit || 12;
    find(base).forEach(function (term) {
      expand(term).forEach(function (alt) {
        if (out.length >= max || alt === term) return;
        out.push(base.split(term).join(alt));
      });
    });
    return unique(out);
  }
  /* The broader subjects a term belongs to: 記過 → 獎懲, 放學 → 作息. A rule about the broader
     subject usually covers the narrower question. */
  function broader(term) {
    var forms = expand(term, { includes: false }), out = [];
    Object.keys(INCLUDES).forEach(function (key) {
      if (INCLUDES[key].some(function (t) { return forms.indexOf(compact(t)) !== -1; })) out = out.concat(expand(key, { includes: false }));
    });
    return unique(out);
  }
  /* Every useful way to look for a phrase: its synonyms, and the synonyms and broader subjects
     of the known terms inside it (「可以染頭髮嗎」 → 頭髮、髮型、服儀…). */
  function concepts(phrase) {
    var out = expand(phrase, { includes: false });
    find(phrase).forEach(function (term) { out = out.concat(expand(term, { includes: false }), broader(term)); });
    return unique(out);
  }
  /* Two terms mean the same thing (or one includes the other). */
  function related(a, b) {
    a = compact(a); b = compact(b);
    return a === b || expand(a).indexOf(b) !== -1 || expand(b).indexOf(a) !== -1;
  }
  return { SAME: SAME, INCLUDES: INCLUDES, expand: expand, find: find, variants: variants, related: related, broader: broader, concepts: concepts, compact: compact };
});
