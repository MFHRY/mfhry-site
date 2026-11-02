// 补抓推文配图：GET /api/xbackfill?key=ADMIN&post=23（不传 post 则处理所有缺图的）
import { fetchTweet } from '../lib/tweet';

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const onRequestGet = async (ctx: any) => {
  const { env, request } = ctx;
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return json({ error: '无权操作' }, 403);

  const only = Number(url.searchParams.get('post') || 0);

  const rows = await env.DB.prepare(
    only
      ? 'SELECT id, x FROM posts WHERE id = ? AND x IS NOT NULL'
      : "SELECT id, x FROM posts WHERE x IS NOT NULL AND (x NOT LIKE '%\"images\":[%' OR x LIKE '%\"images\":[]%')"
  )
    .bind(...(only ? [only] : []))
    .all();

  const result: any[] = [];
  for (const row of rows.results as any[]) {
    let x: any;
    try {
      x = JSON.parse(row.x);
    } catch {
      continue;
    }
    if (!x?.url) continue;
    if (only && x.images && x.images.length) {
      result.push({ id: row.id, skipped: '已有图片' });
      continue;
    }

    const t = await fetchTweet(x.url);
    const photos = t.photos || [];
    if (!photos.length) {
      result.push({ id: row.id, photos: 0 });
      continue;
    }

    const ids: number[] = [];
    for (const ph of photos) {
      const mir = await env.DB.prepare(
        "INSERT INTO media (post_id, mime, size, data, kind) VALUES (?, ?, ?, ?, 'x')"
      )
        .bind(row.id, ph.mime, ph.size, ph.b64)
        .run();
      ids.push(mir.meta.last_row_id as number);
    }

    x.images = [...(x.images || []), ...ids];
    x.text = x.text || t.text || '';
    x.author = x.author || t.author || '';
    x.handle = x.handle || t.handle || '';
    await env.DB.prepare('UPDATE posts SET x = ? WHERE id = ?').bind(JSON.stringify(x), row.id).run();
    result.push({ id: row.id, photos: ids.length, ids });
  }

  return json({ ok: true, result });
};
