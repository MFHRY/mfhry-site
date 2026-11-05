import { r2Bucket } from '../lib/r2';

// 视频页 R2 上传：POST /api/r2-upload?name=xxx（原始文件字节，x-admin-key）
// 返回 { key, url }，再由 /api/videos 写入标题/封面。
const MAX = 80 * 1024 * 1024;
const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const isAdmin = (env: any, request: Request) =>
  !!env.ADMIN_KEY && request.headers.get('x-admin-key') === env.ADMIN_KEY;

const EXT: Record<string, string> = {
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'video/x-m4v': '.m4v', 'video/ogg': '.ogv', 'video/x-matroska': '.mkv',
};
function extFor(name: string, mime: string) {
  const m = /\.(mp4|webm|mov|m4v|ogv|ogg|mkv)$/i.exec(name || '');
  if (m) return '.' + m[1].toLowerCase();
  return EXT[mime] || '.mp4';
}

export const onRequestPost = async (ctx: any) => {
  const { env, request } = ctx;
  const bucket = r2Bucket(env);
  if (!bucket) return json({ error: 'R2 未绑定' }, 503);
  if (!isAdmin(env, request)) return json({ error: '口令不对' }, 403);

  const url = new URL(request.url);
  const mime = String(request.headers.get('content-type') || 'video/mp4').split(';')[0].toLowerCase();
  if (!mime.startsWith('video/')) return json({ error: '只能上传视频' }, 415);
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX) return json({ error: '单条视频最多 80MB' }, 413);
  if (!request.body) return json({ error: '没有文件内容' }, 400);

  const key = 'videos/' + crypto.randomUUID() + extFor(url.searchParams.get('name') || '', mime);
  let size = 0;
  const limited = request.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > MAX) controller.error(new Error('too large'));
      else controller.enqueue(chunk);
    },
  }));

  try {
    await bucket.put(key, limited, {
      httpMetadata: { contentType: mime, cacheControl: 'public, max-age=31536000, immutable' },
    });
  } catch (e: any) {
    try { await bucket.delete(key); } catch {}
    return json({ error: size > MAX ? '单条视频最多 80MB' : 'R2 上传失败' }, size > MAX ? 413 : 500);
  }
  if (!size) {
    try { await bucket.delete(key); } catch {}
    return json({ error: '文件是空的' }, 400);
  }

  return json({ ok: true, key, url: '/api/r2?key=' + encodeURIComponent(key), size });
};

export const onRequestDelete = async (ctx: any) => {
  const { env, request } = ctx;
  const bucket = r2Bucket(env);
  if (!bucket) return json({ error: 'R2 未绑定' }, 503);
  if (!isAdmin(env, request)) return json({ error: '口令不对' }, 403);
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!key.startsWith('videos/') || key.includes('..')) return json({ error: 'key 不对' }, 400);
  await bucket.delete(key);
  return json({ ok: true });
};
