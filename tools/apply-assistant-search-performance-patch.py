from pathlib import Path

path = Path('docs/assistant-qa.js')
text = path.read_text(encoding='utf-8')

old = '''  function familySimilarity(a, b) {
    var left = grams(familyText(a)), right = grams(familyText(b));
    if (!left.length || !right.length) return 0;
    var lookup = {}; right.forEach(function (g) { lookup[g] = true; });
    var shared = left.filter(function (g) { return lookup[g]; }).length;
    return shared / Math.max(1, Math.min(left.length, right.length));
  }
'''
new = '''  function familySimilarityPrepared(left, right) {
    if (!left.length || !right.length) return 0;
    var lookup = {}; right.forEach(function (g) { lookup[g] = true; });
    var shared = left.filter(function (g) { return lookup[g]; }).length;
    return shared / Math.max(1, Math.min(left.length, right.length));
  }
  function familySimilarity(a, b) {
    return familySimilarityPrepared(grams(familyText(a)), grams(familyText(b)));
  }
'''
if old not in text:
    raise SystemExit('familySimilarity marker not found')
text = text.replace(old, new, 1)

old = '''  function preferNewestRelated(query, ranked) {
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
new = '''  function preferNewestRelated(query, ranked) {
    ranked = Array.isArray(ranked) ? ranked.slice(0, 40) : [];
    if (ranked.length < 2) return ranked;
    var requestedPeriod = periodToken(query), slot = answerSlot(query), subjects = subjectTerms(query);
    var prepared = ranked.map(function (row) {
      var item = row && row.item || {}, combined = clean((item.title || "") + " " + (row && row.text || ""));
      var normalized = compact(combined);
      return {
        row: row,
        date: rowDate(row),
        school: String(item.school || item.school_id || ""),
        period: periodToken(item.title || ""),
        grams: grams(familyText(row)),
        subject: subjects.some(function (word) { return word.length >= 2 && normalized.indexOf(word) !== -1; }),
        slot: slot ? cueHits(combined, slot) > 0 : false,
      };
    });
    if (requestedPeriod) {
      var periodRows = prepared.filter(function (p) { return p.period === requestedPeriod; }).map(function (p) { return p.row; });
      if (periodRows.length) return periodRows;
    }
    prepared.sort(function (a, b) { return b.date.localeCompare(a.date) || b.row.score - a.row.score; });
    var kept = [];
    prepared.forEach(function (entry) {
      var superseded = kept.some(function (newer) {
        if (entry.school !== newer.school || !entry.subject || !newer.subject) return false;
        if (newer.date <= entry.date || !newer.slot) return false;
        return familySimilarityPrepared(entry.grams, newer.grams) >= 0.45;
      });
      if (!superseded) kept.push(entry);
    });
    var allowed = {};
    kept.forEach(function (entry) { if (entry.row && entry.row.item) allowed[entry.row.item.id] = true; });
    return ranked.filter(function (row) { return row && row.item && allowed[row.item.id]; });
  }
'''
if old not in text:
    raise SystemExit('preferNewestRelated marker not found')
text = text.replace(old, new, 1)

old = '''    var metadataById = {};
    metadataRows.forEach(function (row) { metadataById[row.item.id] = row; });
    var ranked = sourceItems.map(function (item) {
'''
new = '''    var metadataById = {}, candidateIds = {}, candidateLimit = 80;
    metadataRows.slice(0, candidateLimit).forEach(function (row) {
      metadataById[row.item.id] = row;
      candidateIds[row.item.id] = true;
    });
    /* Reviewed validity records are sparse but authoritative; keep matching ones
       even when metadata ranking did not place them in the first-stage shortlist. */
    sourceItems.forEach(function (item) {
      var reviewed = Validity && Validity.reviewedRecord ? Validity.reviewedRecord(item) : null;
      if (!reviewed) return;
      var reviewedText = (reviewed.fragments || []).map(function (f) { return clean(f.keywords + " " + f.text); }).join(" ");
      if (scoreText(reviewedText, queryTokens, 1) > 0) candidateIds[item.id] = true;
    });
    var candidateItems = sourceItems.filter(function (item) { return !!candidateIds[item.id]; });
    var ranked = candidateItems.map(function (item) {
'''
if old not in text:
    raise SystemExit('metadata shortlist marker not found')
text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('assistant search performance patch applied')
