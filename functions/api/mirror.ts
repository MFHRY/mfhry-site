// osu 谱面包镜像：转发 + 边缘缓存 + Range 直通
// GET /api/mirror?id=<setId>           整包（首次会抓上游，之后走边缘缓存）
// GET /api/mirror?id=<setId>&r=0-1023  按字节段取（客户端分卷用）
const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,HEAD,OPTIONS',
  'access-control-allow-headers': 'range,content-type',
  'access-control-expose-headers': 'content-range,content-length,accept-ranges,x-mirror',
  'access-control-max-age': '86400',
};

const json = (data: any, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS, ...extra },
  });



export const onRequestOptions = async () => new Response(null, { status: 204, headers: CORS });

export const onRequestGet = async (ctx: any) => {
  const url = new URL(ctx.request.url);
  const id = (url.searchParams.get('id') || '').replace(/\D/g, '');
  if (!id) return json({ error: 'id required' }, 400);
  const r = url.searchParams.get('r') || ctx.request.headers.get('range') || '';
  const range = /^\d*-\d*$/.test(r) ? `bytes=${r}` : r.startsWith('bytes=') ? r : '';

  // 带 range 的分卷请求按段缓存；整包请求缓存整包
  const cache = caches.default;
  const key = new Request(`https://mirror.mfhry.internal/osz/${id}${range ? '#' + range : ''}`, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) {
    const h = new Headers(hit.headers);
    h.set('x-mirror', 'hit');
    for (const [k, v] of Object.entries(CORS)) h.set(k, v);
    return new Response(hit.body, { status: hit.status, headers: h });
  }

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const SOURCES = [
    { url: 'https://osu.direct/api/d/', referer: '' },
    { url: 'https://catboy.best/d/', referer: 'https://catboy.best/' },
  ];
  let upstream: Response | null = null;
  let used = '';
  outer: for (const src of SOURCES) {
    for (let i = 0; i < 2; i++) {
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 15000);
        try {
          const h: Record<string, string> = { 'user-agent': UA };
          if (src.referer) h.referer = src.referer;
          if (range) h.range = range;
          upstream = await fetch(src.url + id, { headers: h, redirect: 'follow', signal: ac.signal });
        } finally { clearTimeout(timer); }
        if (upstream.ok || upstream.status === 206) { used = src.url; break outer; }
        if (upstream.status === 404) break;           // 这个源没有，换下一个源
        if (upstream.status === 503 || upstream.status === 429) {
          await new Promise((res) => setTimeout(res, 400));
          continue;
        }
        break;
      } catch (e) { upstream = null; }
      await new Promise((res) => setTimeout(res, 400));
    }
  }

  if (!upstream || !(upstream.ok || upstream.status === 206)) {
    const st = upstream ? upstream.status : 599;
    return json({ error: 'upstream ' + st, hint: '镜像暂不可用，可稍后重试' }, 503);
  }

  const headers = new Headers();
  headers.set('content-type', 'application/octet-stream');
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'public, max-age=604800, immutable');
  headers.set('x-mirror', 'miss');
  headers.set('x-src', used.includes('catboy') ? 'catboy' : 'osu.direct');
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  const cr = upstream.headers.get('content-range');
  const cl = upstream.headers.get('content-length');
  if (cr) headers.set('content-range', cr);
  if (cl) headers.set('content-length', cl);

  const out = new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
  if (out.status === 200) ctx.waitUntil(cache.put(key, out.clone()).catch(() => {}));
  return out;
};
