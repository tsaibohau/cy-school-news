/* Browser-facing projection of the shared school capability registry. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsSchoolRegistry = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  var schools = [
    { id: "cysh", county: "嘉義市", site: "https://www.cysh.cy.edu.tw/", name: "國立嘉義高級中學", short: "嘉中", aliases: ["嘉義高中", "嘉義高級中學", "cysh"], capabilities: { announcements: true, official_calendar: true, class_timetable: true } },
    { id: "cygsh", county: "嘉義市", site: "https://www.cygsh.cy.edu.tw/", name: "國立嘉義女子高級中學", short: "嘉女", aliases: ["嘉義女中", "嘉義女子高級中學", "cygsh"], capabilities: { announcements: true, official_calendar: true } },
    { id: "fjsh", county: "嘉義市", site: "https://rpage.fjsh.cy.edu.tw/", name: "嘉義市私立輔仁高級中學", short: "輔仁高中", aliases: ["輔仁", "輔仁高中", "輔仁中學", "fjsh"], capabilities: { announcements: true, official_calendar: false } },
    { id: "pksh", county: "雲林縣", site: "https://www.pksh.ylc.edu.tw/", name: "國立北港高級中學", short: "北港高中", aliases: ["北高", "北港高中", "北港高級中學", "pksh"], dateUnverifiedBefore: "2026-09-08", capabilities: { announcements: true, official_calendar: false } },
    { id: "ccjh", county: "嘉義縣", site: "https://www.ccjh.cyc.edu.tw/", name: "嘉義縣立竹崎高級中學", short: "竹崎高中", aliases: ["竹崎", "竹崎高中", "竹崎高級中學", "ccjh"], capabilities: { announcements: true, official_calendar: false } },
    { id: "hwsh", county: "雲林縣", site: "https://www.hwsh.ylc.edu.tw/", name: "國立虎尾高級中學", short: "虎尾高中", aliases: ["虎尾高中", "虎中", "hwsh"], capabilities: { announcements: true, official_calendar: false } },
    { id: "yfsh", county: "雲林縣", site: "https://www.yfsh.ylc.edu.tw/", name: "雲林縣私立義峰高級中學", short: "義峰高中", aliases: ["義峰", "義峰高中", "yfsh"], capabilities: { announcements: true, official_calendar: false } },
    { id: "pkvs", county: "雲林縣", site: "https://www.pkvs.ylc.edu.tw/", name: "國立北港高級農工職業學校", short: "北港農工", aliases: ["北港農工", "北農", "pkvs"], capabilities: { announcements: true, official_calendar: false } },
    { id: "tlhc", county: "雲林縣", site: "https://www.tlhc.ylc.edu.tw/", name: "國立斗六高級家事商業職業學校", short: "斗六家商", aliases: ["斗六家商", "斗家", "tlhc"], capabilities: { announcements: true, official_calendar: false } },
    { id: "tlsh", county: "雲林縣", site: "https://www.tlsh.ylc.edu.tw/", name: "國立斗六高級中學", short: "斗六高中", aliases: ["斗六高中", "斗中", "tlsh"], capabilities: { announcements: true, official_calendar: false } },
    { id: "hlvs", county: "雲林縣", site: "https://www.hlvs.ylc.edu.tw/", name: "國立西螺高級農工職業學校", short: "西螺農工", aliases: ["西螺農工", "螺農", "hlvs"], capabilities: { announcements: true, official_calendar: false } },
    { id: "hwaivs", county: "雲林縣", site: "https://www.hwaivs.ylc.edu.tw/", name: "國立虎尾高級農工職業學校", short: "虎尾農工", aliases: ["虎尾農工", "虎農", "hwaivs"], capabilities: { announcements: true, official_calendar: false } },
    { id: "shsh", county: "雲林縣", site: "https://www.shsh.ylc.edu.tw/", name: "雲林縣私立正心高級中學", short: "正心高中", aliases: ["正心", "正心中學", "正心高中", "shsh"], capabilities: { announcements: true, official_calendar: false } },
    { id: "bwjh", county: "雲林縣", site: "https://www.bwjh.ylc.edu.tw/", name: "雲林縣私立福智高級中學", short: "福智高中", aliases: ["福智", "福智高中", "bwjh"], capabilities: { announcements: true, official_calendar: false } },
    { id: "dnsh", county: "雲林縣", site: "https://dnsh.ylc.edu.tw/", name: "雲林縣立斗南高級中學", short: "斗南高中", aliases: ["斗南高中", "斗南", "dnsh"], capabilities: { announcements: true, official_calendar: false } },
    { id: "gwehs", county: "雲林縣", site: "https://gwehs.ylc.edu.tw/", name: "雲林縣立古坑華德福實驗高級中學", short: "古坑華德福", aliases: ["古坑華德福", "華德福", "gwehs"], capabilities: { announcements: true, official_calendar: false } },
    { id: "mljh", county: "雲林縣", site: "https://mljh.ylc.edu.tw/", name: "雲林縣立麥寮高級中學", short: "麥寮高中", aliases: ["麥寮高中", "麥寮", "mljh"], capabilities: { announcements: true, official_calendar: false } },
    { id: "nsjh", county: "雲林縣", site: "https://nsjh.ylc.edu.tw/", name: "雲林縣立蔦松藝術高級中學", short: "蔦松藝術高中", aliases: ["蔦松", "蔦松藝中", "蔦松藝術高中", "nsjh"], capabilities: { announcements: true, official_calendar: false } },
    { id: "cyhvs", county: "嘉義市", site: "https://www.cyhvs.cy.edu.tw/", name: "國立嘉義高級家事職業學校", short: "嘉義家職", aliases: ["嘉義家職", "嘉家", "嘉義家事", "cyhvs"], capabilities: { announcements: true, official_calendar: false } },
    { id: "cyvs", county: "嘉義市", site: "https://www.cyvs.cy.edu.tw/", name: "國立嘉義高級商業職業學校", short: "嘉義高商", aliases: ["嘉義高商", "嘉商", "cyvs"], capabilities: { announcements: true, official_calendar: false } },
    { id: "cyivs", county: "嘉義市", site: "https://www.cyivs.cy.edu.tw/", name: "國立嘉義高級工業職業學校", short: "嘉義高工", aliases: ["嘉義高工", "嘉工", "cyivs"], capabilities: { announcements: true, official_calendar: false } },
    { id: "hhsh", county: "嘉義市", site: "https://www.hhsh.cy.edu.tw/", name: "嘉義市私立興華高級中學", short: "興華高中", aliases: ["興華", "興華高中", "興華中學", "hhsh"], capabilities: { announcements: true, official_calendar: false } },
    { id: "hnvs", county: "嘉義市", site: "https://www.hnvs.cy.edu.tw/", name: "國立華南高級商業職業學校", short: "華南高商", aliases: ["華南高商", "華南", "hnvs"], capabilities: { announcements: true, official_calendar: false } },
    { id: "nehs", county: "嘉義縣", site: "https://www.nehs.cyc.edu.tw/", name: "國立嘉科實驗高級中學", short: "嘉科實中", aliases: ["嘉科實中", "嘉科", "嘉科實驗", "nehs"], capabilities: { announcements: true, official_calendar: false } },
    { id: "sgash", county: "嘉義縣", site: "https://www.sgash.cyc.edu.tw/", name: "國立新港藝術高級中學", short: "新港藝術高中", aliases: ["新港藝術高中", "新港藝中", "新港藝術", "sgash"], capabilities: { announcements: true, official_calendar: false } },
    { id: "mhvs", county: "嘉義縣", site: "https://www.mhvs.cyc.edu.tw/", name: "國立民雄高級農工職業學校", short: "民雄農工", aliases: ["民雄農工", "民雄", "mhvs"], capabilities: { announcements: true, official_calendar: false } },
    { id: "ycsh", county: "嘉義縣", site: "https://www.ycsh.cyc.edu.tw/", name: "嘉義縣立永慶高級中學", short: "永慶高中", aliases: ["永慶", "永慶高中", "ycsh"], capabilities: { announcements: true, official_calendar: false } },
    { id: "tssh", county: "嘉義縣", site: "https://www.tssh.cyc.edu.tw/", name: "國立東石高級中學", short: "東石高中", aliases: ["東石", "東石高中", "tssh"], capabilities: { announcements: true, official_calendar: false } },
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
  /* Every school named in the text, in the order they appear (for 「嘉中跟嘉女比」).
     Longer names are matched first and blanked out, so 「嘉義女中」 never also counts as another school. */
  function mentionedSchools(value) {
    var text = String(value || "").toLowerCase(), found = [];
    var names = [];
    schools.forEach(function (school) {
      if (school.visible === false) return;
      [school.short, school.name].concat(school.aliases || []).forEach(function (alias) { names.push({ school: school, alias: String(alias).toLowerCase() }); });
    });
    names.sort(function (a, b) { return b.alias.length - a.alias.length; });
    names.forEach(function (row) {
      var at = text.indexOf(row.alias);
      while (at !== -1) {
        if (!found.some(function (hit) { return hit.school === row.school; })) found.push({ school: row.school, at: at });
        else found.forEach(function (hit) { if (hit.school === row.school && at < hit.at) hit.at = at; });
        text = text.slice(0, at) + new Array(row.alias.length + 1).join("\u0000") + text.slice(at + row.alias.length);
        at = text.indexOf(row.alias);
      }
    });
    return found.sort(function (a, b) { return a.at - b.at; }).map(function (hit) { return copy(hit.school); });
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
    mentionedSchools: mentionedSchools,
  };
});
