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
  var W = 26, H = 28, TOP = 6; /* 6 rows of headroom for jumps, props and effects */
  var COLORS = {
    D: "#5E1A15", R: "#B13A2E", L: "#C9503F", C: "#FBF4EA", E: "#FFFFFF", K: "#241C18",
    P: "#F39A9A", B: "#8FD3F4", Y: "#F6C344", Z: "#6B5E52", H: "#E8556B", G: "#4C8C4A", N: "#3E6FA8"
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
  var BX0 = 4, BX1 = 21, BH = 18; /* square body: columns 4..21, rows 0..17 (before TOP) */

  function blank() { var g = []; for (var y = 0; y < H; y++) g.push(new Array(W).fill(".")); return g; }
  function put(g, x, y, c) { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; }
  function draw(g, cells, c, dy) { cells.forEach(function (p) { put(g, p[0], p[1] + (dy || 0), c); }); }

  var ARMS = {
    down: [[[3, 10], [2, 11], [2, 12], [1, 13]], [[22, 10], [23, 11], [23, 12], [24, 13]]],
    up: [[[3, 8], [2, 7], [2, 6], [1, 5]], [[22, 8], [23, 7], [23, 6], [24, 5]]],
    wave: [[[3, 10], [2, 11], [2, 12], [1, 13]], [[22, 8], [23, 7], [23, 6], [24, 5], [24, 4]]],
    wave2: [[[3, 10], [2, 11], [2, 12], [1, 13]], [[22, 8], [23, 7], [22, 6], [23, 5], [22, 4]]],
    think: [[[3, 10], [2, 11], [2, 12], [1, 13]], [[22, 7], [23, 6], [23, 5], [22, 4]]],
    dance1: [[[3, 8], [2, 7], [1, 6], [0, 5]], [[22, 11], [23, 12], [24, 12], [25, 12]]],
    dance2: [[[3, 11], [2, 12], [1, 12], [0, 12]], [[22, 8], [23, 7], [24, 6], [25, 5]]],
    hold: [[[3, 5], [2, 4], [2, 3], [2, 2], [2, 1], [3, 0], [4, -1], [5, -1]], [[22, 5], [23, 4], [23, 3], [23, 2], [23, 1], [22, 0], [21, -1], [20, -1]]],
    point: [[[3, 10], [2, 11], [2, 12], [1, 13]], [[22, 8], [23, 7], [24, 7], [25, 7]]],
    type: [[[3, 11], [3, 13], [4, 14], [5, 15]], [[22, 11], [22, 13], [21, 14], [20, 15]]],
    /* both hands in front of the body, holding something low (book, paper, phone) */
    front: [[[3, 10], [3, 11], [4, 12], [5, 13]], [[22, 10], [22, 11], [21, 12], [20, 13]]],
    front2: [[[3, 10], [3, 11], [4, 12], [5, 13]], [[22, 10], [22, 11], [21, 11], [20, 12]]],
    /* right hand up, holding a pen or pencil */
    pen: [[[3, 10], [3, 11], [4, 12], [5, 13]], [[22, 9], [22, 10], [21, 10], [20, 10]]]
  };
  var LEGS = {
    stand: [[9, 18], [9, 19], [8, 20], [9, 20], [16, 18], [16, 19], [16, 20], [17, 20]],
    walkA: [[8, 18], [8, 19], [7, 20], [8, 20], [16, 18], [17, 19], [18, 19]],
    walkB: [[9, 18], [8, 19], [7, 19], [16, 18], [17, 19], [17, 20], [18, 20]],
    tuck: [[9, 18], [8, 19], [9, 19], [16, 18], [16, 19], [17, 19]],
    sit: [[8, 18], [7, 18], [6, 18], [17, 18], [18, 18], [19, 18]]
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
      row.split("").forEach(function (ch, gx) { if (ch === "#") put(g, 7 + gx, 6 + gy + dy, "C"); });
    });
    var e = pose.eyes || "normal", L = 8, Rx = 15;
    if (e === "closed") draw(g, [[L, 4], [L + 1, 4], [L + 2, 4], [Rx, 4], [Rx + 1, 4], [Rx + 2, 4]], "K", dy);
    else if (e === "happy") draw(g, [[L, 4], [L + 1, 3], [L + 2, 4], [Rx, 4], [Rx + 1, 3], [Rx + 2, 4]], "K", dy);
    else {
      var whites = [];
      for (var ey = 2; ey <= 4; ey++) for (var ex = 0; ex < 3; ex++) { whites.push([L + ex, ey]); whites.push([Rx + ex, ey]); }
      draw(g, whites, "E", dy);
      var px = e === "left" ? 0 : e === "right" ? 2 : 1, py = e === "up" ? 2 : e === "down" || e === "sad" ? 4 : 3;
      if (e === "wide") draw(g, [[L + 1, 3], [Rx + 1, 3]], "K", dy);
      else draw(g, [[L + px, py], [L + px, Math.min(4, py + 1)], [Rx + px, py], [Rx + px, Math.min(4, py + 1)]], "K", dy);
      if (e === "sad") draw(g, [[L, 1], [L + 1, 1], [Rx + 1, 1], [Rx + 2, 1]], "D", dy);
      if (e !== "sad" && e !== "wide") draw(g, [[L + 2, 2], [Rx + 2, 2]], "E", dy); /* sparkle in the eye */
    }
    draw(g, [[6, 5], [7, 5], [18, 5], [19, 5]], "P", dy);
    var arms = ARMS[pose.arms] || ARMS.down;
    draw(g, arms[0], "D", dy); draw(g, arms[1], "D", dy);
    draw(g, LEGS[pose.legs] || LEGS.stand, "D", dy);
    (pose.fx || []).forEach(function (fx) {
      /* props held over the head (rows above the body) */
      if (fx === "books") {
        draw(g, [[9, -5], [10, -5], [11, -5], [12, -5], [13, -5], [14, -5], [15, -5], [16, -5]], "Y", dy);
        draw(g, [[16, -5]], "C", dy);
        for (var bx = 7; bx <= 18; bx++) { put(g, bx, -4 + dy, bx === 18 ? "C" : "G"); put(g, bx, -3 + dy, bx === 18 ? "C" : "G"); }
        for (var cx = 6; cx <= 19; cx++) { put(g, cx, -2 + dy, cx === 6 ? "C" : "N"); put(g, cx, -1 + dy, cx === 6 ? "C" : "N"); }
        draw(g, [[9, -4], [9, -3], [12, -2], [12, -1]], "Y", dy);
      }
      if (fx === "sign") {
        for (var sx = 6; sx <= 19; sx++) for (var sy = -6; sy <= -1; sy++) put(g, sx, sy + dy, sx === 6 || sx === 19 || sy === -6 || sy === -1 ? "D" : "E");
        draw(g, [[12, -5], [13, -5], [12, -4], [13, -4], [12, -2], [13, -2]], "H", dy);
      }
      /* activities: props in front of the lower body (rows 11..17) */
      if (fx === "book" || fx === "bookFlip") {
        for (var kx = 5; kx <= 20; kx++) for (var ky = 12; ky <= 17; ky++) {
          put(g, kx, ky + dy, ky === 17 || kx === 5 || kx === 20 ? "N" : kx === 12 || kx === 13 ? "Z" : "E");
        }
        draw(g, [[7, 13], [8, 13], [9, 13], [10, 13], [7, 15], [8, 15], [9, 15], [15, 13], [16, 13], [17, 13], [18, 13], [15, 15], [16, 15], [17, 15]], "Z", dy);
        if (fx === "bookFlip") draw(g, [[14, 9], [15, 9], [14, 10], [15, 10], [16, 10], [14, 11], [15, 11], [16, 11], [17, 11]], "E", dy);
      }
      if (fx === "paper") {
        for (var qx = 5; qx <= 20; qx++) for (var qy = 12; qy <= 17; qy++) put(g, qx, qy + dy, qy === 17 ? "Z" : "E");
      }
      if (fx === "ink1" || fx === "ink2" || fx === "ink3") {
        /* handwriting: short blue "words" on every other row, one line more each step */
        draw(g, [[7, 13], [8, 13], [9, 13], [11, 13], [12, 13]], "N", dy);
        if (fx !== "ink1") draw(g, [[14, 13], [15, 13], [16, 13], [18, 13], [7, 15], [8, 15], [10, 15], [11, 15]], "N", dy);
        if (fx === "ink3") draw(g, [[12, 15], [14, 15], [15, 15], [16, 15]], "N", dy);
      }
      if (fx === "penA" || fx === "penB" || fx === "penC") {
        var tip = fx === "penA" ? 12 : fx === "penB" ? 16 : 10, row = fx === "penC" ? 15 : fx === "penB" ? 15 : 13;
        draw(g, [[tip + 2, row - 4], [tip + 2, row - 3], [tip + 1, row - 2], [tip + 1, row - 1]], fx === "penC" ? "G" : "Y", dy);
        put(g, tip, row + dy, "K");
      }
      if (fx === "art1" || fx === "art2" || fx === "art3") {
        for (var ax = 5; ax <= 20; ax++) for (var ay = 12; ay <= 17; ay++) put(g, ax, ay + dy, ax === 5 || ax === 20 || ay === 12 || ay === 17 ? "Z" : "E");
        draw(g, [[10, 13], [11, 13], [14, 13], [15, 13], [9, 14], [12, 14], [13, 14], [16, 14]], "H", dy);
        if (fx !== "art1") draw(g, [[10, 14], [11, 14], [14, 14], [15, 14], [10, 15], [11, 15], [12, 15], [13, 15], [14, 15], [15, 15], [11, 16], [12, 16], [13, 16], [14, 16]], "H", dy);
        if (fx === "art3") draw(g, [[7, 13], [18, 15], [7, 16]], "Y", dy);
      }
      if (fx === "phone" || fx === "game1" || fx === "game2" || fx === "game3") {
        for (var fx2 = 7; fx2 <= 18; fx2++) for (var fy = 12; fy <= 15; fy++) put(g, fx2, fy + dy, fx2 === 7 || fx2 === 18 || fy === 12 || fy === 15 ? "K" : "B");
        draw(g, [[8, 14], [9, 14], [10, 14], [11, 14], [12, 14], [13, 14], [14, 14], [15, 14], [16, 14], [17, 14]], "G", dy);
        var hero = fx === "game1" ? [9, 13] : fx === "game2" ? [12, 12] : [15, 13];
        put(g, hero[0], hero[1] + dy, "Y");
        put(g, fx === "game3" ? 16 : 17, 13 + dy, "H");
      }
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
    walk: [{ legs: "walkA" }, { legs: "walkA", dy: -1 }, { legs: "walkB" }, { legs: "walkB", dy: -1 }],
    run: [{ legs: "walkA", arms: "dance1", dy: -1 }, { legs: "walkB", arms: "dance2" }],
    booksWalk: [{ legs: "walkA", arms: "hold", fx: ["books"] }, { legs: "walkA", arms: "hold", fx: ["books"], dy: -1 }, { legs: "walkB", arms: "hold", fx: ["books"] }, { legs: "walkB", arms: "hold", fx: ["books"], dy: -1 }],
    booksShow: [{ arms: "hold", fx: ["books"], eyes: "happy" }, { arms: "hold", fx: ["books"], eyes: "happy" }, { arms: "hold", fx: ["books"], eyes: "happy", dy: 1 },
      { arms: "hold", fx: ["books"], eyes: "normal" }, { arms: "hold", fx: ["books"], eyes: "left" }, { arms: "hold", fx: ["books"], eyes: "left" }, { arms: "hold", fx: ["books"], eyes: "normal", dy: 1 }],
    signWalk: [{ legs: "walkA", arms: "hold", fx: ["sign"] }, { legs: "walkA", arms: "hold", fx: ["sign"], dy: -1 }, { legs: "walkB", arms: "hold", fx: ["sign"] }, { legs: "walkB", arms: "hold", fx: ["sign"], dy: -1 }],
    signShow: [{ arms: "hold", fx: ["sign"], eyes: "wide" }, { arms: "hold", fx: ["sign"], eyes: "wide", dy: -1 }, { arms: "hold", fx: ["sign"], eyes: "wide" },
      { arms: "hold", fx: ["sign"], eyes: "wide", dy: -1 }, { arms: "hold", fx: ["sign"] }, { arms: "hold", fx: ["sign"] }, { arms: "hold", fx: ["sign"], eyes: "closed" }, { arms: "hold", fx: ["sign"] }],
    /* Things 小訊 does on its own: read, write, draw, play a phone game. */
    read: [{ legs: "sit", arms: "front", eyes: "down", fx: ["book"] }, { legs: "sit", arms: "front", eyes: "down", fx: ["book"] }, { legs: "sit", arms: "front", eyes: "down", fx: ["book"], dy: 1 },
      { legs: "sit", arms: "front", eyes: "down", fx: ["book"], dy: 1 }, { legs: "sit", arms: "front", eyes: "down", fx: ["book"] }, { legs: "sit", arms: "front", eyes: "closed", fx: ["book"] },
      { legs: "sit", arms: "front", eyes: "down", fx: ["book"] }, { legs: "sit", arms: "front2", eyes: "down", fx: ["bookFlip"] }, { legs: "sit", arms: "front2", eyes: "down", fx: ["bookFlip"] },
      { legs: "sit", arms: "front", eyes: "down", fx: ["book"] }, { legs: "sit", arms: "front", eyes: "down", fx: ["book"] }, { legs: "sit", arms: "front", eyes: "down", fx: ["book"] }],
    write: [{ legs: "sit", arms: "pen", eyes: "down", fx: ["paper", "penA"] }, { legs: "sit", arms: "pen", eyes: "down", fx: ["paper", "penA"], dy: 1 },
      { legs: "sit", arms: "pen", eyes: "down", fx: ["paper", "ink1", "penB"] }, { legs: "sit", arms: "pen", eyes: "down", fx: ["paper", "ink1", "penB"], dy: 1 },
      { legs: "sit", arms: "pen", eyes: "down", fx: ["paper", "ink2", "penA"] }, { legs: "sit", arms: "pen", eyes: "down", fx: ["paper", "ink2", "penB"], dy: 1 },
      { legs: "sit", arms: "pen", eyes: "down", fx: ["paper", "ink3", "penA"] }, { legs: "sit", arms: "pen", eyes: "down", fx: ["paper", "ink3", "penB"] },
      { legs: "sit", arms: "front", eyes: "happy", fx: ["paper", "ink3"] }, { legs: "sit", arms: "front", eyes: "happy", fx: ["paper", "ink3"] }],
    draw: [{ legs: "sit", arms: "pen", eyes: "down", fx: ["art1", "penC"] }, { legs: "sit", arms: "pen", eyes: "down", fx: ["art1", "penC"], dy: 1 },
      { legs: "sit", arms: "pen", eyes: "left", fx: ["art1", "penC"] }, { legs: "sit", arms: "pen", eyes: "down", fx: ["art2", "penC"] },
      { legs: "sit", arms: "pen", eyes: "down", fx: ["art2", "penC"], dy: 1 }, { legs: "sit", arms: "pen", eyes: "down", fx: ["art2", "penC"] },
      { legs: "sit", arms: "front", eyes: "happy", fx: ["art3", "sparkle"] }, { legs: "sit", arms: "front", eyes: "happy", fx: ["art3"] }, { legs: "sit", arms: "front", eyes: "happy", fx: ["art3", "sparkle"] }],
    game: [{ legs: "sit", arms: "front", eyes: "down", fx: ["game1"] }, { legs: "sit", arms: "front2", eyes: "down", fx: ["game1"] },
      { legs: "sit", arms: "front", eyes: "down", fx: ["game2"] }, { legs: "sit", arms: "front2", eyes: "down", fx: ["game2"] },
      { legs: "sit", arms: "front", eyes: "down", fx: ["game3"] }, { legs: "sit", arms: "front2", eyes: "wide", fx: ["game3"] },
      { legs: "sit", arms: "front", eyes: "down", fx: ["game1"] }, { legs: "sit", arms: "front2", eyes: "down", fx: ["game2"] }],
    gameWin: [{ legs: "sit", arms: "front", eyes: "happy", fx: ["game3", "sparkle"], dy: -1 }, { legs: "sit", arms: "front", eyes: "happy", fx: ["game3"] }, { legs: "sit", arms: "front", eyes: "happy", fx: ["game3", "sparkle"], dy: -1 }],
    gameLose: [{ legs: "sit", arms: "front", eyes: "sad", fx: ["phone", "sweat"] }, { legs: "sit", arms: "front", eyes: "sad", fx: ["phone", "sweat"], dy: 1 }, { legs: "sit", arms: "front", eyes: "sad", fx: ["phone"] }],
    hello: [{ arms: "wave", eyes: "happy" }, { arms: "wave2", eyes: "happy" }, { arms: "wave", eyes: "happy", dy: -1 }, { arms: "wave2", eyes: "happy" }, { arms: "point" }, { arms: "point" }, { arms: "point", eyes: "right" }]
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
    wake: ["嚇死我了！我沒在睡喔。", "我只是閉目養神。", "誰！喔，是你。"],
    read: ["看書中，別吵📖", "這本比學生手冊好看多了。", "你也該翻一下課本了吧？"],
    write: ["練字中✍️", "我在寫你的悔過書（騙你的）。", "字醜？我是像素，不能怪我。"],
    draw: ["在畫畫🎨 不准偷看。", "畫了一顆愛心，送給認真讀書的人。", "我是畫家，像素派的。"],
    game: ["再一場就好🎮", "不要跟老師說我在打電動。", "差一點就破關了！"],
    busy: ["欸，我在忙耶。", "好啦好啦，有事快說。", "被抓到了…我只是休息一下。"]
  };
  /* Activities with their follow-up (a phone game ends in a win or a loss). */
  var ACTIVITIES = ["read", "write", "draw", "game"];
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function reducedMotion() {
    try { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; }
  }

  /* An animated mascot. options.walk: walks along the stage; options.pixel: screen px per sprite pixel. */
  function mount(stage, options) {
    if (!stage || typeof document === "undefined") return null;
    options = options || {};
    var scale = options.pixel || 3, walks = options.walk !== false, still = reducedMotion();
    /* perch: sits in one place (the header) and mostly does its own thing; never walks. */
    var perch = !!options.perch, activities = options.activities !== false;
    var clickable = walks || perch;
    if (perch) walks = false;
    var el = document.createElement(clickable ? "button" : "span");
    if (clickable) { el.type = "button"; el.setAttribute("aria-label", "小訊（點我）"); }
    el.className = "mascot" + (clickable ? "" : " mascot-still") + (perch ? " mascot-perch" : "");
    el.style.width = W * scale + "px"; el.style.height = H * scale + "px";
    el.innerHTML = (clickable ? '<span class="mascot-bubble" role="status" aria-live="polite"></span>' : "") + '<span class="mascot-figure"></span>';
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
      /* Sometimes settle down and do something: read, write, draw or play a game. */
      if (activities && r < 0.3) {
        var act = pick(ACTIVITIES);
        var loops = act === "game" ? 2 : 1;
        for (var i = 1; i < loops; i++) queue.push(act);
        if (act === "game") queue.push(Math.random() < 0.6 ? "gameWin" : "gameLose");
        if (Math.random() < 0.25) say(pick(LINES[act]), 2600);
        return act;
      }
      r = Math.random();
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
    if (clickable) el.addEventListener("click", function () {
      var wasAsleep = current === "sleep", wasBusy = ACTIVITIES.indexOf(current) !== -1 || /^game/.test(current || "");
      lastPoke = Date.now();
      queue = []; target = null; current = Math.random() < 0.2 ? "love" : "startle"; step = 0;
      say(wasAsleep ? pick(LINES.wake) : wasBusy ? pick(LINES.busy) : pick(LINES.idle));
    });
    x = perch ? 0 : width() * 0.75; place();
    show(STAND);
    if (!still) timer = setInterval(function () { if (!document.hidden) tick(); }, TICK);
    else if (perch) show({ legs: "sit", arms: "front", eyes: "down", fx: ["book"] });
    else if (!walks) show({ arms: "wave", eyes: "happy" });
    return { el: el, setMood: setMood, say: say, play: play, stop: function () { clearInterval(timer); } };
  }
  /* Cameo: 小訊 dashes in from a side or pops out of the top-left corner anywhere on the page,
     shows something (books to study, a sign for a deadline), then leaves.
     options: { entry: "left"|"right"|"corner", prop: "books"|"sign"|"", text, onClick, holdMs, pixel } */
  var activeCameo = null;
  function cameo(options) {
    if (typeof document === "undefined" || !document.body || activeCameo) return null;
    options = options || {};
    var scale = options.pixel || 3, still = reducedMotion();
    var vw = window.innerWidth || 390, vh = window.innerHeight || 700, w = W * scale, h = H * scale;
    var entry = options.entry || "left", prop = options.prop || "";
    var walkAnim = prop === "books" ? "booksWalk" : prop === "sign" ? "signWalk" : "run";
    var showAnim = prop === "books" ? "booksShow" : prop === "sign" ? "signShow" : "hello";
    var el = document.createElement("button");
    el.type = "button";
    el.className = "mascot mascot-cameo is-entry-" + entry;
    el.setAttribute("aria-label", options.text ? "小訊：" + options.text : "小訊");
    el.style.width = w + "px"; el.style.height = h + "px";
    el.innerHTML = '<span class="mascot-bubble" role="status" aria-live="polite"></span><span class="mascot-figure"></span>';
    document.body.appendChild(el);
    var figure = el.querySelector(".mascot-figure"), bubble = el.querySelector(".mascot-bubble");
    var top = entry === "corner" ? Math.max(64, Math.round(vh * 0.1)) : Math.round(vh * (0.25 + Math.random() * 0.35));
    var stopX = entry === "right" ? Math.round(vw - w - vw * 0.1) : entry === "corner" ? 10 : Math.round(vw * 0.08);
    var x = entry === "right" ? vw : entry === "corner" ? -w : -w, y = entry === "corner" ? -h : top;
    var phase = "in", step = 0, shownAt = 0, timer = null, finished = false, shown = "";
    el.classList.toggle("is-right-half", stopX > vw / 2);
    function place() { el.style.transform = "translate(" + Math.round(x / scale) * scale + "px," + Math.round(y / scale) * scale + "px)"; }
    function show(pose) { var html = frameSvg(pose); if (html !== shown) { figure.innerHTML = html; shown = html; } }
    function leave() { if (phase !== "out") { phase = "out"; step = 0; el.classList.remove("is-talking"); } }
    function finish() {
      if (finished) return;
      finished = true; clearInterval(timer);
      if (el.parentNode) el.parentNode.removeChild(el);
      activeCameo = null;
      if (options.onDone) try { options.onDone(); } catch (_) {}
    }
    el.addEventListener("click", function () {
      if (options.onClick) try { options.onClick(); } catch (_) {}
      leave();
    });
    function tick() {
      var speed = scale * 3;
      if (phase === "in") {
        if (entry === "corner") { x = Math.min(stopX, x + speed); y = Math.min(top, y + speed); }
        else x = entry === "right" ? Math.max(stopX, x - speed) : Math.min(stopX, x + speed);
        show(Object.assign({}, ANIM[walkAnim][step % ANIM[walkAnim].length], { eyes: entry === "right" ? "left" : "right" }));
        if (x === stopX && y === top) { phase = "show"; step = 0; shownAt = Date.now(); bubble.textContent = options.text || ""; if (options.text) el.classList.add("is-talking"); }
      } else if (phase === "show") {
        show(ANIM[showAnim][step % ANIM[showAnim].length]);
        if (Date.now() - shownAt > (options.holdMs || 6500)) leave();
      } else {
        if (entry === "corner") { x -= speed; y -= speed; }
        else x += entry === "right" ? speed : -speed;
        show(Object.assign({}, ANIM[walkAnim][step % ANIM[walkAnim].length], { eyes: entry === "right" ? "right" : "left" }));
        if (x < -w - 4 || x > vw + 4 || y < -h - 4) finish();
      }
      place();
      step++;
    }
    if (still) {
      x = stopX; y = top; phase = "show"; place(); show(ANIM[showAnim][0]);
      bubble.textContent = options.text || ""; if (options.text) el.classList.add("is-talking");
      timer = setTimeout(finish, options.holdMs || 6500);
    } else {
      place(); show(ANIM[walkAnim][0]);
      timer = setInterval(tick, TICK);
    }
    activeCameo = { el: el, leave: leave, finish: finish };
    return activeCameo;
  }
  return { svg: svg, frame: frame, mount: mount, cameo: cameo, lines: LINES, animations: ANIM, size: { width: W, height: H } };
});
