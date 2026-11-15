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
    .ap-collapse{ width:44px; height:44px; min-width:44px; min-height:44px; }
    .ap-collapse svg{ width:20px; height:20px; transition:transform var(--ap-dur) var(--ap-ease); }
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
      display:block; height:100%; overflow:hidden; background:transparent;
    }
    :host([fs]) .ap-card{
      height:100%; width:100% !important; max-width:none !important;
      margin:0 auto; box-sizing:border-box;
      display:flex; flex-direction:column;
      padding:0 clamp(16px,6vw,120px);
      background:transparent;                        /* 无卡片材质 */
      border:0; border-radius:0;                     /* 无卡片圆角 */
      box-shadow:none;                               /* 无卡片阴影 */
      -webkit-backdrop-filter:none; backdrop-filter:none;
      container-type:normal;
      /* 关键：必须 stretch，否则整块字幕会按内容宽度收缩并贴左边（视觉上"偏左"） */
      align-items:stretch;
    }
    :host([fs]) .ap-lybody{ width:100% !important; align-items:stretch; }
    :host([fs]) .ap-lyhead{ display:none; }          /* 标题/偏移/折叠在全屏隐藏 */
    :host([fs]) .ap-lybody{ flex:1 1 auto; display:flex; min-height:0; width:100%; }
    :host([fs]) .ap-lybox{
      flex:1 1 auto; max-height:none; width:100% !important;
      /* 不用 flex 居中：超高内容会向上下同时溢出，transform 坐标系会错位 */
      display:block;
      -webkit-mask-image:linear-gradient(180deg,transparent,#000 22%,#000 78%,transparent);
              mask-image:linear-gradient(180deg,transparent,#000 22%,#000 78%,transparent);
    }
    :host([fs]) .ap-lyinner{
      width:100%; padding:34vh 0;
      gap:clamp(10px, 2.2vh, 26px);                  /* 行距随屏高呼吸 */
    }
    :host([fs]) .ap-line{
      font-size:clamp(16px,2.1vw,24px); line-height:1.45;
      letter-spacing:0.005em;
      color:#e8e8ed; opacity:.62;
      text-wrap:balance;                             /* 长句折行更匀 */
      text-shadow:0 1px 12px rgba(0,0,0,.35);        /* 压在模糊背景上也可读 */
    }
    /* 景深：离当前行越远越淡，视线自然聚焦（[78] 的延伸，仅全屏生效） */
    :host([fs]) .ap-line[data-dist="0"]{ opacity:1; }
    :host([fs]) .ap-line[data-dist="1"]{ opacity:.46; }
    :host([fs]) .ap-line[data-dist="2"]{ opacity:.30; }
    :host([fs]) .ap-line[data-dist="3"]{ opacity:.20; }
    :host([fs]) .ap-line .ap-zh{ font-size:clamp(14px,1.7vw,20px); opacity:.78; }
    :host([fs]) .ap-line.ap-cur{
      font-size:clamp(22px,3.1vw,34px);              /* 当前行放大，演员字幕感 */
      font-weight:650; letter-spacing:-0.012em;
      line-height:1.34; color:#fff; opacity:1;
      text-shadow:0 2px 20px rgba(0,0,0,.45);
    }
    :host([fs]) .ap-line.ap-cur .ap-zh{
      font-size:clamp(18px,2.5vw,28px); color:#e5e5ea; opacity:1;
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
      this._ro = new ResizeObserver(function () {
        self._measure();
        /* 尺寸变化后按当前播放时间重新对齐，避免滚动目标用的是旧高度 */
        self._sync(AP.Store.state.time, true);
      });
      this._ro.observe(box);
      /* 内容层也要观察：字体异步加载、长句折行都会改变各行的 offsetTop，
         只观察外层容器的话滚动目标会一直用旧位置 */
      try { this._ro.observe(this._q('inner')); } catch (e) { }
      this._onCleanup(function () { self._ro.disconnect(); });
      this._onCleanup(function () {

      });

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
      /* 全量清理：重渲染/跳转后可能残留多个 .ap-cur，只保留唯一的当前行 */
      for (var q = 0; q < lines.length; q++) {
        if (lines[q].classList.contains('ap-cur')) {
          lines[q].classList.remove('ap-cur');
          lines[q].removeAttribute('aria-current');
        }
      }
      var cur = lines[ni];
      if (cur) {
        cur.classList.add('ap-cur');
        cur.setAttribute('aria-current', 'true');   /* [91] */
      }
      /* 景深标记：只标最近 3 行，全屏下按距离渐隐 */
      for (var kk = 0; kk < lines.length; kk++) {
        var d = Math.abs(kk - ni);
        lines[kk].setAttribute('data-dist', String(d > 3 ? 3 : d));
      }

      /* 用户刚滚过 → 3s 内不抢滚动位置 */
      if (!force && Date.now() - this._userScrollAt < 3000) return;

      var p = this._positions[ni];
      var h = box.clientHeight || 320;
      /* 位置缓存会在字号/容器变化后过期（如进入全屏），
         所以对目标行直接读实时布局，保证当前行一定滚到可视区中部 */
      var live = cur ? { top: cur.offsetTop, h: cur.offsetHeight } : p;
      if (!live) return;
      var last = this._positions[this._positions.length - 1];
      var contentH = Math.max(
        this._q('inner').scrollHeight,
        last ? last.top + 80 : 0
      );
      var target = live.top + live.h / 2 - h / 2;
      var max = Math.max(0, contentH - h);
      target = clamp(target, 0, max);

      var inner = this._q('inner');
      var self2 = this;
      var ty = target;
      var apply = function (v) {
        ty = clamp(v, 0, max);
        inner.style.transform = 'translate3d(0,' + (-ty) + 'px,0)';  /* [87][208] */
      };
      apply(target);

      /* 对齐校验放在过渡结束之后：260ms 的平滑滚动期间读矩形会读到中间态，
         等动画停下来再量一次偏差，有就补一帧修正（保证当前行真的落在正中） */
      /* 进入/退出全屏、卡片尺寸变化会让容器高度晚一步才定下来，
         这里在 300ms / 900ms 各重算一次（用当时的真实高度，而不是拿矩形反推），
         保证当前行最终落在字幕区正中。 */
      if (this._realign) { clearTimeout(this._realign[0]); clearTimeout(this._realign[1]); }
      if (cur) {
        var realign = function () {
          if (!cur.isConnected) return;
          var hh = box.clientHeight || h;
          var mt = Math.max(0, Math.max(inner.scrollHeight, live.top + live.h) - hh);
          apply(clamp(live.top + live.h / 2 - hh / 2, 0, mt));
        };
        this._realign = [setTimeout(realign, 300), setTimeout(realign, 900)];
      }
    }
  }

  if (!customElements.get('ap-lyrics')) customElements.define('ap-lyrics', ApLyrics);
  AP.Lyrics = ApLyrics;
})();
