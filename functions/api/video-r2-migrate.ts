import { r2Bucket } from '../lib/r2';

// 把旧 D1 切片视频迁到 R2：POST /api/video-r2-migrate { key, id }
// 成功后更新 videos.url，并删除 D1 切片，释放 D1 空间。
const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const EXT: Record<string, string> = {
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'video/x-m4v': '.m4v', 'video/ogg': '.ogv', 'video/x-matroska': '.mkv',
};
function toBytes(value: any): Uint8Array {
  if (!value) return new Uint8Array(0);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (value.type === 'Buffer' && Array.isArray(value.data)) return Uint8Array.from(value.data);
  return new Uint8Array(0);
}

export const onRequestPost = async (ctx: any) => {
  const { env, request } = ctx;
  const bucket = r2Bucket(env);
  if (!bucket) return json({ error: 'R2 未绑定' }, 503);
  let p: any;
  try { p = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }
  const key = String(p?.key || '');
  if (!env.ADMIN_KEY || (key !== env.ADMIN_KEY && request.headers.get('x-admin-key') !== env.ADMIN_KEY)) {
    return json({ error: '口令不对' }, 403);
  }
  const id = Number(p?.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'id 不对' }, 400);

  const row: any = await env.DB.prepare('SELECT id, url FROM videos WHERE id = ?').bind(id).first();
  if (!row) return json({ error: '没有这条视频' }, 404);
  const m = /^\/api\/video-stream\/([0-9a-f-]{20,40})$/i.exec(String(row.url || ''));
  if (!m) return json({ ok: true, skipped: true, url: row.url });

  const sid = m[1];
  const meta: any = await env.DB.prepare(
    'SELECT size, mime, chunk_size, chunks FROM video_uploads WHERE id = ?',
  ).bind(sid).first();
  if (!meta) return json({ error: '找不到原视频信息' }, 404);

  const rows: any = await env.DB.prepare(
    'SELECT idx, data FROM video_chunks WHERE upload_id = ? ORDER BY idx ASC',
  ).bind(sid).all();
  const list = rows.results || [];
  if (list.length !== Number(meta.chunks)) return json({ error: 'D1 切片不完整，迁不了' }, 400);

  const total = Number(meta.size);
  const out = new Uint8Array(total);
  const chunkSize = Number(meta.chunk_size) || 1_500_000;
  for (const item of list) {
    const bytes = toBytes(item.data);
    const off = Number(item.idx) * chunkSize;
    if (off < total) out.set(bytes.subarray(0, Math.min(bytes.length, total - off)), off);
  }

  const mime = String(meta.mime || 'video/mp4');
  const r2key = 'videos/' + sid + (EXT[mime] || '.mp4');
  await bucket.put(r2key, out, {
    httpMetadata: { contentType: mime, cacheControl: 'public, max-age=31536000, immutable' },
  });
  const url = '/api/r2?key=' + encodeURIComponent(r2key);
  await env.DB.prepare('UPDATE videos SET url = ? WHERE id = ?').bind(url, id).run();

  try {
    await env.DB.prepare('DELETE FROM video_chunks WHERE upload_id = ?').bind(sid).run();
    await env.DB.prepare('DELETE FROM video_uploads WHERE id = ?').bind(sid).run();
  } catch (e) {}

  return json({ ok: true, url, bytes: total });
};
