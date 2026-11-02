/* 問校務天氣：「明天要不要帶傘」「明天會冷嗎」。
   資料來自 Open-Meteo（免費、不需要金鑰、非商業使用），以學校所在縣市的座標查詢。
   只讀公開的天氣預報，不送出任何使用者資料。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsWeather = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var ENDPOINT = "https://api.open-meteo.com/v1/forecast";
  /* 縣市中心附近的座標（學校多在市區）。 */
  var PLACES = {
    "嘉義市": { lat: 23.48, lon: 120.45 }, "嘉義縣": { lat: 23.46, lon: 120.29 },
    "雲林縣": { lat: 23.71, lon: 120.43 }, "臺南市": { lat: 22.99, lon: 120.21 }, "高雄市": { lat: 22.63, lon: 120.30 }
  };
  var ASK = /天氣|下雨|會不會雨|降雨|帶傘|雨傘|撐傘|颱風|氣溫|溫度|幾度|冷不冷|會冷|很冷|熱不熱|會熱|很熱|穿外套|要穿|晴天|陰天|太陽/;
  /* 「雨天備案」「天氣不佳延期」 are about an event, not a forecast question. */
  var NOT_FORECAST = /備案|延期|順延|停課標準|颱風假規定|怎麼請|規定/;

  function clean(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
  function pick(list, seed) {
    var h = 0, s = String(seed || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return list[h % list.length];
  }
  function fill(t, slots) { return t.replace(/\{(\w+)\}/g, function (_, k) { return slots[k] == null ? "" : slots[k]; }); }

  /* asks(question) → { day: 0 今天 / 1 明天 / 2 後天, focus: rain|temp|general } or null. */
  function asks(question) {
    var q = clean(question);
    if (!ASK.test(q) || NOT_FORECAST.test(q)) return null;
    var day = /後天/.test(q) ? 2 : /明天|明日|明早|明天早上/.test(q) ? 1 : 0;
    var focus = /雨|傘/.test(q) ? "rain" : /冷|熱|溫|度|外套|穿/.test(q) ? "temp" : "general";
    return { day: day, focus: focus };
  }
  function place(county) { return PLACES[county] ? { name: county, lat: PLACES[county].lat, lon: PLACES[county].lon } : { name: "嘉義市", lat: PLACES["嘉義市"].lat, lon: PLACES["嘉義市"].lon }; }
  function url(where) {
    return ENDPOINT + "?latitude=" + where.lat + "&longitude=" + where.lon +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum" +
      "&timezone=Asia%2FTaipei&forecast_days=3";
  }
  /* WMO weather codes in plain words. */
  function sky(code) {
    code = Number(code);
    if (code === 0) return "晴天";
    if (code <= 2) return "晴時多雲";
    if (code === 3) return "陰天";
    if (code === 45 || code === 48) return "有霧";
    if (code >= 51 && code <= 57) return "毛毛雨";
    if (code >= 61 && code <= 67) return code >= 65 ? "大雨" : "下雨";
    if (code >= 80 && code <= 82) return code === 82 ? "大陣雨" : "陣雨";
    if (code >= 95) return "雷雨";
    if (code >= 71 && code <= 77) return "下雪";
    return "多雲";
  }
  var DAY_NAME = ["今天", "明天", "後天"];
  var T = {
    umbrellaYes: ["{day}{place}降雨機率 {rain}%，{sky}，帶傘吧☔", "要帶傘。{day}{place}降雨機率有 {rain}%，預報是{sky}。", "傘帶著比較保險，{day}{place}降雨機率 {rain}%（{sky}）。"],
    umbrellaMaybe: ["{day}{place}降雨機率 {rain}%，可能會下，折疊傘放書包就好。", "有點難說，{day}{place}降雨機率 {rain}%，帶把輕便的傘以防萬一。", "{day}{place}降雨機率 {rain}%，不一定會下，帶傘比較安心。"],
    umbrellaNo: ["{day}{place}降雨機率只有 {rain}%，{sky}，不用帶傘。", "應該不會下雨，{day}{place}降雨機率 {rain}%（{sky}）。", "傘可以留在家，{day}{place}降雨機率 {rain}%。"],
    cold: ["{day}{place}最低 {min}°C，會冷，記得穿外套🧥", "偏涼喔，{day}{place}只有 {min}～{max}°C，外套帶著。", "{day}{place}早晚 {min}°C 左右，建議加件外套。"],
    hot: ["{day}{place}最高 {max}°C，很熱，多喝水☀️", "會熱，{day}{place}最高到 {max}°C，記得補水防曬。", "{day}{place}{min}～{max}°C，體育課記得帶水。"],
    mild: ["{day}{place}{min}～{max}°C，{sky}，穿制服剛好。", "{day}{place}天氣還算舒服，{min}～{max}°C，{sky}。", "{day}{place}{sky}，氣溫 {min}～{max}°C。"],
    general: ["{day}{place}{sky}，{min}～{max}°C，降雨機率 {rain}%。", "{day}{place}的預報：{sky}，氣溫 {min}～{max}°C，降雨機率 {rain}%。", "{day}{place}是{sky}，{min}～{max}°C，下雨機率 {rain}%。"]
  };
  /* answer(forecast JSON, plan, place, question, today) → 問校務 result. */
  function answer(data, plan, where, question) {
    var daily = data && data.daily;
    var i = plan.day;
    if (!daily || !Array.isArray(daily.time) || daily.time[i] == null) return null;
    var rain = Number(daily.precipitation_probability_max && daily.precipitation_probability_max[i]);
    var min = Math.round(Number(daily.temperature_2m_min[i])), max = Math.round(Number(daily.temperature_2m_max[i]));
    var slots = { day: DAY_NAME[i] + "（" + Number(daily.time[i].slice(5, 7)) + "/" + Number(daily.time[i].slice(8, 10)) + "）", place: where.name,
      rain: isNaN(rain) ? "?" : rain, min: min, max: max, sky: sky(daily.weather_code && daily.weather_code[i]) };
    var seed = clean(question), text;
    if (plan.focus === "rain") text = fill(pick(rain >= 50 ? T.umbrellaYes : rain >= 25 ? T.umbrellaMaybe : T.umbrellaNo, seed), slots);
    else if (plan.focus === "temp") text = fill(pick(min <= 17 ? T.cold : max >= 32 ? T.hot : T.mild, seed), slots);
    else text = fill(pick(T.general, seed), slots);
    return {
      status: "answered", mode: "weather", query: question, summary: text, reply: { text: text, bullets: [] },
      evidence: [], related: [],
      sources: [{ id: "weather:" + daily.time[i], kind: "service", title: "Open-Meteo 天氣預報（" + where.name + "）", url: "https://open-meteo.com/", school_name: "", note: "免費公開預報" }],
      limitation: "天氣是 Open-Meteo 的公開預報，以" + where.name + "市區為準；實際以中央氣象署為準。"
    };
  }
  function failure(question) {
    var text = "天氣資料暫時讀不到，可以直接看中央氣象署的預報。";
    return { status: "insufficient", mode: "weather", query: question, summary: text, reply: { text: text, bullets: [] }, evidence: [], related: [],
      sources: [{ id: "weather:cwa", kind: "service", title: "中央氣象署", url: "https://www.cwa.gov.tw/", note: "官方預報" }] };
  }
  return { asks: asks, place: place, url: url, answer: answer, failure: failure, sky: sky, TEMPLATES: T, PLACES: PLACES };
});
