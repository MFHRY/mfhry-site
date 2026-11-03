// 静态页（/music/、/games/** 等不在 Astro 里渲染的页面）用的错误上报
// Astro 页面已经在 Base.astro 里内联了同样的逻辑，两边都写 D1 client_errors
(function () {
  if (window.__mfErrlog) return;
  window.__mfErrlog = true;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;

  var sent = 0;
  function send(d) {
    if (sent++ > 8) return;
    try {
      d.page = location.pathname + location.search;
      d.ua = navigator.userAgent;
      var body = JSON.stringify(d);
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/log', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/log', { method: 'POST', body: body, headers: { 'content-type': 'application/json' }, keepalive: true });
      }
    } catch (e) {}
  }
  window.mfhryLog = send;

  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && t.tagName && !/^(SCRIPT|IMG|LINK|VIDEO|AUDIO|SOURCE)$/.test(t.tagName)) return;
    send({
      kind: 'error',
      msg: e.message || ('resource: ' + ((t && (t.src || t.href)) || '')),
      src: e.filename || '',
      line: e.lineno || 0,
      col: e.colno || 0,
      stack: (e.error && e.error.stack) || '',
    });
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    var r = (e && e.reason) || {};
    send({ kind: 'reject', msg: String(r.message || r), stack: String(r.stack || '') });
  });
})();
