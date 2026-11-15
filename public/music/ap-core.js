/* ============================================================================
 * ap-components.js — Apple HIG 音乐页组件集（原生 Web Component + Shadow DOM）
 *
 * 结构：共用层（设计令牌 / 主题 / store / 工具）
 *       + 7 个模块：<ap-player> <ap-lyrics> <ap-comments> <ap-mv>
 *                    <ap-search> <ap-cache>  （全屏内建于 player 与 mv）
 *
 * 约束：零外部依赖、零全局样式、每模块 Shadow DOM 隔离、模块间只经 APStore 通信。
 * ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- 工具层 */

  /** 秒 → m:ss（时长文本；超过 1 小时显示 h:mm:ss） */
  function fmtTime(sec, withHour) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var s = Math.floor(sec % 60), m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600);
    if (withHour || h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    return m + ':' + String(s).padStart(2, '0');
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /** 相对时间：3 分钟前 / 昨天 / 2024-05-01（[110]） */
  function relTime(ms) {
    if (!ms) return '';
    var d = Date.now() - ms;
    if (d < 0) d = 0;
    var min = Math.floor(d / 60000);
    if (min < 1) return '刚刚';
    if (min < 60) return min + ' 分钟前';
    var h = Math.floor(min / 60);
    if (h < 24) return h + ' 小时前';
    var day = Math.floor(h / 24);
    if (day === 1) return '昨天';
    if (day < 30) return day + ' 天前';
    var dt = new Date(ms);
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  }

  /** 防抖（[153] 搜索 300ms） */
  function debounce(fn, wait) {
    var t = 0;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait || 300);
    };
  }

  /** 安全存储：隐私模式 / 配额满时不抛错（[175]） */
  var SafeStore = {
    get: function (k, dflt) {
      try { var v = localStorage.getItem(k); return v == null ? dflt : JSON.parse(v); }
      catch (e) { return dflt; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; }
      catch (e) { return false; }
    },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { } },
    /** 统计 ap: 命名空间占用字节（[169][174]） */
    sizeOfMine: function () {
      var total = 0;
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (!k || k.indexOf('ap:') !== 0) continue;
          total += k.length + (localStorage.getItem(k) || '').length;
        }
      } catch (e) { }
      return total;
    },
    keysOfMine: function () {
      var out = [];
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf('ap:') === 0) out.push(k);
        }
      } catch (e) { }
      return out;
    }
  };

  /** 注入样式到 Shadow Root；优先 Constructable Stylesheet（[1][6]） */
  var canAdopt = typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype && 'adoptedStyleSheets' in Document.prototype;

  function apStyle(root, css) {
    if (canAdopt) {
      var sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      root.adoptedStyleSheets = [sheet];
      return sheet;
    }
    var st = document.createElement('style');
    st.textContent = css;
    root.appendChild(st);
    return st;
  }

  /* ------------------------------------------------------------ 设计令牌层 */
  /* 全部可调样式走 --ap-* 变量，且带默认值（[4]）；深浅成对（[14]）。
     强调色只用于进度 / 当前歌词 / 开关激活（[17]）。                              */

  var AP_TOKENS = `
    :host{
      /* 圆角 */
      --ap-radius:24px;            /* 卡片外圆角 [36] */
      --ap-radius-inner:12px;      /* 内部行圆角 [36][40] */
      --ap-radius-art:16px;        /* 封面 / 视频圆角 [36][41][62] */
      --ap-radius-btn:999px;       /* 按钮全圆 [36] */
      /* 8pt 网格间距 [24] */
      --ap-space-1:4px; --ap-space-2:8px; --ap-space-3:12px;
      --ap-space-4:16px; --ap-space-5:20px; --ap-space-6:24px; --ap-space-7:28px;
      /* 材质 [33][34][35][37][38][39][42] */
      --ap-bg:rgba(255,255,255,0.72);
      --ap-bg-fallback:rgba(255,255,255,0.92);
      --ap-border:rgba(0,0,0,0.07);
      --ap-divider:rgba(0,0,0,0.07);
      --ap-shadow:0 20px 50px -20px rgba(0,0,0,0.22);
      --ap-blur:blur(40px) saturate(180%);
      --ap-art-inset:inset 0 1px 0 rgba(255,255,255,0.26);
      /* 文本 [18][19][20] */
      --ap-text:#1d1d1f;
      --ap-text-2:#86868b;
      --ap-hover:rgba(0,0,0,0.05);
      --ap-accent:#0a84ff;
      --ap-track:rgba(0,0,0,0.10);
      --ap-thumb:#ffffff;
      --ap-invert-bg:#1d1d1f;      /* 主按钮反色填充 [51][69] */
      --ap-invert-fg:#ffffff;
      /* 字号 [45] */
      --ap-title:17px; --ap-body:14px; --ap-small:12px; --ap-time:11px;
      /* 动效 [22][53][58] */
      --ap-ease:cubic-bezier(0.4,0,0.2,1);
      --ap-dur:240ms;
      --ap-theme-dur:360ms;
      /* 字体 [5][43][49] */
      --ap-font:inherit;
      --ap-font-fallback:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC",sans-serif;
      /* 层级 [8] */
      --ap-z-content:1; --ap-z-overlay:10; --ap-z-fullscreen:100;
      display:block;
      font-family:var(--ap-font);
      -webkit-font-smoothing:antialiased;
      color:var(--ap-text);
      z-index:var(--ap-z-content);
    }
    /* 深色：media 查询兜底（[13] 第三级） */
    @media (prefers-color-scheme:dark){
      :host(:not([data-theme="light"])){
        --ap-bg:rgba(28,28,30,0.72);
        --ap-bg-fallback:rgba(28,28,30,0.94);
        --ap-text:#f5f5f7;
        --ap-text-2:#98989d;
        --ap-border:rgba(255,255,255,0.10);
        --ap-divider:rgba(255,255,255,0.10);
        --ap-hover:rgba(255,255,255,0.07);
        --ap-track:rgba(255,255,255,0.16);
        --ap-invert-bg:#f5f5f7;
        --ap-invert-fg:#1d1d1f;
        --ap-shadow:0 20px 50px -20px rgba(0,0,0,0.55);
        --ap-art-inset:inset 0 1px 0 rgba(255,255,255,0.12);
      }
    }
    /* [data-theme="dark"]（[13] 第一级，由 JS 写到 host 上） */
    :host([data-theme="dark"]){
      --ap-bg:rgba(28,28,30,0.72);
      --ap-bg-fallback:rgba(28,28,30,0.94);
      --ap-text:#f5f5f7;
      --ap-text-2:#98989d;
      --ap-border:rgba(255,255,255,0.10);
      --ap-divider:rgba(255,255,255,0.10);
      --ap-hover:rgba(255,255,255,0.07);
      --ap-track:rgba(255,255,255,0.16);
      --ap-invert-bg:#f5f5f7;
      --ap-invert-fg:#1d1d1f;
      --ap-shadow:0 20px 50px -20px rgba(0,0,0,0.55);
      --ap-art-inset:inset 0 1px 0 rgba(255,255,255,0.12);
    }
    /* 卡片通用（每模块复用，[33][34][35][36][37][40]） */
    .ap-card{
      box-sizing:border-box;
      position:relative;
      width:100%;
      max-width:480px;                 /* [23] 模块卡片最大 480px */
      background:var(--ap-bg);
      -webkit-backdrop-filter:var(--ap-blur);
      backdrop-filter:var(--ap-blur);
      border:1px solid var(--ap-border);
      border-radius:var(--ap-radius);
      box-shadow:var(--ap-shadow);
      padding:var(--ap-space-2);      /* 8px：24-8=16，保证内圆角 ≤ 外圆角-内边距（[40]） */
      color:var(--ap-text);
      font-family:var(--ap-font);
      transition:background-color var(--ap-theme-dur) var(--ap-ease),
                 border-color var(--ap-theme-dur) var(--ap-ease),
                 color var(--ap-theme-dur) var(--ap-ease);
    }
    /* backdrop-filter 不支持时的半透明回退（[39][60]） */
    @supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
      .ap-card{ background:var(--ap-bg-fallback); }
    }
    /* 尊重减弱动效（[22][58][94][149]） */
    @media (prefers-reduced-motion:reduce){
      .ap-card{ transition:none; }
      *,*::before,*::after{ animation-duration:.001ms !important; animation-iteration-count:1 !important; transition-duration:.001ms !important; }
    }
    /* 文本截断（[47]） */
    .ap-ellipsis{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    /* 数字等宽（[46]） */
    .ap-num{ font-variant-numeric:tabular-nums; font-feature-settings:"tnum" 1; }
    /* 焦点环（[54]） */
    .ap-focusable:focus-visible{
      outline:none;
      box-shadow:0 0 0 2px var(--ap-bg),0 0 0 4px var(--ap-accent);
    }
    /* 视觉隐藏但可被读屏（[50]） */
    .ap-sr{ position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
      clip:rect(0 0 0 0);white-space:nowrap;border:0; }
    /* [hidden] 必须真的隐藏：作者样式里的 display（如 .ap-poster{display:flex}）
       会覆盖 UA 的 [hidden]{display:none}，导致"有声音没画面" */
    [hidden]{ display:none !important; }
    /* 隐藏滚动条但可滚（[29][86][196]） */
    .ap-noscroll{ scrollbar-width:none;-ms-overflow-style:none; }
    .ap-noscroll::-webkit-scrollbar{ width:0;height:0;display:none; }
    /* 通用按钮 [52] */
    .ap-btn{
      box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;
      width:44px;height:44px;min-width:44px;min-height:44px;   /* 热区 ≥44 [25] */
      padding:0;border:0;border-radius:var(--ap-radius-btn);
      background:transparent;color:inherit;cursor:pointer;
      transition:background-color var(--ap-dur) var(--ap-ease),
                 transform var(--ap-dur) var(--ap-ease),
                 opacity var(--ap-dur) var(--ap-ease);
      -webkit-tap-highlight-color:transparent;
    }
    .ap-btn:hover{ background:var(--ap-hover); }
    .ap-btn:active{ transform:scale(0.92); }              /* 次级 active 0.92 */
    .ap-btn:disabled{ opacity:.38;cursor:default; }
    .ap-btn svg{ width:24px;height:24px;display:block; }   /* 24 网格 [55] */
    /* 窄容器字号降 1px（[31]）—— 容器查询 */
    .ap-card{ container-type:inline-size; }
  `;

  /* ---------------------------------------------------------------- 图标层 */
  /* 统一 24 网格、1.7 描边、round 端点；仅播放/暂停用填充（[55][56]）。 */
  function svg(paths, filled) {
    var fill = filled ? 'currentColor' : 'none';
    var stroke = filled ? 'none' : 'currentColor';
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="' + fill +
      '" stroke="' + stroke + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }
  var ICON = {
    play: svg('<path d="M8 5.2v13.6c0 .8.9 1.3 1.6.9l10.2-6.8c.6-.4.6-1.3 0-1.7L9.6 4.3c-.7-.4-1.6.1-1.6.9Z"/>', true),
    pause: svg('<rect x="7" y="5" width="3.4" height="14" rx="1.2"/><rect x="13.6" y="5" width="3.4" height="14" rx="1.2"/>', true),
    prev: svg('<path d="M18.5 6.2v11.6c0 .8-.9 1.2-1.5.7l-6.6-5.2°"/><path d="M6.5 5.5v13"/><path d="M18 5.8v12.4c0 .8-.9 1.2-1.5.7L10 13.6a1 1 0 0 1 0-1.6l6.5-5a1 1 0 0 1 1.5.8Z"/>', false),
    next: svg('<path d="M17.5 5.5v13"/><path d="M6 5.8v12.4c0 .8.9 1.2 1.5.7l6.5-5a1 1 0 0 0 0-1.6l-6.5-5A1 1 0 0 0 6 5.8Z"/>', false),
    shuffle: svg('<path d="M16 4l4 4-4 4"/><path d="M20 8H4"/><path d="M8 20l-4-4 4-4"/><path d="M4 16h16"/>', false),
    repeat: svg('<path d="M7 7h10a3 3 0 0 1 3 3v2"/><path d="M20 7l-3-3"/><path d="M17 17H7a3 3 0 0 1-3-3v-2"/><path d="M4 17l3 3"/>', false),
    repeatOne: svg('<path d="M7 7h10a3 3 0 0 1 3 3v2"/><path d="M17 17H7a3 3 0 0 1-3-3v-2"/><path d="M12 10v4"/><path d="M10.6 11.2L12 10l1.4 1.2"/>', false),
    volume: svg('<path d="M4 9.5h3.2L12 6v12L7.2 14.5H4z"/><path d="M16 9.2a4 4 0 0 1 0 5.6"/><path d="M18.6 6.8a7.4 7.4 0 0 1 0 10.4"/>', false),
    mute: svg('<path d="M4 9.5h3.2L12 6v12L7.2 14.5H4z"/><path d="M16.5 9.5l4 4"/><path d="M20.5 9.5l-4 4"/>', false),
    list: svg('<path d="M4 7h11"/><path d="M4 12h11"/><path d="M4 17h7"/><path d="M18 9v7"/><path d="M15.6 14.2L18 16.6l2.4-2.4"/>', false),
    expand: svg('<path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5V9"/><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9"/><path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20H9"/>', false),
    compress: svg('<path d="M8 4v4H4"/><path d="M16 4v4h4"/><path d="M16 20v-4h4"/><path d="M8 20v-4H4"/>', false),
    close: svg('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>', false),
    search: svg('<circle cx="11" cy="11" r="6.4"/><path d="M16 16l4.2 4.2"/>', false),
    x: svg('<path d="M7 7l10 10"/><path d="M17 7L7 17"/>', false),
    heart: svg('<path d="M12 20s-7.2-4.4-7.2-9A3.9 3.9 0 0 1 12 8.6 3.9 3.9 0 0 1 19.2 11c0 4.6-7.2 9-7.2 9Z"/>', false),
    playCircle: svg('<circle cx="12" cy="12" r="9"/><path d="M10.4 8.8l5.2 3.2-5.2 3.2z"/>', false),
    chevron: svg('<path d="M9 5l7 7-7 7"/>', false)
  };
  // 修正 prev 图标（上面第一个 path 有笔误，用干净版本覆盖）
  ICON.prev = svg('<path d="M7 5v14"/><path d="M18.5 6.2v11.6c0 .7-.8 1.1-1.4.6l-6.6-5.2a.9.9 0 0 1 0-1.4l6.6-5.2c.6-.5 1.4-.1 1.4.6Z"/>', false);

  /* ---------------------------------------------------------------- 主题层 */
  /* 优先级：[data-theme="dark"] → .dark → prefers-color-scheme（[13]）。
     只读宿主，不改宿主变量（[12]）；结果写到每个组件自己的 host 属性上。     */
  var APTheme = {
    hosts: new Set(),
    inited: false,
    mq: null,
    mo: null,
    init: function () {
      if (this.inited) return;
      this.inited = true;
      var self = this;
      this.mq = window.matchMedia('(prefers-color-scheme: dark)');
      this.onMq = function () { self.apply(); };
      this.mq.addEventListener('change', this.onMq);
      this.mo = new MutationObserver(function () { self.apply(); });
      var opt = { attributes: true, attributeFilter: ['data-theme', 'class'] };
      this.mo.observe(document.documentElement, opt);
      if (document.body) this.mo.observe(document.body, opt);
    },
    resolve: function () {
      var de = document.documentElement, b = document.body;
      var t = (de.getAttribute('data-theme') || (b && b.getAttribute('data-theme')) || '').toLowerCase();
      if (t === 'dark' || t === 'light') return t;
      if ((de.classList && de.classList.contains('dark')) || (b && b.classList && b.classList.contains('dark'))) return 'dark';
      return this.mq && this.mq.matches ? 'dark' : 'light';
    },
    apply: function () { this.hosts.forEach(function (h) { APTheme.applyOne(h); }); },
    applyOne: function (h) {
      var t = this.resolve();
      if (h.getAttribute('data-theme') !== t) h.setAttribute('data-theme', t);
    },
    add: function (h) { this.init(); this.hosts.add(h); this.applyOne(h); },
    remove: function (h) {
      this.hosts.delete(h);
      if (!this.hosts.size && this.inited) {
        this.mo.disconnect();
        this.mq.removeEventListener('change', this.onMq);
        this.inited = false;                     /* [212] 清理 Observer */
      }
    }
  };

  /* ---------------------------------------------------------------- 状态层 */
  /* 模块间唯一通信通道（[190]）：任何模块都不直接读写别的模块的 DOM。        */
  var APStore = {
    state: {
      tracks: [],        /* [{id,label,zh,artist,src,cover,lyrics,nc,mv,dur}] */
      index: -1,
      playing: false,
      time: 0,
      duration: 0,
      volume: 0.85,
      muted: false,
      mode: 'order',     /* order | one | shuffle（[71][137][138][139]） */
      error: '',
      loading: false
    },
    subs: new Set(),
    set: function (patch) {
      var changed = false;
      for (var k in patch) {
        if (this.state[k] !== patch[k]) { this.state[k] = patch[k]; changed = true; }
      }
      if (changed) this.emit();
    },
    emit: function () {
      var s = this.state;
      this.subs.forEach(function (f) { try { f(s); } catch (e) { /* 单模块异常不拖垮其它模块 */ } });
    },
    on: function (fn) { this.subs.add(fn); return function () { APStore.subs.delete(fn); }; },
    track: function () {
      var i = this.state.index;
      return (i >= 0 && i < this.state.tracks.length) ? this.state.tracks[i] : null;
    }
  };

  /* ------------------------------------------------------------ 公共基类 */

  var AP_EVENTS = ['ap-play', 'ap-pause', 'ap-seek', 'ap-change', 'ap-ended', 'ap-error', 'ap-toast'];

  class ApElement extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._cleanups = [];        /* 卸载时统一执行（[6][212]） */
      this._storeOff = null;
      this._mounted = false;
    }
    /** 注册清理函数 */
    _onCleanup(fn) { this._cleanups.push(fn); }
    /** 组件内派发事件；bubbles=false 避免污染宿主（[144] 语义 / [205]） */
    _emit(name, detail) {
      this.dispatchEvent(new CustomEvent(name, { detail: detail == null ? null : detail, bubbles: false, composed: false }));
    }
    connectedCallback() {
      if (this._mounted) return;
      this._mounted = true;
      APTheme.add(this);
      this._onCleanup(function () { APTheme.remove(this); }.bind(this));
      if (this.render) this.render();
    }
    disconnectedCallback() {
      this._mounted = false;
      this.destroy();
    }
    /** 释放全部监听器 / rAF / Observer / 子元素（[6][212][213]） */
    destroy() {
      while (this._cleanups.length) {
        var fn = this._cleanups.pop();
        try { fn(); } catch (e) { }
      }
      if (this._storeOff) { this._storeOff(); this._storeOff = null; }
      if (this.shadowRoot) this.shadowRoot.innerHTML = '';
    }
  }

  /* 暴露到内部作用域供后续模块使用 */
  var AP = {
    fmtTime: fmtTime, clamp: clamp, relTime: relTime, debounce: debounce,
    SafeStore: SafeStore, apStyle: apStyle, TOKENS: AP_TOKENS, ICON: ICON, svg: svg,
    Theme: APTheme, Store: APStore, Base: ApElement, EVENTS: AP_EVENTS
  };
  window.AP = AP;       /* 页面编排层使用（共享 store / 工具） */
})();
