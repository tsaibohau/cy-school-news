/* 校訊吉祥物「小訊」：「訊」字印章長了眼睛、手和腳。會在問校務的輸入框上面走來走去，
   查資料時會思考，找到答案會跳一下，找不到會垂頭喪氣。不呼叫任何外部服務。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsMascot = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var GLYPH = "M65.10000000000001 93.4Q65.10000000000001 94.0 62.25000000000001 95.5Q59.400000000000006 97.0 54.300000000000004 97.0H51.900000000000006V13.099999999999994H65.10000000000001ZM71.10000000000001 11.799999999999997 77.7 4.199999999999989 90.2 14.700000000000003Q89.80000000000001 15.299999999999997 88.70000000000002 15.799999999999997Q87.60000000000001 16.299999999999997 85.80000000000001 16.700000000000003Q85.30000000000001 22.200000000000003 85.05000000000001 29.4Q84.80000000000001 36.599999999999994 84.9 44.099999999999994Q85.0 51.6 85.6 58.25Q86.2 64.9 87.4 69.45Q88.60000000000001 74.0 90.60000000000001 75.2Q91.80000000000001 76.0 92.5 74.1Q93.5 71.5 94.15 68.9Q94.80000000000001 66.3 95.5 63.2L96.5 63.3L95.7 80.7Q97.4 85.0 97.65 88.55Q97.9 92.1 96.60000000000001 93.5Q93.7 96.3 90.25 95.6Q86.80000000000001 94.9 83.7 92.4Q79.7 89.2 77.30000000000001 83.0Q74.9 76.8 73.7 68.44999999999999Q72.5 60.099999999999994 72.15 50.5Q71.8 40.9 71.9 30.999999999999996Q72.0 21.099999999999994 72.3 11.799999999999997ZM83.60000000000001 11.799999999999997V14.5H44.5L43.7 11.799999999999997ZM68.5 37.599999999999994Q68.5 37.599999999999994 69.85 39.14999999999999Q71.2 40.699999999999996 72.9 42.8Q74.60000000000001 44.9 75.8 46.699999999999996Q75.5 48.3 73.3 48.3H44.6L43.900000000000006 45.5H64.2ZM12.8 4.3999999999999915Q20.3 4.099999999999994 24.55 5.599999999999994Q28.8 7.099999999999994 30.450000000000003 9.449999999999996Q32.1 11.799999999999997 31.75 14.199999999999996Q31.400000000000002 16.599999999999994 29.5 18.349999999999994Q27.6 20.099999999999994 24.8 20.349999999999994Q22.0 20.599999999999994 18.8 18.599999999999994Q18.3 14.799999999999997 16.35 11.049999999999997Q14.4 7.299999999999997 12.200000000000001 4.8999999999999915ZM33.6 83.7V86.5H15.700000000000001V83.7ZM28.8 61.5 34.300000000000004 55.6 45.7 64.2Q44.800000000000004 65.4 42.2 66.0V88.8Q42.2 89.2 40.5 90.0Q38.800000000000004 90.8 36.400000000000006 91.5Q34.0 92.2 31.900000000000002 92.2H29.700000000000003V61.5ZM20.400000000000002 92.5Q20.400000000000002 93.1 18.85 94.0Q17.3 94.9 14.9 95.65Q12.5 96.4 9.9 96.4H8.1V61.5V56.5L20.8 61.5H32.800000000000004V64.3H20.400000000000002ZM38.5 15.200000000000003Q38.5 15.200000000000003 40.2 16.6Q41.900000000000006 18.0 44.25 19.949999999999996Q46.6 21.89999999999999 48.400000000000006 23.599999999999994Q48.0 25.199999999999996 45.7 25.199999999999996H3.7L2.9000000000000004 22.39999999999999H33.1ZM35.0 41.4Q35.0 41.4 36.650000000000006 42.7Q38.300000000000004 44.0 40.550000000000004 45.9Q42.800000000000004 47.8 44.6 49.5Q44.2 51.1 42.0 51.1H7.9L7.1000000000000005 48.3H29.8ZM35.0 28.299999999999997Q35.0 28.299999999999997 36.650000000000006 29.599999999999998Q38.300000000000004 30.9 40.550000000000004 32.8Q42.800000000000004 34.699999999999996 44.6 36.4Q44.2 38.0 42.0 38.0H7.9L7.1000000000000005 35.199999999999996H29.8Z";
  /* viewBox 0 0 120 132: body (seal) 18..102 x 8..100, arms at the sides, legs below. */
  function svg(options) {
    options = options || {};
    var title = options.title ? "<title>" + options.title + "</title>" : "";
    return '<svg class="mascot-svg" viewBox="0 0 120 132" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="' + (options.title ? "false" : "true") + '">' + title +
      '<g class="mascot-legs" stroke="#7E241D" stroke-width="7" stroke-linecap="round">' +
        '<path class="mascot-leg mascot-leg-l" d="M46 98 L44 118"/><path class="mascot-leg mascot-leg-r" d="M74 98 L76 118"/></g>' +
      '<g fill="#7E241D"><ellipse class="mascot-foot mascot-foot-l" cx="41" cy="121" rx="9" ry="5"/><ellipse class="mascot-foot mascot-foot-r" cx="79" cy="121" rx="9" ry="5"/></g>' +
      '<g class="mascot-arm mascot-arm-l"><path d="M22 60 Q8 62 6 74" fill="none" stroke="#7E241D" stroke-width="7" stroke-linecap="round"/><circle cx="6" cy="76" r="6" fill="#7E241D"/></g>' +
      '<g class="mascot-arm mascot-arm-r"><path d="M98 60 Q112 62 114 74" fill="none" stroke="#7E241D" stroke-width="7" stroke-linecap="round"/><circle cx="114" cy="76" r="6" fill="#7E241D"/></g>' +
      '<g class="mascot-body">' +
        '<rect x="18" y="8" width="84" height="92" rx="16" fill="#A8352B"/>' +
        '<rect x="23" y="13" width="74" height="82" rx="12" fill="none" stroke="#FBF4EA" stroke-opacity=".75" stroke-width="2"/>' +
        '<g transform="translate(36 42) scale(.48)"><path d="' + GLYPH + '" fill="#FBF4EA"/></g>' +
        '<g class="mascot-eyes">' +
          '<ellipse cx="46" cy="29" rx="8" ry="9" fill="#FFFDF8"/><ellipse cx="74" cy="29" rx="8" ry="9" fill="#FFFDF8"/>' +
          '<circle class="mascot-pupil" cx="48" cy="31" r="4.2" fill="#2A2420"/><circle class="mascot-pupil" cx="76" cy="31" r="4.2" fill="#2A2420"/>' +
          '<circle cx="49.5" cy="29" r="1.4" fill="#fff"/><circle cx="77.5" cy="29" r="1.4" fill="#fff"/></g>' +
        '<ellipse cx="34" cy="40" rx="5" ry="3" fill="#F4A3A0" opacity=".75"/><ellipse cx="86" cy="40" rx="5" ry="3" fill="#F4A3A0" opacity=".75"/>' +
      '</g></svg>';
  }
  var LINES = {
    idle: ["有問題就問啊，我又不會咬人😏", "手冊我翻過了，你翻過嗎？", "今天也是被問「什麼時候放假」的一天。", "戳我幹嘛，問問題啦。", "我只是個字，但我很努力。", "別一直戳，我會長繭。"],
    thinking: ["翻手冊中…", "等我一下，在找了。", "學校網站好難翻…"],
    happy: ["找到了！快誇我。", "這題簡單。", "嘿嘿，我果然很厲害。"],
    sad: ["找不到…不是我的錯🥲", "學校網站沒寫啦。", "這題考倒我了。"]
  };
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function reducedMotion() {
    try { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; }
  }
  /* A mascot that walks along the top of the chat composer. */
  function mount(stage) {
    if (!stage || typeof document === "undefined") return null;
    var el = document.createElement("button");
    el.type = "button";
    el.className = "mascot is-idle";
    el.setAttribute("aria-label", "小訊（點我聊天）");
    el.innerHTML = '<span class="mascot-bubble" role="status" aria-live="polite"></span><span class="mascot-figure">' + svg() + "</span>";
    stage.appendChild(el);
    var bubble = el.querySelector(".mascot-bubble"), x = 0, timer = null, bubbleTimer = null, mood = "idle";
    function width() { return Math.max(0, (stage.clientWidth || 0) - 64); }
    function place(next) {
      x = Math.max(0, Math.min(width(), next));
      el.style.transform = "translateX(" + x + "px)";
      el.classList.toggle("is-right-half", x > width() / 2);
    }
    function say(text, ms) {
      if (!text) return;
      bubble.textContent = text;
      el.classList.add("is-talking");
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(function () { el.classList.remove("is-talking"); }, ms || 3200);
    }
    function wander() {
      clearTimeout(timer);
      if (reducedMotion() || mood === "thinking") return;
      timer = setTimeout(function () {
        if (mood === "idle" && !document.hidden) {
          var target = Math.random() * width();
          el.classList.toggle("is-facing-left", target < x);
          el.classList.add("is-walking");
          place(target);
          setTimeout(function () { el.classList.remove("is-walking"); }, 1400);
        }
        wander();
      }, 3500 + Math.random() * 5000);
    }
    function setMood(next, text) {
      mood = next;
      el.className = el.className.replace(/\bis-(idle|thinking|happy|sad)\b/g, "").trim() + " is-" + next;
      if (text !== false) say(text || pick(LINES[next] || LINES.idle), next === "thinking" ? 60000 : 3200);
      if (next === "thinking") { clearTimeout(timer); el.classList.remove("is-walking"); }
      if (next === "happy" || next === "sad") setTimeout(function () { if (mood === next) setMood("idle", false); }, 2600);
      if (next === "idle") wander();
    }
    el.addEventListener("click", function () {
      el.classList.remove("is-poked"); void el.offsetWidth; el.classList.add("is-poked");
      say(pick(LINES.idle));
    });
    place(width() * 0.75);
    wander();
    return { el: el, setMood: setMood, say: say };
  }
  return { svg: svg, mount: mount, lines: LINES };
});
