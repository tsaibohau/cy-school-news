/* Browser-facing projection of the shared school capability registry. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsSchoolRegistry = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  var schools = [
    { id: "cysh", county: "嘉義市", site: "https://www.cysh.cy.edu.tw/", name: "國立嘉義高級中學", short: "嘉中", aliases: ["嘉義高中", "嘉義高級中學", "cysh"], capabilities: { announcements: true, official_calendar: true } },
    { id: "cygsh", county: "嘉義市", site: "https://www.cygsh.cy.edu.tw/", name: "國立嘉義女子高級中學", short: "嘉女", aliases: ["嘉義女中", "嘉義女子高級中學", "cygsh"], capabilities: { announcements: true, official_calendar: true } },
    { id: "fjsh", county: "嘉義市", site: "https://rpage.fjsh.cy.edu.tw/", name: "嘉義市私立輔仁高級中學", short: "輔仁高中", aliases: ["輔仁", "輔仁高中", "輔仁中學", "fjsh"], capabilities: { announcements: true, official_calendar: false } },
    { id: "pksh", county: "雲林縣", site: "https://www.pksh.ylc.edu.tw/", name: "國立北港高級中學", short: "北港高中", aliases: ["北高", "北港高中", "北港高級中學", "pksh"], dateUnverifiedBefore: "2026-09-08", capabilities: { announcements: true, official_calendar: false } },
    { id: "ccjh", county: "嘉義縣", site: "https://www.ccjh.cyc.edu.tw/", name: "嘉義縣立竹崎高級中學", short: "竹崎高中", aliases: ["竹崎", "竹崎高中", "竹崎高級中學", "ccjh"], capabilities: { announcements: true, official_calendar: false } },
  ];
  function copy(school) {
    return Object.assign({}, school, { aliases: (school.aliases || []).slice(), capabilities: Object.assign({}, school.capabilities) });
  }
  function mentionedSchool(value) {
    var text = String(value || "").toLowerCase();
    return schools.find(function (school) {
      if (school.visible === false) return false;
      return [school.short, school.name].concat(school.aliases || []).some(function (alias) {
        return text.indexOf(String(alias).toLowerCase()) !== -1;
      });
    }) || null;
  }
  function hiddenIds() {
    var out = {};
    schools.forEach(function (school) { if (school.visible === false) out[school.id] = true; });
    return out;
  }
  function hiddenNames() {
    var names = [];
    schools.forEach(function (school) {
      if (school.visible === false) names = names.concat([school.name, school.short], school.aliases || []);
    });
    return names;
  }
  // 舊匯入日期尚未經官方文章頁確認的公告（首見早於 dateUnverifiedBefore 且未標 verified）
  function unverifiedLegacyDate(item) {
    if (!item) return false;
    if (item.date_status === "unverified" || item.date_source === "legacy_unverified") return true;
    var school = schools.find(function (row) { return row.id === String(item.school || ""); });
    var cutoff = school && school.dateUnverifiedBefore;
    return !!cutoff && item.date_status !== "verified" && !!item.date && String(item.first_seen || "").slice(0, 10) < cutoff;
  }
  return {
    unverifiedLegacyDate: unverifiedLegacyDate,
    ids: function () { return schools.map(function (school) { return school.id; }); },
    hiddenIds: hiddenIds,
    hiddenNames: hiddenNames,
    schools: function () { return schools.filter(function (school) { return school.visible !== false; }).map(copy); },
    find: function (id) { var school = schools.find(function (row) { return row.id === String(id); }); return school ? copy(school) : null; },
    mentionedSchool: function (value) { var school = mentionedSchool(value); return school ? copy(school) : null; },
  };
});
