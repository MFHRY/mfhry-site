(function () {
  /* 依赖 ap-core.js 暴露的 window.AP；未加载时静默跳过（组件自身不报错） */
  var AP = window.AP;
  if (!AP) return;
  var apStyle = AP.apStyle, ICON = AP.ICON, svg = AP.svg, fmtTime = AP.fmtTime,
      clamp = AP.clamp, relTime = AP.relTime, debounce = AP.debounce,
      SafeStore = AP.SafeStore, APTheme = AP.Theme, APStore = AP.Store,
      AP_TOKENS = AP.TOKENS, AP_EVENTS = AP.EVENTS;

  /* ==========================================================================
   * 模块 4：<ap-mv> MV 模块（[116]–[135]）
   * 保留旧页能力：多版本 MV + 多分辨率切换、与音频播放进度交接、结束自动下一首。
   * ======================================================================== */

  var MV_CSS = AP_TOKENS + `
    .ap-card{ padding:var(--ap-space-2); }
    .ap-mhead{ display:flex; align-items:center; gap:var(--ap-space-2); margin-bottom:var(--ap-space-3); }
    .ap-mhead b{ font-size:15px; font-weight:600; letter-spacing:-0.02em; }
    .ap-mhead .ap-sp{ flex:1 1 auto; }
    /* 16:9 容器，圆角 16px，overflow hidden（[116]） */
    .ap-stage{
      position:relative; width:100%; aspect-ratio:16/9; overflow:hidden;
      border-radius:var(--ap-radius-art); background:#000;
      /* iOS Safari 圆角兜底（[132]） */
      -webkit-mask-image:-webkit-radial-gradient(white,black);
      isolation:isolate;
    }
    .ap-stage video{ width:100%; height:100%; object-fit:contain; display:block; background:#000; }
    /* 播放前封面 + 渐变遮罩（[117][118][119]） */
    .ap-poster{
      position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      background-size:cover; background-position:center; cursor:pointer;
      border:0; padding:0; width:100%;
    }
    .ap-poster::after{
      content:''; position:absolute; inset:0;
      background:linear-gradient(180deg,rgba(0,0,0,.10),rgba(0,0,0,.42));
    }
    /* 播放按钮 64px 圆形毛玻璃（[118]） */
    .ap-poster .ap-playbig{
      position:relative; z-index:1; width:64px; height:64px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      background:rgba(255,255,255,.22);
      -webkit-backdrop-filter:blur(20px) saturate(160%);
      backdrop-filter:blur(20px) saturate(160%);
      border:1px solid rgba(255,255,255,.35);
      color:#fff;
      transition:transform var(--ap-dur) var(--ap-ease), background-color var(--ap-dur) var(--ap-ease);
    }
    .ap-poster:hover .ap-playbig{ transform:scale(1.06); background:rgba(255,255,255,.30); }
    .ap-poster .ap-playbig svg{ width:28px; height:28px; margin-left:3px; }
    /* 控件条：3s 自动隐藏（[120][121]） */
    .ap-vctrl{
      position:absolute; left:0; right:0; bottom:0; z-index:2;
      display:flex; align-items:center; gap:var(--ap-space-2);
      padding:var(--ap-space-3) var(--ap-space-3) var(--ap-space-2);
      background:linear-gradient(180deg,transparent,rgba(0,0,0,.62));
      opacity:1; transform:translateY(0);
      transition:opacity var(--ap-dur) var(--ap-ease), transform var(--ap-dur) var(--ap-ease);
    }
    .ap-vctrl.ap-hide{ opacity:0; transform:translateY(6px); pointer-events:none; }
    .ap-vctrl .ap-vbtn{
      width:44px; height:44px; min-width:44px; min-height:44px;   /* 热区 [148] */
      border:0; border-radius:50%; background:transparent; color:#fff;
      display:inline-flex; align-items:center; justify-content:center; cursor:pointer;
      transition:background-color var(--ap-dur) var(--ap-ease);
    }
    .ap-vctrl .ap-vbtn:hover{ background:rgba(255,255,255,.16); }
    .ap-vctrl .ap-vbtn svg{ width:22px; height:22px; }
    .ap-vtrack{ position:relative; flex:1 1 auto; height:22px; display:flex; align-items:center;
      cursor:pointer; touch-action:none; }
    .ap-vtrack .ap-line{ height:4px; border-radius:2px; background:rgba(255,255,255,.28); width:100%;
      position:relative; transition:height var(--ap-dur) var(--ap-ease); }
    .ap-vtrack:hover .ap-line{ height:6px; }                     /* 与播放模块一致 [122] */
    .ap-vfill{ position:absolute; left:0; top:0; bottom:0; border-radius:2px;
      background:var(--ap-accent); width:0%; }                    /* 强调色 [17] */
    .ap-vtime{ font-size:11px; color:#fff; font-variant-numeric:tabular-nums;
      letter-spacing:0; white-space:nowrap; }
    /* 版本 / 分辨率切换（保留旧功能） */
    .ap-mvers{ display:flex; flex-wrap:wrap; gap:6px; margin-top:var(--ap-space-3); }
    .ap-mvers button{
      min-height:32px; padding:0 10px; border:1px solid var(--ap-border);
      border-radius:999px; background:transparent; color:var(--ap-text-2);
      font-size:12px; font-family:inherit; cursor:pointer;
      transition:color var(--ap-dur) var(--ap-ease), border-color var(--ap-dur) var(--ap-ease);
    }
    .ap-mvers button[aria-pressed="true"]{ color:var(--ap-text); border-color:var(--ap-text-2); font-weight:600; }
    /* 加载进度条（不用无限转圈 [123][172]） */
    .ap-vload{ position:absolute; left:0; right:0; top:0; height:2px; background:rgba(255,255,255,.2); z-index:3; }
    .ap-vload i{ display:block; height:100%; width:0%; background:var(--ap-accent);
      transition:width 200ms linear; }
    .ap-empty{ padding:var(--ap-space-7) var(--ap-space-4); text-align:center;
      color:var(--ap-text-2); font-size:13px; }                    /* [124] */
    @container (max-width:340px){
      .ap-poster .ap-playbig{ width:52px; height:52px; }
      .ap-vtime{ display:none; }
    }
  `;

  class ApMv extends AP.Base {
    constructor() {
      super();
      this._vers = 0;
      this._res = 0;
      this._hideTimer = 0;
      this._playing = false;
      this._key = '';
      this._started = false;      /* 懒加载标记 [133] */
    }

    render() {
      var self = this;
      AP.apStyle(this.shadowRoot, MV_CSS);

      var root = document.createElement('div');
      root.className = 'ap-card';
      root.innerHTML =
        '<div class="ap-mhead"><b id="ttl">MV</b><span class="ap-sp"></span></div>' +
        '<div class="ap-stage" id="stage">' +
        '<div class="ap-vload" id="load" hidden><i id="loadbar"></i></div>' +
        '<video id="v" playsinline preload="metadata" crossorigin="anonymous"></video>' +
        '<button class="ap-poster ap-focusable" id="poster" type="button" aria-label="播放 MV">' +
        '<span class="ap-playbig">' + AP.ICON.play + '</span></button>' +
        '<div class="ap-vctrl" id="ctrl">' +
        '<button class="ap-vbtn ap-focusable" id="vtoggle" type="button" aria-label="播放">' + AP.ICON.play + '</button>' +
        '<div class="ap-vtrack ap-focusable" id="vtrack" role="slider" tabindex="0" aria-label="MV 进度" ' +
        'aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
        '<div class="ap-line"><div class="ap-vfill" id="vfill"></div></div></div>' +
        '<span class="ap-vtime" id="vtime">0:00</span>' +
        '<button class="ap-vbtn ap-focusable" id="vfull" type="button" aria-label="MV 全屏">' + AP.ICON.expand + '</button>' +
        '</div></div>' +
        '<div class="ap-mvers" id="vers"></div>';
      this.shadowRoot.appendChild(root);
      this._onCleanup(function () { root.remove(); });
      var _qc = {};
      this._q = function (id) { return _qc[id] || (_qc[id] = root.querySelector('#' + id)); };

      var v = this._q('v'), poster = this._q('poster'), ctrl = this._q('ctrl');

      /* ---- 视频事件（[125][127]） ---- */
      var onTime = function () {
        var d = v.duration;
        if (!d || !isFinite(d)) return;
        var r = clamp(v.currentTime / d, 0, 1);
        self._q('vfill').style.width = (r * 100).toFixed(2) + '%';   /* 只改宽度 [207] */
        self._q('vtrack').setAttribute('aria-valuenow', String(Math.round(r * 100)));
        self._q('vtime').textContent = AP.fmtTime(v.currentTime);
      };
      var onPlay = function () {
        self._playing = true;
        poster.hidden = true;
        self._q('vtoggle').innerHTML = AP.ICON.pause;
        self._q('vtoggle').setAttribute('aria-label', '暂停');
        self._scheduleHide();
        self._emit('ap-mv-play', { index: AP.Store.state.index });   /* 页面据此暂停音频 [144] */
      };
      var onPause = function () {
        self._playing = false;
        self._q('vtoggle').innerHTML = AP.ICON.play;
        self._q('vtoggle').setAttribute('aria-label', '播放');
        ctrl.classList.remove('ap-hide');
        clearTimeout(self._hideTimer);
        self._emit('ap-mv-pause', {});
      };
      var onErr = function () {
        self._q('load').hidden = true;
        poster.hidden = false;
        self._q('ttl').textContent = 'MV';
        self._q('vers').innerHTML = '<div class="ap-empty">视频加载失败，可换分辨率或稍后再试</div>';  /* [125] */
      };
      var onProgress = function () {
        var b = v.buffered;
        if (b && b.length && v.duration) {
          self._q('loadbar').style.width = ((b.end(b.length - 1) / v.duration) * 100).toFixed(1) + '%';
        }
      };
      var onWaiting = function () { self._q('load').hidden = false; };
      var onPlaying = function () { self._q('load').hidden = true; };
      var onEnded = function () {
        self._playing = false;
        poster.hidden = false;
        self._emit('ap-mv-ended', {});                     /* 结束自动下一首由页面接 */
      };
      [['timeupdate', onTime], ['play', onPlay], ['pause', onPause], ['error', onErr],
      ['progress', onProgress], ['waiting', onWaiting], ['playing', onPlaying],
      ['ended', onEnded]].forEach(function (p) {
        v.addEventListener(p[0], p[1]);
        self._onCleanup(function () { v.removeEventListener(p[0], p[1]); });
      });

      /* ---- 播放按钮 ---- */
      var onPoster = function () { self.play(); };
      poster.addEventListener('click', onPoster);
      var onToggle = function () { if (v.paused) self.play(); else v.pause(); };
      this._q('vtoggle').addEventListener('click', onToggle);
      this._onCleanup(function () {
        poster.removeEventListener('click', onPoster);
        self._q('vtoggle').removeEventListener('click', onToggle);
      });

      /* ---- 进度拖拽（与播放模块同样的手感） ---- */
      var track = this._q('vtrack');
      var dragging = false;
      var ratio = function (ev) {
        var r = track.getBoundingClientRect();
        return clamp((ev.clientX - r.left) / (r.width || 1), 0, 1);
      };
      var onDown = function (ev) {
        if (!v.duration) return;
        dragging = true; track.setPointerCapture && track.setPointerCapture(ev.pointerId);
        ev.preventDefault();
      };
      var onMove = function (ev) {
        if (!dragging) return;
        self._q('vfill').style.width = (ratio(ev) * 100).toFixed(2) + '%';
      };
      var onUp = function (ev) {
        if (!dragging) return;
        dragging = false;
        if (v.duration) v.currentTime = ratio(ev) * v.duration;
      };
      var onKey = function (ev) {
        if (!v.duration) return;
        if (ev.key === 'ArrowLeft') { v.currentTime = Math.max(0, v.currentTime - 5); ev.preventDefault(); }
        else if (ev.key === 'ArrowRight') { v.currentTime = Math.min(v.duration, v.currentTime + 5); ev.preventDefault(); }
      };
      track.addEventListener('pointerdown', onDown);
      track.addEventListener('pointermove', onMove);
      track.addEventListener('pointerup', onUp);
      track.addEventListener('pointercancel', onUp);
      track.addEventListener('keydown', onKey);
      this._onCleanup(function () {
        track.removeEventListener('pointerdown', onDown);
        track.removeEventListener('pointermove', onMove);
        track.removeEventListener('pointerup', onUp);
        track.removeEventListener('pointercancel', onUp);
        track.removeEventListener('keydown', onKey);
      });

      /* ---- 控件 3s 自动隐藏（[120]） ---- */
      var stage = this._q('stage');
      var wake = function () {
        ctrl.classList.remove('ap-hide');
        self._scheduleHide();
      };
      stage.addEventListener('pointermove', wake);
      stage.addEventListener('pointerdown', wake);
      this._onCleanup(function () {
        stage.removeEventListener('pointermove', wake);
        stage.removeEventListener('pointerdown', wake);
        clearTimeout(self._hideTimer);
      });

      /* ---- 全屏（[130]） ---- */
      var onFull = function () {
        var st = self._q('stage');
        if (document.fullscreenElement) document.exitFullscreen().catch(function () { });
        else (st.requestFullscreen ? st.requestFullscreen() : Promise.reject()).catch(function () { });
      };
      this._q('vfull').addEventListener('click', onFull);
      this._onCleanup(function () { self._q('vfull').onclick = null; });

      /* ---- 音量与播放模块共享（[126]） ---- */
      this._storeOff = AP.Store.on(function (st) {
        v.volume = st.muted ? 0 : st.volume;
        var t = AP.Store.track();
        var key = t ? (t.id || t.label || '') + '|' + ((t.mv && t.mv.length) || 0) : '';
        if (key !== self._key) {
          self._key = key;
          self._destroyVideo();          /* 切歌销毁旧 video [128] */
          self._setup(t);
        }
      });
      this._setup(AP.Store.track());
    }

    _scheduleHide() {
      var self = this;
      clearTimeout(this._hideTimer);
      if (!this._playing) return;
      this._hideTimer = setTimeout(function () {
        if (self._playing) self._q('ctrl').classList.add('ap-hide');
      }, 3000);                                                       /* [120] */
    }

    _destroyVideo() {
      var v = this._q('v');
      if (!v) return;
      try { v.pause(); } catch (e) { }
      v.removeAttribute('src');                                       /* [128] */
      try { v.load(); } catch (e) { }
      this._started = false;
      this._playing = false;
      this._q('poster').hidden = false;
    }

    _setup(t) {
      var vers = this._q('vers'), ttl = this._q('ttl'), poster = this._q('poster');
      vers.innerHTML = '';
      if (!t || !t.mv || !t.mv.length) {
        ttl.textContent = 'MV';
        poster.hidden = true;
        /* 空状态，不黑屏（[124]） */
        vers.innerHTML = '<div class="ap-empty">这首没有 MV</div>';
        return;
      }
      ttl.textContent = 'MV · ' + (t.zh || t.label || '');
      poster.hidden = false;
      poster.style.backgroundImage = t.cover ? 'url("' + t.cover + '")' : 'none';
      poster.style.background = poster.style.backgroundImage === 'none'
        ? 'var(--ap-hover)' : '';
      this._vers = clamp(this._vers, 0, t.mv.length - 1);
      var self = this;

      var build = function () {
        var mv = t.mv[self._vers];
        vers.innerHTML = '';
        /* 版本切换（保留旧功能） */
        if (t.mv.length > 1) {
          t.mv.forEach(function (m, i) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = m.title || ('版本 ' + (i + 1));
            b.setAttribute('aria-pressed', i === self._vers ? 'true' : 'false');
            b.addEventListener('click', function () {
              self._vers = i; self._res = 0;
              self._destroyVideo();
              build();
            });
            vers.appendChild(b);
          });
        }
        /* 分辨率切换（保留旧功能） */
        var cur = t.mv[self._vers];
        if (cur && cur.res && cur.res.length > 1) {
          self._res = clamp(self._res, 0, cur.res.length - 1);
          cur.res.forEach(function (r, j) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = r.label || ('源 ' + (j + 1));
            b.setAttribute('aria-pressed', j === self._res ? 'true' : 'false');
            b.addEventListener('click', function () {
              var keep = self._q('v').currentTime || 0;
              self._res = j;
              self._q('v').src = cur.res[j].url;
              if (keep) { try { self._q('v').currentTime = keep; } catch (e) { } }
              build();
            });
            vers.appendChild(b);
          });
        }
        if (!self._started) {
          /* 懒加载：不主动设 src，等用户点播放（[133][211]） */
        } else {
          var nv = t.mv[self._vers].res[self._res];
          if (nv) self._q('v').src = nv.url;
        }
      };
      build();
    }

    /** 播放 MV；带声音播放必须由用户手势触发（[129]） */
    play() {
      var t = AP.Store.track();
      if (!t || !t.mv || !t.mv.length) return;
      var mv = t.mv[this._vers];
      if (!mv || !mv.res || !mv.res[this._res]) return;
      var v = this._q('v');
      if (!this._started || !v.getAttribute('src')) {
        v.src = mv.res[this._res].url;         /* 首次点击才加载 [133] */
        this._started = true;
      }
      v.volume = AP.Store.state.muted ? 0 : AP.Store.state.volume;
      var p = v.play();
      if (p && p.catch) p.catch(function () {
        /* 自动播放/解码失败：回到封面态（[129]） */
      });
    }
  }

  if (!customElements.get('ap-mv')) customElements.define('ap-mv', ApMv);
  AP.Mv = ApMv;
})();
