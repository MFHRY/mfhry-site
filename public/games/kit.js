// 小游戏通用打磨包：毛玻璃 HUD（返回 / 音效 / 暂停 / 重开 / 排行榜 / 最佳成绩 / 分享）
// + 合成音效 + 震动 + 新纪录庆祝 + 暂停（冻结 requestAnimationFrame）
// + 可选虚拟按键（游戏里设置 window.MF_TOUCH）
// 用法：在游戏页 </body> 前加 <script src="/games/kit.js"></script>
(function () {
  if (window.__mfKit) return;
  window.__mfKit = true;

  const LS_SFX = 'mfhry_sfx';
  const LS_HAP = 'mfhry_haptic';
  const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  let muted = false;
  let haptic = true;
  try {
    muted = localStorage.getItem(LS_SFX) === '0';
    haptic = localStorage.getItem(LS_HAP) !== '0';
  } catch (e) {}

  // ---------- 音效（WebAudio 合成，零资源） ----------
  let actx = null;
  function ac() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
    return actx;
  }
  function tone(freq, dur, type, gain, slideTo) {
    const a = ac();
    if (!a) return;
    const t0 = a.currentTime;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.05, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(a.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  const SFX = {
    click: () => tone(560, 0.05, 'sine', 0.05, 700),
    hit: () => { tone(900, 0.045, 'square', 0.045); tone(1350, 0.05, 'square', 0.03); },
    score: () => { tone(720, 0.07, 'triangle', 0.055); setTimeout(() => tone(1080, 0.09, 'triangle', 0.05), 65); },
    jump: () => tone(420, 0.11, 'sine', 0.06, 820),
    flap: () => tone(300, 0.08, 'triangle', 0.05, 520),
    shoot: () => tone(1100, 0.04, 'square', 0.03, 500),
    boom: () => { tone(180, 0.22, 'sawtooth', 0.06, 60); tone(90, 0.25, 'sine', 0.05, 40); },
    fail: () => { tone(240, 0.16, 'sawtooth', 0.06, 120); setTimeout(() => tone(150, 0.24, 'sawtooth', 0.05, 70), 130); },
    win: () => [0, 90, 190].forEach((d, i) => setTimeout(() => tone([660, 880, 1180][i], 0.15, 'triangle', 0.06), d)),
    pop: () => tone(880, 0.06, 'sine', 0.045, 1200),
    flip: () => tone(520, 0.05, 'sine', 0.035, 660),
    move: () => tone(240, 0.03, 'sine', 0.03, 300),
    coin: () => { tone(1180, 0.05, 'square', 0.035); setTimeout(() => tone(1580, 0.08, 'square', 0.03), 55); },
    swipe: () => tone(360, 0.06, 'sine', 0.035, 540),
    miss: () => tone(190, 0.09, 'square', 0.028, 120),
  };
  function sfx(name) {
    if (muted) return;
    const f = SFX[name];
    if (f) { try { f(); } catch (e) {} }
  }
  function buzz(pattern) {
    if (!haptic || !coarse) return;
    try { navigator.vibrate && navigator.vibrate(pattern); } catch (e) {}
  }

  // ---------- 最佳成绩 ----------
  // 步数 / 用时类游戏越小越好；排行榜后端用同样的方向。
  const LOWER_BETTER = new Set(['maze', 'minesweeper', 'memory', 'puzzle15', 'huarong', 'sudoku']);
  const NEGATIVE_GAMES = new Set(['fx-sim', 'stock-sim']);
  const BEST_PREFIX = 'mfhry_best_';
  const LEGACY = {
    'gold-miner': ['goldminer_best'],
    '2048': ['mfhry_2048_best'],
    whack: ['mfhry_whack_best'],
    jump: ['mfhry_jump_best'],
    maze: ['mfhry_maze_best'],
    rhythm: ['mfhry_rhythm_best'],
    snake: ['mfhry_snake_best'],
    breakout: ['mfhry_brick_best'],
    tetris: ['mfhry_tetris_best'],
    flappy: ['mfhry_flappy_best'],
    invaders: ['mfhry_invaders_best'],
    minesweeper: ['mfhry_mines_best'],
    memory: ['mfhry_memory_best'],
    puzzle15: ['mfhry_puzzle_best'],
    gomoku: ['mfhry_gomoku_win'],
    pong: ['mfhry_pong_win'],
    reversi: ['mfhry_reversi_win'],
    sudoku: ['mfhry_sudoku_best'],
    dodger: ['mfhry_dodger_best'],
    bubble: ['mfhry_bubble_best'],
    match3: ['mfhry_match3_best'],
    huarong: ['mfhry_huarong_best'],
  };
  function getBest(key) {
    try {
      const raw = localStorage.getItem(BEST_PREFIX + key);
      if (raw !== null && raw !== '') return +raw || 0;
      const legacy = LEGACY[key] || [];
      for (const k of legacy) {
        const v = +(localStorage.getItem(k) || 0);
        if (v > 0) {
          localStorage.setItem(BEST_PREFIX + key, String(v));
          return v;
        }
      }
      return 0;
    } catch (e) { return 0; }
  }
  function setBest(key, v) {
    try { localStorage.setItem(BEST_PREFIX + key, String(v)); } catch (e) {}
  }
  function isBetter(key, v) {
    if (!isFinite(v) || v <= 0) return false;
    const best = getBest(key);
    if (!best) return true;
    return LOWER_BETTER.has(key) ? v < best : v > best;
  }

  const path = location.pathname.split('/').filter(Boolean);
  const slug = path[0] === 'games' ? (path[1] || 'arcade') : (path[1] || 'arcade');

  // ---------- 暂停：冻结 rAF，不打断游戏状态 ----------
  const rafNative = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null;
  let paused = false;
  let engaged = false;
  let pauseEl = null;
  let rafQueue = [];
  if (rafNative) {
    window.requestAnimationFrame = function (cb) {
      if (paused) { rafQueue.push(cb); return 0; }
      return rafNative(cb);
    };
  }
  const noPause = () => !!window.__mfNoPause;
  function setPaused(v) {
    if (noPause() || !rafNative) return;
    v = !!v;
    if (v === paused) return;
    paused = v;
    document.body.classList.toggle('mf-paused', paused);
    if (paused) {
      buildPause();
      pauseEl.classList.add('on');
      try { window.dispatchEvent(new CustomEvent('mf:pause')); } catch (e) {}
      sfx('click');
    } else {
      if (pauseEl) pauseEl.classList.remove('on');
      const q = rafQueue;
      rafQueue = [];
      for (const cb of q) rafNative(cb);
      try { window.dispatchEvent(new CustomEvent('mf:resume')); } catch (e) {}
    }
  }
  function togglePause() { setPaused(!paused); }

  function buildPause() {
    if (pauseEl) return;
    pauseEl = document.createElement('div');
    pauseEl.className = 'mf-pause';
    pauseEl.innerHTML =
      '<div class="mf-pause-card">' +
      '<div class="mf-pause-ico">⏸</div>' +
      '<h2>已暂停</h2>' +
      '<p>切到后台会自动暂停，回来接着玩</p>' +
      '<div class="mf-pause-btns">' +
      '<button type="button" data-p="resume">继续</button>' +
      (window.__mfNoRestart ? '' : '<button type="button" data-p="restart">重开</button>') +
      '<a href="/games/">返回列表</a>' +
      '</div>' +
      '<small>P 继续 · R 重开</small>' +
      '</div>';
    document.body.appendChild(pauseEl);
    pauseEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      if (b.dataset.p === 'resume') { setPaused(false); sfx('click'); }
      else if (b.dataset.p === 'restart') { setPaused(false); restart(); }
    });
  }

  // 暂停时拦下游戏按键；P / Esc 用来继续
  document.addEventListener('keydown', (e) => {
    if (!paused) return;
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { e.preventDefault(); setPaused(false); return; }
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setPaused(false); restart(); return; }
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'p' && e.key !== 'P') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (!engaged || noPause()) return;
    e.preventDefault();
    togglePause();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && engaged && !noPause()) setPaused(true);
  });

  function markEngaged() { engaged = true; }
  window.addEventListener('pointerdown', markEngaged, { capture: true, passive: true, once: true });
  window.addEventListener('keydown', markEngaged, { capture: true, once: true });

  // ---------- HUD ----------
  let hudBestEl = null;
  function buildHud() {
    const wrap = document.createElement('div');
    wrap.className = 'mf-hud';
    wrap.innerHTML =
      '<a class="mf-btn" href="/games/" title="返回小游戏列表" aria-label="返回">←</a>' +
      '<button class="mf-btn" data-act="sfx" title="音效开关" aria-label="音效">' + (muted ? '🔇' : '🔊') + '</button>' +
      (noPause() ? '' : '<button class="mf-btn" data-act="pause" title="暂停（P）" aria-label="暂停">⏸</button>') +
      (window.__mfNoRestart ? '' : '<button class="mf-btn" data-act="restart" title="重开（R）" aria-label="重开">⟲</button>') +
      '<a class="mf-btn" data-act="board" title="排行榜" aria-label="排行榜" href="/leaderboard/#' + encodeURIComponent(slug) + '">榜</a>' +
      '<span class="mf-btn mf-best" title="本机最佳成绩">🏆 <b>' + (getBest(slug) || '—') + '</b></span>' +
      '<button class="mf-btn" data-act="share" title="分享成绩图" aria-label="分享">⤴</button>';
    document.body.appendChild(wrap);
    hudBestEl = wrap.querySelector('.mf-best b');
    placeHud(wrap);

    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      e.preventDefault();
      const act = btn.dataset.act;
      if (act === 'sfx') {
        muted = !muted;
        try { localStorage.setItem(LS_SFX, muted ? '0' : '1'); } catch (err) {}
        btn.textContent = muted ? '🔇' : '🔊';
        if (!muted) sfx('click');
      } else if (act === 'pause') {
        togglePause();
      } else if (act === 'restart') {
        sfx('click');
        restart();
      } else if (act === 'share') {
        sfx('click');
        shareScore();
      }
    });
    window.addEventListener('resize', () => placeHud(wrap), { passive: true });
  }

  function restart() {
    setPaused(false);
    if (typeof window.mfRestart === 'function') {
      try { window.mfRestart(); return; } catch (e) {}
    }
    const cands = [...document.querySelectorAll('button, a, [role="button"], .btn, .button, span')];
    const hit = cands.find((el) => {
      if (el.closest('.mf-hud, .mf-pause, .mf-pads')) return false;
      if (el.offsetParent === null) return false;
      const t = (el.textContent || '').trim();
      return /^(重开|重新开始|再来一局|再玩一次|再来|打乱|restart|play again|new game)$/i.test(t);
    });
    if (hit) { hit.click(); return; }
    location.reload();
  }

  // 自动避开页面已有按钮：右下 → 左下 → 右上 → 左上；有虚拟按键时优先顶部
  function collides(wrap) {
    const r = wrap.getBoundingClientRect();
    const pad = 4;
    for (const el of document.querySelectorAll('button, a, .btn, [role="button"], input')) {
      if (el.closest('.mf-hud, .mf-pause, .mf-pads')) continue;
      if (!el.offsetParent && el.tagName !== 'CANVAS') continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if (!(b.right < r.left - pad || b.left > r.right + pad || b.bottom < r.top - pad || b.top > r.bottom + pad)) return true;
    }
    return false;
  }
  function placeHud(wrap) {
    if (!wrap) return;
    const pads = !!document.querySelector('.mf-pads');
    const pos = pads
      ? [['right:14px;top:14px'], ['left:14px;top:14px'], ['right:14px;bottom:14px'], ['left:14px;bottom:14px']]
      : [['right:14px;bottom:14px'], ['left:14px;bottom:14px'], ['right:14px;top:14px'], ['left:14px;top:14px']];
    let chosen = null;
    for (const [css] of pos) {
      wrap.style.cssText = '';
      const m = /(right|left):14px;(top|bottom):14px/.exec(css);
      wrap.style[m[1]] = 'calc(14px + env(safe-area-inset-' + m[1] + '))';
      wrap.style[m[2]] = 'calc(14px + env(safe-area-inset-' + m[2] + '))';
      if (!collides(wrap)) { chosen = css; break; }
    }
    if (!chosen) {
      wrap.style.left = wrap.style.top = '';
      wrap.style.right = '14px';
      wrap.style.bottom = '14px';
    }
  }

  // ---------- 虚拟按键（可选，window.MF_TOUCH） ----------
  // 用法：游戏在加载 kit 之前设置
  // window.MF_TOUCH = { dpad: ['ArrowLeft','ArrowUp','ArrowDown','ArrowRight'],
  //                     actions: [{ key: ' ', label: '开火', repeat: false }] };
  const KEYCODE = {
    ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, ' ': 32,
    Enter: 13, a: 65, d: 68, w: 87, s: 83, z: 90, x: 88, Shift: 16,
  };
  function keyEvent(type, key) {
    const ev = new KeyboardEvent(type, {
      key: key,
      code: key === ' ' ? 'Space' : (/^[a-z]$/i.test(key) ? 'Key' + key.toUpperCase() : key),
      bubbles: true,
      cancelable: true,
    });
    const kc = KEYCODE[key];
    if (kc) {
      try { Object.defineProperty(ev, 'keyCode', { get: () => kc }); } catch (e) {}
      try { Object.defineProperty(ev, 'which', { get: () => kc }); } catch (e) {}
    }
    document.dispatchEvent(ev);
  }
  function buildPads() {
    const cfg = window.MF_TOUCH;
    if (!cfg || (!coarse && !cfg.force)) return;
    if (document.querySelector('.mf-pads')) return;
    const pad = document.createElement('div');
    pad.className = 'mf-pads';
    let html = '';
    if (cfg.dpad && cfg.dpad.length >= 4) {
      html +=
        '<div class="mf-dpad">' +
        '<button type="button" class="mf-key up" data-key="' + cfg.dpad[1] + '" aria-label="上">▲</button>' +
        '<button type="button" class="mf-key left" data-key="' + cfg.dpad[0] + '" aria-label="左">◀</button>' +
        '<button type="button" class="mf-key right" data-key="' + cfg.dpad[3] + '" aria-label="右">▶</button>' +
        '<button type="button" class="mf-key down" data-key="' + cfg.dpad[2] + '" aria-label="下">▼</button>' +
        '</div>';
    }
    const acts = cfg.actions || [];
    if (acts.length) {
      html += '<div class="mf-acts">' + acts.map((a) =>
        '<button type="button" class="mf-key act" data-key="' + a.key + '" data-repeat="' + (a.repeat ? '1' : '0') + '" aria-label="' + (a.label || a.key) + '">' +
        (a.label || a.key) + '</button>').join('') + '</div>';
    }
    pad.innerHTML = html;
    document.body.appendChild(pad);
    document.body.classList.add('mf-touch');

    const timers = new Map();
    function press(btn) {
      if (btn.__on) return;
      btn.__on = true;
      btn.classList.add('on');
      const key = btn.dataset.key;
      keyEvent('keydown', key);
      if (btn.dataset.repeat === '1') {
        timers.set(btn, setInterval(() => keyEvent('keydown', key), 120));
      }
      buzz(8);
    }
    function release(btn) {
      if (!btn || !btn.__on) return;
      btn.__on = false;
      btn.classList.remove('on');
      clearInterval(timers.get(btn));
      timers.delete(btn);
      keyEvent('keyup', btn.dataset.key);
    }
    pad.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.mf-key');
      if (!b) return;
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (err) {}
      press(b);
    });
    pad.addEventListener('pointerup', (e) => release(e.target.closest('.mf-key')));
    pad.addEventListener('pointercancel', (e) => release(e.target.closest('.mf-key')));
    pad.addEventListener('lostpointercapture', (e) => release(e.target.closest('.mf-key')));
    ['pointerleave', 'pointerout'].forEach((ev) => pad.addEventListener(ev, (e) => {
      const b = e.target.closest('.mf-key');
      if (b && timers.has(b)) release(b);
    }));
    pad.querySelectorAll('.mf-key').forEach((b) => {
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    const wrap = document.querySelector('.mf-hud');
    if (wrap) placeHud(wrap);
  }

  // ---------- 分享成绩图 ----------
  let lastScore = 0;

  function gameTitle() {
    const t = (document.title || '').split('·')[0].trim();
    return t || slug;
  }

  async function shareScore() {
    const score = lastScore || getBest(slug) || 0;
    const title = gameTitle();
    const best = getBest(slug) || score;
    const cv = document.createElement('canvas');
    cv.width = 1080; cv.height = 1350;
    const g = cv.getContext('2d');

    const bg = g.createLinearGradient(0, 0, 1080, 1350);
    bg.addColorStop(0, '#0e1519');
    bg.addColorStop(0.55, '#0b1014');
    bg.addColorStop(1, '#0a0d10');
    g.fillStyle = bg;
    g.fillRect(0, 0, 1080, 1350);

    const glow = g.createRadialGradient(900, 200, 40, 900, 200, 720);
    glow.addColorStop(0, 'rgba(127,209,176,.28)');
    glow.addColorStop(1, 'rgba(127,209,176,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 1080, 1350);

    g.strokeStyle = 'rgba(255,255,255,.05)';
    for (let x = 0; x < 1080; x += 54) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 1350); g.stroke(); }
    for (let y = 0; y < 1350; y += 54) { g.beginPath(); g.moveTo(0, y); g.lineTo(1080, y); g.stroke(); }

    g.fillStyle = 'rgba(255,255,255,.05)';
    g.strokeStyle = 'rgba(255,255,255,.14)';
    g.lineWidth = 3;
    const card = [88, 250, 904, 850];
    const r = 42;
    g.beginPath();
    g.moveTo(card[0] + r, card[1]);
    g.arcTo(card[0] + card[2], card[1], card[0] + card[2], card[1] + card[3], r);
    g.arcTo(card[0] + card[2], card[1] + card[3], card[0], card[1] + card[3], r);
    g.arcTo(card[0], card[1] + card[3], card[0], card[1], r);
    g.arcTo(card[0], card[1], card[0] + card[2], card[1], r);
    g.closePath();
    g.fill();
    g.stroke();

    const font = (w, px) => w + ' ' + px + 'px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#8b939c';
    g.font = font('600', 40);
    g.fillText('MFHRY.Store 小游戏', 540, 150);

    g.fillStyle = '#eaecef';
    g.font = font('800', 92);
    g.fillText(title.slice(0, 10), 540, 420);

    g.fillStyle = '#7fd1b0';
    g.font = font('800', 230);
    g.fillText(String(score), 540, 760);

    g.fillStyle = '#8b939c';
    g.font = font('600', 46);
    g.fillText('本次成绩', 540, 830);

    if (best > score) {
      g.fillStyle = '#5d6a74';
      g.font = font('600', 42);
      g.fillText('本机最佳 ' + best, 540, 950);
    }

    g.fillStyle = 'rgba(255,255,255,.35)';
    g.font = font('500', 34);
    g.fillText('mfhry.store/games', 540, 1240);

    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    if (!blob) return;
    const file = new File([blob], 'mfhry-' + slug + '.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: title + ' · ' + score, text: '我在 mfhry.store 玩「' + title + '」拿了 ' + score + ' 分' });
        return;
      } catch (e) { /* 用户取消就退回下载 */ }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  // ---------- 新纪录庆祝 ----------
  let celebrated = false;
  function toastBest(v) {
    const el = document.createElement('div');
    el.className = 'mf-toast';
    el.textContent = '🏆 新纪录 ' + v;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('on'), 30);
    setTimeout(() => {
      el.classList.remove('on');
      setTimeout(() => el.remove(), 350);
    }, 2200);
  }
  function confetti() {
    if (reduced) return;
    const cv = document.createElement('canvas');
    cv.className = 'mf-confetti';
    cv.width = innerWidth;
    cv.height = innerHeight;
    document.body.appendChild(cv);
    const g = cv.getContext('2d');
    const colors = ['#7fd1b0', '#e8c46a', '#c58ee0', '#6aa8e8', '#e57b6b', '#f2f5f7'];
    const parts = Array.from({ length: 110 }, () => ({
      x: innerWidth * (0.15 + Math.random() * 0.7),
      y: innerHeight * 0.32 + Math.random() * 60,
      vx: (Math.random() - 0.5) * 13,
      vy: -6 - Math.random() * 10,
      g: 0.26 + Math.random() * 0.12,
      w: 4 + Math.random() * 6,
      h: 3 + Math.random() * 7,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      color: colors[(Math.random() * colors.length) | 0],
      life: 80 + Math.random() * 50,
    }));
    let n = 0;
    function frame() {
      g.clearRect(0, 0, cv.width, cv.height);
      let alive = false;
      for (const p of parts) {
        if (n > p.life) continue;
        alive = true;
        p.vy += p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.992;
        p.rot += p.vr;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = p.color;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      }
      n++;
      if (alive && n < 170) rafNative(frame);
      else cv.remove();
    }
    rafNative(frame);
  }

  // ---------- 成绩接管 ----------
  let scoreImpl = window.mfhryScore;
  function wrappedScore(game, score) {
    const v = Math.round(Number(score) || 0);
    const key = String(game || slug);
    if (v) lastScore = v;
    if (isBetter(key, v)) {
      setBest(key, v);
      if (key === slug) refreshBest();
      sfx('win');
      buzz([18, 30, 40]);
      if (!celebrated) {
        celebrated = true;
        confetti();
        toastBest(v);
      }
    }
    try { if (typeof scoreImpl === 'function') return scoreImpl.apply(this, arguments); } catch (e) {}
  }
  try {
    Object.defineProperty(window, 'mfhryScore', {
      configurable: true,
      get() { return wrappedScore; },
      set(fn) { scoreImpl = fn; },
    });
  } catch (e) { window.mfhryScore = wrappedScore; }

  function refreshBest() {
    if (hudBestEl) hudBestEl.textContent = getBest(slug) || '—';
  }

  // 只记本机最佳，不联网（给自己直连 /api/score 的游戏用）
  function record(key, v) {
    if (!key) key = slug;
    const value = Math.round(Number(v) || 0);
    if (value) lastScore = value;
    if (isBetter(key, value)) {
      setBest(key, value);
      if (key === slug) refreshBest();
      if (!celebrated) {
        celebrated = true;
        confetti();
        toastBest(value);
      }
    }
    return value;
  }

  // ---------- 通用反馈 ----------
  let lastNotify = 0;
  function notify(kind) {
    const now = performance.now();
    if (now - lastNotify < 1200) return;
    lastNotify = now;
    if (kind === 'fail' || kind === 'gameover') {
      sfx('fail');
      buzz(35);
      document.body.classList.remove('mf-shake');
      void document.body.offsetWidth;
      document.body.classList.add('mf-shake');
      setTimeout(() => document.body.classList.remove('mf-shake'), 380);
    } else if (kind === 'win') {
      sfx('win');
      buzz([16, 24, 36]);
    }
  }

  function installFeedback() {
    // 点击任何按钮：轻响
    document.addEventListener('pointerdown', (e) => {
      if (window.__mfNoAutoSfx) return;
      const el = e.target.closest('button, a, [role="button"], .btn, .chip, input[type="button"]');
      if (!el || el.closest('.mf-hud, .mf-pause, .mf-pads')) return;
      sfx('click');
    }, true);

    // 分数 / 连击数字变化：叮
    let lastAt = 0;
    const scoreEls = () => [...document.querySelectorAll('[id*="score" i],[id*="combo" i],[class*="score" i],[data-score],[id*="金币"],[id*="得分"]')];
    const walker = new MutationObserver(() => {
      if (window.__mfNoAutoSfx || paused || document.hidden) return;
      const now = performance.now();
      if (now - lastAt < 110) return;
      lastAt = now;
      sfx('score');
    });
    const watch = () => {
      scoreEls().forEach((el) => {
        if (el.__mfWatched) return;
        el.__mfWatched = true;
        walker.observe(el, { childList: true, characterData: true, subtree: true });
      });
    };
    watch();
    new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });

    // 结束 / 胜利提示出现时给反馈（只看浮层，避免整页 innerText 触发布局）
    let lastText = '';
    setInterval(() => {
      if (window.__mfNoAutoSfx || paused || document.hidden) return;
      const nodes = document.querySelectorAll('.overlay, [class*="modal"], [role="dialog"]');
      let t = '';
      for (const n of nodes) {
        if (n.offsetParent === null) continue;
        t += (n.textContent || '') + '\n';
      }
      if (!t || t === lastText) return;
      lastText = t;
      if (/游戏结束|Game Over|GAME OVER|你输了|挑战失败|时间到/.test(t)) notify('fail');
    }, 1400);

    // R 键重开
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() !== 'r' || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (window.__mfNoRestart) return;
      e.preventDefault();
      restart();
    });
  }

  function installStyles() {
    const css = document.createElement('style');
    css.textContent = `
      .mf-hud{position:fixed;right:14px;bottom:14px;z-index:9998;display:flex;gap:6px;align-items:center;flex-wrap:wrap;
        justify-content:flex-end;max-width:calc(100vw - 20px);
        font:13px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
        touch-action:manipulation;user-select:none}
      .mf-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:34px;height:34px;
        padding:0 10px;border-radius:12px;cursor:pointer;color:#e9f3ef;text-decoration:none;font-size:14px;
        background:linear-gradient(165deg,rgba(28,36,42,.72),rgba(18,24,29,.72));
        border:1px solid rgba(255,255,255,.16);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 10px 24px rgba(0,0,0,.38);
        -webkit-backdrop-filter:blur(18px) saturate(170%);backdrop-filter:blur(18px) saturate(170%);
        transition:transform .12s,background .18s,box-shadow .18s;opacity:.92}
      .mf-btn:hover{background:linear-gradient(165deg,rgba(46,60,70,.86),rgba(28,38,46,.86));
        box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 14px 30px rgba(0,0,0,.45);opacity:1}
      .mf-btn:active{transform:scale(.94)}
      .mf-best{cursor:default;font-size:12px;color:#cfe9df}
      .mf-best b{font-weight:700;color:#8fe0c3;font-variant-numeric:tabular-nums}
      .mf-best:hover{background:linear-gradient(165deg,rgba(28,36,42,.72),rgba(18,24,29,.72));transform:none}
      @keyframes mfshake{0%,100%{transform:translate(0,0)}25%{transform:translate(-3px,2px)}55%{transform:translate(3px,-2px)}80%{transform:translate(-2px,1px)}}
      body.mf-shake{animation:mfshake .3s ease}
      body.mf-paused{overflow:hidden}
      .mf-pause{position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;
        background:rgba(5,8,10,.62);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);padding:24px}
      .mf-pause.on{display:flex}
      .mf-pause-card{width:min(90vw,360px);padding:26px 24px;border-radius:20px;text-align:center;color:#eaecef;
        background:linear-gradient(165deg,rgba(28,36,42,.94),rgba(15,20,24,.96));
        border:1px solid rgba(255,255,255,.16);box-shadow:0 30px 80px rgba(0,0,0,.55);
        font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
      .mf-pause-ico{font-size:34px;line-height:1;margin-bottom:10px}
      .mf-pause-card h2{font-size:22px;margin:0 0 8px}
      .mf-pause-card p{margin:0 0 18px;font-size:13px;color:#8b939c;line-height:1.6}
      .mf-pause-btns{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
      .mf-pause-btns button,.mf-pause-btns a{font:inherit;font-size:14px;padding:9px 18px;border-radius:12px;cursor:pointer;
        border:1px solid rgba(127,209,176,.5);background:rgba(127,209,176,.12);color:#eafff6;text-decoration:none}
      .mf-pause-btns button:first-child{background:#7fd1b0;color:#08221a;border-color:#7fd1b0;font-weight:700}
      .mf-pause-btns button:hover,.mf-pause-btns a:hover{filter:brightness(1.12)}
      .mf-pause-card small{display:block;margin-top:14px;font-size:11px;color:#5d6a74;letter-spacing:.04em}
      .mf-pads{position:fixed;inset:0;z-index:9997;pointer-events:none}
      .mf-dpad{position:fixed;left:calc(14px + env(safe-area-inset-left));bottom:calc(14px + env(safe-area-inset-bottom));
        display:grid;grid-template-columns:repeat(3,54px);grid-template-rows:repeat(3,54px);gap:4px;touch-action:none}
      .mf-key{pointer-events:auto;display:flex;align-items:center;justify-content:center;border-radius:14px;
        border:1px solid rgba(255,255,255,.18);background:rgba(22,30,36,.66);color:#dfe9e5;font-size:18px;
        -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:0 8px 20px rgba(0,0,0,.3);
        user-select:none;-webkit-user-select:none;touch-action:none}
      .mf-key.on{background:rgba(127,209,176,.4);border-color:rgba(127,209,176,.8);transform:scale(.95)}
      .mf-key.up{grid-area:1/2}.mf-key.left{grid-area:2/1}.mf-key.right{grid-area:2/3}.mf-key.down{grid-area:3/2}
      .mf-acts{position:fixed;right:calc(14px + env(safe-area-inset-right));bottom:calc(20px + env(safe-area-inset-bottom));
        display:flex;gap:12px;touch-action:none}
      .mf-key.act{width:66px;height:66px;border-radius:50%;font-size:13px;font-weight:700}
      body.mf-paused .mf-pads{display:none}
      .mf-toast{position:fixed;left:50%;top:22px;transform:translate(-50%,-14px);z-index:10001;
        padding:10px 20px;border-radius:999px;background:rgba(24,46,42,.95);border:1px solid rgba(127,209,176,.65);
        color:#eafff6;font:700 14px/1 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
        box-shadow:0 12px 32px rgba(0,0,0,.45);opacity:0;transition:opacity .3s,transform .3s;pointer-events:none}
      .mf-toast.on{opacity:1;transform:translate(-50%,0)}
      .mf-confetti{position:fixed;inset:0;z-index:9999;pointer-events:none;width:100vw;height:100vh}
      @media (max-width:520px){
        .mf-hud{right:8px;bottom:8px;gap:4px}
        .mf-btn{height:32px;min-width:32px;padding:0 8px;font-size:13px}
        .mf-best{font-size:11px}
        .mf-dpad{grid-template-columns:repeat(3,48px);grid-template-rows:repeat(3,48px);left:10px;bottom:calc(10px + env(safe-area-inset-bottom))}
        .mf-acts{right:10px;bottom:calc(16px + env(safe-area-inset-bottom))}
        .mf-key.act{width:58px;height:58px}
      }
    `;
    document.head.appendChild(css);
  }

  function boot() {
    installStyles();
    buildHud();
    buildPads();
    wrapScore();
    installFeedback();
    refreshBest();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.mfKit = {
    sfx,
    getBest,
    setBest,
    isBetter,
    restart,
    share: () => shareScore(),
    setScore: (v) => { lastScore = Number(v) || 0; },
    record,
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    togglePause,
    gameOver: () => notify('gameover'),
    win: () => notify('win'),
    vibrate: buzz,
    isTouch: coarse,
  };
})();