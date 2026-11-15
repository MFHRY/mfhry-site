/* ============================================================================
 * engine.js — 音乐页能力层（无 DOM，纯逻辑）
 *
 * 由原页面 1:1 移植并增强，保证功能零删减：
 *   1. osu! 镜像搜索 + 结果排序（rankSets）
 *   2. ZIP 流式解包（只读到音频/封面就断开）+ 多编码回退
 *   3. IndexedDB 缓存（与原音游共用 mfhry_rhythm/osz 库）
 *   4. 同曲备选谱面包回退（findAlternatives / loadTrack）
 *   5. 歌词 JSON 读取 + 偏移
 *   6. 网易云评论
 *   7. Media Session
 *   8. 新增：搜索请求取消、缓存统计/清理、blob 生命周期回收
 *
 * 依赖：无。挂到 window.APEngine。
 * ========================================================================== */
(function () {
  'use strict';

  var MIRROR = 'https://osu.direct/api';
  var API = '/api/mirror';
  var DIRECT = 'https://osu.direct/api/d/';
  var MB = 1048576;
  var AUDIO_RE = /\.(mp3|ogg|m4a|wav)$/i;
  var IMG_RE = /\.(jpg|jpeg|png)$/i;

  var cacheEnabled = true;                 /* 缓存开关（[166]）；由 ap-cache 模块控制 */
  function setCacheEnabled(on) { cacheEnabled = !!on; }

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function timed(ms) { try { return AbortSignal.timeout(ms); } catch (e) { return undefined; } }

  /* ---------------------------------------------------------------- 缓存层 */
  /* 与原音游共用同一个 IndexedDB 库：下过的谱面包两边都能用。            */

  function db() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('mfhry_rhythm', 1);
      r.onupgradeneeded = function () {
        if (!r.result.objectStoreNames.contains('osz')) r.result.createObjectStore('osz');
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  async function cacheGet(k) {
    try {
      var d = await db();
      return await new Promise(function (res) {
        var rq = d.transaction('osz', 'readonly').objectStore('osz').get(k);
        rq.onsuccess = function () { res(rq.result || null); };
        rq.onerror = function () { res(null); };
      });
    } catch (e) { return null; }
  }
  async function cachePut(k, v) {
    try {
      var d = await db();
      await new Promise(function (res) {
        var tx = d.transaction('osz', 'readwrite');
        tx.objectStore('osz').put(v, k);
        tx.oncomplete = res; tx.onerror = res;
      });
      return true;
    } catch (e) { return false; }
  }
  /** 缓存统计：条目数 + 总字节（[169] 显示用） */
  async function cacheStats() {
    try {
      var d = await db();
      return await new Promise(function (res) {
        var tx = d.transaction('osz', 'readonly');
        var os = tx.objectStore('osz');
        var count = 0, bytes = 0;
        var cur = os.openCursor();
        cur.onsuccess = function () {
          var c = cur.result;
          if (!c) { res({ count: count, bytes: bytes }); return; }
          count++;
          var v = c.value;
          if (v && v.byteLength) bytes += v.byteLength;
          else if (v && v.size) bytes += v.size;
          c.continue();
        };
        cur.onerror = function () { res({ count: count, bytes: bytes }); };
      });
    } catch (e) { return { count: 0, bytes: 0 }; }
  }
  /** 只清本页产生的缓存键（aud: / bg:），不误删音游谱面（[171] 确认后调用） */
  async function cacheClearMusic() {
    try {
      var d = await db();
      return await new Promise(function (res) {
        var tx = d.transaction('osz', 'readwrite');
        var os = tx.objectStore('osz');
        var cur = os.openCursor();
        var n = 0;
        cur.onsuccess = function () {
          var c = cur.result;
          if (!c) { res(n); return; }
          var k = String(c.key);
          if (k.indexOf('aud:') === 0 || k.indexOf('bg:') === 0) { c.delete(); n++; }
          c.continue();
        };
        cur.onerror = function () { res(n); };
      });
    } catch (e) { return 0; }
  }

  /* ------------------------------------------------------------- ZIP 解析层 */

  function decodeText(bytes) {
    var s = new TextDecoder('utf-8').decode(bytes);
    if (s.indexOf('\uFFFD') < 0) return s;
    var encs = ['gbk', 'shift_jis', 'big5', 'euc-kr'];
    for (var i = 0; i < encs.length; i++) {
      try {
        var t = new TextDecoder(encs[i]).decode(bytes);
        if (t.indexOf('\uFFFD') < 0) return t;
      } catch (e) { }
    }
    return s;
  }

  async function fetchSet(id) {
    var last = '连接失败';
    for (var a = 0; a < 2; a++) {
      var urls = [API + '?id=' + id, DIRECT + id];
      for (var i = 0; i < urls.length; i++) {
        try {
          var res = await fetch(urls[i], { signal: timed(a === 0 ? 25000 : 45000) });
          if (res.ok && res.body) return res;
          last = '镜像 ' + res.status;
        } catch (e) { last = /abort/i.test(e.message) ? '超时' : e.message; }
      }
      if (last === '镜像 503') break;
      await sleep(600);
    }
    throw new Error(last);
  }

  /**
   * 流式读 zip：顺着本地文件头逐条读，只保留 .osu 文本 + 音频 + 封面，
   * 其余数据读掉不存（省内存），拿到音频和封面就断开连接。
   */
  async function streamSet(id, onStatus) {
    var res = await fetchSet(id);
    var reader = res.body.getReader();
    var hold = new Uint8Array(0), holdStart = 0;
    var pos = 0, seen = 0;
    var audioName = '', bgName = '';
    var audio = null, bg = null;

    var append = function (b) {
      var n = new Uint8Array(hold.length + b.length);
      n.set(hold, 0); n.set(b, hold.length); hold = n;
    };
    var ensure = async function (upto) {
      while (holdStart + hold.length < upto) {
        var r = await reader.read();
        if (r.done) return false;
        if (r.value && r.value.length) append(r.value);
      }
      return true;
    };
    var dropTo = function (abs) {
      var cut = abs - holdStart;
      if (cut > 0) { hold = hold.subarray(cut); holdStart = abs; }
    };

    try {
      for (; ;) {
        if (!(await ensure(pos + 30))) break;
        var rel = pos - holdStart;
        var dv = new DataView(hold.buffer, hold.byteOffset, hold.byteLength);
        if (dv.getUint32(rel, true) !== 0x04034b50) break;
        var method = dv.getUint16(rel + 8, true);
        var csize = dv.getUint32(rel + 18, true);
        var nlen = dv.getUint16(rel + 26, true);
        var elen = dv.getUint16(rel + 28, true);
        if (!(await ensure(pos + 30 + nlen))) break;
        var name = decodeText(hold.subarray(pos - holdStart + 30, pos - holdStart + 30 + nlen));
        var dataStart = pos + 30 + nlen + elen;
        var dataEnd = dataStart + csize;
        seen++;

        var lower = name.toLowerCase();
        var isOsu = lower.endsWith('.osu');
        var isAudio = AUDIO_RE.test(name);
        var isImg = IMG_RE.test(name);
        var wantAudio = audioName ? lower === audioName : isAudio;
        var wantBg = bgName ? lower === bgName : (isImg && seen > 1);
        var keep = isOsu || (wantAudio && !audio) || (wantBg && !bg);

        if (!keep) {
          if (!(await ensure(dataEnd))) break;
          dropTo(dataEnd); pos = dataEnd;
        } else {
          if (!(await ensure(dataEnd))) break;
          var data = hold.subarray(dataStart - holdStart, dataEnd - holdStart).slice();
          dropTo(dataEnd); pos = dataEnd;
          var bytes = data;
          if (method !== 0) {
            try {
              var st = new Response(data).body.pipeThrough(new DecompressionStream('deflate-raw'));
              bytes = new Uint8Array(await new Response(st).arrayBuffer());
            } catch (e) { bytes = null; }
          }
          if (!bytes) continue;
          if (isOsu) {
            var txt = decodeText(bytes);
            var an = ((/AudioFilename\s*:\s*(.+)/i.exec(txt) || [])[1] || '').trim();
            var bn = ((/^\s*0,0,"([^"]+)"/m.exec(txt) || [])[1] || '').trim();
            if (an && !audioName) audioName = an.toLowerCase();
            if (bn && !bgName && IMG_RE.test(bn)) bgName = bn.toLowerCase();
          } else if (wantAudio && !audio) {
            audio = bytes;
            onStatus && onStatus('音频到手 ' + (audio.length / MB).toFixed(1) + ' MB', 1);
          } else if (wantBg && !bg) {
            bg = { bytes: bytes, name: lower };
          }
          if (audio && (bg || !bgName)) break;
        }
        if (audio && seen > 60) break;
      }
    } finally {
      try { await reader.cancel(); } catch (e) { }
    }

    if (!audio) throw new Error('包里没找到音频');
    return { audio: audio, bg: bg, audioName: audioName };
  }

  /** 取音频：先查 IndexedDB，未命中再流式下载并回写缓存 */
  async function loadSetAudio(id, onStatus) {
    var audKey = 'aud:' + id, bgKey = 'bg:' + id;
    var cachedAud = cacheEnabled ? await cacheGet(audKey) : null;
    if (cachedAud) {
      var bgc = await cacheGet(bgKey);
      return {
        url: URL.createObjectURL(new Blob([cachedAud], { type: 'audio/mpeg' })),
        bgUrl: bgc ? URL.createObjectURL(new Blob([bgc])) : '',
        fromCache: true
      };
    }
    onStatus && onStatus('连接镜像…', 0);
    var got = await streamSet(id, onStatus);
    if (cacheEnabled) {                       /* 开关关闭时不写本机（[166][177]） */
      await cachePut(audKey, got.audio.buffer);
      if (got.bg) await cachePut(bgKey, got.bg.bytes.buffer);
    }
    return {
      url: URL.createObjectURL(new Blob([got.audio], { type: 'audio/mpeg' })),
      bgUrl: got.bg ? URL.createObjectURL(new Blob([got.bg.bytes], {
        type: got.bg.name.endsWith('.png') ? 'image/png' : 'image/jpeg'
      })) : '',
      fromCache: false
    };
  }

  /* ------------------------------------------------------------- 搜索与排序 */

  function rankSets(list, q) {
    var norm = function (t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
    var toks = norm(q).split(' ').filter(function (t) { return t.length > 1; });
    var bad = /various artists|compilation|favourites|pack|collection|megamix|medley/i;
    return list.map(function (s) {
      var title = norm(s.Title), artist = norm(s.Artist);
      var k = 0;
      toks.forEach(function (t) {
        if (title.indexOf(t) >= 0) k += 6;
        else if (artist.indexOf(t) >= 0) k += 3;
      });
      k += Math.min(6, Math.log10(1 + (s.Favourites || 0)) * 2);
      if (bad.test((s.Title || '') + ' ' + (s.Artist || ''))) k -= 5;
      if (/cover|instrumental|off vocal|karaoke|8-bit|chiptune|nightcore|remix/i.test(s.Title || '')) k -= 4;
      var lens = (s.ChildrenBeatmaps || []).map(function (c) { return c.TotalLength || 0; });
      if (lens.length && Math.max.apply(null, lens) > 480) k -= 4;
      return { s: s, k: k };
    }).sort(function (a, b) { return b.k - a.k; }).map(function (x) { return x.s; });
  }

  var searchCtl = null;
  /**
   * 镜像搜索。会取消上一次未完成请求（[161][215]）。
   * @returns {Promise<Array>} 已按相关度排序
   */
  async function search(q, opts) {
    opts = opts || {};
    if (searchCtl) { try { searchCtl.abort(); } catch (e) { } }
    searchCtl = new AbortController();
    var signal = searchCtl.signal;
    var timeout = timed(opts.timeout || 20000);
    var last = '连接失败';
    for (var a = 0; a < 2; a++) {
      try {
        var r = await fetch(MIRROR + '/search?query=' + encodeURIComponent(q) + '&limit=' + (opts.limit || 10),
          { signal: signal });
        if (signal.aborted) throw new Error('aborted');
        if (!r.ok) throw new Error('镜像返回 ' + r.status);
        var list = rankSets(await r.json(), q);
        return list;
      } catch (e) {
        if (e.name === 'AbortError' || /aborted/.test(e.message)) throw new Error('aborted');
        last = e.message;
        if (a === 0) await sleep(800);
      }
    }
    throw new Error(last);
  }

  async function findAlternatives(s, tried) {
    try {
      var q = ((s.title || '') + ' ' + (s.artist || '')).trim();
      var r = await fetch(MIRROR + '/search?query=' + encodeURIComponent(q) + '&limit=8');
      if (!r.ok) return [];
      var list = rankSets(await r.json(), s.title || '');
      return list.filter(function (x) { return !tried.has(String(x.SetID)); })
        .slice(0, 4)
        .map(function (x) { return { setId: x.SetID, title: x.Title || s.title, artist: x.Artist || s.artist }; });
    } catch (e) { return []; }
  }

  /** 同曲多个谱面包依次尝试（原逻辑保留） */
  async function loadTrack(s, onStatus) {
    var tried = new Set([String(s.setId)]);
    var cur = s;
    for (var a = 0; a < 4; a++) {
      try {
        var r = await loadSetAudio(cur.setId, onStatus);
        return Object.assign({ item: cur }, r);
      } catch (e) {
        var alts = (cur.alts || []).filter(function (x) { return !tried.has(String(x.setId)); });
        if (!alts.length) alts = (await findAlternatives(s, tried)).filter(function (x) { return !tried.has(String(x.setId)); });
        if (!alts.length) throw e;
        var next = alts.shift();
        tried.add(String(next.setId));
        onStatus && onStatus('拿不到这个包（' + e.message + '），换同曲的另一个版本…', 0);
        cur = Object.assign({}, cur, next, { alts: alts });
      }
    }
    throw new Error('同曲的几个谱面包都拿不到');
  }

  /* ---------------------------------------------------------------- 歌词层 */
  /** 读取歌词 JSON；已是 [{t,ja,zh}] 则直接返回。失败返回 null（[82] 无歌词空状态） */
  async function loadLyrics(url) {
    if (!url) return null;
    try {
      var r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      var d = await r.json();
      if (Array.isArray(d.lines)) return { lines: d.lines, song: d.song || '', artist: d.artist || '' };
      if (Array.isArray(d)) return { lines: d, song: '', artist: '' };
      return null;
    } catch (e) { return null; }
  }

  /** [mm:ss.xx] 解析（[83]）；无时间戳的项目跳过时间戳，返回纯文本行 */
  function parseLrc(text) {
    var out = [];
    if (!text) return out;
    var re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    text.split(/\r?\n/).forEach(function (line) {
      var stamps = [], m, last = 0;
      re.lastIndex = 0;
      while ((m = re.exec(line))) {
        var mm = +m[1], ss = +m[2], xx = m[3] ? +m[3] : 0;
        if (m[3] && m[3].length === 2) xx *= 10;
        stamps.push(mm * 60 + ss + xx / 1000);
        last = re.lastIndex;
      }
      var body = line.slice(last).trim();
      if (!body) return;
      if (!stamps.length) { out.push({ t: -1, ja: body }); return; }
      stamps.forEach(function (t) { out.push({ t: t, ja: body }); });
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  /* -------------------------------------------------------------- 评论层 */
  async function loadComments(ncId, opts) {
    opts = opts || {};
    var r = await fetch('/api/netease-comment?id=' + encodeURIComponent(ncId) +
      '&limit=' + (opts.limit || 20) + '&offset=' + (opts.offset || 0));
    var d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || ('HTTP ' + r.status));
    return d;   /* { total, hot:[], comments:[] } */
  }

  /* ------------------------------------------------------------ Media Session */
  function setMediaSession(handlers) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: handlers.title || '', artist: handlers.artist || '', album: 'mfhry.store'
      });
      var map = {
        play: 'play', pause: 'pause', previoustrack: 'previoustrack', nexttrack: 'nexttrack',
        seekbackward: 'seekbackward', seekforward: 'seekforward'
      };
      Object.keys(map).forEach(function (k) {
        if (handlers[k]) navigator.mediaSession.setActionHandler(map[k], handlers[k]);
      });
    } catch (e) { }
  }

  window.APEngine = {
    MIRROR: MIRROR,
    search: search,
    rankSets: rankSets,
    loadTrack: loadTrack,
    loadSetAudio: loadSetAudio,
    streamSet: streamSet,
    findAlternatives: findAlternatives,
    cacheGet: cacheGet,
    cachePut: cachePut,
    cacheStats: cacheStats,
    cacheClearMusic: cacheClearMusic,
    setCacheEnabled: setCacheEnabled,
    loadLyrics: loadLyrics,
    parseLrc: parseLrc,
    loadComments: loadComments,
    setMediaSession: setMediaSession
  };
})();
