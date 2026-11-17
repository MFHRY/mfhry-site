import { r2Bucket } from '../lib/r2';

// 管理员音乐文件上传：POST /api/music-upload?key=music/xxx.mp3
//   header: x-admin-key；body: 原始字节
//   → { ok, key, size }
const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const MAX_BYTES = 30 * 1024 * 1024;

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function validKey(key: string) {
  return (
    key.length > 6 &&
    key.length < 300 &&
    key.startsWith('music/') &&
    !key.includes('..') &&
    !key.includes('\\') &&
    !key.includes('?')
  );
}

export const onRequestPost = async ({ env, request }: any) => {
  if (!env.ADMIN_KEY || request.headers.get('x-admin-key') !== env.ADMIN_KEY) {
    return json({ error: '口令不对' }, 403);
  }
  const bucket = r2Bucket(env);
  if (!bucket) return json({ error: 'R2 未绑定' }, 503);

  const key = new URL(request.url).searchParams.get('key') || '';
  if (!validKey(key)) return json({ error: 'key 不合法（需 music/ 前缀）' }, 400);

  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return json({ error: '空文件' }, 400);
  if (buf.byteLength > MAX_BYTES) return json({ error: '文件过大（上限 30MB）' }, 413);

  const ext = (key.split('.').pop() || '').toLowerCase();
  try {
    await bucket.put(key, buf, {
      httpMetadata: {
        contentType: MIME[ext] || request.headers.get('content-type') || 'application/octet-stream',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
  } catch (e: any) {
    return json({ error: '写入失败：' + (e?.message || 'unknown') }, 502);
  }
  return json({ ok: true, key, size: buf.byteLength });
};
