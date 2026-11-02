"use strict";
/* 2026-11-02: 問校務天氣（Open-Meteo，免費、不需金鑰）：「明天要不要帶傘」。 */
const assert = require("node:assert/strict");
const W = require("../docs/weather.js");

assert.deepEqual(W.asks("明天要不要帶傘"), { day: 1, focus: "rain" });
assert.deepEqual(W.asks("後天會冷嗎"), { day: 2, focus: "temp" });
assert.deepEqual(W.asks("今天天氣如何"), { day: 0, focus: "general" });
assert.equal(W.asks("段考什麼時候"), null);
assert.equal(W.asks("校慶下雨的雨天備案"), null, "an event's rain plan is not a forecast question");
assert.match(W.url(W.place("嘉義市")), /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=23\.48&longitude=120\.45&daily=/);
assert.doesNotMatch(W.url(W.place("嘉義市")), /apikey|key=/i, "no API key");
assert.equal(W.place("不存在").name, "嘉義市");
for (const key of Object.keys(W.TEMPLATES)) assert.ok(W.TEMPLATES[key].length >= 3, key);

const data = (rain, min, max, code) => ({ daily: { time: ["2026-11-02", "2026-11-03", "2026-11-04"], weather_code: [0, code, 0],
  temperature_2m_min: [20, min, 20], temperature_2m_max: [28, max, 28], precipitation_probability_max: [0, rain, 0] } });
const where = W.place("嘉義市");
let r = W.answer(data(70, 20, 26, 63), { day: 1, focus: "rain" }, where, "明天要不要帶傘");
assert.equal(r.status, "answered");
assert.match(r.reply.text, /明天（11\/3）/);
assert.match(r.reply.text, /70%/);
assert.match(r.reply.text, /傘/);
assert.doesNotMatch(r.reply.text, /不用帶傘|留在家/);
r = W.answer(data(10, 20, 26, 1), { day: 1, focus: "rain" }, where, "明天要不要帶傘");
assert.match(r.reply.text, /不用帶傘|不會下雨|留在家/);
r = W.answer(data(10, 14, 19, 3), { day: 1, focus: "temp" }, where, "明天會冷嗎");
assert.match(r.reply.text, /外套/);
assert.equal(W.answer({}, { day: 1, focus: "rain" }, where, "x"), null);
assert.equal(W.failure("x").status, "insufficient");
assert.equal(W.sky(63), "下雨");
console.log("weather tests passed");
