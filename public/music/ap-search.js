(function () {
  /* 依赖 ap-core.js 暴露的 window.AP；未加载时静默跳过（组件自身不报错） */
  var AP = window.AP;
  if (!AP) return;
  var apStyle = AP.apStyle, ICON = AP.ICON, svg = AP.svg, fmtTime = AP.fmtTime,
      clamp = AP.clamp, relTime = AP.relTime, debounce = AP.debounce,
      SafeStore = AP.SafeStore, APTheme = AP.Theme, APStore = AP.Store,
      AP_TOKENS = AP.TOKENS, AP_EVENTS = AP.EVENTS;

  /* ==========================================================================
   * 模块 5：<ap-search> 搜索模块（[151]–[165]）
   * 保留旧页能力：osu! 镜像搜索、结果排序、「加入」队列、没结果提示；
   * 新增：300ms 防抖、请求取消、搜索历史、键盘导航、匹配高亮。
   * ======================================================================== */

  var SEARCH_CSS = AP_TOKENS + `
    .ap-card{ padding:var(--ap-space-2) var(--ap-space-2) var(--ap-space-3); }
    .ap-sform{ display:flex; align-items:center; gap:var(--ap-space-2); }
    /* 搜索框：高 36px，圆角 10px，左侧放大镜 16px（[151][152]） */
    .ap-sbox{
      display:flex; align-items:center; gap:6px; flex:1 1 auto; min-width:0;
      height:36px; padding:0 10px; box-sizing:border-box;
      border:1px solid var(--ap-border); border-radius:10px;
      background:var(--ap-hover);                       /* [151] */
      transition:box-shadow var(--ap-dur) var(--ap-ease);
    }
    .ap-sbox:focus-within{ box-shadow:0 0 0 2px var(--ap-bg),0 0 0 4px var(--ap-accent); }  /* [162] */
    .ap-sbox svg{ width:16px; height:16px; flex:0 0 auto; color:var(--ap-text-2); }          /* 16px [152] */
    .ap-sbox input{
      flex:1 1 auto; min-width:0; height:100%; border:0; background:transparent;
      color:var(--ap-text); font-size:13px; font-family:inherit; outline:none;
      letter-spacing:-0.01em;
    }
    .ap-sbox input::placeholder{ color:var(--ap-text-2); }
    /* 取消按钮：聚焦时出现（[154]） */
    .ap-cancel{
      display:none; height:32px; padding:0 8px; border:0; border-radius:8px;
      background:transparent; color:var(--ap-text-2); font-size:13px;
      font-family:inherit; cursor:pointer; white-space:nowrap;
    }
    .ap-cancel:hover{ background:var(--ap-hover); }
    .ap-sform.ap-focus .ap-cancel{ display:inline-block; }
    .ap-sresults{ margin-top:var(--ap-space-2); }
    /* 结果行复用播放列表行样式（[156]） */
    .ap-srow{
      display:grid; grid-template-columns:minmax(0,1fr) auto; gap:var(--ap-space-2);
      align-items:center; padding:9px 11px; border-radius:var(--ap-radius-inner);
      min-height:44px; cursor:pointer;
      transition:background-color var(--ap-dur) var(--ap-ease);
    }
    .ap-srow:hover,.ap-srow.ap-hl{ background:var(--ap-hover); }
    .ap-srowtxt{ min-width:0; display:flex; flex-direction:column; }
    .ap-srowtitle{ font-size:14px; letter-spacing:-0.01em; overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; }
    .ap-srowtitle mark{ background:transparent; color:var(--ap-accent); font-weight:600; }  /* 仅变色 [157] */
    .ap-srowsub{ font-size:12px; color:var(--ap-text-2); overflow:hidden;
      text-overflow:ellipsis; white-space:nowrap; }
    .ap-add{ min-height:32px; padding:0 10px; border:1px solid var(--ap-border);
      border-radius:999px; background:transparent; color:var(--ap-text);
      font-size:12px; font-family:inherit; cursor:pointer;
      transition:background-color var(--ap-dur) var(--ap-ease); }
    .ap-add:hover{ background:var(--ap-hover); }
    /* 历史（[159][160]） */
    .ap-hist{ display:flex; flex-wrap:wrap; gap:6px; margin-top:var(--ap-space-2); }
    .ap-hist button{
      min-height:28px; padding:0 10px; border:1px solid var(--ap-border);
      border-radius:999px; background:transparent; color:var(--ap-text-2);
      font-size:12px; font-family:inherit; cursor:pointer;
    }
    .ap-hist button:hover{ background:var(--ap-hover); color:var(--ap-text); }
    .ap-histhead{ display:flex; align-items:center; gap:8px; margin-top:var(--ap-space-2); }
    .ap-histhead span{ font-size:11px; color:var(--ap-text-2); }
    .ap-histhead button{ margin-left:auto; border:0; background:transparent;
      color:var(--ap-text-2); font-size:11px; font-family:inherit; cursor:pointer; }
    .ap-empty{ padding:var(--ap-space-5) var(--ap-space-4); text-align:center;
      color:var(--ap-text-2); font-size:13px; }            /* [158] */
    .ap-sstat{ font-size:11px; color:var(--ap-text-2); min-height:14px; margin-top:4px; }
    @container (max-width:340px){
      .ap-srowtitle{ font-size:13px; }
    }
  `;

  class ApSearch extends AP.Base {
    constructor() {
      super();
      this._hist = [];
      this._results = [];
      this._hl = -1;
      this._reqId = 0;
      this._expanded = false;
    }

    render() {
      var self = this;
      AP.apStyle(this.shadowRoot, SEARCH_CSS);

      var root = document.createElement('div');
      root.className = 'ap-card';
      root.innerHTML =
        '<form class="ap-sform" id="form" role="search">' +
        '<div class="ap-sbox">' + AP.ICON.search +
        '<input id="q" type="search" placeholder="搜 osu! 曲库，例如 kenshi yonezu lemon" ' +
        'aria-label="搜索曲目" autocomplete="off" />' +
        '</div>' +
        '<button class="ap-cancel ap-focusable" id="cancel" type="button">取消</button>' +
        '</form>' +
        '<div class="ap-sstat" id="stat" role="status" aria-live="polite"></div>' +
        '<div class="ap-sresults" id="results"></div>' +
        '<div id="histwrap"></div>';
      this.shadowRoot.appendChild(root);
      this._onCleanup(function () { root.remove(); });
      var _qc = {};
      this._q = function (id) { return _qc[id] || (_qc[id] = root.querySelector('#' + id)); };

      try {
        this._hist = JSON.parse(localStorage.getItem('ap:shist') || '[]') || [];
        if (!Array.isArray(this._hist)) this._hist = [];
      } catch (e) { this._hist = []; }

      var q = this._q('q'), form = this._q('form');

      /* 聚焦显示取消按钮（[154]）；绝不自动聚焦（[165]） */
      q.addEventListener('focus', function () { form.classList.add('ap-focus'); });
      q.addEventListener('blur', function () { form.classList.remove('ap-focus'); });

      /* 输入防抖 300ms（[153]） */
      var run = AP.debounce(function () { self._doSearch(q.value.trim()); }, 300);
      q.addEventListener('input', function () {
        var v = q.value.trim();
        if (!v) { self._results = []; self._q('results').innerHTML = ''; self._q('stat').textContent = ''; self._renderHist(); return; }
        run();
      });

      /* 回车 / 键盘上下选择（[163]） */
      q.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          if (self._hl >= 0 && self._results[self._hl]) { self._pick(self._results[self._hl]); return; }
          self._doSearch(q.value.trim(), true);
        } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
          if (!self._results.length) return;
          ev.preventDefault();
          var d = ev.key === 'ArrowDown' ? 1 : -1;
          self._hl = (self._hl + d + self._results.length) % self._results.length;
          self._paintRows();
        } else if (ev.key === 'Escape') {
          q.value = ''; self._results = []; self._q('results').innerHTML = '';
          self._q('stat').textContent = ''; self._renderHist();
        }
      });

      var cancel = this._q('cancel');
      var onCancel = function () {                                  /* [154][155] */
        q.value = ''; self._results = []; self._hl = -1;
        self._q('results').innerHTML = '';
        self._q('stat').textContent = '';
        self._renderHist();
        q.blur();
      };
      cancel.addEventListener('click', onCancel);
      this._onCleanup(function () { cancel.removeEventListener('click', onCancel); });

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var v = q.value.trim();
        if (v) self._doSearch(v, true);
      });

      this._renderHist();
    }

    _renderHist() {
      var wrap = this._q('histwrap');
      if (!this._hist.length) { wrap.innerHTML = ''; return; }
      var head = document.createElement('div');
      head.className = 'ap-histhead';
      head.innerHTML = '<span>最近搜索</span>';
      var clear = document.createElement('button');
      clear.type = 'button';
      clear.textContent = '清除';
      clear.className = 'ap-focusable';
      clear.addEventListener('click', function () {
        this._hist = [];                                  /* [160] */
        try { localStorage.removeItem('ap:shist'); } catch (e) { }
        this._renderHist();
      }.bind(this));
      head.appendChild(clear);
      var row = document.createElement('div');
      row.className = 'ap-hist';
      var self = this;
      this._hist.slice(0, 10).forEach(function (h) {      /* 最多 10 条 [159] */
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = h;
        b.addEventListener('click', function () {
          self._q('q').value = h;
          self._doSearch(h, true);
        });
        row.appendChild(b);
      });
      wrap.innerHTML = '';
      wrap.appendChild(head);
      wrap.appendChild(row);
    }

    _remember(q) {
      this._hist = [q].concat(this._hist.filter(function (x) { return x !== q; })).slice(0, 10);
      try { localStorage.setItem('ap:shist', JSON.stringify(this._hist)); } catch (e) { }
    }

    async _doSearch(q, manual) {
      if (!q) return;
      var self = this;
      var req = ++this._reqId;
      this._q('stat').textContent = '搜索中…';            /* 加载中状态 */
      this._q('results').innerHTML = '';
      this._hl = -1;
      try {
        var list = await APEngine.search(q, { limit: manual ? 10 : 8 });
        if (req !== self._reqId) return;                  /* 取消旧请求 [161] */
        self._results = list;
        self._expanded = false;
        self._remember(q);
        self._renderHist();
        self._paintRows();
        self._q('stat').textContent = list.length
          ? '找到 ' + list.length + ' 个，回车或点「加入」'
          : '没搜到，换个关键词（英文 / 罗马音更准）';
      } catch (e) {
        if (req !== self._reqId) return;
        if (/aborted/.test(e.message)) return;            /* 主动取消不报错 */
        self._q('stat').textContent = '搜索失败：' + e.message;  /* 失败状态 */
        self._q('results').innerHTML = '<div class="ap-empty">镜像暂时连不上，稍后再试</div>';
      }
    }

    /** 高亮匹配文字，仅变色不加底（[157]） */
    _hlText(text, q) {
      var out = AP.esc(text || '');
      var toks = String(q || '').split(/\s+/).filter(function (t) { return t.length > 1; });
      toks.forEach(function (t) {
        var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
        out = out.replace(re, '<mark>$1</mark>');
      });
      return out;
    }

    _paintRows() {
      var self = this;
      var wrap = this._q('results');
      if (!this._results.length) { wrap.innerHTML = ''; return; }
      var show = this._expanded ? this._results : this._results.slice(0, 5);
      var frag = document.createDocumentFragment();
      show.forEach(function (s, i) {
        var row = document.createElement('div');
        row.className = 'ap-srow' + (i === self._hl ? ' ap-hl' : '');
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        var diffs = (s.ChildrenBeatmaps || []).length;
        row.innerHTML =
          '<span class="ap-srowtxt">' +
          '<span class="ap-srowtitle">' + self._hlText(s.Title || '?', self._q('q').value) + '</span>' +
          '<span class="ap-srowsub">' + AP.esc(s.Artist || '') + ' · ' + AP.esc(s.Creator || '') +
          ' · ' + diffs + ' 难度 · ♥ ' + (s.Favourites || 0) + '</span></span>' +
          '<button class="ap-add ap-focusable" type="button">加入</button>';
        var onPick = function () { self._pick(s); };
        row.addEventListener('click', onPick);
        row.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick(); }
        });
        frag.appendChild(row);
      });
      if (this._results.length > 5) {
        var more = document.createElement('button');
        more.type = 'button';
        more.className = 'ap-cancel';
        more.style.display = 'inline-block';
        more.style.marginTop = '4px';
        more.textContent = this._expanded ? '收起 ↑' : '展开全部 ' + this._results.length + ' 个 ↓';
        more.addEventListener('click', function () {
          self._expanded = !self._expanded;
          self._paintRows();
        });
        frag.appendChild(more);
      }
      wrap.innerHTML = '';
      wrap.appendChild(frag);
    }

    /** 选中结果：只发事件，不触发播放（[164]）；由页面决定加入队列 */
    _pick(s) {
      this._emit('ap-search-pick', {
        setId: s.SetID, title: s.Title || '未知曲目', artist: s.Artist || ''
      });
    }
  }

  if (!customElements.get('ap-search')) customElements.define('ap-search', ApSearch);
  AP.Search = ApSearch;
})();
