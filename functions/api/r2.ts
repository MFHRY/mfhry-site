// R2 视频流代理：GET/HEAD /api/r2?key=wall/... 或 videos/...
// 不要求桶公开；Range 直接交给 R2，视频可拖动进度。
const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

function validKey(key: string) {
  return key.length > 5 && key.length < 300 &&
    (key.startsWith('wall/') || key.startsWith('videos/')) &&
    !key.includes('..') && !key.includes('\\');
}

function baseHeaders(obj: any) {
  return {
    'content-type': obj?.httpMetadata?.contentType || 'video/mp4',
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  } as Record<string, string>;
}

export const onRequestGet = async (ctx: any) => {
  const { env, request } = ctx;
  if (!env.R2) return json({ error: 'R2 未绑定' }, 503);
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  if (!validKey(key)) return new Response('not found', { status: 404 });

  let obj: any;
  try {
    obj = await env.R2.get(key, request.headers.get('range') ? { range: request.headers } : undefined);
  } catch (e: any) {
    return new Response('bad range', { status: 416 });
  }
  if (!obj) return new Response('not found', { status: 404 });

  const headers = baseHeaders(obj);
  const r = obj.range;
  if (r && typeof r.offset === 'number' && typeof r.length === 'number') {
    const start = r.offset;
    const end = r.offset + r.length - 1;
    headers['content-range'] = `bytes ${start}-${end}/${obj.size}`;
    headers['content-length'] = String(r.length);
    return new Response(obj.body, { status: 206, headers });
  }
  headers['content-length'] = String(obj.size);
  return new Response(obj.body, { status: 200, headers });
};

export const onRequestHead = async (ctx: any) => {
  const { env, request } = ctx;
  if (!env.R2) return json({ error: 'R2 未绑定' }, 503);
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!validKey(key)) return new Response('not found', { status: 404 });
  const obj = await env.R2.head(key);
  if (!obj) return new Response('not found', { status: 404 });
  const headers = baseHeaders(obj);
  headers['content-length'] = String(obj.size);
  return new Response(null, { status: 200, headers });
};
