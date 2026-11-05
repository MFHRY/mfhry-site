import { r2Bucket } from '../lib/r2';

// 留言墙视频上传：POST /api/wall-video?name=xxx（原始字节，匿名）
// 只进 R2，不写 D1；按 IP 哈希分目录，利用 R2 list 做频率/容量限制。
const MAX = 50 * 1024 * 1024;
const PER_HOUR = 5;
const PER_DAY = 300 * 1024 * 1024;
const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const EXT: Record<string, string> = {
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'video/x-m4v': '.m4v', 'video/ogg': '.ogv', 'video/x-matroska': '.mkv',
};
function extFor(name: string, mime: string) {
  const m = /\.(mp4|webm|mov|m4v|ogv|ogg|mkv)$/i.exec(name || '');
  if (m) return '.' + m[1].toLowerCase();
  return EXT[mime] || '.mp4';
}
const ipOf = (req: Request) => req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || 'unknown';

async function hashIp(env: any, ip: string) {
  const salt = String(env.ADMIN_KEY || 'mfhry-wall');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '\n' + ip));
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function prefixFor(hash: string) {
  return 'wall/u/' + hash + '/';
}

export const onRequestPost = async (ctx: any) => {
  const { env, request } = ctx;
  const bucket = r2Bucket(env);
  if (!bucket) return json({ error: 'R2 未绑定' }, 503);

  const url = new URL(request.url);
  const mime = String(request.headers.get('content-type') || 'video/mp4').split(';')[0].toLowerCase();
  if (!mime.startsWith('video/')) return json({ error: '只能上传视频' }, 415);
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX) return json({ error: '墙上视频最多 50MB' }, 413);

  const hash = await hashIp(env, ipOf(request));
  const prefix = prefixFor(hash);
  let recent: any[] = [];
  try {
    const list = await bucket.list({ prefix, limit: 100 });
    recent = list.objects || [];
  } catch {
    return json({ error: '存储暂时不可用' }, 503);
  }
  const now = Date.now(), hourAgo = now - 3600 * 1000, dayAgo = now - 24 * 3600 * 1000;
  let hourCount = 0, dayBytes = 0;
  for (const o of recent) {
    const t = o.uploaded ? new Date(o.uploaded).getTime() : 0;
    if (t > hourAgo) hourCount++;
    if (t > dayAgo) dayBytes += Number(o.size || 0);
  }
  if (hourCount >= PER_HOUR) return json({ error: '视频上传太频繁，歇一会儿' }, 429);
  if (declared && dayBytes + declared > PER_DAY) return json({ error: '今天上传的视频总量到上限了' }, 429);

  const key = prefix + String(9_999_999_999_999 - now).padStart(13, '0') + '-' +
    crypto.randomUUID() + extFor(url.searchParams.get('name') || '', mime);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch (e) {
    return json({ error: '读取文件失败' }, 400);
  }
  let size = bytes.byteLength;
  if (size > MAX) return json({ error: '墙上视频最多 50MB' }, 413);

  try {
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: mime, cacheControl: 'public, max-age=31536000, immutable' },
    });
  } catch (e: any) {
    try { await bucket.delete(key); } catch {}
    return json({ error: '上传失败', detail: String(e && e.message || e) }, 500);
  }
  if (!size) {
    try { await bucket.delete(key); } catch {}
    return json({ error: '文件是空的' }, 400);
  }
  if (size > MAX || dayBytes + size > PER_DAY) {
    try { await bucket.delete(key); } catch {}
    return json({ error: size > MAX ? '墙上视频最多 50MB' : '今天上传的视频总量到上限了' }, 413);
  }

  return json({ ok: true, key, url: '/api/r2?key=' + encodeURIComponent(key), size });
};

export const onRequestDelete = async (ctx: any) => {
  const { env, request } = ctx;
  const bucket = r2Bucket(env);
  if (!bucket) return json({ error: 'R2 未绑定' }, 503);
  const key = new URL(request.url).searchParams.get('key') || '';
  const hash = await hashIp(env, ipOf(request));
  if (!key.startsWith(prefixFor(hash)) || key.includes('..')) return json({ error: 'key 不对' }, 400);
  await bucket.delete(key);
  return json({ ok: true });
};
