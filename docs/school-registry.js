/* Browser-facing projection of the shared school capability registry. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsSchoolRegistry = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  var schools = [
    { id: "cysh", name: "國立嘉義高級中學", short: "嘉中", capabilities: { announcements: true, official_calendar: true } },
    { id: "cygsh", name: "國立嘉義女子高級中學", short: "嘉女", capabilities: { announcements: true, official_calendar: true } },
  ];
  return {
    schools: function () { return schools.map(function (school) { return Object.assign({}, school, { capabilities: Object.assign({}, school.capabilities) }); }); },
    find: function (id) { return schools.find(function (school) { return school.id === String(id); }) || null; },
  };
});
