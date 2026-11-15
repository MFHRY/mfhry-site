(function () {
  /* 依赖 ap-core.js 暴露的 window.AP；未加载时静默跳过（组件自身不报错） */
  var AP = window.AP;
  if (!AP) return;
  var apStyle = AP.apStyle, ICON = AP.ICON, svg = AP.svg, fmtTime = AP.fmtTime,
      clamp = AP.clamp, relTime = AP.relTime, debounce = AP.debounce,
      SafeStore = AP.SafeStore, APTheme = AP.Theme, APStore = AP.Store,
      AP_TOKENS = AP.TOKENS, AP_EVENTS = AP.EVENTS;

  /* ==========================================================================
   * 模块 2：<ap-lyrics> 歌词模块（[76]–[95]）
   * 保留旧页全部能力：偏移 ±2000ms 记忆、点击行跳转、双语上下排、平滑跟随。
   * ======================================================================== */

  var LYRICS_CSS = AP_TOKENS + `
    .ap-card{ padding:var(--ap-space-2); }
    .ap-lyhead{
      display:flex; align-items:center; gap:var(--ap-space-2);
      padding-bottom:var(--ap-space-2); border-bottom:1px solid var(--ap-divider);
      margin-bottom:var(--ap-space-2);
    }
    .ap-lyhead b{ font-size:15px; font-weight:600; letter-spacing:-0.02em; }   /* [45] */
    .ap-lyhead .ap-cnt{ font-size:11px; color:var(--ap-text-2); }               /* [113] */
    .ap-lyhead .ap-sp{ flex:1 1 auto; }
    /* 偏移控制（保留旧功能） */
    .ap-off{ display:flex; align-items:center; gap:6px; font-size:11px; color:var(--ap-text-2); }
    .ap-off input{
      width:72px; height:4px; -webkit-appearance:none; appearance:none;
      background:var(--ap-track); border-radius:2px; outline:none; cursor:pointer;
      accent-color:var(--ap-accent);                                  /* [17] */
    }
    .ap-off i{ font-style:normal; font-variant-numeric:tabular-nums; min-width:38px; text-align:right; }
    /* 容器：最大高 320px，内部滚动，滚动条隐藏（[85][86]） */
    .ap-lybox{
      max-height:320px; overflow-y:auto; overscroll-behavior:contain;
      scrollbar-width:none; -ms-overflow-style:none;
      position:relative;
    }
    .ap-lybox::-webkit-scrollbar{ width:0; height:0; display:none; }
    .ap-lyinner{
      display:flex; flex-direction:column; gap:var(--ap-space-3);
      padding:var(--ap-space-5) 0 var(--ap-space-6);
      /* 只用 transform 滚动，不触发重排（[87][92][208]） */
      will-change:transform;
      transition:transform 260ms var(--ap-ease);        /* ≤300ms [79] */
    }
    .ap-line{
      font-size:15px; line-height:1.8; letter-spacing:-0.01em;   /* [88][44] */
      color:var(--ap-text-2); opacity:.72;                       /* [78] */
      text-align:center; cursor:pointer;
      border-radius:var(--ap-radius-inner);
      padding:2px 6px;
      transition:color var(--ap-dur) var(--ap-ease),
                 opacity var(--ap-dur) var(--ap-ease),
                 font-size var(--ap-dur) var(--ap-ease);
      word-break:break-word;                                     /* [84] 长行不撑破 */
    }
    .ap-line:hover{ opacity:.9; }
    .ap-line .ap-zh{ font-size:14px; opacity:.85; }              /* 双语字号差 1px [89] */
    .ap-line.ap-cur{
      font-size:17px;                                             /* 当前行 +2px [77] */
      font-weight:600;
      color:var(--ap-text);                                       /* 主色 [77] */
      opacity:1;
      transform:scale(1.01);
    }
    .ap-line.ap-cur .ap-zh{ font-size:16px; color:var(--ap-text-2); }
    /* 空状态不与真实歌词互抢布局（[82]） */
    .ap-lyempty{ padding:var(--ap-space-7) var(--ap-space-4);
      text-align:center; color:var(--ap-text-2); font-size:13px; }
    /* 折叠（[95]） */
    .ap-lybody[hidden]{ display:none; }
    .ap-collapse{ width:32px; height:32px; min-width:32px; min-height:32px; }
    .ap-collapse svg{ width:18px; height:18px; transition:transform var(--ap-dur) var(--ap-ease); }
    .ap-collapse[aria-expanded="true"] svg{ transform:rotate(180deg); }
    @media (prefers-reduced-motion:reduce){
      .ap-lyinner{ transition:none; }
      .ap-line.ap-cur{ transform:none; }
    }
    @container (max-width:340px){
      .ap-line{ font-size:14px; }
      .ap-line.ap-cur{ font-size:16px; }
    }

    /* ------------------------------------------------------------------
       全屏字幕形态（host 带 fs 属性时）：去掉卡片、边框、阴影，整屏只留歌词
       ------------------------------------------------------------------ */
    :host([fs]){
      position:fixed; inset:0; z-index:var(--ap-z-fullscreen);
      background:#000; display:block; overflow:hidden;
    }
    :host([fs]) .ap-card{
      height:100%; width:100%; box-sizing:border-box;
      display:flex; flex-direction:column;
      padding:0 clamp(16px,6vw,120px);
      background:transparent;                        /* 无卡片材质 */
      border:0; border-radius:0;                     /* 无卡片圆角 */
      box-shadow:none;                               /* 无卡片阴影 */
      -webkit-backdrop-filter:none; backdrop-filter:none;
      container-type:normal;
    }
    :host([fs]) .ap-lyhead{ display:none; }          /* 标题/偏移/折叠在全屏隐藏 */
    :host([fs]) .ap-lybody{ flex:1 1 auto; display:flex; min-height:0; }
    :host([fs]) .ap-lybox{
      flex:1 1 auto; max-height:none; display:flex; align-items:center;
      -webkit-mask-image:linear-gradient(180deg,transparent,#000 22%,#000 78%,transparent);
              mask-image:linear-gradient(180deg,transparent,#000 22%,#000 78%,transparent);
    }
    :host([fs]) .ap-lyinner{ width:100%; padding:38vh 0; gap:var(--ap-space-5); }
    :host([fs]) .ap-line{
      font-size:clamp(16px,2.1vw,24px); line-height:1.6;
      color:#8e8e93; opacity:.62;
    }
    :host([fs]) .ap-line .ap-zh{ font-size:clamp(14px,1.7vw,20px); opacity:.8; }
    :host([fs]) .ap-line.ap-cur{
      font-size:clamp(22px,3.1vw,34px);              /* 当前行放大，演员字幕感 */
      font-weight:600; color:#f5f5f7; opacity:1;
    }
    :host([fs]) .ap-line.ap-cur .ap-zh{
      font-size:clamp(18px,2.5vw,28px); color:#d2d2d7; opacity:1;
    }
    :host([fs]) .ap-lyempty{ color:#98989d; padding:40vh 0; font-size:clamp(14px,1.8vw,18px); }
    @media (prefers-reduced-motion:reduce){
      :host([fs]) .ap-lyinner{ transition:none; }
    }
  `;

  class ApLyrics extends AP.Base {
    constructor() {
      super();
      this._lines = null;
      this._cur = -1;
      this._offset = 0;
      this._userScrollAt = 0;    /* 手动滚动后 3s 内不自动跟随 [80] */
      this._positions = [];      /* 缓存行位置，避免 timeupdate 时读布局 [214] */
      this._reqId = 0;
      this._trackKey = '';
    }

    render() {
      var self = this;
      AP.apStyle(this.shadowRoot, LYRICS_CSS);

      var root = document.createElement('div');
      root.className = 'ap-card';
      root.innerHTML =
        '<div class="ap-lyhead">' +
        '<b id="ttl">歌词</b><span class="ap-cnt" id="cnt"></span>' +
        '<span class="ap-sp"></span>' +
        '<label class="ap-off" id="offwrap" hidden>偏移' +
        '<input type="range" id="off" min="-2000" max="2000" step="50" value="0" aria-label="歌词偏移毫秒" />' +
        '<i id="offval">0ms</i></label>' +
        '<button class="ap-btn ap-focusable ap-collapse" id="col" type="button" ' +
        'aria-label="折叠歌词" aria-expanded="true">' + AP.ICON.chevron + '</button>' +
        '</div>' +
        '<div class="ap-lybody" id="body">' +
        '<div class="ap-lybox ap-noscroll" id="box" role="log" aria-live="off">' +
        '<div class="ap-lyinner" id="inner"></div></div></div>';
      this.shadowRoot.appendChild(root);
      this._onCleanup(function () { root.remove(); });
      var _qc = {};
      this._q = function (id) { return _qc[id] || (_qc[id] = root.querySelector('#' + id)); };

      /* 偏移：滑块 + 记忆（保留旧功能） */
      var off = this._q('off');
      var onOff = function () {
        self._offset = (Number(off.value) || 0) / 1000;
        self._q('offval').textContent = off.value + 'ms';
        try { localStorage.setItem('ap:lyoff:' + self._trackKey, off.value); } catch (e) { }
        self._cur = -1;                 /* 强制重算当前行 */
        self._sync(AP.Store.state.time, true);
      };
      off.addEventListener('input', onOff);
      this._onCleanup(function () { off.removeEventListener('input', onOff); });

      /* 折叠 [95] */
      var col = this._q('col');
      var onCol = function () {
        var body = self._q('body');
        var open = body.hasAttribute('hidden');
        if (open) body.removeAttribute('hidden'); else body.setAttribute('hidden', '');
        col.setAttribute('aria-expanded', open ? 'true' : 'false');
        col.setAttribute('aria-label', open ? '折叠歌词' : '展开歌词');
      };
      col.addEventListener('click', onCol);
      this._onCleanup(function () { col.removeEventListener('click', onCol); });

      /* 用户手动滚动 → 3s 内不自动跟随（[80]） */
      var box = this._q('box');
      var markUser = function () { self._userScrollAt = Date.now(); };
      box.addEventListener('wheel', markUser, { passive: true });
      box.addEventListener('touchstart', markUser, { passive: true });
      box.addEventListener('pointerdown', markUser);
      this._onCleanup(function () {
        box.removeEventListener('wheel', markUser);
        box.removeEventListener('touchstart', markUser);
        box.removeEventListener('pointerdown', markUser);
      });

      /* 点击歌词行跳转（[81]） */
      var inner = this._q('inner');
      var onClick = function (ev) {
        var line = ev.target.closest ? ev.target.closest('.ap-line') : null;
        if (!line) return;
        var t = Number(line.dataset.t);
        if (!isFinite(t)) return;
        var idx = Number(line.dataset.i);
        var target = Math.max(0, t - self._offset);
        /* 通过 store 之外的事件交给播放器 seek；页面把事件接到 player.seek */
        self._emit('ap-lyrics-seek', { time: target, index: idx });
      };
      inner.addEventListener('click', onClick);
      this._onCleanup(function () { inner.removeEventListener('click', onClick); });

      /* 位置缓存：容器尺寸变化时重算（不进 timeupdate 路径）[214] */
      this._ro = new ResizeObserver(function () { self._measure(); });
      this._ro.observe(box);
      this._onCleanup(function () { self._ro.disconnect(); });

      /* 订阅 store：曲目变了就换歌词，时间变了就同步（[90] 误差 ≤200ms 由 timeupdate 保证） */
      this._storeOff = AP.Store.on(function (st) {
        var t = AP.Store.track();
        var key = t ? (t.id || t.label || '') + '|' + (t.lyrics || '') : '';
        if (key !== self._trackKey) { self._trackKey = key; self._load(t); }
        if (st.index !== undefined) self._sync(st.time, false);
      });

      this._load(AP.Store.track());
    }

    async _load(t) {
      var self = this;
      var req = ++this._reqId;
      this._lines = null; this._cur = -1;
      this._q('inner').innerHTML = '';
      this._q('cnt').textContent = '';
      if (!t || !t.lyrics) {
        this._empty('这首没有歌词');
        this._q('offwrap').hidden = true;
        return;
      }
      this._q('ttl').textContent = t.zh || t.label || '歌词';
      var d = await APEngine.loadLyrics(t.lyrics);
      if (req !== this._reqId) return;              /* 切歌后旧请求作废 [140] */
      if (!d || !d.lines || !d.lines.length) { this._empty('歌词暂时没有内容'); return; }

      this._lines = d.lines.slice().sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
      var timed = this._lines.some(function (l) { return isFinite(l.t) && l.t >= 0; });
      this._timed = timed;

      /* 偏移恢复 */
      var saved = null;
      try { saved = localStorage.getItem('ap:lyoff:' + this._trackKey); } catch (e) { }
      this._q('offwrap').hidden = !timed;
      if (saved != null) { this._q('off').value = saved; this._q('offval').textContent = saved + 'ms'; }
      this._offset = (Number(this._q('off').value) || 0) / 1000;

      this._q('cnt').textContent = this._lines.length + ' 行';
      this._q('ttl').textContent = (d.artist ? d.artist + ' · ' : '') + (d.song || (t.zh || t.label || '歌词'));

      var frag = document.createDocumentFragment();
      this._lines.forEach(function (l, i) {
        var el = document.createElement('div');
        el.className = 'ap-line';
        el.dataset.i = String(i);
        el.dataset.t = String(isFinite(l.t) ? l.t : '');
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        var ja = document.createElement('div'); ja.className = 'ap-ja'; ja.textContent = l.ja || '';
        el.appendChild(ja);
        if (l.zh) {                                  /* 双语上下排 [89] */
          var zh = document.createElement('div'); zh.className = 'ap-zh'; zh.textContent = l.zh;
          el.appendChild(zh);
        }
        frag.appendChild(el);
      });
      this._q('inner').appendChild(frag);
      this._measure();
      this._sync(AP.Store.state.time, true);
    }

    _empty(msg) {
      this._q('inner').innerHTML = '<div class="ap-lyempty">' + AP.esc(msg || '暂无歌词') + '</div>';
      this._positions = [];
    }

    /** 缓存每一行的 offsetTop（只在渲染/尺寸变化时执行） */
    _measure() {
      var inner = this._q('inner');
      var lines = inner.querySelectorAll('.ap-line');
      this._positions = [];
      for (var i = 0; i < lines.length; i++) {
        this._positions.push({ top: lines[i].offsetTop, h: lines[i].offsetHeight });
      }
    }

    /** 按时间找当前行并滚动；force=true 时忽略 3s 平静期（[80][90]） */
    _sync(time, force) {
      if (!this._lines || !this._lines.length) return;
      var box = this._q('box');
      if (!this._timed) {                        /* 无时间戳：纯文本，不滚动（[93]） */
        return;
      }
      var ct = (time || 0) + this._offset;
      var ni = 0;
      for (var i = 0; i < this._lines.length; i++) {
        if ((this._lines[i].t || 0) <= ct) ni = i; else break;
      }
      if (ni === this._cur && !force) return;
      this._cur = ni;

      var lines = this._q('inner').querySelectorAll('.ap-line');
      var prev = this._q('inner').querySelector('.ap-line.ap-cur');
      if (prev) { prev.classList.remove('ap-cur'); prev.removeAttribute('aria-current'); }
      var cur = lines[ni];
      if (cur) {
        cur.classList.add('ap-cur');
        cur.setAttribute('aria-current', 'true');   /* [91] */
      }

      /* 用户刚滚过 → 3s 内不抢滚动位置 */
      if (!force && Date.now() - this._userScrollAt < 3000) return;

      var p = this._positions[ni];
      if (!p) return;
      var h = box.clientHeight || 320;
      var target = p.top + p.h / 2 - h / 2;
      var max = Math.max(0, (this._positions[this._positions.length - 1].top + 80) - h);
      target = clamp(target, 0, max);
      this._q('inner').style.transform = 'translate3d(0,' + (-target) + 'px,0)';  /* [87][208] */
    }
  }

  if (!customElements.get('ap-lyrics')) customElements.define('ap-lyrics', ApLyrics);
  AP.Lyrics = ApLyrics;
})();
