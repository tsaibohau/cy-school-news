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

  /* 公告欄位標籤字典：公告裡「時間：…」「地點：…」這類標籤的各種寫法 → 欄位。
     answer-composer.js 用它把條列公告（一、時間：… (二)地點：…）拆成欄位，再依問題類型回答該欄位。
     time 活動時間；deadline 報名／申請的期限；place 地點；audience 對象；signup 報名方式；
     bring 要帶或要備的東西；fee 費用；contact 聯絡；purpose 活動內容與目的。 */
  var FIELD_LABELS = {
    time: ["活動時間", "活動日期", "辦理時間", "辦理日期", "舉辦時間", "舉辦日期", "舉行時間", "舉行日期", "研習時間", "研習日期", "上課時間", "上課日期", "開課日期", "比賽時間", "比賽日期", "競賽時間", "競賽日期", "考試時間", "考試日期", "決賽時間", "初賽時間", "講座時間", "演講時間", "演出時間", "活動期間", "活動時程", "活動日程", "營隊時間", "營隊日期", "開營日期", "展出時間", "展期", "報到時間", "日期時間", "日期", "時間", "時程", "期程", "日程", "辦理期間", "研習期間", "課程時間", "課程日期"],
    deadline: ["報名截止", "報名截止日", "報名截止日期", "報名截止時間", "截止日期", "截止時間", "截止日", "報名期限", "申請期限", "收件期限", "繳交期限", "受理期限", "報名期間", "報名時間", "報名日期", "申請期間", "申請時間", "申請日期", "收件期間", "收件時間", "徵件期間", "徵稿期間", "投稿期限", "繳交時間", "線上報名時間", "報名及繳件期限", "回覆期限", "填報期限"],
    place: ["活動地點", "辦理地點", "舉辦地點", "舉行地點", "上課地點", "研習地點", "比賽地點", "競賽地點", "考試地點", "集合地點", "報到地點", "展出地點", "地點", "場地", "場所", "會場", "地址", "活動場地", "研習場地", "辦理場地"],
    audience: ["參加對象", "參與對象", "報名對象", "招生對象", "招收對象", "適用對象", "活動對象", "研習對象", "參賽對象", "邀請對象", "開放對象", "對象", "報名資格", "參加資格", "申請資格", "參賽資格", "資格條件", "資格"],
    signup: ["報名方式", "報名網址", "報名連結", "報名辦法", "報名途徑", "報名管道", "報名表單", "報名網站", "報名流程", "報名及繳交方式", "線上報名", "網路報名", "申請方式", "申請辦法", "申請流程", "參加方式", "參賽方式", "繳交方式", "收件方式", "投稿方式", "辦理方式", "報名方法"],
    fee: ["費用", "報名費", "報名費用", "收費", "收費標準", "活動費用", "參加費用", "課程費用", "經費", "註冊費", "材料費", "繳費方式", "費用說明"],
    bring: ["攜帶物品", "攜帶", "應備文件", "應備資料", "應備物品", "應備", "應繳資料", "應繳文件", "自備物品", "自備", "檢附資料", "檢附文件", "應檢附", "準備事項", "報名文件", "所需文件", "繳交資料", "繳交文件", "備審資料", "需備", "需攜帶", "請攜帶", "應攜帶"],
    contact: ["聯絡人", "連絡人", "聯絡方式", "聯絡電話", "連絡電話", "聯絡資訊", "聯絡窗口", "聯繫窗口", "洽詢", "洽詢電話", "洽詢專線", "洽詢方式", "諮詢電話", "諮詢專線", "承辦人", "承辦人員", "承辦單位", "電話", "分機", "電子信箱", "電子郵件", "E-mail", "Email", "報名洽詢"],
    quota: ["名額", "人數", "招生名額", "招收名額", "錄取名額", "參加名額", "報名名額", "員額", "限額", "人數限制", "名額限制", "可提報名額", "推薦名額"],
    purpose: ["活動目的", "辦理目的", "目的", "宗旨", "活動宗旨", "活動內容", "課程內容", "研習內容", "內容", "活動簡介", "課程簡介", "簡介", "活動介紹", "介紹", "活動說明", "活動概述", "概述", "研習主題", "活動主題", "主題", "緣起", "辦理緣起", "計畫目標", "主旨"]
  };
  /* 沒收在字典裡的標籤（網路報名時間、補件截止日…）依結尾關鍵字歸類。順序即優先序。 */
  var LABEL_SUFFIX = [
    ["deadline", /(?:報名|申請|收件|截止|繳交|徵件|徵稿|投稿|回覆|填報|繳件).{0,6}(?:時間|日期|期間|期限|日)$|截止(?:日期|時間|日)?$|期限$/],
    ["time", /(?:時間|日期|期間|期程|日程|時程)$/],
    ["place", /(?:地點|場地|場所|會場|地址)$/],
    ["quota", /(?:名額|人數|員額|限額)$/],
    ["audience", /(?:對象|資格|條件)$/],
    ["signup", /(?:報名|申請|投稿|參加|參賽|繳交|收件).{0,4}(?:方式|辦法|方法|網址|連結|流程|表單|網站)$|報名$/],
    ["fee", /(?:費用|費|經費)$/],
    ["bring", /(?:物品|文件|資料|證件)$/],
    ["contact", /(?:電話|聯絡|洽詢|窗口|信箱|承辦|專線)/],
    ["purpose", /(?:目的|宗旨|內容|簡介|主旨|主題|緣起)$/]
  ];
  /* 問題的說法 → 想問的欄位（依序比對，先中先贏）。 */
  var QUESTION_SLOTS = [
    ["fee", /多少錢|多少費用|費用|收費|要錢|要付|免費嗎|免費的嗎|報名費|學費|要繳多少|價錢|價格/],
    ["contact", /問誰|找誰|聯絡誰|聯絡方式|怎麼聯絡|如何聯絡|聯絡人|洽詢|承辦|分機|電話|信箱|窗口/],
    ["bring", /要帶|需要帶|攜帶|帶什麼|帶哪些|要準備|需要準備|準備什麼|準備哪些|應備|自備|備妥|要交什麼|要繳什麼|繳交什麼|檢附什麼|需要什麼(?:文件|資料|證件)|什麼文件|什麼資料/],
    ["deadline", /截止|期限|最晚|來得及|幾號前|哪天前|何時前|什麼時候前|報名到|報名時間|報名期間|報名日期|什麼時候報名|何時報名|何時申請|什麼時候申請|申請時間|申請期間|收件|還能報|還可以報|報得到|還有名額/],
    ["quota", /名額|幾個人|幾人|人數|收幾|招幾|錄取幾|限幾/],
    ["signup", /怎麼報名|如何報名|怎樣報名|報名方式|報名網址|報名連結|報名表單|報名辦法|在哪報名|哪裡報名|去哪報名|怎麼申請|如何申請|申請方式|申請辦法|怎麼參加|如何參加|怎麼投稿|如何投稿|怎麼繳|如何繳|報名嗎|要報名|需要報名|需報名|要不要報名|可以報名|能報名|報名$|報名[？?]*$/],
    ["place", /在哪|哪裡|哪邊|哪間|哪個地方|去哪|地點|場地|地址|會場|線上嗎|實體嗎|線上還是|在哪裡舉行/],
    ["audience", /誰可以|誰能|誰有|哪些人|什麼人|對象|資格|條件|限制|高[一二三]可以|高[一二三]的?(?:學生|同學)?能|國[一二三]可以|教師可以|老師可以|學生可以|年級|限.{0,6}(?:嗎|才)/],
    ["time", /什麼時候|何時|幾號|幾月|哪天|哪一天|哪幾天|日期|幾點|時間|星期幾|禮拜幾|幾時|什麼時間|多久|開始|何日/],
    ["summary", /是什麼|在幹嘛|在做什麼|做什麼|講什麼|說什麼|介紹|簡介|內容|重點|大概|概要|概況|怎麼回事|什麼活動|什麼比賽|什麼課程|什麼研習|詳情|細節|有什麼好|主要/]
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

  /* Results are pure functions of their input and are asked for once per notice per word,
     so each is cached (問校務 spent ~40% of its time here). Callers get copies of arrays. */
  var CACHE_LIMIT = 20000;
  function memo(fn) {
    var cache = new Map();
    return function (key) {
      var hit = cache.get(key);
      if (hit === undefined) { if (cache.size > CACHE_LIMIT) cache.clear(); hit = fn(key); cache.set(key, hit); }
      return hit;
    };
  }
  var compactText = memo(function (value) {
    return value.toLowerCase().replace(/[^0-9a-z㐀-鿿]+/g, "").replace(/臺/g, "台");
  });
  function compact(value) { return compactText(value == null ? "" : String(value)); }
  function key(value) { return value == null ? "" : String(value); }
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
  var expandWide = memo(function (term) { return expandRaw(term, true); }), expandSame = memo(function (term) { return expandRaw(term, false); });
  function expand(term, options) { return (options && options.includes === false ? expandSame : expandWide)(compact(key(term))).slice(); }
  function expandRaw(term, includes) {
    var key = term, out = [key];
    (groupsOf[key] || []).forEach(function (index) { SAME[index].forEach(function (t) { out.push(compact(t)); }); });
    if (includes) {
      var narrower = INCLUDES[key] || [];
      (groupsOf[key] || []).forEach(function (index) { SAME[index].forEach(function (t) { narrower = narrower.concat(INCLUDES[compact(t)] || []); }); });
      narrower.forEach(function (t) { out.push(compact(t)); (groupsOf[compact(t)] || []).forEach(function (index) { SAME[index].forEach(function (s) { out.push(compact(s)); }); }); });
    }
    return unique(out);
  }
  /* Known terms inside a phrase, longest first, without overlaps: 「閱讀心得報告要交」 → [閱讀心得報告]. */
  var findCached = memo(function (text) { return findRaw(text); });
  function find(phrase) { return findCached(compact(key(phrase))).slice(); }
  function findRaw(text) {
    var found = [];
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
  var variantsCached = new Map();
  function variants(phrase, limit) {
    var base = compact(key(phrase)), max = limit || 12, cacheKey = max + "\u0001" + base, hit = variantsCached.get(cacheKey);
    if (hit) return hit.slice();
    if (variantsCached.size > CACHE_LIMIT) variantsCached.clear();
    hit = variantsRaw(base, max); variantsCached.set(cacheKey, hit);
    return hit.slice();
  }
  function variantsRaw(base, max) {
    var out = [base];
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
  var broaderCached = memo(function (term) { return broaderRaw(term); });
  function broader(term) { return broaderCached(compact(key(term))).slice(); }
  function broaderRaw(term) {
    var forms = expand(term, { includes: false }), out = [];
    Object.keys(INCLUDES).forEach(function (key) {
      if (INCLUDES[key].some(function (t) { return forms.indexOf(compact(t)) !== -1; })) out = out.concat(expand(key, { includes: false }));
    });
    return unique(out);
  }
  /* Every useful way to look for a phrase: its synonyms, and the synonyms and broader subjects
     of the known terms inside it (「可以染頭髮嗎」 → 頭髮、髮型、服儀…). */
  var conceptsCached = memo(function (phrase) { return conceptsRaw(phrase); });
  function concepts(phrase) { return conceptsCached(key(phrase)).slice(); }
  function conceptsRaw(phrase) {
    var out = expand(phrase, { includes: false });
    find(phrase).forEach(function (term) { out = out.concat(expand(term, { includes: false }), broader(term)); });
    return unique(out);
  }
  /* Two terms mean the same thing (or one includes the other). */
  function related(a, b) {
    a = compact(key(a)); b = compact(key(b));
    return a === b || expand(a).indexOf(b) !== -1 || expand(b).indexOf(a) !== -1;
  }
  /* 別人辦的運動會不是本校的校運會：主辦單位／層級／對象的限定詞放在「運動會」前面
     （全民e化資訊運動會、全國運動會、全中運、縣市聯合運動會）。問校運會時，這些字樣整段不算。 */
  var OUTSIDE_SPORTS_QUALIFIERS = ["全民", "全國", "全中", "全運", "e化", "資訊", "縣市", "縣運", "市際", "聯合", "中小學", "大專", "原住民", "身心障礙", "身障", "教職員", "教師", "親子", "社區", "區運", "海外", "國際", "世界", "亞洲", "奧林匹克"];
  var OUTSIDE_SPORTS_RE = new RegExp("(?:" + OUTSIDE_SPORTS_QUALIFIERS.join("|") + ")[^，。；、：:\\s（）()]{0,8}?(?:運動會|運動大會)|全中運|全運會|全民運動", "gi");
  /* 問的是運動會／校運會嗎？ */
  var SPORTS_DAY_ASK = /運動會|校運/;
  /* 把「別人辦的運動會」字樣拿掉，剩下的才拿來比對校運會。 */
  function ownEventText(query, text) {
    var t = text == null ? "" : String(text);
    return SPORTS_DAY_ASK.test(String(query == null ? "" : query)) ? t.replace(OUTSIDE_SPORTS_RE, " ") : t;
  }
  return { OUTSIDE_SPORTS_QUALIFIERS: OUTSIDE_SPORTS_QUALIFIERS, ownEventText: ownEventText, FIELD_LABELS: FIELD_LABELS, LABEL_SUFFIX: LABEL_SUFFIX, QUESTION_SLOTS: QUESTION_SLOTS, SAME: SAME, INCLUDES: INCLUDES, expand: expand, find: find, variants: variants, related: related, broader: broader, concepts: concepts, compact: compact };
});
