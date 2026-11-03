// 小游戏通用打磨包：毛玻璃 HUD（返回 / 音效 / 重开 / 最佳成绩）+ 合成音效 + 通用反馈
// 用法：在游戏页 </body> 前加 <script src="/games/kit.js"></script>
(function () {
  if (window.__mfKit) return;
  window.__mfKit = true;

  const LS_SFX = 'mfhry_sfx';
  let muted = false;
  try { muted = localStorage.getItem(LS_SFX) === '0'; } catch (e) {}

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
  };
  function sfx(name) {
    if (muted) return;
    const f = SFX[name];
    if (f) { try { f(); } catch (e) {} }
  }

  // ---------- 最佳成绩 ----------
  const BEST_PREFIX = 'mfhry_best_';
  function getBest(key) {
    try { return +(localStorage.getItem(BEST_PREFIX + key) || 0); } catch (e) { return 0; }
  }
  function setBest(key, v) {
    try { localStorage.setItem(BEST_PREFIX + key, String(v)); } catch (e) {}
  }

  const path = location.pathname.split('/').filter(Boolean);
  let slug = path[1] || 'arcade';
  if (slug === 'rhythm') slug = 'rhythm';

  // ---------- HUD ----------
  function buildHud() {
    const wrap = document.createElement('div');
    wrap.className = 'mf-hud';
    wrap.innerHTML =
      '<a class="mf-btn" href="/games/" title="返回小游戏列表" aria-label="返回">←</a>' +
      '<button class="mf-btn" data-act="sfx" title="音效开关" aria-label="音效">' + (muted ? '🔇' : '🔊') + '</button>' +
      '<button class="mf-btn" data-act="restart" title="重开（R）" aria-label="重开">⟲</button>' +
      '<a class="mf-btn" data-act="board" title="排行榜" aria-label="排行榜" href="/leaderboard/#' + encodeURIComponent(slug) + '">榜</a>' +
      '<span class="mf-btn mf-best" title="本机最佳成绩">🏆 <b>' + (getBest(slug) || '—') + '</b></span>' +
      '<button class="mf-btn" data-act="share" title="分享成绩图" aria-label="分享">⤴</button>';
    document.body.appendChild(wrap);
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
      } else if (act === 'restart') {
        sfx('click');
        restart();
      } else if (act === 'share') {
        sfx('click');
        shareScore();
      }
    });
    return wrap;
  }

  function restart() {
    const cands = [...document.querySelectorAll('button, a, [role="button"], .btn, .button, span')];
    const hit = cands.find((el) => {
      if (el.closest('.mf-hud')) return false;
      if (el.offsetParent === null) return false;
      const t = (el.textContent || '').trim();
      return /^(重开|重新开始|再来一局|再玩一次|再来|restart|play again|new game)$/i.test(t);
    });
    if (hit) { hit.click(); return; }
    if (typeof window.mfRestart === 'function') { window.mfRestart(); return; }
    location.reload();
  }

  // 自动避开页面已有按钮：右下 → 左下 → 右上 → 左上
  function collides(wrap) {
    const r = wrap.getBoundingClientRect();
    const pad = 4;
    for (const el of document.querySelectorAll('button, a, .btn, [role="button"], input')) {
      if (el.closest('.mf-hud')) continue;
      if (!el.offsetParent && el.tagName !== 'CANVAS') continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if (!(b.right < r.left - pad || b.left > r.right + pad || b.bottom < r.top - pad || b.top > r.bottom + pad)) return true;
    }
    return false;
  }
  function placeHud(wrap) {
    const pos = [
      ['right:14px;bottom:14px', 'right'],
      ['left:14px;bottom:14px', 'left'],
      ['right:14px;top:14px', 'right'],
      ['left:14px;top:14px', 'left'],
    ];
    wrap.style.right = wrap.style.bottom = wrap.style.left = wrap.style.top = '';
    for (const [css] of pos) {
      wrap.style.cssText = '';
      const m = /(right|left):14px;(top|bottom):14px/.exec(css);
      wrap.style[m[1]] = '14px';
      wrap.style[m[2]] = '14px';
      if (!collides(wrap)) return;
    }
    wrap.style.left = wrap.style.top = '';
    wrap.style.right = '14px';
    wrap.style.bottom = '14px';
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
    g.fillText('本次得分', 540, 830);

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

  function refreshBest() {
    const b = document.querySelector('.mf-best b');
    if (b) b.textContent = getBest(slug) || '—';
  }

  // 接管成绩提交：记最佳 + 反馈
  function wrapScore() {
    const orig = window.mfhryScore;
    window.mfhryScore = function (game, score) {
      const v = Math.round(Number(score) || 0);
      const key = game || slug;
      if (v) lastScore = v;
      if (v > getBest(key)) {
        setBest(key, v);
        if (key === slug) refreshBest();
        sfx('win');
      }
      try { if (orig) return orig.apply(this, arguments); } catch (e) {}
    };
  }

  // ---------- 通用反馈 ----------
  function installFeedback() {
    // 点击任何按钮：轻响
    document.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('button, a, [role="button"], .btn, .chip, input[type="button"]');
      if (!el || el.closest('.mf-hud')) return;
      sfx('click');
    }, true);

    // 分数 / 连击数字变化：叮
    let lastAt = 0;
    const scoreEls = () => [...document.querySelectorAll('[id*="score" i],[id*="combo" i],[class*="score" i],[id*="金币"],[id*="得分"]')];
    const walker = new MutationObserver(() => {
      const now = performance.now();
      if (now - lastAt < 90) return;
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

    // 结束 / 胜利提示出现时给反馈
    let lastText = '';
    let lastFailAt = 0;
    setInterval(() => {
      const t = (document.body && document.body.innerText || '').slice(-4000);
      if (t === lastText) return;
      lastText = t;
      const now = performance.now();
      if (/游戏结束|Game Over|GAME OVER|你输了|挑战失败/.test(t) && now - lastFailAt > 1500) {
        lastFailAt = now;
        sfx('fail');
        document.body.classList.remove('mf-shake');
        void document.body.offsetWidth;
        document.body.classList.add('mf-shake');
      }
    }, 600);

    // R 键重开
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (window.__mfNoRestart) return;
        restart();
      }
    });
  }

  function installStyles() {
    const css = document.createElement('style');
    css.textContent = `
      .mf-hud{position:fixed;right:14px;bottom:14px;z-index:9998;display:flex;gap:6px;align-items:center;
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
      @media (max-width:520px){.mf-hud{right:8px;bottom:8px;gap:4px}.mf-btn{height:32px;min-width:32px;padding:0 8px;font-size:13px}}
    `;
    document.head.appendChild(css);
  }

  function boot() {
    installStyles();
    buildHud();
    wrapScore();
    installFeedback();
    refreshBest();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.mfKit = { sfx, getBest, setBest, restart, share: () => shareScore(), setScore: (v) => { lastScore = Number(v) || 0; } };
})();
