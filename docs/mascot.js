/* 校訊吉祥物「小訊」：像素風的「訊」字印章，長了眼睛、手和腳。
   每個動作都是逐格的像素畫面（約 8 格／秒），走路是一步一步踏，不是滑動。
   會走路、眨眼、東張西望、揮手、跳舞、坐下打哈欠、睡著；查資料時思考，找到答案跳起來，
   找不到冒冷汗。不呼叫任何外部服務。 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CyNewsMascot = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var W = 26, H = 28, TOP = 4; /* 4 rows of headroom for jumps and effects */
  var COLORS = {
    D: "#5E1A15", R: "#B13A2E", L: "#C9503F", C: "#FBF4EA", E: "#FFFFFF", K: "#241C18",
    P: "#F39A9A", B: "#8FD3F4", Y: "#F6C344", Z: "#6B5E52", H: "#E8556B"
  };
  /* 訊 in pixels: 言 (4 wide), gap, 卂 (7 wide); 10 rows. */
  var GLYPH = [
    ".#...######.",
    "####...#..#.",
    ".....####.#.",
    "###....#..#.",
    ".......#..#.",
    "###....#..#.",
    ".......#..#.",
    "####...#..#.",
    "#..#...#..#.",
    "####...#..##"
  ];
  var BX0 = 4, BX1 = 21, BH = 20; /* body columns 4..21, rows 0..19 (before TOP) */

  function blank() { var g = []; for (var y = 0; y < H; y++) g.push(new Array(W).fill(".")); return g; }
  function put(g, x, y, c) { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; }
  function draw(g, cells, c, dy) { cells.forEach(function (p) { put(g, p[0], p[1] + (dy || 0), c); }); }

  var ARMS = {
    down: [[[3, 11], [2, 12], [2, 13], [1, 14]], [[22, 11], [23, 12], [23, 13], [24, 14]]],
    up: [[[3, 9], [2, 8], [2, 7], [1, 6]], [[22, 9], [23, 8], [23, 7], [24, 6]]],
    wave: [[[3, 11], [2, 12], [2, 13], [1, 14]], [[22, 9], [23, 8], [23, 7], [24, 6], [24, 5]]],
    wave2: [[[3, 11], [2, 12], [2, 13], [1, 14]], [[22, 9], [23, 8], [22, 7], [23, 6], [22, 5]]],
    think: [[[3, 11], [2, 12], [2, 13], [1, 14]], [[22, 8], [23, 7], [23, 6], [22, 5]]],
    dance1: [[[3, 9], [2, 8], [1, 7], [0, 6]], [[22, 12], [23, 13], [24, 13], [25, 13]]],
    dance2: [[[3, 12], [2, 13], [1, 13], [0, 13]], [[22, 9], [23, 8], [24, 7], [25, 6]]],
    type: [[[3, 12], [3, 14], [4, 15], [5, 16]], [[22, 12], [22, 14], [21, 15], [20, 16]]]
  };
  var LEGS = {
    stand: [[9, 20], [9, 21], [8, 22], [9, 22], [16, 20], [16, 21], [16, 22], [17, 22]],
    walkA: [[8, 20], [8, 21], [7, 22], [8, 22], [16, 20], [17, 21], [18, 21]],
    walkB: [[9, 20], [8, 21], [7, 21], [16, 20], [17, 21], [17, 22], [18, 22]],
    tuck: [[9, 20], [8, 21], [9, 21], [16, 20], [16, 21], [17, 21]],
    sit: [[8, 20], [7, 20], [6, 20], [17, 20], [18, 20], [19, 20]]
  };
  /* One frame: pose = { eyes, arms, legs, fx, dy } */
  function frame(pose) {
    pose = pose || {};
    var g = blank(), dy = TOP + (pose.dy || 0);
    for (var y = 0; y < BH; y++) for (var x = BX0; x <= BX1; x++) {
      var corner = (y === 0 || y === BH - 1) && (x === BX0 || x === BX1);
      if (corner) continue;
      var edge = y === 0 || y === BH - 1 || x === BX0 || x === BX1;
      put(g, x, y + dy, edge ? "D" : (y === 1 || x === BX0 + 1 ? "L" : "R"));
    }
    GLYPH.forEach(function (row, gy) {
      row.split("").forEach(function (ch, gx) { if (ch === "#") put(g, 7 + gx, 8 + gy + dy, "C"); });
    });
    var e = pose.eyes || "normal", L = 8, Rx = 15;
    if (e === "closed") draw(g, [[L, 5], [L + 1, 5], [L + 2, 5], [Rx, 5], [Rx + 1, 5], [Rx + 2, 5]], "K", dy);
    else if (e === "happy") draw(g, [[L, 5], [L + 1, 4], [L + 2, 5], [Rx, 5], [Rx + 1, 4], [Rx + 2, 5]], "K", dy);
    else {
      var whites = [];
      for (var ey = 3; ey <= 5; ey++) for (var ex = 0; ex < 3; ex++) { whites.push([L + ex, ey]); whites.push([Rx + ex, ey]); }
      draw(g, whites, "E", dy);
      var px = e === "left" ? 0 : e === "right" ? 2 : 1, py = e === "up" ? 3 : e === "down" || e === "sad" ? 5 : 4;
      if (e === "wide") draw(g, [[L + 1, 4], [Rx + 1, 4]], "K", dy);
      else draw(g, [[L + px, py], [L + px, Math.min(5, py + 1)], [Rx + px, py], [Rx + px, Math.min(5, py + 1)]], "K", dy);
      if (e === "sad") draw(g, [[L, 2], [L + 1, 2], [Rx + 1, 2], [Rx + 2, 2]], "D", dy);
      if (e !== "sad" && e !== "wide") draw(g, [[L + 2, 3], [Rx + 2, 3]], "E", dy); /* sparkle in the eye */
    }
    draw(g, [[6, 6], [7, 6], [18, 6], [19, 6]], "P", dy);
    var arms = ARMS[pose.arms] || ARMS.down;
    draw(g, arms[0], "D", dy); draw(g, arms[1], "D", dy);
    draw(g, LEGS[pose.legs] || LEGS.stand, "D", dy);
    (pose.fx || []).forEach(function (fx) {
      if (fx === "sweat") draw(g, [[22, 3 + dy], [22, 4 + dy], [21, 4 + dy]], "B");
      if (fx === "sparkle") { draw(g, [[1, 1], [0, 2], [2, 2], [1, 3]], "Y"); draw(g, [[24, 0], [23, 1], [25, 1], [24, 2]], "Y"); }
      if (fx === "z1") draw(g, [[20, 1], [21, 1], [21, 2], [20, 3], [21, 3]], "Z");
      if (fx === "z2") draw(g, [[23, 0], [24, 0], [24, 1], [23, 2], [24, 2]], "Z");
      if (fx === "dots1") draw(g, [[20, 1]], "Z");
      if (fx === "dots2") draw(g, [[20, 1], [22, 1]], "Z");
      if (fx === "dots3") draw(g, [[20, 1], [22, 1], [24, 1]], "Z");
      if (fx === "bang") draw(g, [[24, 0], [24, 1], [24, 3]], "H");
      if (fx === "heart") draw(g, [[21, 0], [23, 0], [20, 1], [21, 1], [22, 1], [23, 1], [24, 1], [21, 2], [22, 2], [23, 2], [22, 3]], "H");
    });
    return g;
  }
  /* Pixel grid → SVG rects (horizontal runs merged). */
  function rects(g) {
    var out = "";
    g.forEach(function (row, y) {
      var x = 0;
      while (x < W) {
        var c = row[x];
        if (c === ".") { x++; continue; }
        var start = x;
        while (x < W && row[x] === c) x++;
        out += '<rect x="' + start + '" y="' + y + '" width="' + (x - start) + '" height="1" fill="' + COLORS[c] + '"/>';
      }
    });
    return out;
  }
  function svg(pose, options) {
    options = options || {};
    return '<svg class="mascot-svg" viewBox="0 0 ' + W + " " + H + '" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">' +
      (options.title ? "<title>" + options.title + "</title>" : "") + rects(frame(pose)) + "</svg>";
  }

  /* Animations: lists of poses played one per tick (TICK ms). */
  var TICK = 125;
  var STAND = { eyes: "normal" };
  var ANIM = {
    idle: [STAND, STAND, STAND, { dy: 1 }, { dy: 1 }, STAND, STAND, STAND],
    blink: [STAND, { eyes: "closed" }, STAND],
    look: [{ eyes: "left" }, { eyes: "left" }, { eyes: "left" }, { eyes: "left" }, STAND, { eyes: "right" }, { eyes: "right" }, { eyes: "right" }, { eyes: "right" }, STAND],
    wave: [{ arms: "wave", eyes: "happy" }, { arms: "wave2", eyes: "happy" }, { arms: "wave", eyes: "happy" }, { arms: "wave2", eyes: "happy" }, { arms: "wave", eyes: "happy" }, { arms: "wave2", eyes: "happy" }, STAND],
    dance: [
      { arms: "dance1", legs: "walkA", dy: -1, eyes: "happy" }, { arms: "dance1", legs: "walkA", eyes: "happy" },
      { arms: "dance2", legs: "walkB", dy: -1, eyes: "happy" }, { arms: "dance2", legs: "walkB", eyes: "happy" },
      { arms: "dance1", legs: "walkA", dy: -1, eyes: "happy" }, { arms: "dance1", legs: "walkA", eyes: "happy" },
      { arms: "dance2", legs: "walkB", dy: -1, eyes: "happy" }, { arms: "dance2", legs: "walkB", eyes: "happy" },
      { arms: "up", legs: "tuck", dy: -2, eyes: "happy", fx: ["sparkle"] }, { arms: "up", eyes: "happy" }, STAND],
    yawn: [{ legs: "sit", dy: 1 }, { legs: "sit", dy: 1, eyes: "closed" }, { legs: "sit", dy: 1, eyes: "closed", arms: "up" }, { legs: "sit", dy: 1, eyes: "closed", arms: "up" },
      { legs: "sit", dy: 1, eyes: "closed" }, { legs: "sit", dy: 1 }, { legs: "sit", dy: 1 }, { legs: "sit", dy: 1, eyes: "closed" }, { legs: "sit", dy: 1 }, STAND],
    sleep: [{ legs: "sit", dy: 1, eyes: "closed" }, { legs: "sit", dy: 1, eyes: "closed", fx: ["z1"] }, { legs: "sit", dy: 1, eyes: "closed", fx: ["z1"] },
      { legs: "sit", dy: 2, eyes: "closed", fx: ["z1", "z2"] }, { legs: "sit", dy: 2, eyes: "closed", fx: ["z2"] }, { legs: "sit", dy: 1, eyes: "closed" }],
    think: [{ arms: "think", eyes: "up", fx: ["dots1"] }, { arms: "think", eyes: "up", fx: ["dots1"] }, { arms: "think", eyes: "up", fx: ["dots2"] },
      { arms: "think", eyes: "up", fx: ["dots2"] }, { arms: "type", eyes: "down", fx: ["dots3"] }, { arms: "type", eyes: "down", dy: 1, fx: ["dots3"] },
      { arms: "type", eyes: "down", fx: ["dots3"] }, { arms: "type", eyes: "down", dy: 1 }],
    happy: [{ arms: "up", legs: "tuck", dy: -2, eyes: "happy" }, { arms: "up", legs: "tuck", dy: -4, eyes: "happy", fx: ["sparkle"] },
      { arms: "up", legs: "tuck", dy: -2, eyes: "happy", fx: ["sparkle"] }, { arms: "up", eyes: "happy", dy: 1 },
      { arms: "up", legs: "tuck", dy: -2, eyes: "happy" }, { arms: "up", legs: "tuck", dy: -4, eyes: "happy", fx: ["sparkle"] },
      { arms: "up", legs: "tuck", dy: -2, eyes: "happy" }, { eyes: "happy", dy: 1 }, { eyes: "happy" }, STAND],
    sad: [{ eyes: "sad", dy: 1, fx: ["sweat"] }, { eyes: "sad", dy: 1, fx: ["sweat"] }, { eyes: "sad", dy: 2, fx: ["sweat"] }, { eyes: "sad", dy: 2, fx: ["sweat"] },
      { eyes: "sad", dy: 1, fx: ["sweat"] }, { eyes: "sad", dy: 2, fx: ["sweat"] }, { eyes: "sad", dy: 2 }, { eyes: "sad", dy: 1 }, STAND],
    startle: [{ eyes: "wide", arms: "up", legs: "tuck", dy: -3, fx: ["bang"] }, { eyes: "wide", arms: "up", dy: -1, fx: ["bang"] }, { eyes: "wide", arms: "up", fx: ["bang"] }, STAND],
    love: [{ eyes: "happy", fx: ["heart"] }, { eyes: "happy", dy: -1, fx: ["heart"] }, { eyes: "happy", fx: ["heart"] }, { eyes: "happy", dy: -1, fx: ["heart"] }, STAND],
    walk: [{ legs: "walkA" }, { legs: "walkA", dy: -1 }, { legs: "walkB" }, { legs: "walkB", dy: -1 }]
  };
  /* Pre-render every frame once. */
  var CACHE = {};
  function frameSvg(pose) {
    var key = JSON.stringify(pose);
    if (!CACHE[key]) CACHE[key] = svg(pose);
    return CACHE[key];
  }

  var LINES = {
    idle: ["有問題就問啊，我又不會咬人😏", "手冊我翻過了，你翻過嗎？", "今天也是被問「什麼時候放假」的一天。", "戳我幹嘛，問問題啦。", "我只是個字，但我很努力。", "別一直戳，我會長繭。", "我是像素做的，戳太大力會掉格。"],
    thinking: ["翻手冊中…", "等我一下，在找了。", "學校網站好難翻…"],
    happy: ["找到了！快誇我。", "這題簡單。", "嘿嘿，我果然很厲害。"],
    sad: ["找不到…不是我的錯🥲", "學校網站沒寫啦。", "這題考倒我了。"],
    wake: ["嚇死我了！我沒在睡喔。", "我只是閉目養神。", "誰！喔，是你。"]
  };
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function reducedMotion() {
    try { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; }
  }

  /* An animated mascot. options.walk: walks along the stage; options.pixel: screen px per sprite pixel. */
  function mount(stage, options) {
    if (!stage || typeof document === "undefined") return null;
    options = options || {};
    var scale = options.pixel || 3, walks = options.walk !== false, still = reducedMotion();
    var el = document.createElement(walks ? "button" : "span");
    if (walks) { el.type = "button"; el.setAttribute("aria-label", "小訊（點我聊天）"); }
    el.className = "mascot" + (walks ? "" : " mascot-still");
    el.style.width = W * scale + "px"; el.style.height = H * scale + "px";
    el.innerHTML = (walks ? '<span class="mascot-bubble" role="status" aria-live="polite"></span>' : "") + '<span class="mascot-figure"></span>';
    stage.appendChild(el);
    var figure = el.querySelector(".mascot-figure"), bubble = el.querySelector(".mascot-bubble");
    var x = 0, target = null, queue = [], current = null, step = 0, mood = "idle", lastPoke = Date.now(), bubbleTimer = null, timer = null, shown = "";
    function width() { return Math.max(0, (stage.clientWidth || 0) - W * scale); }
    function place() {
      el.style.transform = "translateX(" + Math.round(x / scale) * scale + "px)";
      el.classList.toggle("is-right-half", x > width() / 2);
    }
    function show(pose) { var html = frameSvg(pose); if (html !== shown) { figure.innerHTML = html; shown = html; } }
    function play(name) { queue.push(name); }
    function say(text, ms) {
      if (!text || !bubble) return;
      bubble.textContent = text;
      el.classList.add("is-talking");
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(function () { el.classList.remove("is-talking"); }, ms || 3200);
    }
    function chooseIdle() {
      var asleep = Date.now() - lastPoke > 45000;
      if (asleep) return "sleep";
      var r = Math.random();
      if (walks && r < 0.3) { target = Math.random() * width(); return "walk"; }
      if (r < 0.45) return "look";
      if (r < 0.55) return "wave";
      if (r < 0.63) return "dance";
      if (r < 0.7) return "yawn";
      if (r < 0.85) return "blink";
      return "idle";
    }
    function tick() {
      if (!current || step >= ANIM[current].length) {
        if (current === "walk" && target !== null && Math.abs(target - x) > scale * 2) step = 0;
        else {
          target = current === "walk" ? null : target;
          current = queue.shift() || (mood === "thinking" ? "think" : mood === "idle" ? chooseIdle() : "idle");
          step = 0;
        }
      }
      if (current === "walk" && target !== null) {
        var dir = target > x ? 1 : -1;
        x += dir * scale * 2;
        if ((dir > 0 && x > target) || (dir < 0 && x < target)) x = target;
        place();
      }
      var pose = ANIM[current][step];
      /* Walking: look where you are going (the sprite is never mirrored, so 訊 stays readable). */
      if (current === "walk" && target !== null) pose = Object.assign({}, pose, { eyes: target > x ? "right" : "left" });
      show(pose);
      step++;
    }
    function setMood(next, text) {
      mood = next === "happy" || next === "sad" ? "idle" : next;
      queue = []; target = null;
      if (next === "thinking") { current = "think"; step = 0; }
      if (next === "happy" || next === "sad") { current = next; step = 0; }
      if (text !== false) say(text || pick(LINES[next] || LINES.idle), next === "thinking" ? 60000 : 3200);
      lastPoke = Date.now();
    }
    if (walks) el.addEventListener("click", function () {
      var wasAsleep = current === "sleep";
      lastPoke = Date.now();
      queue = []; target = null; current = Math.random() < 0.2 ? "love" : "startle"; step = 0;
      say(wasAsleep ? pick(LINES.wake) : pick(LINES.idle));
    });
    x = width() * 0.75; place();
    show(STAND);
    if (!still) timer = setInterval(function () { if (!document.hidden) tick(); }, TICK);
    else if (!walks) show({ arms: "wave", eyes: "happy" });
    return { el: el, setMood: setMood, say: say, play: play, stop: function () { clearInterval(timer); } };
  }
  return { svg: svg, frame: frame, mount: mount, lines: LINES, animations: ANIM, size: { width: W, height: H } };
});
