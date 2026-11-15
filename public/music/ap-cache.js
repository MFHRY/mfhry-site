(function () {
  /* 依赖 ap-core.js 暴露的 window.AP；未加载时静默跳过（组件自身不报错） */
  var AP = window.AP;
  if (!AP) return;
  var apStyle = AP.apStyle, ICON = AP.ICON, svg = AP.svg, fmtTime = AP.fmtTime,
      clamp = AP.clamp, relTime = AP.relTime, debounce = AP.debounce,
      SafeStore = AP.SafeStore, APTheme = AP.Theme, APStore = AP.Store,
      AP_TOKENS = AP.TOKENS, AP_EVENTS = AP.EVENTS;

  /* ==========================================================================
   * 模块 6：<ap-cache> 缓存模块（[166]–[180]）
   * 保留旧页能力：IndexedDB 谱面缓存（与音游共用库）；新增开关、容量显示、
   * 内联二次确认、条目列表、环形进度。
   * ======================================================================== */

  var CACHE_CSS = AP_TOKENS + `
    .ap-card{ padding:var(--ap-space-2); }
    .ap-row1{ display:flex; align-items:center; gap:var(--ap-space-3); }
    .ap-row1 b{ font-size:15px; font-weight:600; letter-spacing:-0.02em; }
    .ap-row1 .ap-sp{ flex:1 1 auto; }
    .ap-sub{ font-size:12px; color:var(--ap-text-2); margin-top:2px; }
    /* iOS 风格开关 51×31（[166][167][168]） */
    .ap-switch{
      position:relative; width:51px; height:31px; flex:0 0 auto;
      border:0; border-radius:999px; padding:0; cursor:pointer;
      background:var(--ap-track);
      transition:background-color 200ms var(--ap-ease);
    }
    .ap-switch::after{
      content:''; position:absolute; top:2px; left:2px; width:27px; height:27px;
      border-radius:50%; background:#fff; box-shadow:0 2px 6px rgba(0,0,0,.25);
      transition:transform 200ms var(--ap-ease);
    }
    .ap-switch[aria-checked="true"]{ background:var(--ap-accent); }   /* 开态强调色 [167] */
    .ap-switch[aria-checked="true"]::after{ transform:translateX(20px); }
    /* 容量行 + 细进度条（[169][172]） */
    .ap-cap{ margin-top:var(--ap-space-3); }
    .ap-caprow{ display:flex; align-items:baseline; gap:6px; font-size:12px; color:var(--ap-text-2); }
    .ap-caprow b{ font-size:14px; color:var(--ap-text); font-variant-numeric:tabular-nums; }
    .ap-capbar{ height:4px; border-radius:2px; background:var(--ap-track); margin-top:6px; overflow:hidden; }
    .ap-capbar i{ display:block; height:100%; width:0%; border-radius:2px;
      background:var(--ap-accent); transition:width 260ms var(--ap-ease); }   /* [17] */
    /* 操作行 */
    .ap-acts{ display:flex; align-items:center; gap:var(--ap-space-2); margin-top:var(--ap-space-3);
      padding-top:var(--ap-space-3); border-top:1px solid var(--ap-divider); }
    .ap-acts .ap-sp{ flex:1 1 auto; }
    /* 文字按钮，红色仅文字（[170]） */
    .ap-danger{
      min-height:36px; padding:0 10px; border:0; background:transparent;
      color:#d70015; font-size:13px; font-family:inherit; cursor:pointer;
      border-radius:8px;
    }
    .ap-danger:hover{ background:var(--ap-hover); }
    .ap-ghost{
      min-height:36px; padding:0 10px; border:0; background:transparent;
      color:var(--ap-text-2); font-size:13px; font-family:inherit; cursor:pointer;
      border-radius:8px;
    }
    .ap-ghost:hover{ background:var(--ap-hover); color:var(--ap-text); }
    /* 内联确认条，不用 alert（[171]） */
    .ap-confirm{
      display:flex; align-items:center; gap:var(--ap-space-2);
      margin-top:var(--ap-space-3); padding:10px 12px;
      border-radius:var(--ap-radius-inner); background:var(--ap-hover);
      font-size:12px; color:var(--ap-text-2);
    }
    .ap-confirm .ap-sp{ flex:1 1 auto; }
    .ap-confirm .ap-yes{ color:#d70015; font-weight:600; }
    /* 条目列表可展开（[178]） */
    .ap-keys{ margin-top:var(--ap-space-3); max-height:180px; overflow-y:auto; }
    .ap-keys[hidden]{ display:none; }
    .ap-key{ display:flex; justify-content:space-between; gap:8px; font-size:12px;
      color:var(--ap-text-2); padding:4px 0; }
    .ap-key span:first-child{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    @container (max-width:340px){ .ap-row1 b{ font-size:14px; } }
  `;

  class ApCache extends AP.Base {
    constructor() { super(); this._on = true; this._stats = { count: 0, bytes: 0 }; this._confirm = false; }

    render() {
      var self = this;
      AP.apStyle(this.shadowRoot, CACHE_CSS);

      var root = document.createElement('div');
      root.className = 'ap-card';
      root.innerHTML =
        '<div class="ap-row1">' +
        '<div><b>本地缓存</b><div class="ap-sub" id="sub">下过的谱面音频会存本机，下次秒开</div></div>' +
        '<span class="ap-sp"></span>' +
        '<button class="ap-switch ap-focusable" id="sw" type="button" role="switch" ' +
        'aria-checked="true" aria-label="本地缓存"></button>' +
        '</div>' +
        '<div class="ap-cap">' +
        '<div class="ap-caprow"><b id="size">0 MB</b><span id="cnt">0 项</span></div>' +
        '<div class="ap-capbar"><i id="bar"></i></div>' +
        '</div>' +
        '<div class="ap-acts">' +
        '<button class="ap-ghost ap-focusable" id="togglekeys" type="button" aria-expanded="false">查看条目</button>' +
        '<span class="ap-sp"></span>' +
        '<button class="ap-danger ap-focusable" id="clear" type="button">清除音乐缓存</button>' +
        '</div>' +
        '<div id="confirmwrap"></div>' +
        '<div class="ap-keys" id="keys" hidden></div>';
      this.shadowRoot.appendChild(root);
      this._onCleanup(function () { root.remove(); });
      var _qc = {};
      this._q = function (id) { return _qc[id] || (_qc[id] = root.querySelector('#' + id)); };

      /* 开关：[179] aria-checked；开关关闭时引擎跳过写入缓存 */
      var sw = this._q('sw');
      var saved = null;
      try { saved = localStorage.getItem('ap:cacheon'); } catch (e) { }
      this._on = saved !== '0';
      sw.setAttribute('aria-checked', this._on ? 'true' : 'false');
      var onSw = function () {
        self._on = !self._on;
        sw.setAttribute('aria-checked', self._on ? 'true' : 'false');
        try { localStorage.setItem('ap:cacheon', self._on ? '1' : '0'); } catch (e) { }
        if (window.APEngine && APEngine.setCacheEnabled) APEngine.setCacheEnabled(self._on);
        self._q('sub').textContent = self._on
          ? '下过的谱面音频会存本机，下次秒开'
          : '已关闭：每次都会重新下载（不写本机）';
        self._emit('ap-toast', { text: self._on ? '缓存已开启' : '缓存已关闭' });
      };
      sw.addEventListener('click', onSw);
      this._onCleanup(function () { sw.removeEventListener('click', onSw); });
      if (window.APEngine && APEngine.setCacheEnabled) APEngine.setCacheEnabled(this._on);

      /* 清除：内联二次确认（[171]） */
      var clear = this._q('clear'), cwrap = this._q('confirmwrap');
      clear.addEventListener('click', function () {
        self._confirm = true;
        cwrap.innerHTML =
          '<div class="ap-confirm"><span>确定清除？只删音乐缓存</span><span class="ap-sp"></span>' +
          '<button class="ap-ghost ap-focusable" id="no" type="button">取消</button>' +
          '<button class="ap-ghost ap-yes ap-focusable" id="yes" type="button">清除</button></div>';
        cwrap.querySelector('#no').addEventListener('click', function () {
          self._confirm = false; cwrap.innerHTML = '';
        });
        cwrap.querySelector('#yes').addEventListener('click', async function () {
          cwrap.innerHTML = '<div class="ap-confirm">清除中…</div>';
          var n = await APEngine.cacheClearMusic();
          cwrap.innerHTML = '';
          self._refresh();
          self._emit('ap-toast', { text: '已清除 ' + n + ' 项音乐缓存' });   /* [176] */
        });
      });

      /* 条目展开/折叠（[178]） */
      var tk = this._q('togglekeys'), keys = this._q('keys');
      tk.addEventListener('click', function () {
        var open = keys.hasAttribute('hidden');
        if (open) keys.removeAttribute('hidden'); else keys.setAttribute('hidden', '');
        tk.setAttribute('aria-expanded', open ? 'true' : 'false');
        tk.textContent = open ? '收起条目' : '查看条目';
        if (open) self._renderKeys();
      });

      this._refresh();
      /* 页面切回本模块时刷新容量 */
      this._onCleanup(function () { });
    }

    async _refresh() {
      if (!window.APEngine) return;
      try {
        var s = await APEngine.cacheStats();
        this._stats = s;
        var mb = s.bytes / 1048576;
        this._q('size').textContent = mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(mb < 10 ? 2 : 1) + ' MB';
        this._q('cnt').textContent = s.count + ' 项';
        /* 细条：以 512MB 为参考上限（纯展示） */
        this._q('bar').style.width = Math.min(100, (mb / 512) * 100).toFixed(1) + '%';
      } catch (e) {
        this._q('size').textContent = '—';             /* 读失败静默降级 [173][175] */
      }
    }

    async _renderKeys() {
      var keys = this._q('keys');
      try {
        var list = [];
        for (var k of AP.SafeStore.keysOfMine()) list.push({ k: k, v: 0 });
        keys.innerHTML = list.length
          ? list.map(function (x) {
            return '<div class="ap-key"><span>' + AP.esc(x.k) + '</span></div>';
          }).join('')
          : '<div class="ap-key"><span>本地存储里没有 ap: 条目</span></div>';
      } catch (e) { keys.innerHTML = ''; }
    }

    /** 宿主切到本模块时调用，刷新容量 */
    refresh() { this._refresh(); }
  }

  /* ---------------------------------------------------------------- 注册 */

  if (!customElements.get('ap-cache')) customElements.define('ap-cache', ApCache);
  AP.Cache = ApCache;
})();
