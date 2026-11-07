import { r2Bucket } from '../lib/r2';

// 文件库：GET /api/files 列出 files/ 下的对象（公开），供 /files 页展示与下载分享。
// 上传/删除走 /api/r2-mp（管理员，需要 x-admin-key）。列表不需要口令，只暴露文件名/大小/时间。

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const onRequestGet = async (ctx: any) => {
  const { env } = ctx;
  const bucket = r2Bucket(env);
  if (!bucket) return json({ error: 'R2 未绑定' }, 503);

  let objects: any[] = [];
  let cursor: string | undefined;
  try {
    do {
      const page: any = await bucket.list({ prefix: 'files/', limit: 1000, cursor });
      objects = objects.concat(page.objects || []);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  } catch (e: any) {
    return json({ error: '列取失败', detail: String(e && e.message || e) }, 500);
  }

  const items = objects
    .map((o) => ({
      key: o.key,
      name: (o.key || '').replace(/^files\//, ''),
      size: Number(o.size || 0),
      uploaded: o.uploaded ? new Date(o.uploaded).toISOString() : null,
      type: (o as any).httpMetadata?.contentType || 'application/octet-stream',
      url: '/api/r2?key=' + encodeURIComponent(o.key),
    }))
    .sort((a: any, b: any) => String(b.uploaded || '').localeCompare(String(a.uploaded || '')));

  return json({ ok: true, count: items.length, items });
};
