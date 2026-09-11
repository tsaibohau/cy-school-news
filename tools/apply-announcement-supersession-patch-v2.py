from pathlib import Path

qa_path = Path('docs/assistant-qa.js')
test_path = Path('tests/test_assistant_attachment_qa.js')
qa = qa_path.read_text(encoding='utf-8')

if 'function preferNewestRelated(query, ranked)' not in qa:
    marker = '  function rank(query, items, details, options) {'
    helper = r'''  function periodToken(value) {
    var text = clean(value), match = text.match(/(\d{2,4})\s*[-－]\s*([12])|(?:民國\s*)?(\d{2,4})\s*學年(?:度)?(?:第?\s*([一二12])\s*學期)?/);
    if (!match) return "";
    var year = match[1] || match[3] || "", term = match[2] || match[4] || "";
    if (term === "一") term = "1";
    if (term === "二") term = "2";
    return year + (term ? "-" + term : "");
  }
  function rowDate(row) {
    var item = row && row.item || {};
    return String(item.date || item.first_seen || "").slice(0, 10);
  }
  function familyText(row) {
    var title = clean(row && row.item && row.item.title || "");
    return compact(title
      .replace(/(?:民國\s*)?\d{2,4}\s*學年(?:度)?/g, " ")
      .replace(/\d{2,4}\s*[-－]\s*[12]/g, " ")
      .replace(/第?[一二12]\s*學期/g, " ")
      .replace(/修正版|修正|更正|更新|新版|公告|通知|名單|開設情形|上課地點|上課教室/g, " "));
  }
  function grams(value) {
    value = compact(value); var out = [];
    if (value.length < 2) return value ? [value] : [];
    for (var i = 0; i + 2 <= value.length; i++) out.push(value.slice(i, i + 2));
    return unique(out);
  }
  function familySimilarity(a, b) {
    var left = grams(familyText(a)), right = grams(familyText(b));
    if (!left.length || !right.length) return 0;
    var lookup = {}; right.forEach(function (g) { lookup[g] = true; });
    var shared = left.filter(function (g) { return lookup[g]; }).length;
    return shared / Math.max(1, Math.min(left.length, right.length));
  }
  function sameSchool(a, b) {
    var ai = a && a.item || {}, bi = b && b.item || {};
    return String(ai.school || ai.school_id || "") === String(bi.school || bi.school_id || "");
  }
  function subjectOverlap(query, row) {
    var words = subjectTerms(query), text = compact(clean((row && row.item && row.item.title || "") + " " + (row && row.text || "")));
    return words.some(function (word) { return word.length >= 2 && text.indexOf(word) !== -1; });
  }
  function hasSlotEvidence(row, slot) {
    if (!slot) return false;
    return cueHits(clean((row && row.item && row.item.title || "") + " " + (row && row.text || "")), slot) > 0;
  }
  function preferNewestRelated(query, ranked) {
    ranked = Array.isArray(ranked) ? ranked.slice() : [];
    if (ranked.length < 2) return ranked;
    var requestedPeriod = periodToken(query), slot = answerSlot(query);
    if (requestedPeriod) {
      var periodRows = ranked.filter(function (row) { return periodToken(row && row.item && row.item.title || "") === requestedPeriod; });
      if (periodRows.length) return periodRows;
    }
    var chronological = ranked.slice().sort(function (a, b) {
      return rowDate(b).localeCompare(rowDate(a)) || b.score - a.score;
    });
    var kept = [];
    chronological.forEach(function (row) {
      var superseded = kept.some(function (newer) {
        if (!sameSchool(row, newer)) return false;
        if (!subjectOverlap(query, row) || !subjectOverlap(query, newer)) return false;
        if (familySimilarity(row, newer) < 0.45) return false;
        if (rowDate(newer) <= rowDate(row)) return false;
        return slot ? hasSlotEvidence(newer, slot) : false;
      });
      if (!superseded) kept.push(row);
    });
    var allowed = {};
    kept.forEach(function (row) { if (row && row.item) allowed[row.item.id] = true; });
    return ranked.filter(function (row) { return row && row.item && allowed[row.item.id]; });
  }
'''
    if marker not in qa:
        raise SystemExit('rank marker not found')
    qa = qa.replace(marker, helper + marker, 1)

needle = '    var floor = Math.max(70, ranked[0].score * 0.55);\n    return ranked.filter(function (row) { return row.score >= floor; });'
if 'ranked = preferNewestRelated(query, ranked);' not in qa:
    if needle not in qa:
        raise SystemExit('rank floor marker not found')
    qa = qa.replace(needle, '    ranked = preferNewestRelated(query, ranked);\n    if (!ranked.length) return ranked;\n' + needle, 1)

qa_path.write_text(qa, encoding='utf-8')

test = test_path.read_text(encoding='utf-8')
if 'newer same-topic notice must replace the old location field' not in test:
    marker = 'const lowConfidenceDetail = {'
    block = r'''const oldSignItem = {
  id: "sign-old",
  title: "113-2本土語文開設情形&上課地點_名單",
  school: "cysh",
  school_name: "嘉中",
  summary: "台灣手語上課地點",
  snippet: "",
  url: "https://school.example/sign-old",
  date: "2025-02-08",
};
const oldSignDetail = {
  provenance: "official_article",
  announcement_id: "sign-old",
  source_hash: "old-sign",
  blocks: [{ type: "paragraph", text: "台灣手語課程在懷恩樓三樓多功能教室上課。" }],
  attachments: [],
};
const currentSignItem = {
  id: "sign-current",
  title: "115-1本土語文台灣手語上課地點_名單&開設情形",
  school: "cysh",
  school_name: "嘉中",
  summary: "台灣手語上課地點",
  snippet: "",
  url: "https://school.example/sign-current",
  date: "2026-08-27",
};
const currentSignDetail = {
  provenance: "official_article",
  announcement_id: "sign-current",
  source_hash: "current-sign",
  blocks: [{ type: "paragraph", text: "台灣手語課程在懷恩樓四樓多功能教室上課。" }],
  attachments: [],
};
const currentSignAnswer = QA.answer(
  "手語去哪上？",
  [oldSignItem, currentSignItem],
  { "sign-old": oldSignDetail, "sign-current": currentSignDetail },
  { asOf: "2026-09-11" },
);
assert.equal(currentSignAnswer.status, "answered");
assert(currentSignAnswer.answer_lines.some((row) => row.includes("懷恩樓四樓多功能教室")), "newer same-topic notice must replace the old location field");
assert(!currentSignAnswer.answer_lines.some((row) => row.includes("三樓多功能教室")), "older conflicting location must not leak into a current answer");

const historicalSignAnswer = QA.answer(
  "113-2手語去哪上？",
  [oldSignItem, currentSignItem],
  { "sign-old": oldSignDetail, "sign-current": currentSignDetail },
  { asOf: "2026-09-11" },
);
assert(historicalSignAnswer.answer_lines.some((row) => row.includes("三樓多功能教室")), "an explicitly requested historical semester must remain queryable");

const oldDeadlineItem = {
  id: "music-deadline-old", title: "學生音樂比賽報名公告", school: "cysh", school_name: "嘉中", date: "2026-09-01", summary: "學生音樂比賽報名", snippet: "", url: "https://school.example/music-old",
};
const newDeadlineItem = {
  id: "music-deadline-new", title: "學生音樂比賽報名公告修正", school: "cysh", school_name: "嘉中", date: "2026-09-10", summary: "學生音樂比賽報名期限修正", snippet: "", url: "https://school.example/music-new",
};
const deadlineAnswer = QA.answer(
  "音樂比賽報名截止到幾號？",
  [oldDeadlineItem, newDeadlineItem],
  {
    "music-deadline-old": { provenance: "official_article", blocks: [{ text: "報名截止日期為2026年9月15日。" }], attachments: [] },
    "music-deadline-new": { provenance: "official_article", blocks: [{ text: "報名截止日期修正為2026年9月20日。" }], attachments: [] },
  },
  { asOf: "2026-09-11" },
);
assert(deadlineAnswer.answer_lines.some((row) => row.includes("9月20日")), "newer deadline correction must replace the older deadline field");
assert(!deadlineAnswer.answer_lines.some((row) => row.includes("9月15日")), "old deadline must not remain in the current answer after correction");

'''
    if marker not in test:
        raise SystemExit('test insertion marker not found')
    test = test.replace(marker, block + marker, 1)
    test_path.write_text(test, encoding='utf-8')

print('announcement supersession patch applied')
