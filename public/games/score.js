// 交成绩到 /api/score（Cloudflare Pages Functions + D1）。
// 失败一律静默：玩得爽比上榜重要。
(function () {
  const LAST_KEY = 'mfhry_last_game';
  let toastEl = null;
  let toastTimer = 0;

  function rememberGame(game) {
    try {
      localStorage.setItem(LAST_KEY, game);
    } catch (e) {
      /* 隐私模式下 localStorage 会抛，忽略 */
    }
  }

  function toast(html, href) {
    if (!toastEl) {
      const el = document.createElement('a');
      el.style.cssText =
        'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;' +
        'display:block;max-width:90vw;padding:10px 18px;border-radius:999px;' +
        'background:rgba(24,46,42,.94);border:1px solid rgba(127,209,176,.6);color:#eafff6;' +
        'font:14px/1.4 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;' +
        'text-decoration:none;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.4);opacity:0;transition:opacity .25s;pointer-events:none';
      document.body.appendChild(el);
      toastEl = el;
    }
    toastEl.innerHTML = html;
    toastEl.href = href || '#';
    toastEl.style.pointerEvents = href ? 'auto' : 'none';
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.style.opacity = '0';
    }, 4200);
  }

  window.mfhryScore = function (game, score) {
    const value = Math.round(Number(score));
    if (!game || !isFinite(value) || value <= 0) return;
    rememberGame(game);
    try {
      fetch('/api/score', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ game: game, score: value }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (!d || !d.ok) return;
          if (d.stored) {
            toast(
              (d.rank ? '上榜第 ' + d.rank + ' 名 🏆' : '成绩已记录 🏆') + ' · 点这里看榜单',
              '/leaderboard/#' + game
            );
          } else if (d.best) {
            toast('没超过自己的最高分 ' + d.best + ' · 点这里看榜单', '/leaderboard/#' + game);
          }
        })
        .catch(() => {});
    } catch (e) {
      /* 离线、被拦截、老浏览器都无所谓 */
    }
  };

  // 在每个游戏页面的「返回小游戏」旁边补一个排行榜入口
  function addLink() {
    const back = document.querySelector('a.back, a.back-link');
    if (!back || document.querySelector('a[data-lb]')) return;
    const a = document.createElement('a');
    a.href = '/leaderboard/';
    a.setAttribute('data-lb', '1');
    a.className = back.className;
    a.textContent = '🏆 排行榜';
    a.style.marginLeft = '10px';
    back.parentNode.insertBefore(a, back.nextSibling);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addLink);
  else addLink();
})();
