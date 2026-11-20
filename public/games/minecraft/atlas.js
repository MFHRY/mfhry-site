/* 程序化像素贴图：为每个方块绘制 16×16 的原创贴图，打包进一张图集
 * 不依赖任何外部图片资源；同一方块的不同面（顶/侧/底）可以长得不一样。
 */
(function (root) {
  'use strict';
  var TILE = 16;

  /* ------------------------------------------------------------ 工具 */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hex2rgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgb2css(c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a === undefined ? 1 : a) + ')';
  }
  function shade(c, f) {
    return [Math.max(0, Math.min(255, c[0] * f)), Math.max(0, Math.min(255, c[1] * f)), Math.max(0, Math.min(255, c[2] * f))];
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function px(ctx, x, y, col, a) { ctx.fillStyle = rgb2css(col, a); ctx.fillRect(x, y, 1, 1); }

  function noise(ctx, rng, base, amt, col2, chance) {
    for (var y = 0; y < TILE; y++) for (var x = 0; x < TILE; x++) {
      if (col2 && rng() < (chance || 0.08)) { px(ctx, x, y, col2); continue; }
      px(ctx, x, y, shade(base, 1 - amt / 2 + rng() * amt));
    }
  }

  /* ------------------------------------------------------------ 图案库 */
  var PAT = {
    stone: function (ctx, rng, b, c) { noise(ctx, rng, c, 0.16); },
    polished: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.05);
      ctx.fillStyle = rgb2css(shade(c, 0.88));
      ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
    },
    smooth: function (ctx, rng, b, c) { noise(ctx, rng, c, 0.03); },
    cobble: function (ctx, rng, b, c) {
      noise(ctx, rng, shade(c, 0.86), 0.12);
      for (var i = 0; i < 26; i++) {
        var x = (rng() * 14) | 0, y = (rng() * 14) | 0, w = 2 + ((rng() * 3) | 0), h = 2 + ((rng() * 3) | 0);
        ctx.fillStyle = rgb2css(shade(c, 0.95 + rng() * 0.2));
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = rgb2css(shade(c, 0.7));
        ctx.fillRect(x, y + h, w, 1);
      }
    },
    gravel: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.22);
      for (var i = 0; i < 40; i++) px(ctx, (rng() * 16) | 0, (rng() * 16) | 0, shade(c, 0.7 + rng() * 0.5));
    },
    dirt: function (ctx, rng, b, c) { noise(ctx, rng, c, 0.2); },
    sand: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.08);
      for (var i = 0; i < 24; i++) px(ctx, (rng() * 16) | 0, (rng() * 16) | 0, shade(c, 1.06));
    },
    sandstone: function (ctx, rng, b, c, face) {
      noise(ctx, rng, c, 0.06);
      ctx.fillStyle = rgb2css(shade(c, 0.9));
      ctx.fillRect(0, 0, 16, 1);
      if (face === 'side') { ctx.fillRect(0, 4, 16, 1); ctx.fillRect(0, 11, 16, 1); }
    },
    grass_side: function (ctx, rng, b, c, face) {
      var dirt = hex2rgb(b.col2 || '#8a6a44');
      noise(ctx, rng, dirt, 0.18);
      var top = hex2rgb(c);
      for (var x = 0; x < 16; x++) {
        var h = 3 + ((rng() * 3) | 0);
        for (var y = 0; y < h; y++) px(ctx, x, y, shade(top, 0.86 + rng() * 0.28));
        px(ctx, x, h, shade(top, 0.7));
      }
    },
    grass_top: function (ctx, rng, b, c) { noise(ctx, rng, c, 0.2); },
    planks: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.08);
      ctx.fillStyle = rgb2css(shade(c, 0.78));
      for (var y = 3; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
      for (var i = 0; i < 4; i++) {
        var yy = i * 4, xx = 2 + ((rng() * 12) | 0);
        ctx.fillStyle = rgb2css(shade(c, 0.84));
        ctx.fillRect(xx, yy, 1, 3);
      }
    },
    log_side: function (ctx, rng, b, c, face) {
      var inner = hex2rgb(b.col2 || b.col);
      if (face === 'top') {
        noise(ctx, rng, inner, 0.08);
        for (var r = 6; r > 0; r -= 2) {
          ctx.strokeStyle = rgb2css(shade(inner, 0.8));
          ctx.beginPath(); ctx.arc(8, 8, r, 0, Math.PI * 2); ctx.stroke();
        }
        return;
      }
      noise(ctx, rng, c, 0.1);
      for (var x = 0; x < 16; x++) {
        if (rng() < 0.3) {
          ctx.fillStyle = rgb2css(shade(c, 0.78 + rng() * 0.3));
          ctx.fillRect(x, 0, 1, 16);
        }
      }
    },
    leaves: function (ctx, rng, b, c) {
      ctx.clearRect(0, 0, 16, 16);
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
        if (rng() < 0.14) continue;
        px(ctx, x, y, shade(c, 0.7 + rng() * 0.55));
      }
    },
    ore: function (ctx, rng, b, c, face, id) {
      noise(ctx, rng, c, 0.16);
      var gem = hex2rgb(b.col2 || '#fff');
      var n = 4 + ((rng() * 3) | 0);
      for (var i = 0; i < n; i++) {
        var x = 1 + ((rng() * 12) | 0), y = 1 + ((rng() * 12) | 0), s = 2 + ((rng() * 2) | 0);
        for (var dy = 0; dy < s; dy++) for (var dx = 0; dx < s; dx++) {
          if (rng() < 0.2) continue;
          px(ctx, x + dx, y + dy, shade(gem, 0.8 + rng() * 0.4));
        }
      }
    },
    brick: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.06);
      ctx.fillStyle = rgb2css(shade(c, 0.66));
      ctx.fillRect(0, 0, 16, 16);
      for (var row = 0; row < 4; row++) {
        var off = row % 2 ? 4 : 0;
        for (var bx = -8; bx < 16; bx += 8) {
          ctx.fillStyle = rgb2css(shade(c, 0.9 + rng() * 0.2));
          ctx.fillRect(bx + off + 1, row * 4 + 1, 6, 3);
        }
      }
    },
    chiseled: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.06);
      ctx.strokeStyle = rgb2css(shade(c, 0.65));
      ctx.strokeRect(2.5, 2.5, 11, 11);
      ctx.fillStyle = rgb2css(shade(c, 1.1));
      ctx.fillRect(6, 6, 4, 4);
    },
    quartz: function (ctx, rng, b, c) { noise(ctx, rng, c, 0.03); },
    obsidian: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.25);
      for (var i = 0; i < 10; i++) px(ctx, (rng() * 16) | 0, (rng() * 16) | 0, shade(c, 2.2));
    },
    netherrack: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.24);
      for (var i = 0; i < 18; i++) {
        var x = (rng() * 14) | 0, y = (rng() * 14) | 0;
        ctx.fillStyle = rgb2css(shade(c, 0.66));
        ctx.fillRect(x, y, 2 + ((rng() * 2) | 0), 1);
      }
    },
    magma: function (ctx, rng, b, c) {
      noise(ctx, rng, shade(c, 0.6), 0.2);
      for (var i = 0; i < 10; i++) {
        var x = (rng() * 13) | 0, y = (rng() * 13) | 0;
        ctx.fillStyle = rgb2css(shade([230, 140, 40], 0.8 + rng() * 0.5));
        ctx.fillRect(x, y, 2, 2);
      }
    },
    endstone: function (ctx, rng, b, c) { noise(ctx, rng, c, 0.12); },
    purpur: function (ctx, rng, b, c) { noise(ctx, rng, c, 0.12); },
    prismarine: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.12);
      ctx.fillStyle = rgb2css(shade(c, 0.8));
      for (var y = 0; y < 16; y += 5) ctx.fillRect(0, y, 16, 1);
    },
    terracotta: function (ctx, rng, b, c) { noise(ctx, rng, c, 0.07); },
    concrete: function (ctx, rng, b, c) { noise(ctx, rng, c, 0.02); },
    wool: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.12);
      for (var i = 0; i < 30; i++) {
        var x = (rng() * 15) | 0, y = (rng() * 15) | 0;
        ctx.fillStyle = rgb2css(shade(c, 1.12));
        ctx.fillRect(x, y, 1, 1);
      }
    },
    glass: function (ctx, rng, b, c) {
      ctx.clearRect(0, 0, 16, 16);
      ctx.fillStyle = rgb2css(c, 0.16); ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = rgb2css(c, 0.6);
      ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
      ctx.fillRect(0, 0, 1, 16); ctx.fillRect(15, 0, 1, 16);
      ctx.fillStyle = rgb2css([255, 255, 255], 0.35);
      ctx.fillRect(3, 3, 4, 1); ctx.fillRect(3, 4, 1, 3);
    },
    pane: function (ctx, rng, b, c) {
      ctx.clearRect(0, 0, 16, 16);
      ctx.fillStyle = rgb2css(c, 0.92);
      ctx.fillRect(0, 0, 1, 16); ctx.fillRect(15, 0, 1, 16);
      ctx.fillStyle = rgb2css(shade(c, 0.8));
      ctx.fillRect(0, 7, 16, 1);
      ctx.fillStyle = rgb2css(shade(c, 1.15));
      ctx.fillRect(1, 0, 14, 1);
    },
    liquid: function (ctx, rng, b, c) {
      ctx.fillStyle = rgb2css(c, 0.72); ctx.fillRect(0, 0, 16, 16);
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
        if (rng() < 0.1) px(ctx, x, y, shade(c, 1.3), 0.6);
      }
    },
    ice: function (ctx, rng, b, c) {
      ctx.fillStyle = rgb2css(c, 0.78); ctx.fillRect(0, 0, 16, 16);
      for (var i = 0; i < 8; i++) {
        ctx.fillStyle = rgb2css([255, 255, 255], 0.5);
        var x = (rng() * 14) | 0, y = (rng() * 14) | 0;
        ctx.fillRect(x, y, 1 + ((rng() * 4) | 0), 1);
      }
    },
    snow: function (ctx, rng, b, c) { noise(ctx, rng, c, 0.06); },
    metal: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.04);
      ctx.fillStyle = rgb2css(shade(c, 1.18));
      ctx.fillRect(2, 2, 12, 1);
      ctx.fillStyle = rgb2css(shade(c, 0.78));
      ctx.fillRect(2, 13, 12, 1);
    },
    gem: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.1);
      ctx.fillStyle = rgb2css(shade(c, 1.35), 0.8);
      ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(11, 6); ctx.lineTo(6, 11); ctx.closePath(); ctx.fill();
    },
    copper: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.12);
      for (var i = 0; i < 12; i++) px(ctx, (rng() * 16) | 0, (rng() * 16) | 0, shade([90, 170, 140], 0.9 + rng() * 0.4));
    },
    sculk: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.24);
      for (var i = 0; i < 10; i++) px(ctx, (rng() * 16) | 0, (rng() * 16) | 0, shade([70, 190, 200], 0.7 + rng() * 0.6));
    },
    froglight: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.1);
      for (var i = 0; i < 26; i++) px(ctx, (rng() * 16) | 0, (rng() * 16) | 0, shade(c, 1.4));
    },
    plant: function (ctx, rng, b, c) {
      ctx.clearRect(0, 0, 16, 16);
      var stem = shade(c, 0.7);
      for (var x = 6; x < 10; x++) px(ctx, x, 6 + ((rng() * 10) | 0), stem);
      for (var i = 0; i < 26; i++) {
        var x2 = 1 + ((rng() * 14) | 0), y2 = 1 + ((rng() * 14) | 0);
        px(ctx, x2, y2, shade(c, 0.75 + rng() * 0.6));
      }
      for (var k = 0; k < 5; k++) {
        var x3 = 4 + ((rng() * 8) | 0), y3 = 2 + ((rng() * 6) | 0);
        px(ctx, x3, y3, shade(c, 1.2));
      }
    },
    torch: function (ctx, rng, b, c) {
      ctx.clearRect(0, 0, 16, 16);
      ctx.fillStyle = rgb2css([120, 80, 40]);
      ctx.fillRect(7, 7, 2, 8);
      ctx.fillStyle = rgb2css(shade(c, 1.1));
      ctx.fillRect(6, 4, 4, 4);
      ctx.fillStyle = rgb2css([255, 240, 180]);
      ctx.fillRect(7, 5, 2, 2);
    },
    workbench: function (ctx, rng, b, c, face) {
      noise(ctx, rng, c, 0.08);
      if (face === 'top') {
        ctx.strokeStyle = rgb2css(shade(c, 0.6));
        ctx.strokeRect(1.5, 1.5, 13, 13);
        ctx.fillStyle = rgb2css(shade(c, 0.65));
        ctx.fillRect(2, 7, 12, 1); ctx.fillRect(7, 2, 1, 12);
      } else {
        ctx.fillStyle = rgb2css(shade(c, 0.6));
        ctx.fillRect(0, 0, 16, 4);
        ctx.fillStyle = rgb2css(shade(c, 0.75));
        ctx.fillRect(2, 6, 12, 1);
      }
    },
    furnace: function (ctx, rng, b, c, face) {
      noise(ctx, rng, c, 0.12);
      if (face === 'side') {
        ctx.fillStyle = rgb2css(shade(c, 0.55));
        ctx.fillRect(3, 7, 10, 6);
        ctx.fillStyle = rgb2css([230, 140, 40], 0.8);
        ctx.fillRect(5, 9, 6, 3);
      }
    },
    chest: function (ctx, rng, b, c, face) {
      noise(ctx, rng, c, 0.08);
      ctx.fillStyle = rgb2css(shade(c, 0.6));
      ctx.fillRect(0, 6, 16, 1);
      if (face !== 'top') {
        ctx.fillStyle = rgb2css([220, 190, 80]);
        ctx.fillRect(7, 7, 2, 3);
      }
    },
    bookshelf: function (ctx, rng, b, c, face) {
      noise(ctx, rng, b.col2 || c, 0.06);
      if (face === 'side') {
        ctx.fillStyle = rgb2css(shade(hex2rgb(b.col2 || c), 0.7));
        ctx.fillRect(0, 0, 16, 3); ctx.fillRect(0, 13, 16, 3);
        var cols = ['#a03040', '#2a5a8a', '#c09030', '#3a7a3a'];
        for (var i = 0; i < 8; i++) {
          ctx.fillStyle = cols[(rng() * 4) | 0];
          ctx.fillRect(1 + i * 2, 3 + ((rng() * 2) | 0), 2, 9);
        }
      }
    },
    tnt: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.06);
      ctx.fillStyle = rgb2css([240, 240, 240]);
      ctx.fillRect(0, 6, 16, 4);
      ctx.fillStyle = rgb2css([40, 40, 40]);
      ctx.fillRect(3, 7, 2, 2); ctx.fillRect(6, 7, 2, 2); ctx.fillRect(9, 7, 2, 2); ctx.fillRect(12, 7, 2, 2);
    },
    target: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.05);
      ctx.fillStyle = rgb2css([200, 60, 50]);
      ctx.beginPath(); ctx.arc(8, 8, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgb2css([240, 240, 230]);
      ctx.beginPath(); ctx.arc(8, 8, 2.5, 0, Math.PI * 2); ctx.fill();
    },
    campfire: function (ctx, rng, b, c) {
      noise(ctx, rng, shade(c, 0.7), 0.15);
      for (var i = 0; i < 8; i++) px(ctx, (rng() * 16) | 0, (rng() * 16) | 0, shade([240, 160, 60], 0.8 + rng() * 0.5));
    },
    lantern: function (ctx, rng, b, c) {
      ctx.clearRect(0, 0, 16, 16);
      ctx.fillStyle = rgb2css([60, 50, 40]); ctx.fillRect(4, 2, 8, 12);
      ctx.fillStyle = rgb2css(shade(c, 1.2)); ctx.fillRect(5, 4, 6, 8);
      ctx.fillStyle = rgb2css([255, 240, 200]); ctx.fillRect(7, 7, 2, 3);
    },
    piston: function (ctx, rng, b, c, face) {
      noise(ctx, rng, c, 0.08);
      if (face === 'top') {
        ctx.fillStyle = rgb2css(shade(c, 0.55));
        ctx.fillRect(0, 0, 16, 6);
      }
    },
    observer: function (ctx, rng, b, c, face) {
      noise(ctx, rng, c, 0.08);
      if (face === 'side') {
        ctx.fillStyle = rgb2css([40, 40, 48]);
        ctx.fillRect(3, 5, 10, 6);
        ctx.fillStyle = rgb2css([220, 60, 60]);
        ctx.fillRect(7, 7, 2, 2);
      }
    },
    enchant: function (ctx, rng, b, c) {
      noise(ctx, rng, shade(c, 0.8), 0.1);
      ctx.fillStyle = rgb2css([230, 210, 150], 0.9);
      for (var i = 0; i < 6; i++) ctx.fillRect((rng() * 14) | 0, (rng() * 14) | 0, 2, 1);
    },
    mushroom: function (ctx, rng, b, c) {
      noise(ctx, rng, shade(c, 0.9), 0.12);
      for (var i = 0; i < 10; i++) px(ctx, (rng() * 16) | 0, (rng() * 16) | 0, shade(c, 1.3));
    },
    hay: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.14);
      ctx.fillStyle = rgb2css(shade(c, 0.7));
      ctx.fillRect(0, 6, 16, 1); ctx.fillRect(0, 11, 16, 1);
    },
    melon: function (ctx, rng, b, c) {
      noise(ctx, rng, shade(c, 0.85), 0.12);
      for (var i = 0; i < 5; i++) {
        ctx.fillStyle = rgb2css(shade(c, 0.55));
        ctx.fillRect(1 + i * 3, 0, 1, 16);
      }
    },
    pumpkin: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.1);
      for (var i = 0; i < 5; i++) { ctx.fillStyle = rgb2css(shade(c, 0.72)); ctx.fillRect(1 + i * 3, 0, 1, 16); }
    },
    glazed: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.05);
      ctx.save(); ctx.translate(8, 8); ctx.rotate(Math.PI / 4); ctx.translate(-8, -8);
      ctx.fillStyle = rgb2css(shade(c, 1.25), 0.7); ctx.fillRect(4, 4, 8, 8);
      ctx.fillStyle = rgb2css(shade(c, 0.7), 0.7); ctx.fillRect(6, 6, 4, 4);
      ctx.restore();
    },
    wax: function (ctx, rng, b, c) {
      ctx.clearRect(0, 0, 16, 16);
      ctx.fillStyle = rgb2css(c); ctx.fillRect(6, 6, 4, 9);
      ctx.fillStyle = rgb2css([255, 240, 200]); ctx.fillRect(7, 3, 2, 3);
    },
    shulker: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.08);
      ctx.fillStyle = rgb2css(shade(c, 0.75));
      ctx.fillRect(0, 9, 16, 1);
      ctx.fillStyle = rgb2css(shade(c, 0.6));
      ctx.fillRect(6, 4, 4, 3);
    },
    slime: function (ctx, rng, b, c) {
      ctx.fillStyle = rgb2css(c, 0.62); ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = rgb2css(shade(c, 1.2), 0.5); ctx.fillRect(3, 3, 4, 4);
    },
    honey: function (ctx, rng, b, c) {
      ctx.fillStyle = rgb2css(c, 0.8); ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = rgb2css(shade(c, 1.2), 0.5); ctx.fillRect(2, 2, 5, 5);
    },
    bone: function (ctx, rng, b, c) {
      noise(ctx, rng, c, 0.08);
      ctx.fillStyle = rgb2css(shade(c, 0.55));
      ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
      ctx.fillStyle = rgb2css([30, 26, 26]);
      ctx.fillRect(4, 6, 3, 3); ctx.fillRect(9, 6, 3, 3);
      ctx.fillStyle = rgb2css(shade(c, 0.6));
      ctx.fillRect(6, 11, 4, 1);
    },
    cobweb: function (ctx, rng, b, c) {
      ctx.clearRect(0, 0, 16, 16);
      ctx.strokeStyle = rgb2css(c, 0.75); ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 8); ctx.lineTo(16, 8); ctx.moveTo(8, 0); ctx.lineTo(8, 16);
      ctx.moveTo(0, 0); ctx.lineTo(16, 16); ctx.moveTo(16, 0); ctx.lineTo(0, 16);
      ctx.stroke();
    }
  };

  /* 图案名映射：没单独实现的走近似的 */
  var ALIAS = {
    log_top: 'log_side', glass_top: 'glass', sandstone_top: 'sandstone',
    grass_top2: 'grass_top', quartz_pillar: 'log_side'
  };

  /* ------------------------------------------------------------ 构建图集 */
  function build(blocks) {
    var cols = 24;
    var tiles = [];
    var index = {};
    var facesOf = function (b) {
      var p = b.pat;
      if (p === 'grass_side') return ['side', 'top', 'bottom'];
      if (p === 'log_side') return ['side', 'top', 'bottom'];
      if (p === 'workbench' || p === 'furnace' || p === 'chest' || p === 'bookshelf' || p === 'piston' ||
          p === 'observer' || p === 'tnt' || p === 'sandstone') return ['side', 'top', 'bottom'];
      return ['side'];
    };
    blocks.forEach(function (b) {
      facesOf(b).forEach(function (f) {
        var key = b.id + ':' + f;
        if (!index[key]) { index[key] = tiles.length; tiles.push({ b: b, face: f }); }
      });
    });
    var rows = Math.ceil(tiles.length / cols);
    var cv = document.createElement('canvas');
    cv.width = cols * TILE; cv.height = rows * TILE;
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    tiles.forEach(function (t, i) {
      var cx = (i % cols) * TILE, cy = ((i / cols) | 0) * TILE;
      var rng = mulberry32(t.b.id * 7919 + t.face.charCodeAt(0) * 31);
      var fn = PAT[t.b.pat] || PAT[ALIAS[t.b.pat]] || PAT.stone;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath(); ctx.rect(0, 0, TILE, TILE); ctx.clip();
      try {
        fn(ctx, rng, t.b, hex2rgb(t.b.col), t.face, t.b.id);
      } catch (e) {
        ctx.fillStyle = t.b.col; ctx.fillRect(0, 0, TILE, TILE);
      }
      ctx.restore();
    });

    return {
      canvas: cv,
      cols: cols,
      tile: TILE,
      count: tiles.length,
      uv: function (blockId, face) {
        var i = index[blockId + ':' + face];
        if (i === undefined) i = index[blockId + ':side'];
        if (i === undefined) i = 0;
        var x = (i % cols) * TILE, y = ((i / cols) | 0) * TILE;
        var e0 = 0.02;
        return { x: x, y: y, w: TILE, h: TILE,
          u0: (x + e0) / cv.width, v0: 1 - (y + TILE - e0) / cv.height,
          u1: (x + TILE - e0) / cv.width, v1: 1 - (y + e0) / cv.height };
      }
    };
  }

  /* 给 UI 画方块图标（等距小方块） */
  function icon(block, size) {
    size = size || 32;
    var cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    var ctx = cv.getContext('2d');
    var a = build.one || null;
    var col = block.col;
    var rgb = hex2rgb(col);
    // 上 / 左 / 右 三个面
    var top = [size / 2, size * 0.16], right = [size * 0.88, size * 0.4], bot = [size / 2, size * 0.6], left = [size * 0.12, size * 0.4];
    function poly(pts, fill) {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    }
    if (block.shape === 'cross') {
      ctx.save(); ctx.translate(size / 2, size / 2); ctx.rotate(-0.25);
      ctx.fillStyle = rgb2css(rgb); ctx.fillRect(-size * 0.16, -size * 0.3, size * 0.32, size * 0.6);
      ctx.restore();
      return cv;
    }
    var hi = size * (block.shape === 'slab' ? 0.34 : 0.44);
    poly([top, right, bot, left], rgb2css(shade(rgb, 1.06)));
    poly([left, bot, [size / 2, size * 0.6 + hi], [size * 0.12, size * 0.4 + hi]], rgb2css(shade(rgb, 0.78)));
    poly([right, bot, [size / 2, size * 0.6 + hi], [size * 0.88, size * 0.4 + hi]], rgb2css(shade(rgb, 0.9)));
    return cv;
  }

  root.MC_TEX = { build: build, icon: icon, shade: shade, hex2rgb: hex2rgb, rgb2css: rgb2css, PAT: PAT };
})(window);
