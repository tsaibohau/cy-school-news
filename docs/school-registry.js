/* Browser-facing projection of the shared school capability registry. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsSchoolRegistry = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  var schools = [
    { id: "cysh", name: "國立嘉義高級中學", short: "嘉中", aliases: ["嘉義高中", "嘉義高級中學", "cysh"], capabilities: { announcements: true, official_calendar: true } },
    { id: "cygsh", name: "國立嘉義女子高級中學", short: "嘉女", aliases: ["嘉義女中", "嘉義女子高級中學", "cygsh"], capabilities: { announcements: true, official_calendar: true } },
    { id: "pksh", name: "國立北港高級中學", short: "北港高中", aliases: ["北港高中", "北港高級中學", "北高", "pksh"], capabilities: { announcements: true, official_calendar: false } },
  ];
  function copy(school) {
    return Object.assign({}, school, { aliases: (school.aliases || []).slice(), capabilities: Object.assign({}, school.capabilities) });
  }
  function mentionedSchool(value) {
    var text = String(value || "").toLocaleLowerCase("zh-TW");
    return schools.find(function (school) {
      return [school.short, school.name].concat(school.aliases || []).some(function (alias) {
        return text.indexOf(String(alias).toLocaleLowerCase("zh-TW")) !== -1;
      });
    }) || null;
  }
  return {
    schools: function () { return schools.map(copy); },
    find: function (id) { var school = schools.find(function (row) { return row.id === String(id); }); return school ? copy(school) : null; },
    mentionedSchool: function (value) { var school = mentionedSchool(value); return school ? copy(school) : null; },
  };
});
