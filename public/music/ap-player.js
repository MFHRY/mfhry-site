(function () {
  /* 依赖 ap-core.js 暴露的 window.AP；未加载时静默跳过（组件自身不报错） */
  var AP = window.AP;
  if (!AP) return;
  var apStyle = AP.apStyle, ICON = AP.ICON, svg = AP.svg, fmtTime = AP.fmtTime,
      clamp = AP.clamp, relTime = AP.relTime, debounce = AP.debounce,
      SafeStore = AP.SafeStore, APTheme = AP.Theme, APStore = AP.Store,
      AP_TOKENS = AP.TOKENS, AP_EVENTS = AP.EVENTS;

  /* ==========================================================================
   * 模块 1：<ap-player> 播放模块（[61]–[75]）+ 全屏（[136]–[150]）
   * ======================================================================== */

  var PLAYER_CSS = AP_TOKENS + `
    .ap-body{ display:flex; flex-direction:column; gap:var(--ap-space-3); }
    /* ---- 头部：封面 + 标题 ---- */
    .ap-head{ display:flex; align-items:center; gap:var(--ap-space-3); min-width:0; }
    .ap-art{
      position:relative; flex:0 0 auto;
      width:64px; height:64px;                     /* 封面正方形 [61] */
      border-radius:var(--ap-radius-art);          /* 16px [61] */
      overflow:hidden;
      background:var(--ap-hover);
      box-shadow:var(--ap-art-inset);              /* 内高光 [62] */
    }
    .ap-art img{ width:100%; height:100%; object-fit:cover; display:block; }  /* [61] */
    .ap-art::after{ content:''; position:absolute; inset:0; border-radius:inherit;
      box-shadow:var(--ap-art-inset); pointer-events:none; }
    /* 播放时呼吸动画：幅度 2%，周期 9s，仅播放（[57][63]） */
    .ap-art.ap-breath img{ animation:ap-breath 9s var(--ap-ease) infinite; will-change:transform; }
    @keyframes ap-breath{ 0%,100%{ transform:scale(1); } 50%{ transform:scale(1.02); } }
    .ap-meta{ min-width:0; flex:1 1 auto; display:flex; flex-direction:column; gap:2px; }
    .ap-title{
      font-size:var(--ap-title);                   /* 17px [64] */
      font-weight:600; letter-spacing:-0.02em;      /* [44] */
      color:var(--ap-text);
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;  /* [47] */
    }
    .ap-artist{
      font-size:13px; font-weight:400; color:var(--ap-text-2);      /* 13px 次色 [64] */
      letter-spacing:-0.01em;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    /* ---- 进度条 [65][66][67][68] ---- */
    .ap-seekwrap{ display:flex; flex-direction:column; gap:var(--ap-space-2); }
    .ap-seek{
      position:relative; height:22px;               /* 热区内衬，便于点击 */
      display:flex; align-items:center; cursor:pointer;
      touch-action:none; outline:none;
    }
    .ap-trackline{
      position:relative; width:100%; height:4px;    /* 轨道 4px [65] */
      border-radius:2px; background:var(--ap-track); transition:height var(--ap-dur) var(--ap-ease);
    }
    .ap-seek:hover .ap-trackline,
    .ap-seek.ap-dragging .ap-trackline,
    .ap-seek:focus-visible .ap-trackline{ height:6px; }   /* hover 6px [65] */
    .ap-fill{
      position:absolute; left:0; top:0; bottom:0;
      border-radius:2px;                            /* 圆角 2px [65] */
      background:var(--ap-accent);                  /* 强调色只用于进度 [17] */
      width:0%; will-change:width;                  /* 只改 width，不查 DOM [206][207] */
    }
    .ap-thumb{
      position:absolute; top:50%; left:0; width:13px; height:13px;  /* 12–14px [66] */
      margin-left:-6.5px; margin-top:-6.5px;
      border-radius:50%; background:var(--ap-thumb);
      box-shadow:0 1px 4px rgba(0,0,0,.28);
      opacity:0; transform:scale(.8);               /* 默认隐藏 [66] */
      transition:opacity var(--ap-dur) var(--ap-ease), transform var(--ap-dur) var(--ap-ease);
      pointer-events:none;
    }
    .ap-seek:hover .ap-thumb,
    .ap-seek.ap-dragging .ap-thumb,
    .ap-seek:focus-visible .ap-thumb{ opacity:1; transform:scale(1); }
    .ap-times{ display:flex; justify-content:space-between;
      font-size:var(--ap-time);                     /* 11px [45] */
      color:var(--ap-text-2); letter-spacing:0; }
    /* ---- 控制区 [69][70][71][72] ---- */
    /* 控制行：允许换行，避免"全屏按钮"被挤出卡片右边界 */
    .ap-controls{
      display:flex; align-items:center; gap:var(--ap-space-1);
      flex-wrap:wrap; row-gap:var(--ap-space-1); min-width:0;
    }
    .ap-controls .ap-grow{ flex:1 1 0; min-width:0; }
    .ap-controls .ap-btn, .ap-controls .ap-main{ flex:0 0 auto; }
    .ap-vol{ min-width:0; flex:0 0 auto; }
    .ap-main{
      width:52px; height:52px; min-width:52px; min-height:52px;   /* 52px [69] */
      border-radius:var(--ap-radius-btn);
      background:var(--ap-invert-bg); color:var(--ap-invert-fg);  /* 反色填充 [51][69] */
      border:0; display:inline-flex; align-items:center; justify-content:center;
      cursor:pointer; position:relative;
      transition:transform var(--ap-dur) var(--ap-ease), background-color var(--ap-dur) var(--ap-ease);
    }
    .ap-main:hover{ transform:scale(1.04); }        /* hover 1.04 [51] */
    .ap-main:active{ transform:scale(0.95); }
    .ap-main:disabled{ opacity:.4; cursor:default; transform:none; }
    .ap-main svg{ width:24px; height:24px; }
    /* 音量 [72] */
    .ap-vol{ display:flex; align-items:center; gap:var(--ap-space-1); }
    .ap-volbar{ position:relative; width:80px; height:22px; display:flex; align-items:center;
      cursor:pointer; touch-action:none; }
    .ap-volbar .ap-trackline{ height:4px; border-radius:2px; }
    .ap-volbar .ap-fill{ background:var(--ap-text-2); }   /* 音量不走强调色 */
    /* 列表开关 */
    .ap-listbtn svg{ width:22px; height:22px; }
    /* ---- 播放列表 [111]–[125] ---- */
    .ap-plist{
      margin-top:var(--ap-space-2);
      max-height:320px;                              /* 列表最大高 [118] */
      overflow-y:auto; overscroll-behavior:contain;   /* 内部滚动 [29][85] */
      scrollbar-width:none; -ms-overflow-style:none;
      border-top:1px solid var(--ap-divider);        /* 分割线 [35] */
      padding-top:var(--ap-space-2);
      transition:max-height 320ms var(--ap-ease), opacity 240ms var(--ap-ease);
    }
    .ap-plist::-webkit-scrollbar{ width:0; height:0; display:none; }  /* 滚动条隐藏 [119] */
    .ap-plist[hidden]{ display:none; }
    .ap-row{
      box-sizing:border-box;
      display:grid;
      grid-template-columns:28px minmax(0,1fr) auto;  /* 均衡器/标题·艺人/时长 [120] */
      align-items:center; gap:var(--ap-space-2);
      padding:9px 11px;                               /* 8–10 / 10–12 [111] */
      border-radius:var(--ap-radius-inner);           /* 12px [112] */
      cursor:pointer;
      min-height:44px;                                /* 热区 [25] */
      transition:background-color var(--ap-dur) var(--ap-ease);
    }
    .ap-row:hover{ background:var(--ap-hover); }      /* [113] */
    .ap-row[aria-current="true"]{ background:var(--ap-hover); }  /* [123] */
    .ap-rowtxt{ min-width:0; display:flex; flex-direction:column; }
    .ap-rowtitle{ font-size:14px; letter-spacing:-0.01em;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .ap-rowartist{ font-size:12px; color:var(--ap-text-2);
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .ap-rowtime{ font-size:11px; color:var(--ap-text-2); }
    /* 从播放列表移除（44px 热区，默认淡显、悬停/聚焦变实） */
    .ap-rowdel{
      width:44px; height:44px; min-width:44px; min-height:44px; padding:0;
      display:inline-flex; align-items:center; justify-content:center;
      border:0; border-radius:50%; background:transparent; color:var(--ap-text-2);
      cursor:pointer; opacity:.55; transition:opacity var(--ap-dur) var(--ap-ease),
        background-color var(--ap-dur) var(--ap-ease), color var(--ap-dur) var(--ap-ease);
    }
    .ap-row:hover .ap-rowdel, .ap-rowdel:focus-visible{ opacity:1; }
    .ap-rowdel:hover{ background:rgba(255,59,48,.16); color:#ff453a; }
    .ap-rowdel svg{ width:14px; height:14px; }
    /* 均衡器三根条 [114][115][116][117] */
    .ap-eq{ display:flex; align-items:flex-end; gap:2px; height:14px; width:20px; }
    .ap-eq i{
      display:block; width:2px; height:14px; background:var(--ap-accent);
      border-radius:1px; transform:scaleY(.3); transform-origin:bottom;
      animation:none;
    }
    .ap-eq.ap-on i{ animation:ap-eq 0.8s var(--ap-ease) infinite; }   /* 周期 0.8s [116] */
    .ap-eq.ap-on i:nth-child(2){ animation-delay:0.15s; }             /* 延迟 [116] */
    .ap-eq.ap-on i:nth-child(3){ animation-delay:0.3s; }
    @keyframes ap-eq{ 0%,100%{ transform:scaleY(.3); } 50%{ transform:scaleY(1); } }
    /* 空状态 [124] */
    .ap-empty{
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:var(--ap-space-2); padding:var(--ap-space-6) var(--ap-space-4);
      color:var(--ap-text-2); font-size:13px; text-align:center;
    }
    .ap-empty svg{ width:32px; height:32px; opacity:.5; }
    /* 状态行（加载/错误）[73][74][175] */
    .ap-status{ font-size:12px; color:var(--ap-text-2); min-height:16px; letter-spacing:0; }
    .ap-status.ap-err{ color:#d70015; }
    /* 窄容器降级（[31] 容器查询） */
    @container (max-width:440px){
      /* 先收起音量条（保留静音键），给全屏/列表按钮腾位置 */
      .ap-volbar{ display:none; }
    }
    @container (max-width:340px){
      .ap-art{ width:52px; height:52px; }
      .ap-title{ font-size:16px; }
      .ap-artist{ font-size:12px; }
      .ap-volbar{ width:64px; }
    }
    /* ---- 页面级全屏（data-fs）里的播放卡片：玻璃材质 + 紧凑排版 ---- */
    /* 全屏：无边框沉浸形态——不要卡片底衬，控件直接浮在封面虚化层上 */
    :host([fs]) .ap-card{
      max-width:880px;                            /* 与字幕列同宽 */
      margin:0 auto;                              /* 影子树内同样居中 */
      background:none;
      -webkit-backdrop-filter:none;
              backdrop-filter:none;
      border:0;
      border-radius:0;
      box-shadow:none;
      color:#f5f5f7;
      padding:6px 6px 0;
    }
    :host([fs]) .ap-body{ gap:10px; }
    /* 全屏卡片：封面在上、歌名与歌手居中，不再靠左 */
    :host([fs]) .ap-head{
      flex-direction:column; align-items:center; text-align:center;
      gap:10px; justify-content:center;
    }
    :host([fs]) .ap-meta{
      align-items:center; text-align:center; flex:0 0 auto; width:100%;
    }
    :host([fs]) .ap-title, :host([fs]) .ap-artist{ text-align:center; }
    :host([fs]) .ap-status{ text-align:center; }
    :host([fs]) .ap-art{
      width:78px; height:78px; border-radius:19px;
      box-shadow:0 20px 50px rgba(0,0,0,.52), 0 0 0 1px rgba(255,255,255,.10) inset;
    }
    :host([fs]) .ap-title{
      font-size:17px; letter-spacing:-0.02em;
      text-shadow:0 1px 20px rgba(0,0,0,.45);
    }
    :host([fs]) .ap-artist{ font-size:12.5px; }
    :host([fs]) .ap-seekwrap{ margin:0; }
    :host([fs]) .ap-times{ font-size:11px; color:#c7c7cc; }
    /* 全屏：上一首 / 播放暂停 / 下一首 独占一排并严格居中，其余按钮排下一行 */
    :host([fs]) .ap-controls{
      flex-wrap:wrap; justify-content:center; gap:6px 12px; row-gap:8px;
    }
    :host([fs]) .ap-controls .ap-grow{ display:none; }
    :host([fs]) #prev, :host([fs]) #toggle, :host([fs]) #next{ order:0; }
    :host([fs]) .ap-controls::after{
      content:''; flex:0 0 100%; order:1; height:0;     /* 换行分隔 */
    }
    :host([fs]) #mode, :host([fs]) .ap-vol,
    :host([fs]) #mvbtn, :host([fs]) #listbtn, :host([fs]) #fullscreen{ order:2; }
    :host([fs]) .ap-status{ min-height:0; }
    /* 全屏进度条：更细、渐变强调色，悬停才加粗 */
    :host([fs]) .ap-trackline{ height:3px; border-radius:3px; }
    :host([fs]) .ap-seek:hover .ap-trackline,
    :host([fs]) .ap-seek.ap-dragging .ap-trackline,
    :host([fs]) .ap-seek:focus-visible .ap-trackline{ height:5px; }
    :host([fs]) .ap-fill{ background:linear-gradient(90deg,#0a84ff,#5e5ce6); border-radius:3px; }
    :host([fs]) .ap-times{ color:rgba(245,245,247,.55); }

    :host([fs]) .ap-status:empty{ display:none; }

    /* 全屏（[136]–[150]） */
    :host(:fullscreen){ background:transparent; }
    :host(:fullscreen) .ap-card{
      position:fixed; inset:0; max-width:none; width:100vw; height:100vh;
      border-radius:0; border:0; box-shadow:none;
      padding:calc(env(safe-area-inset-top,0px) + 24px) 24px calc(env(safe-area-inset-bottom,0px) + 24px);
      display:flex; align-items:center; justify-content:center;
      z-index:var(--ap-z-fullscreen);              /* [8] 全屏 100 */
      background:#000;                             /* 全屏深色底 [18][138] */
      overflow:hidden;
    }
    :host(:fullscreen) .ap-body{ width:min(520px,100%); }
    :host(:fullscreen) .ap-art{ width:min(280px,60vw); height:min(280px,60vw); align-self:center; }
    :host(:fullscreen) .ap-head{ flex-direction:column; text-align:center; align-items:center; gap:var(--ap-space-4); }
    :host(:fullscreen) .ap-title{ font-size:22px; }
    :host(:fullscreen) .ap-artist{ font-size:15px; }
    :host(:fullscreen) .ap-exit{ position:absolute; top:calc(env(safe-area-inset-top,0px) + 12px);
      right:calc(env(safe-area-inset-right,0px) + 12px); }   /* 右上安全区 [141] */
    :host(:fullscreen) .ap-exit{ color:#f5f5f7; }
    .ap-exit{ display:none; }
    :host(:fullscreen) .ap-exit{ display:inline-flex; }
    /* Fullscreen API 不可用时的兜底覆盖（[137]），带淡出可退出（[3]） */
    :host([data-fs-fallback]) .ap-card{
      position:fixed; inset:0; z-index:var(--ap-z-fullscreen);
      max-width:none; width:100vw; height:100vh; border-radius:0;
      background:#000; padding:calc(env(safe-area-inset-top,0px) + 24px) 24px
        calc(env(safe-area-inset-bottom,0px) + 24px);
      display:flex; align-items:center; justify-content:center;
      animation:ap-fs 300ms var(--ap-ease);
    }
    :host([data-fs-fallback]) .ap-body{ width:min(520px,100%); }
    :host([data-fs-fallback]) .ap-exit{ display:inline-flex; position:absolute;
      top:calc(env(safe-area-inset-top,0px) + 12px);
      right:calc(env(safe-area-inset-right,0px) + 12px); color:#f5f5f7; }
    /* 全屏进场动画 300ms（[143]），reduced-motion 取消（[149]） */
    :host(:fullscreen) .ap-card{ animation:ap-fs 300ms var(--ap-ease); }
    @keyframes ap-fs{ from{ opacity:0; transform:scale(.96); } to{ opacity:1; transform:scale(1); } }
    @media (prefers-reduced-motion:reduce){
      :host(:fullscreen) .ap-card{ animation:none; }
      .ap-art.ap-breath img{ animation:none; }
      .ap-eq.ap-on i{ animation:none; transform:scaleY(.6); }
    }
  `;

  class ApPlayer extends AP.Base {
    constructor() {
      super();
      this._idx = -1;
      this._tracks = [];
      this._dragging = false;
      this._volDragging = false;
      this._loadToken = 0;          /* 取消上一次未完成加载（[75][140]） */
      this._audio = null;
    }

    static get observedAttributes() { return ['current-index', 'volume', 'playlist-open']; }

    /* -------- 属性 / API（[141]–[147][150]） -------- */
    get tracks() { return this._tracks; }
    set tracks(v) {
      this._tracks = Array.isArray(v) ? v.slice() : [];
      AP.Store.set({ tracks: this._tracks });
      if (this._tracks.length && AP.Store.state.index < 0) {
        AP.Store.set({ index: 0 });
        this._idx = 0;
      }
      this._renderList();
      this._syncMeta();
      this._renderEmpty();
    }
    get currentIndex() { return this._idx; }
    set currentIndex(n) {
      n = Number(n);
      if (!isFinite(n) || n < 0 || n >= this._tracks.length) return;
      this._select(n, true);
    }
    get volume() { return AP.Store.state.volume; }
    set volume(v) {
      v = clamp(Number(v) || 0, 0, 1);
      AP.Store.set({ volume: v, muted: v === 0 });
      if (this._audio) this._audio.volume = v;
      this._paintVolume();
    }

    /** 播放（[141]） */
    play() {
      if (!this._audio) return Promise.resolve();
      var self = this;
      /* 自动播放被拒必须捕获 Promise 并回退暂停态（[74][131][132]） */
      var p = this._audio.play();
      if (p && typeof p.then === 'function') {
        return p.then(function () { }).catch(function () {
          AP.Store.set({ playing: false });
          self._setStatus('点击播放开始（浏览器阻止了自动播放）');
          self._paintPlayBtn();
          self._emit('ap-pause');
        });
      }
      return Promise.resolve();
    }
    /** 暂停（[141]） */
    pause() { if (this._audio) this._audio.pause(); }
    /** 跳转秒数（[142]） */
    seek(sec) {
      if (!this._audio) return;
      var d = this._audio.duration;
      if (!isFinite(d) || d <= 0) return;
      this._audio.currentTime = clamp(Number(sec) || 0, 0, d);
      this._paintProgress();
    }
    /** 设置音量（[142]） */
    setVolume(v) { this.volume = v; }

    render() {
      var self = this;
      var css = apStyle(this.shadowRoot, PLAYER_CSS);
      this._onCleanup(function () { try { self.shadowRoot.adoptedStyleSheets = []; } catch (e) { } });

      var root = document.createElement('div');
      root.className = 'ap-card';
      root.setAttribute('part', 'card');
      root.innerHTML =
        '<div class="ap-body">' +
        '<div class="ap-head">' +
        '<div class="ap-art" id="art"></div>' +
        '<div class="ap-meta"><div class="ap-title ap-ellipsis" id="title">未选择曲目</div>' +
        '<div class="ap-artist ap-ellipsis" id="artist">从下方曲单挑一首</div></div>' +
        '</div>' +
        '<div class="ap-seekwrap">' +
        '<div class="ap-seek ap-focusable" id="seek" role="slider" tabindex="0" ' +
        'aria-label="播放进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0:00">' +
        '<div class="ap-trackline"><div class="ap-fill" id="fill"></div><div class="ap-thumb" id="thumb"></div></div>' +
        '</div>' +
        '<div class="ap-times ap-num"><span id="cur">0:00</span><span id="dur">0:00</span></div>' +
        '</div>' +
        '<div class="ap-controls">' +
        '<button class="ap-btn ap-focusable" id="prev" type="button" aria-label="上一首">' + AP.ICON.prev + '</button>' +
        '<button class="ap-main ap-focusable" id="toggle" type="button" aria-label="播放" aria-pressed="false">' +
        AP.ICON.play + '</button>' +
        '<button class="ap-btn ap-focusable" id="next" type="button" aria-label="下一首">' + AP.ICON.next + '</button>' +
        '<button class="ap-btn ap-focusable" id="mode" type="button" aria-label="播放模式：顺序" aria-pressed="false">' +
        AP.ICON.repeat + '</button>' +
        '<span class="ap-grow"></span>' +
        '<div class="ap-vol">' +
        '<button class="ap-btn ap-focusable" id="mute" type="button" aria-label="静音" aria-pressed="false">' +
        AP.ICON.volume + '</button>' +
        '<div class="ap-volbar ap-focusable" id="volbar" role="slider" tabindex="0" aria-label="音量" ' +
        'aria-valuemin="0" aria-valuemax="100" aria-valuenow="85">' +
        '<div class="ap-trackline"><div class="ap-fill" id="volfill"></div></div></div>' +
        '</div>' +
        '<button class="ap-btn ap-focusable" id="mvbtn" type="button" ' +
        'aria-label="播放 MV" aria-pressed="false">' + AP.ICON.video + '</button>' +
        '<button class="ap-btn ap-listbtn ap-focusable" id="listbtn" type="button" ' +
        'aria-label="播放列表" aria-expanded="false" aria-pressed="false">' + AP.ICON.list + '</button>' +
        '<button class="ap-btn ap-focusable" id="fullscreen" type="button" aria-label="进入全屏">' + AP.ICON.expand + '</button>' +
        '</div>' +
        '<div class="ap-status" id="status" role="status" aria-live="polite"></div>' +
        '<div class="ap-plist" id="plist" hidden aria-label="播放列表"></div>' +
        '</div>' +
        '<button class="ap-btn ap-exit ap-focusable" id="exit" type="button" aria-label="退出全屏">' + AP.ICON.compress + '</button>' +
        '<audio id="audio" preload="metadata"></audio>';
      this.shadowRoot.appendChild(root);
      this._onCleanup(function () { root.remove(); });

      var _qc = {};
      this._q = function (id) { return _qc[id] || (_qc[id] = root.querySelector('#' + id)); };
      this._audio = this._q('audio');

      /* --------- 音频事件（[73][74][127]–[136]） --------- */
      var a = this._audio;

      /* loadedmetadata：拿到时长（[128]） */
      var onMeta = function () {
        AP.Store.set({ duration: a.duration || 0, loading: false });
        self._paintProgress();
      };
      /* durationchange：时长变化（[129]） */
      var onDur = function () { AP.Store.set({ duration: a.duration || 0 }); self._paintProgress(); };
      /* timeupdate：唯一进度来源，禁止 setInterval（[73][127][130][206]） */
      var onTime = function () {
        if (self._dragging) return;                  /* 拖拽中暂停更新 [68] */
        AP.Store.set({ time: a.currentTime || 0 });
        self._paintProgress();
      };
      var onPlay = function () {
        AP.Store.set({ playing: true });
        self._paintPlayBtn(); self._paintEq();
        self._emit('ap-play', { index: self._idx });
      };
      var onPause = function () {
        AP.Store.set({ playing: false });
        self._paintPlayBtn(); self._paintEq();
        self._emit('ap-pause', { index: self._idx });
      };
      /* ended：单曲循环 / 列表循环 / 顺序 / 随机（[136]–[139]） */
      var onEnded = function () {
        self._emit('ap-ended', { index: self._idx });
        var st = AP.Store.state, n = st.tracks.length;
        if (st.mode === 'one') {                     /* [137] */
          a.currentTime = 0; self.play(); return;
        }
        if (st.mode === 'shuffle') {                 /* [139] 不重复当前曲 */
          if (n <= 1) { a.currentTime = 0; self.play(); return; }
          var pick = self._idx;
          while (pick === self._idx) pick = Math.floor(Math.random() * n);
          self._select(pick, true); return;
        }
        if (self._idx + 1 < n) { self._select(self._idx + 1, true); }  /* 顺序/列表循环 [138] */
        else if (st.mode === 'order') { AP.Store.set({ playing: false }); self._paintPlayBtn(); }
        else self._select(0, true);
      };
      /* error：静默降级 + 提示（[135][125]） */
      var onErr = function () {
        AP.Store.set({ playing: false, loading: false, error: 'audio' });
        self._setStatus('音频加载失败，请换一首或稍后重试', true);
        self._paintPlayBtn();
        self._emit('ap-error', { index: self._idx });
      };
      var onWaiting = function () { AP.Store.set({ loading: true }); self._setStatus('缓冲中…'); };
      var onPlaying = function () { AP.Store.set({ loading: false }); self._setStatus(''); };

      [['loadedmetadata', onMeta], ['durationchange', onDur], ['timeupdate', onTime],
      ['play', onPlay], ['pause', onPause], ['ended', onEnded], ['error', onErr],
      ['waiting', onWaiting], ['playing', onPlaying]].forEach(function (pair) {
        a.addEventListener(pair[0], pair[1]);
        self._onCleanup(function () { a.removeEventListener(pair[0], pair[1]); });  /* [212] */
      });

      /* --------- 进度条：指针拖拽（[67][68][89][90]） --------- */
      var seek = this._q('seek');
      var ratioFromEvent = function (ev) {
        var r = seek.getBoundingClientRect();
        return clamp((ev.clientX - r.left) / (r.width || 1), 0, 1);
      };
      var onSeekDown = function (ev) {
        if (!a.duration || !isFinite(a.duration)) return;
        self._dragging = true;                        /* 拖拽中冻结 timeupdate [68][90] */
        seek.classList.add('ap-dragging');
        seek.setPointerCapture && seek.setPointerCapture(ev.pointerId);
        self._paintRatio(ratioFromEvent(ev));         /* 预览 */
        ev.preventDefault();
      };
      var onSeekMove = function (ev) {
        if (!self._dragging) return;
        self._paintRatio(ratioFromEvent(ev));
      };
      var onSeekUp = function (ev) {
        if (!self._dragging) return;
        self._dragging = false;
        seek.classList.remove('ap-dragging');
        var r = ratioFromEvent(ev);
        if (a.duration && isFinite(a.duration)) a.currentTime = r * a.duration;  /* 松开才真正 seek */
        self._paintProgress();
      };
      seek.addEventListener('pointerdown', onSeekDown);
      seek.addEventListener('pointermove', onSeekMove);
      seek.addEventListener('pointerup', onSeekUp);
      seek.addEventListener('pointercancel', onSeekUp);
      this._onCleanup(function () {
        seek.removeEventListener('pointerdown', onSeekDown);
        seek.removeEventListener('pointermove', onSeekMove);
        seek.removeEventListener('pointerup', onSeekUp);
        seek.removeEventListener('pointercancel', onSeekUp);
      });

      /* 键盘：左右 ±5s，Home/End（[67]） */
      var onSeekKey = function (ev) {
        var d = a.duration;
        if (!d || !isFinite(d)) return;
        var t = a.currentTime;
        if (ev.key === 'ArrowLeft') { self.seek(t - 5); ev.preventDefault(); }       /* 5 秒步进 [67] */
        else if (ev.key === 'ArrowRight') { self.seek(t + 5); ev.preventDefault(); }
        else if (ev.key === 'Home') { self.seek(0); ev.preventDefault(); }            /* [67] */
        else if (ev.key === 'End') { self.seek(d); ev.preventDefault(); }
      };
      seek.addEventListener('keydown', onSeekKey);
      this._onCleanup(function () { seek.removeEventListener('keydown', onSeekKey); });

      /* --------- 传输按钮 --------- */
      var toggle = this._q('toggle');
      var onToggle = function () { if (a.paused) self.play(); else self.pause(); };
      toggle.addEventListener('click', onToggle);
      this._onCleanup(function () { toggle.removeEventListener('click', onToggle); });

      var prev = this._q('prev');
      var onPrev = function () {
        var n = self._tracks.length; if (!n) return;
        self._select((self._idx - 1 + n) % n, true);
      };
      prev.addEventListener('click', onPrev);
      this._onCleanup(function () { prev.removeEventListener('click', onPrev); });

      var next = this._q('next');
      var onNext = function () {
        var n = self._tracks.length; if (!n) return;
        if (AP.Store.state.mode === 'shuffle') {
          var p = self._idx; while (p === self._idx && n > 1) p = Math.floor(Math.random() * n);
          self._select(p, true);
        } else self._select((self._idx + 1) % n, true);
      };
      next.addEventListener('click', onNext);
      this._onCleanup(function () { next.removeEventListener('click', onNext); });

      /* 播放模式：order → one → shuffle（[71] 图标态，不用彩色） */
      var mode = this._q('mode');
      var MODES = [
        { k: 'order', label: '顺序', icon: AP.ICON.repeat },
        { k: 'one', label: '单曲循环', icon: AP.ICON.repeatOne },
        { k: 'shuffle', label: '随机', icon: AP.ICON.shuffle }
      ];
      var onMode = function () {
        var cur = AP.Store.state.mode;
        var i = MODES.findIndex(function (m) { return m.k === cur; });
        var nx = MODES[(i + 1) % MODES.length];
        AP.Store.set({ mode: nx.k });
        mode.innerHTML = nx.icon;
        mode.setAttribute('aria-label', '播放模式：' + nx.label);
        mode.setAttribute('aria-pressed', nx.k !== 'order' ? 'true' : 'false');
        self._setStatus('播放模式：' + nx.label);
      };
      mode.addEventListener('click', onMode);
      this._onCleanup(function () { mode.removeEventListener('click', onMode); });

      /* --------- 音量 + 静音（[72][126]） --------- */
      var volbar = this._q('volbar'), volfill = this._q('volfill'), mute = this._q('mute');
      var volRatio = function (ev) {
        var r = volbar.getBoundingClientRect();
        return clamp((ev.clientX - r.left) / (r.width || 1), 0, 1);
      };
      var onVolDown = function (ev) {
        self._volDragging = true;
        volbar.setPointerCapture && volbar.setPointerCapture(ev.pointerId);
        self.volume = volRatio(ev); ev.preventDefault();
      };
      var onVolMove = function (ev) { if (self._volDragging) self.volume = volRatio(ev); };
      var onVolUp = function () { self._volDragging = false; };
      volbar.addEventListener('pointerdown', onVolDown);
      volbar.addEventListener('pointermove', onVolMove);
      volbar.addEventListener('pointerup', onVolUp);
      volbar.addEventListener('pointercancel', onVolUp);
      var onVolKey = function (ev) {
        var v = self.volume;
        if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') { self.volume = v - 0.05; ev.preventDefault(); }
        else if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') { self.volume = v + 0.05; ev.preventDefault(); }
        else if (ev.key === 'Home') { self.volume = 0; ev.preventDefault(); }
        else if (ev.key === 'End') { self.volume = 1; ev.preventDefault(); }
      };
      volbar.addEventListener('keydown', onVolKey);
      var onMute = function () {
        var st = AP.Store.state;
        var muted = !st.muted;
        AP.Store.set({ muted: muted });
        if (a) a.muted = muted;
        mute.innerHTML = muted ? AP.ICON.mute : AP.ICON.volume;
        mute.setAttribute('aria-pressed', muted ? 'true' : 'false');
        mute.setAttribute('aria-label', muted ? '取消静音' : '静音');
        self._paintVolume();
      };
      mute.addEventListener('click', onMute);
      this._onCleanup(function () {
        volbar.removeEventListener('pointerdown', onVolDown);
        volbar.removeEventListener('pointermove', onVolMove);
        volbar.removeEventListener('pointerup', onVolUp);
        volbar.removeEventListener('pointercancel', onVolUp);
        volbar.removeEventListener('keydown', onVolKey);
        mute.removeEventListener('click', onMute);
      });

      /* --------- 列表展开/折叠（[39] 默认折叠 / [40] 属性可控） --------- */
      var listbtn = this._q('listbtn');
      var onListToggle = function () { self._toggleList(); };

      /* MV 按钮：页面持有 MV 模块，这里只发事件 */
      var mvBtn = this._q('mvbtn');
      var onMv = function () {
        self._emit('ap-mv-open', { index: AP.Store.state.index });
      };
      mvBtn.addEventListener('click', onMv);
      this._onCleanup(function () { mvBtn.removeEventListener('click', onMv); });
      this._syncMvBtn();
      listbtn.addEventListener('click', onListToggle);
      this._onCleanup(function () { listbtn.removeEventListener('click', onListToggle); });

      /* 明确的全屏按钮；封面双击仍保留作为快捷入口 */
      var fsBtn = this._q('fullscreen');
      var onFs = function () {
        self.toggleFullscreen(fsBtn);
      };
      fsBtn.addEventListener('click', onFs);
      this._onCleanup(function () { fsBtn.removeEventListener('click', onFs); });

      /* --------- 全屏（[136]–[150]） --------- */
      var exitBtn = this._q('exit');
      this._fsTrigger = null;
      var onFsChange = function () {
        var isFs = document.fullscreenElement === self;
        if (!isFs && self._fsTrigger) {                /* 退出后焦点回到触发按钮 [147] */
          try { self._fsTrigger.focus(); } catch (e) { }
          self._fsTrigger = null;
        }
        self._paintPlayBtn();
      };
      document.addEventListener('fullscreenchange', onFsChange);
      this._onCleanup(function () { document.removeEventListener('fullscreenchange', onFsChange); });

      var onExit = function () {
        if (document.fullscreenElement === self) {
          document.exitFullscreen().catch(function () { });
        } else if (self.hasAttribute('data-fs-fallback')) {
          self._exitFallback();                 /* 兜底模式退出 [137] */
        }
      };
      exitBtn.addEventListener('click', onExit);
      this._onCleanup(function () { exitBtn.removeEventListener('click', onExit); });

      /* ESC 退出兜底全屏（[142][3] 必须可退出） */
      var onEsc = function (ev) {
        if (ev.key === 'Escape' && self.hasAttribute('data-fs-fallback')) self._exitFallback();
      };
      document.addEventListener('keydown', onEsc);
      this._onCleanup(function () { document.removeEventListener('keydown', onEsc); });

      /* 双击封面进全屏（[136] 播放器入口） */
      var art = this._q('art');
      var onArtDbl = function () { self.toggleFullscreen(art); };
      art.addEventListener('dblclick', onArtDbl);
      this._onCleanup(function () { art.removeEventListener('dblclick', onArtDbl); });

      /* --------- 订阅 store（所有模块共用状态，[190]） --------- */
      var prevSig = '';
      this._storeOff = AP.Store.on(function (st) {
        var sig = st.index + '|' + st.playing + '|' + st.duration + '|' + st.muted;
        if (sig !== prevSig) { prevSig = sig; self._paintPlayBtn(); self._paintEq(); self._syncMeta(); }
      });

      /* 初始渲染 */
      this._renderList();
      this._syncMeta();
      this._paintPlayBtn();
      this._paintVolume();
      this._renderEmpty();
    }

    /** 全屏入口（[136][137]）；页面接管时（_fsDelegate）只发事件，
     *  由页面把全屏层换成「纯歌词字幕」——全屏不再只显示卡片 */
    toggleFullscreen(trigger) {
      var self = this;
      this._fsTrigger = trigger || null;
      if (this._fsDelegate) { this._emit('ap-fs-toggle', { on: true }); return; }
      if (document.fullscreenElement === this) {
        (document.exitFullscreen ? document.exitFullscreen() : Promise.reject()).catch(function () { });
        return;
      }
      var card = this.shadowRoot && this.shadowRoot.querySelector('.ap-card');
      var el = card || this;
      var req = el.requestFullscreen ? el.requestFullscreen() : Promise.reject();
      (req || Promise.reject()).catch(function () {
        /* 失败回退：把卡片固定到视口（[137] 兜底；仍可 ESC 关闭） */
        self.setAttribute('data-fs-fallback', '');
        self.setAttribute('aria-modal', 'true');          /* [150] 读屏可感知 */
        self.setAttribute('role', 'dialog');
        self.setAttribute('aria-label', '全屏播放');
        self._prevOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';   /* [145] 锁滚动（全屏例外） */
        self._setStatus('当前浏览器不支持全屏 API，已切换为覆盖模式');
      });
    }

    /** 退出兜底全屏：清属性、恢复滚动与焦点（[137][145][147]） */
    _exitFallback() {
      this.removeAttribute('data-fs-fallback');
      this.removeAttribute('aria-modal');
      this.removeAttribute('role');
      this.removeAttribute('aria-label');
      document.documentElement.style.overflow = this._prevOverflow || '';
      if (this._fsTrigger) { try { this._fsTrigger.focus(); } catch (e) { } this._fsTrigger = null; }
    }

    attributeChangedCallback(name, oldV, newV) {
      if (!this.shadowRoot) return;
      if (name === 'current-index') {
        var n = Number(newV);
        if (isFinite(n) && n >= 0 && n < this._tracks.length && n !== this._idx) this._select(n, false);
      } else if (name === 'volume') {
        this.volume = newV;
      } else if (name === 'playlist-open') {
        this._toggleList(newV !== 'false' && newV !== null);
      }
    }

    /* -------- 内部渲染 -------- */

    _paintRatio(r) {
      if (!this._q) return;
      var pct = (r * 100).toFixed(2) + '%';
      this._q('fill').style.width = pct;             /* 只改 width [207] */
      this._q('thumb').style.left = pct;
      var d = this._audio && isFinite(this._audio.duration) ? this._audio.duration : 0;
      this._q('cur').textContent = fmtTime(r * d);
    }

    _paintProgress() {
      if (!this._q) return;
      var a = this._audio, d = a && isFinite(a.duration) ? a.duration : 0;
      var t = a ? a.currentTime : 0;
      var r = d > 0 ? clamp(t / d, 0, 1) : 0;
      var pct = (r * 100).toFixed(3) + '%';
      this._q('fill').style.width = pct;
      this._q('thumb').style.left = pct;
      this._q('cur').textContent = fmtTime(t);
      this._q('dur').textContent = fmtTime(d);
      var seek = this._q('seek');
      seek.setAttribute('aria-valuenow', String(Math.round(r * 100)));
      seek.setAttribute('aria-valuetext', fmtTime(t) + ' / ' + fmtTime(d));
    }

    _paintVolume() {
      if (!this._q) return;
      var v = AP.Store.state.muted ? 0 : AP.Store.state.volume;
      this._q('volfill').style.width = (v * 100).toFixed(1) + '%';
      this._q('volbar').setAttribute('aria-valuenow', String(Math.round(v * 100)));
      this._q('volbar').setAttribute('aria-valuetext', Math.round(v * 100) + '%');
      var mute = this._q('mute');
      mute.innerHTML = AP.Store.state.muted ? AP.ICON.mute : AP.ICON.volume;
      mute.setAttribute('aria-pressed', AP.Store.state.muted ? 'true' : 'false');
    }

    _paintPlayBtn() {
      if (!this._q) return;
      var playing = AP.Store.state.playing;
      var b = this._q('toggle');
      b.innerHTML = playing ? AP.ICON.pause : AP.ICON.play;
      b.setAttribute('aria-label', playing ? '暂停' : '播放');
      b.setAttribute('aria-pressed', playing ? 'true' : 'false');
      var art = this._q('art');
      if (art) art.classList.toggle('ap-breath', playing);      /* 仅播放时呼吸 [57][63] */
    }

    _paintEq() {
      if (!this._q) return;
      var playing = AP.Store.state.playing;
      var rows = this.shadowRoot.querySelectorAll('.ap-row');
      for (var i = 0; i < rows.length; i++) {
        var eq = rows[i].querySelector('.ap-eq');
        if (!eq) continue;
        var on = playing && Number(rows[i].dataset.i) === this._idx;
        eq.classList.toggle('ap-on', on);                        /* 仅播放时运行 [117] */
      }
    }

    _setStatus(text, isErr) {
      if (!this._q) return;
      var s = this._q('status');
      if (!s) return;
      s.textContent = text || '';
      s.classList.toggle('ap-err', !!isErr);
    }

    _syncMeta() {
      if (!this._q) return;
      var t = AP.Store.track();
      var title = this._q('title'), artist = this._q('artist'), art = this._q('art');
      if (!t) {
        title.textContent = '未选择曲目';
        artist.textContent = this._tracks.length ? '从下方曲单挑一首' : '曲单为空';
        art.innerHTML = '';
        return;
      }
      var prevTitle = title.textContent;
      var nextTitle = t.zh || t.label || '未知曲目';
      title.textContent = nextTitle;
      artist.textContent = t.artist || t.label || '';
      /* 切歌时标题/封面轻微渐入，避免生硬跳变（尊重减弱动效） */
      var soft = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (soft && nextTitle && prevTitle !== nextTitle && title.animate) {
        title.animate(
          [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' }
        );
        if (art.animate) art.animate(
          [{ opacity: .55, transform: 'scale(.965)' }, { opacity: 1, transform: 'scale(1)' }],
          { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' }
        );
      }
      if (t.cover) {
        if (!art.querySelector('img') || art.querySelector('img').getAttribute('src') !== t.cover) {
          art.innerHTML = '';
          var img = document.createElement('img');
          img.src = t.cover;
          img.alt = (t.zh || t.label || '') + ' 封面';
          img.loading = 'lazy';               /* [210] */
          img.decoding = 'async';
          img.addEventListener('error', function () { img.remove(); });
          art.appendChild(img);
        }
      } else {
        art.innerHTML = '';
      }
    }

    _renderEmpty() {
      if (!this._q) return;
      var plist = this._q('plist');
      if (!this._tracks.length) {
        plist.innerHTML = '<div class="ap-empty">' + AP.ICON.list +
          '<div>曲单为空</div><div style="font-size:12px">从下方推荐曲单挑一首开始</div></div>';
        plist.hidden = false;                 /* 空列表也要可见空状态 [124] */
      }
    }

    _renderList() {
      if (!this._q) return;
      var plist = this._q('plist');
      if (!this._tracks.length) { this._renderEmpty(); return; }
      var frag = document.createDocumentFragment();
      var self = this;
      this._tracks.forEach(function (t, i) {
        var row = document.createElement('div');
        row.className = 'ap-row';
        row.dataset.i = String(i);
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.setAttribute('aria-label', (t.zh || t.label || '') + (t.artist ? ' - ' + t.artist : ''));
        if (i === self._idx) row.setAttribute('aria-current', 'true');   /* [123] */
        row.innerHTML =
          '<span class="ap-eq"><i></i><i></i><i></i></span>' +
          '<span class="ap-rowtxt">' +
          '<span class="ap-rowtitle">' + esc(t.zh || t.label || '') + '</span>' +
          '<span class="ap-rowartist">' + esc(t.artist || t.label || '') + '</span></span>' +
          '<span class="ap-rowtime ap-num">' + (t.durText || '') + '</span>' +
          '<button class="ap-rowdel ap-focusable" type="button" data-del="' + i + '" ' +
          'aria-label="从播放列表移除 ' + esc(t.zh || t.label || '') + '">' + AP.ICON.close + '</button>';
        /* 点击行切歌并自动播放（[121]）；不跳回顶部（[122] 由 scrollTop 保持实现） */
        var onClick = function () { self._select(i, true); };
        var onKey = function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); self._select(i, true); }
        };
        /* 移除按钮：不触发行点击 */
        var del = row.querySelector('[data-del]');
        var onDel = function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          self._emit('ap-queue-remove', { index: i });
        };
        if (del) del.addEventListener('click', onDel);
        row.addEventListener('click', onClick);
        row.addEventListener('keydown', onKey);
        self._onCleanup(function () {
          row.removeEventListener('click', onClick);
          row.removeEventListener('keydown', onKey);
          if (del) del.removeEventListener('click', onDel);
        });
        frag.appendChild(row);
      });
      var keep = plist.scrollTop;               /* [122] 切歌不跳回顶部 */
      plist.innerHTML = '';
      plist.appendChild(frag);
      plist.scrollTop = keep;
      this._paintEq();
    }

    /** MV 按钮反映当前曲目：没有 MV 时淡显并标注 */
    _syncMvBtn() {
      if (!this._q) return;
      var b = this._q('mvbtn');
      if (!b) return;
      var t = AP.Store.track();
      var has = !!(t && t.mv && t.mv.length);
      b.style.opacity = has ? '' : '.42';
      b.setAttribute('aria-label', has ? '播放 MV' : '这首没有 MV');
      b.setAttribute('data-empty', has ? 'false' : 'true');
    }

    _toggleList(force) {
      if (!this._q) return;
      var plist = this._q('plist'), btn = this._q('listbtn');
      var open = typeof force === 'boolean' ? force : plist.hasAttribute('hidden');
      if (open) { plist.hidden = false; this._renderList(); }
      else plist.hidden = true;                 /* 折叠动画 ≤400ms [125] */
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-pressed', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? '收起播放列表' : '展开播放列表');
    }

    /** 选中第 n 首并（可选）自动播放；重置 currentTime 并取消旧加载（[75]） */
    _select(n, autoplay) {
      var t = this._tracks[n];
      if (!t) return;
      var a = this._audio;
      if (!a) return;
      var token = ++this._loadToken;            /* 取消上一次未完成的加载 [140] */
      this._idx = n;
      AP.Store.set({ index: n, time: 0, duration: 0, error: '', loading: true });
      this._syncMvBtn();

      /* 切歌：先解绑旧源，避免旧请求回来污染（[75][140]） */
      a.pause();
      a.removeAttribute('src');
      try { a.load(); } catch (e) { }

      if (t.src) {
        a.src = t.src;
        /* 只 load 一次；load() 自身会把 currentTime 归零（[133]）。
           若先写 currentTime 再 load，浏览器可能中断元数据加载导致时长一直为 0。 */
        try { a.load(); } catch (e) { }
      } else {
        /* 无直链：交给宿主的在线搜索（由页面监听 ap-change 处理） */
        this._setStatus('该曲需在线搜索获取音频');
      }
      a.volume = AP.Store.state.volume;
      a.muted = AP.Store.state.muted;

      /* 行高亮 + 滚动保持 */
      var rows = this.shadowRoot.querySelectorAll('.ap-row');
      for (var i = 0; i < rows.length; i++) {
        if (i === n) rows[i].setAttribute('aria-current', 'true');
        else rows[i].removeAttribute('aria-current');
      }
      this._syncMeta();
      this._emit('ap-change', { index: n, track: t });   /* [144] */
      this.setAttribute('current-index', String(n));     /* 属性反射 [147] */

      if (autoplay && t.src) {
        var self = this;
        /* 只有 token 仍是最新的才播放（旧加载已废弃） */
        requestAnimationFrame(function () { if (token === self._loadToken) self.play(); });
      } else if (autoplay) {
        this._emit('ap-play-request', { index: n });
      }
      this._renderList();
      this._paintProgress();
    }

    /* 内部读取 */
    get _qRef() { return this._q; }
  }

  /** HTML 转义，防止曲名里的引号破坏结构 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  AP.esc = esc;


  if (!customElements.get('ap-player')) customElements.define('ap-player', ApPlayer);
  AP.Player = ApPlayer;
})();
