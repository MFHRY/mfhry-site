/* 世界：区块生成 + 网格化 + 碰撞 + 射线拾取
 * 每个区块 16×16×64，方块数据存在 Uint8Array 里（0 = 空气）
 */
(function (root) {
  'use strict';
  var CX = 16, CZ = 16, CY = 64;

  /* ---------------------------------------------------------- 噪声 */
  function hash2(x, z, seed) {
    var h = x * 374761393 + z * 668265263 + seed * 2147483647;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function valueNoise(x, z, seed) {
    var xi = Math.floor(x), zi = Math.floor(z);
    var xf = x - xi, zf = z - zi;
    var a = hash2(xi, zi, seed), b = hash2(xi + 1, zi, seed);
    var c = hash2(xi, zi + 1, seed), d = hash2(xi + 1, zi + 1, seed);
    var u = smooth(xf), v = smooth(zf);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm(x, z, seed, oct) {
    var v = 0, amp = 1, freq = 1, tot = 0;
    for (var i = 0; i < (oct || 4); i++) {
      v += valueNoise(x * freq, z * freq, seed + i * 17) * amp;
      tot += amp; amp *= 0.5; freq *= 2.02;
    }
    return v / tot;
  }

  var SEA = 26;

  function World(blocks, seed) {
    this.blocks = blocks;
    this.byId = {};
    blocks.forEach(function (b) { this.byId[b.id] = b; }, this);
    this.byKey = {};
    blocks.forEach(function (b) { this.byKey[b.key] = b; }, this);
    this.seed = seed || 1337;
    this.chunks = {};
    this.edits = {};
  }

  World.prototype.chunkKey = function (cx, cz) { return cx + ',' + cz; };

  World.prototype.getChunk = function (cx, cz) {
    var k = this.chunkKey(cx, cz);
    var c = this.chunks[k];
    if (!c) { c = this.genChunk(cx, cz); this.chunks[k] = c; }
    return c;
  };

  World.prototype.heightAt = function (wx, wz) {
    var n = fbm(wx / 96, wz / 96, this.seed, 4);
    var n2 = fbm(wx / 24, wz / 24, this.seed + 91, 3);
    var h = 18 + n * 34 + n2 * 6;
    return Math.max(4, Math.min(CY - 12, Math.round(h)));
  };

  World.prototype.genChunk = function (cx, cz) {
    var data = new Uint8Array(CX * CY * CZ);
    var B = this.byKey;
    var stone = B.stone.id, dirt = B.dirt.id, grass = B.grass_block.id,
      sand = B.sand.id, gravel = B.gravel.id, water = B.water.id,
      ores = [B.coal_ore, B.iron_ore, B.copper_ore, B.gold_ore, B.redstone_ore, B.lapis_lazuli_ore, B.diamond_ore, B.emerald_ore],
      oakLog = B.oak_log ? B.oak_log.id : stone, oakLeaves = B.oak_leaves ? B.oak_leaves.id : stone;

    for (var lx = 0; lx < CX; lx++) for (var lz = 0; lz < CZ; lz++) {
      var wx = cx * CX + lx, wz = cz * CZ + lz;
      var h = this.heightAt(wx, wz);
      var beach = h <= SEA + 1;
      for (var y = 0; y <= h; y++) {
        var id;
        if (y === 0) id = B.bedrock.id;
        else if (y < h - 4) {
          id = stone;
          // 矿石
          var r = hash2(wx * 7 + y, wz * 13 - y, this.seed + y);
          if (r < 0.012) {
            var oi = (hash2(wx + y, wz - y, this.seed + 3) * ores.length) | 0;
            id = ores[oi].id;
          }
        } else if (y < h) id = beach ? sand : dirt;
        else id = beach ? (h < SEA ? sand : sand) : grass;
        data[idx(lx, y, lz)] = id;
      }
      for (var wy = h + 1; wy <= SEA; wy++) data[idx(lx, wy, lz)] = water;
      // 碎石滩
      if (h > SEA + 8 && hash2(wx, wz, this.seed + 55) > 0.93) {
        data[idx(lx, h, lz)] = gravel;
      }
    }

    // 树
    for (var lx2 = 0; lx2 < CX; lx2++) for (var lz2 = 0; lz2 < CZ; lz2++) {
      var wx2 = cx * CX + lx2, wz2 = cz * CZ + lz2;
      var h2 = this.heightAt(wx2, wz2);
      if (h2 <= SEA + 1) continue;
      if (hash2(wx2, wz2, this.seed + 777) > 0.985) this.plantTree(data, lx2, h2 + 1, lz2, oakLog, oakLeaves);
    }
    return { cx: cx, cz: cz, data: data, mesh: null, meshT: null, dirty: true };
  };

  World.prototype.plantTree = function (data, lx, y, lz, logId, leafId) {
    var hgt = 4 + ((hash2(lx, lz, 5) * 3) | 0);
    for (var i = 0; i < hgt; i++) set(data, lx, y + i, lz, logId);
    var top = y + hgt;
    for (var dx = -2; dx <= 2; dx++) for (var dz = -2; dz <= 2; dz++) for (var dy = -2; dy <= 1; dy++) {
      var d = Math.abs(dx) + Math.abs(dz) + Math.abs(dy);
      if (d > 3 || (dx === 0 && dz === 0 && dy <= 0)) continue;
      if (hash2(lx + dx, lz + dz + dy, 9) > 0.16) set(data, lx + dx, top + dy, lz + dz, leafId);
    }
  };

  function idx(x, y, z) { return (y * CZ + z) * CX + x; }
  function set(data, x, y, z, id) {
    if (x < 0 || x >= CX || z < 0 || z >= CZ || y < 0 || y >= CY) return;
    data[idx(x, y, z)] = id;
  }

  /* ---------------------------------------------------------- 读写方块 */
  World.prototype.get = function (wx, wy, wz) {
    if (wy < 0 || wy >= CY) return 0;
    var cx = Math.floor(wx / CX), cz = Math.floor(wz / CZ);
    var lx = wx - cx * CX, lz = wz - cz * CZ;
    var c = this.getChunk(cx, cz);
    return c.data[idx(lx, wy, lz)];
  };
  World.prototype.set = function (wx, wy, wz, id) {
    if (wy < 0 || wy >= CY) return false;
    var cx = Math.floor(wx / CX), cz = Math.floor(wz / CZ);
    var lx = wx - cx * CX, lz = wz - cz * CZ;
    var c = this.getChunk(cx, cz);
    var i = idx(lx, wy, lz);
    if (c.data[i] === id) return false;
    c.data[i] = id;
    c.dirty = true;
    this.edits[cx + ',' + cz] = 1;
    // 邻区块边界也要重建
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CX - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CZ - 1) this.markDirty(cx, cz + 1);
    return true;
  };
  World.prototype.markDirty = function (cx, cz) {
    var c = this.chunks[this.chunkKey(cx, cz)];
    if (c) c.dirty = true;
  };

  World.prototype.isSolid = function (wx, wy, wz) {
    var id = this.get(wx, wy, wz);
    if (!id) return false;
    var b = this.byId[id];
    return !!b && b.solid;
  };
  World.prototype.isOpaque = function (wx, wy, wz) {
    var id = this.get(wx, wy, wz);
    if (!id) return false;
    var b = this.byId[id];
    return !!b && b.opaque;
  };

  /* ---------------------------------------------------------- 网格化 */
  var FACES = [
    { n: [1, 0, 0], c: 'side', shade: 0.82, v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
    { n: [-1, 0, 0], c: 'side', shade: 0.82, v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
    { n: [0, 1, 0], c: 'top', shade: 1.0, v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], c: 'bottom', shade: 0.55, v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], c: 'side', shade: 0.72, v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { n: [0, 0, -1], c: 'side', shade: 0.72, v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }
  ];

  function pushBox(out, wx, wy, wz, box, face, atlas, blockId, shadeMul) {
    var uv = atlas.uv(blockId, face.c);
    var x0 = wx + box[0], y0 = wy + box[1], z0 = wz + box[2];
    var x1 = wx + box[3], y1 = wy + box[4], z1 = wz + box[5];
    var verts = face.v, s = face.shade * (shadeMul || 1);
    for (var i = 0; i < 4; i++) {
      var v = verts[i];
      var px = v[0] ? x1 : x0, py = v[1] ? y1 : y0, pz = v[2] ? z1 : z0;
      out.pos.push(px, py, pz);
      out.nor.push(face.n[0], face.n[1], face.n[2]);
      var uu = (v[0] ? 1 : 0), vv = (v[1] ? 1 : 0);
      // 侧面：按高度贴 v；顶/底用水平两轴
      if (face.c === 'top' || face.c === 'bottom') { uu = (v[0] ? 1 : 0); vv = (v[2] ? 1 : 0); }
      else if (face.n[0] !== 0) { uu = (v[2] ? 1 : 0); vv = (v[1] ? 1 : 0); }
      else { uu = (v[0] ? 1 : 0); vv = (v[1] ? 1 : 0); }
      out.uv.push(uv.u0 + (uv.u1 - uv.u0) * uu, uv.v0 + (uv.v1 - uv.v0) * vv);
      out.col.push(s, s, s);
    }
    var base = out.vertexCount();
    out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  function pushCross(out, wx, wy, wz, atlas, blockId, shade) {
    var uv = atlas.uv(blockId, 'side');
    var quads = [
      [[0.15, 0, 0.15], [0.85, 0, 0.85]],
      [[0.85, 0, 0.15], [0.15, 0, 0.85]]
    ];
    quads.forEach(function (q) {
      var a = q[0], b = q[1];
      var pts = [
        [wx + a[0], wy, wz + a[2], 0, 0], [wx + b[0], wy, wz + b[2], 1, 0],
        [wx + b[0], wy + 1, wz + b[2], 1, 1], [wx + a[0], wy + 1, wz + a[2], 0, 1]
      ];
      var base = out.vertexCount();
      pts.forEach(function (p) {
        out.pos.push(p[0], p[1], p[2]);
        out.nor.push(0, 1, 0);
        out.uv.push(uv.u0 + (uv.u1 - uv.u0) * p[3], uv.v0 + (uv.v1 - uv.v0) * p[4]);
        out.col.push(shade, shade, shade);
      });
      out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      // 背面
      var b2 = out.vertexCount();
      pts.slice().reverse().forEach(function (p) {
        out.pos.push(p[0], p[1], p[2]);
        out.nor.push(0, 1, 0);
        out.uv.push(uv.u0 + (uv.u1 - uv.u0) * p[3], uv.v0 + (uv.v1 - uv.v0) * p[4]);
        out.col.push(shade, shade, shade);
      });
      out.idx.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3);
    });
  }

  var BOX_FULL = [[0, 0, 0, 1, 1, 1]];

  function Bucket() {
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = [];
  }
  Bucket.prototype.vertexCount = function () { return this.pos.length / 3; };

  World.prototype.buildMesh = function (chunk, atlas) {
    var op = new Bucket(), tr = new Bucket();
    var cx = chunk.cx, cz = chunk.cz;
    var data = chunk.data;
    var byId = this.byId;
    var self = this;

    /* 贪婪化的关键：区块内部的邻居直接读数组，只有边界才走跨区块查询 */
    function at(x, y, z) {
      if (y < 0 || y >= CY) return 0;
      if (x >= 0 && x < CX && z >= 0 && z < CZ) return data[(y * CZ + z) * CX + x];
      return self.get(cx * CX + x, y, cz * CZ + z);
    }

    /* 每列最高非空气方块，省掉整片底部的遍历 */
    var top = new Uint8Array(CX * CZ);
    for (var tx = 0; tx < CX; tx++) for (var tz = 0; tz < CZ; tz++) {
      for (var ty = CY - 1; ty >= 0; ty--) {
        if (data[(ty * CZ + tz) * CX + tx]) { top[tx * CZ + tz] = ty; break; }
      }
    }

    for (var x = 0; x < CX; x++) for (var z = 0; z < CZ; z++) {
      var maxY = top[x * CZ + z];
      for (var y = 0; y <= maxY; y++) {
        var id = data[(y * CZ + z) * CX + x];
        if (!id) continue;
        var b = byId[id];
        if (!b) continue;
        var wx = cx * CX + x, wz = cz * CZ + z;
        var bucket = b.opaque ? op : tr;

        if (b.shape === 'cross') {
          pushCross(bucket, wx, y, wz, atlas, id, 0.95);
          continue;
        }
        if (b.shape === 'pane') {
          pushBox(bucket, wx, y, wz, [0, 0, 0.44, 1, 1, 0.56], FACES[4], atlas, id);
          pushBox(bucket, wx, y, wz, [0.44, 0, 0, 0.56, 1, 1], FACES[0], atlas, id);
          pushBox(bucket, wx, y, wz, [0, 0, 0.44, 1, 1, 0.56], FACES[5], atlas, id);
          pushBox(bucket, wx, y, wz, [0.44, 0, 0, 0.56, 1, 1], FACES[1], atlas, id);
          continue;
        }

        var boxes;
        if (b.shape === 'slab') boxes = [[0, 0, 0, 1, 0.5, 1]];
        else if (b.shape === 'stairs') boxes = [[0, 0, 0, 1, 0.5, 1], [0, 0.5, 0, 1, 1, 0.5]];
        else boxes = BOX_FULL;

        for (var bi = 0; bi < boxes.length; bi++) {
          var box = boxes[bi];
          for (var fi = 0; fi < 6; fi++) {
            var f = FACES[fi];
            var nb = at(x + f.n[0], y + f.n[1], z + f.n[2]);
            if (nb) {
              var nbb = byId[nb];
              if (nbb && nbb.opaque) continue;
              if (nb === id && !b.opaque) continue;
              /* 台阶薄的顶面：上面压了满方块就不画 */
              if (b.shape === 'slab' && f.n[1] === 1 && nbb && nbb.shape === 'cube' && nbb.opaque) continue;
            }
            pushBox(bucket, wx, y, wz, box, f, atlas, id);
          }
        }
      }
    }
    return { opaque: op, trans: tr };
  };

  /* ---------------------------------------------------------- 射线拾取（DDA） */
  World.prototype.raycast = function (origin, dir, maxDist) {
    var x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    var stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
    var tDeltaX = Math.abs(1 / (dir.x || 1e-9)), tDeltaY = Math.abs(1 / (dir.y || 1e-9)), tDeltaZ = Math.abs(1 / (dir.z || 1e-9));
    var tMaxX = ((dir.x > 0 ? (x + 1 - origin.x) : (origin.x - x)) || 1e-9) * tDeltaX;
    var tMaxY = ((dir.y > 0 ? (y + 1 - origin.y) : (origin.y - y)) || 1e-9) * tDeltaY;
    var tMaxZ = ((dir.z > 0 ? (z + 1 - origin.z) : (origin.z - z)) || 1e-9) * tDeltaZ;
    var face = null, t = 0;
    for (var i = 0; i < 256; i++) {
      var id = this.get(x, y, z);
      if (id && this.byId[id] && this.byId[id].shape !== 'cross' && this.byId[id].shape !== 'pane') {
        return { x: x, y: y, z: z, id: id, face: face, dist: t };
      }
      if (id && this.byId[id] && (this.byId[id].shape === 'cross')) {
        return { x: x, y: y, z: z, id: id, face: face, dist: t };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; face = [-stepX, 0, 0];
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; face = [0, -stepY, 0];
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ];
      }
      if (t > maxDist) break;
    }
    return null;
  };

  World.prototype.serialize = function () {
    var out = {};
    for (var k in this.edits) {
      var c = this.chunks[k];
      if (!c) continue;
      var arr = [];
      for (var i = 0; i < c.data.length; i++) if (c.data[i]) arr.push(i, c.data[i]);
      out[k] = arr;
    }
    return { seed: this.seed, edits: out };
  };
  World.prototype.applySave = function (save) {
    if (!save || !save.edits) return;
    for (var k in save.edits) {
      var parts = k.split(','), cx = +parts[0], cz = +parts[1];
      var c = this.getChunk(cx, cz);
      var arr = save.edits[k];
      for (var i = 0; i < arr.length; i += 2) c.data[arr[i]] = arr[i + 1];
      c.dirty = true;
      this.edits[k] = 1;
    }
  };

  root.MC_WORLD = { World: World, CX: CX, CY: CY, CZ: CZ, SEA: SEA, idx: idx, fbm: fbm, hash2: hash2 };
})(window);
