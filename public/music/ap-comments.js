(function () {
  /* 依赖 ap-core.js 暴露的 window.AP；未加载时静默跳过（组件自身不报错） */
  var AP = window.AP;
  if (!AP) return;
  var apStyle = AP.apStyle, ICON = AP.ICON, svg = AP.svg, fmtTime = AP.fmtTime,
      clamp = AP.clamp, relTime = AP.relTime, debounce = AP.debounce,
      SafeStore = AP.SafeStore, APTheme = AP.Theme, APStore = AP.Store,
      AP_TOKENS = AP.TOKENS, AP_EVENTS = AP.EVENTS;

  /* ==========================================================================
   * 模块 3：<ap-comments> 评论模块（[96]–[115]）
   * 保留旧页能力：热评 + 最新、头像、点赞数、时间；新增骨架屏、排序、长评折叠、
   * 本地草稿（写回网易云需登录，故本地保存并标注）。
   * ======================================================================== */

  var COMMENTS_CSS = AP_TOKENS + `
    .ap-card{ padding:var(--ap-space-2); }
    .ap-chead{ display:flex; align-items:center; gap:var(--ap-space-2);
      padding-bottom:var(--ap-space-3); border-bottom:1px solid var(--ap-divider); }
    .ap-chead b{ font-size:15px; font-weight:600; letter-spacing:-0.02em; }
    .ap-chead .ap-cnt{ font-size:11px; color:var(--ap-text-2); }        /* [113] */
    .ap-chead .ap-sp{ flex:1 1 auto; }
    /* 排序切换：文字按钮，不用彩色胶囊（[186][112]） */
    .ap-sort{ display:flex; gap:var(--ap-space-1); }
    .ap-sort button{
      min-height:32px; padding:0 8px; border:0; border-radius:var(--ap-radius-inner);
      background:transparent; color:var(--ap-text-2); font-size:12px; cursor:pointer;
      font-family:inherit; transition:color var(--ap-dur) var(--ap-ease),
        background-color var(--ap-dur) var(--ap-ease);
    }
    .ap-sort button:hover{ background:var(--ap-hover); }
    .ap-sort button[aria-pressed="true"]{ color:var(--ap-text); font-weight:600; }
    .ap-list{ max-height:var(--ap-list-max,320px); overflow-y:auto; overscroll-behavior:contain;
      scrollbar-width:none; -ms-overflow-style:none; }
    .ap-list::-webkit-scrollbar{ width:0; height:0; display:none; }
    /* 每条评论卡片（[96][102] 间距 12px，无分割线，二选一取间距） */
    .ap-cmt{
      display:flex; gap:var(--ap-space-3); padding:12px; margin-bottom:var(--ap-space-3);
      border-radius:var(--ap-radius-inner);                              /* 12px [96] */
      background:var(--ap-hover);
      content-visibility:auto; contain-intrinsic-size:auto 84px;         /* 列表虚拟化 [115][209] */
    }
    .ap-av{
      flex:0 0 auto; width:36px; height:36px; border-radius:50%;         /* 36px 圆形 [97] */
      object-fit:cover; overflow:hidden; display:flex; align-items:center; justify-content:center;
      font-size:14px; font-weight:600; color:var(--ap-invert-fg);
      background:linear-gradient(135deg,var(--ap-accent),var(--ap-text-2));  /* 首字母渐变底 [98] */
    }
    .ap-av img{ width:100%; height:100%; object-fit:cover; }
    .ap-cbody{ min-width:0; flex:1 1 auto; }
    .ap-cmeta{ display:flex; align-items:center; gap:6px; min-width:0; }
    .ap-cmeta b{ font-size:14px; font-weight:600; letter-spacing:-0.01em; }  /* 昵称 14/600 [99] */
    .ap-cmeta time{ font-size:12px; color:var(--ap-text-2); }               /* 时间 12px [99][110] */
    .ap-ctxt{
      font-size:14px; line-height:1.6; letter-spacing:-0.01em;               /* [100] */
      margin-top:4px; color:var(--ap-text);
      overflow-wrap:anywhere;
      display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:6;  /* 超 6 行折叠 [101] */
      overflow:hidden;
    }
    .ap-ctxt.ap-open{ -webkit-line-clamp:unset; display:block; }
    .ap-more{ margin-top:4px; border:0; background:transparent; color:var(--ap-accent);
      font-size:12px; cursor:pointer; font-family:inherit; padding:4px 0; }
    .ap-like{ display:inline-flex; align-items:center; gap:4px; margin-top:6px;
      border:0; background:transparent; color:var(--ap-text-2); font-size:12px;
      font-family:inherit; cursor:pointer; padding:4px 0; }
    .ap-like svg{ width:15px; height:15px; }
    .ap-like[aria-pressed="true"]{ color:var(--ap-accent); }   /* 激活仅变色 [103] */
    /* 输入框 + 发送 [104][105] */
    .ap-compose{ display:flex; gap:var(--ap-space-2); margin-top:var(--ap-space-3); }
    .ap-compose input{
      flex:1 1 auto; min-width:0; box-sizing:border-box;
      height:38px; padding:0 12px; border:1px solid var(--ap-border);
      border-radius:var(--ap-radius-inner); background:var(--ap-hover);  /* [104] */
      color:var(--ap-text); font-size:13px; font-family:inherit; outline:none;
      transition:box-shadow var(--ap-dur) var(--ap-ease);
    }
    .ap-compose input:focus-visible{ box-shadow:0 0 0 2px var(--ap-bg),0 0 0 4px var(--ap-accent); }  /* [114] */
    .ap-compose button{ min-width:44px; height:38px; padding:0 12px; border:0;
      border-radius:var(--ap-radius-inner); background:var(--ap-accent); color:#fff;
      font-size:13px; font-family:inherit; cursor:pointer;
      transition:opacity var(--ap-dur) var(--ap-ease); }
    .ap-compose button:disabled{ opacity:.35; cursor:default; }          /* 空输入不可点 [105] */
    /* 骨架屏（[107][108]） */
    .ap-sk{ display:flex; gap:var(--ap-space-3); padding:12px; margin-bottom:var(--ap-space-3);
      border-radius:var(--ap-radius-inner); background:var(--ap-hover); }
    .ap-sk .ap-av{ background:var(--ap-track); }
    .ap-sk .ap-bar{ height:10px; border-radius:5px; background:var(--ap-track); margin-top:6px; }
    .ap-sk .ap-bar:nth-child(2){ width:60%; }
    .ap-sk .ap-bar:nth-child(3){ width:88%; }
    .ap-empty{ padding:var(--ap-space-7) var(--ap-space-4); text-align:center;
      color:var(--ap-text-2); font-size:13px; }                           /* [106] */
    @container (max-width:340px){
      .ap-ctxt{ font-size:13px; }
      .ap-cmeta b{ font-size:13px; }
    }
  `;

  class ApComments extends AP.Base {
    constructor() {
      super();
      this._data = null;
      this._sort = 'new';        /* new | hot */
      this._reqId = 0;
      this._key = '';
      this._drafts = [];
    }

    render() {
      var self = this;
      AP.apStyle(this.shadowRoot, COMMENTS_CSS);

      var root = document.createElement('div');
      root.className = 'ap-card';
      root.innerHTML =
        '<div class="ap-chead">' +
        '<b id="ttl">评论</b><span class="ap-cnt" id="cnt"></span>' +
        '<span class="ap-sp"></span>' +
        '<div class="ap-sort" role="group" aria-label="评论排序">' +
        '<button id="s-new" type="button" aria-pressed="true">最新</button>' +
        '<button id="s-hot" type="button" aria-pressed="false">最热</button>' +
        '</div></div>' +
        '<div class="ap-list ap-noscroll" id="list" role="log" aria-live="off"></div>' +
        '<form class="ap-compose" id="compose">' +
        '<input id="draft" type="text" maxlength="140" placeholder="写条评论（仅保存在本机）" ' +
        'aria-label="评论内容" autocomplete="off" />' +
        '<button id="send" type="submit" disabled>发送</button>' +
        '</form>';
      this.shadowRoot.appendChild(root);
      this._onCleanup(function () { root.remove(); });
      var _qc = {};
      this._q = function (id) { return _qc[id] || (_qc[id] = root.querySelector('#' + id)); };

      var sNew = this._q('s-new'), sHot = this._q('s-hot');
      var onSort = function (which) {
        self._sort = which;
        sNew.setAttribute('aria-pressed', which === 'new' ? 'true' : 'false');
        sHot.setAttribute('aria-pressed', which === 'hot' ? 'true' : 'false');
        self._render();
      };
      sNew.addEventListener('click', function () { onSort('new'); });
      sHot.addEventListener('click', function () { onSort('hot'); });
      this._onCleanup(function () { sNew.onclick = sHot.onclick = null; });

      /* 草稿：非空才可点发送（[105]） */
      var draft = this._q('draft'), send = this._q('send');
      var onInput = function () { send.disabled = !draft.value.trim(); };
      draft.addEventListener('input', onInput);
      var onSubmit = function (ev) {
        ev.preventDefault();
        var v = draft.value.trim();
        if (!v) return;
        var item = { user: '我', content: v, time: Date.now() / 1000, local: true, liked: 0 };
        self._drafts.unshift(item);
        self._drafts = self._drafts.slice(0, 50);
        try {
          localStorage.setItem('ap:cmdraft:' + self._key, JSON.stringify(self._drafts));
        } catch (e) { }
        draft.value = ''; send.disabled = true;
        self._render();
        self._emit('ap-toast', { text: '已保存到本机草稿' });
      };
      this._q('compose').addEventListener('submit', onSubmit);
      this._onCleanup(function () { draft.removeEventListener('input', onInput); });

      this._storeOff = AP.Store.on(function () {
        var t = AP.Store.track();
        var key = t ? (t.id || t.label || '') + '|' + (t.nc || '') : '';
        if (key !== self._key) { self._key = key; self._load(t); }
      });
      this._load(AP.Store.track());
    }

    _skeleton() {
      var h = '';
      for (var i = 0; i < 3; i++) {
        h += '<div class="ap-sk"><div class="ap-av"></div><div style="flex:1">' +
          '<div class="ap-bar" style="width:38%"></div><div class="ap-bar"></div>' +
          '<div class="ap-bar"></div></div></div>';
      }
      this._q('list').innerHTML = h;
    }

    async _load(t) {
      var self = this;
      var req = ++this._reqId;
      this._data = null;
      try {
        this._drafts = JSON.parse(localStorage.getItem('ap:cmdraft:' + this._key) || '[]');
        if (!Array.isArray(this._drafts)) this._drafts = [];
      } catch (e) { this._drafts = []; }
      this._q('cnt').textContent = '';
      if (!t || !t.nc) {
        this._q('ttl').textContent = t ? (t.zh || t.label || '评论') : '评论';
        this._q('list').innerHTML = '<div class="ap-empty">这首没有关联评论</div>';  /* [106] */
        if (this._drafts.length) this._render();
        return;
      }
      this._q('ttl').textContent = (t.zh || t.label || '评论');
      this._skeleton();                                                     /* [107] */
      try {
        var d = await APEngine.loadComments(t.nc, { limit: 20, offset: 0 });
        if (req !== self._reqId) return;
        self._data = d;
        self._q('cnt').textContent = (d.total || 0) + ' 条';               /* [113] */
        self._render();
      } catch (e) {
        if (req !== self._reqId) return;
        self._q('list').innerHTML = '<div class="ap-empty">评论加载失败：' +
          AP.esc(e.message || '接口暂时不通') + '</div>';
        if (this._drafts.length) this._render();
      }
    }

    _item(c) {
      var wrap = document.createElement('div');
      wrap.className = 'ap-cmt';
      var av = document.createElement('div');
      av.className = 'ap-av';
      if (c.avatar) {
        var img = document.createElement('img');
        img.src = c.avatar; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', function () {
          img.remove();
          av.textContent = (c.user || '?').slice(0, 1);
        });
        av.appendChild(img);
      } else {
        av.textContent = (c.user || '?').slice(0, 1);                        /* [98] */
      }
      var body = document.createElement('div');
      body.className = 'ap-cbody';

      var meta = document.createElement('div');
      meta.className = 'ap-cmeta';
      var b = document.createElement('b'); b.textContent = c.user || '匿名';
      var time = document.createElement('time');
      /* 兼容两种时间单位：网易云给的是毫秒，本地草稿是秒；10^11 以下按秒处理 */
      var ms = !c.time ? 0 : (c.time > 1e11 ? c.time : c.time * 1000);
      time.textContent = AP.relTime(ms);                                     /* [110] */
      meta.appendChild(b); meta.appendChild(time);
      body.appendChild(meta);

      var txt = document.createElement('div');
      txt.className = 'ap-ctxt';
      txt.textContent = c.content || '';
      body.appendChild(txt);

      if ((c.content || '').length > 160) {                                  /* [101] */
        var more = document.createElement('button');
        more.className = 'ap-more ap-focusable';
        more.type = 'button';
        more.textContent = '展开';
        more.addEventListener('click', function () {
          var open = txt.classList.toggle('ap-open');
          more.textContent = open ? '收起' : '展开';
        });
        body.appendChild(more);
      }

      if (c.liked) {
        var like = document.createElement('button');
        like.className = 'ap-like ap-focusable';
        like.type = 'button';
        like.setAttribute('aria-pressed', 'false');
        like.setAttribute('aria-label', '点赞 ' + c.liked);
        like.innerHTML = AP.ICON.heart + '<span class="ap-num">' + c.liked + '</span>';
        like.addEventListener('click', function () {
          var on = like.getAttribute('aria-pressed') === 'true';
          like.setAttribute('aria-pressed', on ? 'false' : 'true');        /* 仅变色 [103] */
        });
        body.appendChild(like);
      }

      wrap.appendChild(av);
      wrap.appendChild(body);
      return wrap;
    }

    _render() {
      var list = this._q('list');
      var d = this._data || {};
      var items = [];
      if (this._drafts.length) items = items.concat(this._drafts.slice(0, 3));
      if (this._sort === 'hot' && d.hot && d.hot.length) items = items.concat(d.hot);
      else items = items.concat((d.comments || []).concat(d.hot && this._sort === 'new' ? d.hot : []));
      if (!items.length) {
        list.innerHTML = '<div class="ap-empty">暂无评论</div>';
        return;
      }
      var frag = document.createDocumentFragment();
      var seen = new Set();
      items.forEach(function (c) {
        var k = (c.user || '') + '|' + (c.content || '').slice(0, 24);
        if (seen.has(k)) return;                  /* 热评与最新去重 */
        seen.add(k);
        frag.appendChild(this._item(c));
      }, this);
      list.innerHTML = '';
      list.appendChild(frag);                     /* [109] 最大高 + 内部滚动 */
    }
  }

  if (!customElements.get('ap-comments')) customElements.define('ap-comments', ApComments);
  AP.Comments = ApComments;
})();
