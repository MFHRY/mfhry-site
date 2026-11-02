// 新闻 API：GET 公开列表 / POST 仅管理员（x-admin-key）
import { fetchTweet, tweetId } from '../lib/tweet';

const MAX_TITLE = 100;
const MAX_BODY = 5000;
const MAX_IMAGE = 400 * 1024;
const MAX_IMAGES = 9;

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

function isAdmin(env: any, req: Request, body?: any) {
  const h = req.headers.get('x-admin-key') || '';
  const k = body?.key || '';
  return !!env.ADMIN_KEY && (h === env.ADMIN_KEY || k === env.ADMIN_KEY);
}

async function list(ctx: any) {
  const { env } = ctx;
  const rows = await env.DB.prepare(
    'SELECT id, title, body, image_id, images, video, x, created_at FROM news ORDER BY id DESC LIMIT 50'
  ).all();

  const news = rows.results.map((r: any) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    created_at: r.created_at,
    images: JSON.parse(r.images || '[]'),
    video: r.video || null,
    x: r.x ? JSON.parse(r.x) : null,
  }));
  return json({ news });
}

async function create(ctx: any) {
  const { env, request } = ctx;
  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }
  if (!isAdmin(env, request, p)) return json({ error: '口令不对' }, 403);

  const title = String(p?.title ?? '').trim();
  const body = String(p?.body ?? '').trim();
  const video = String(p?.video ?? '').trim();
  const xUrl = String(p?.x ?? '').trim();

  if (!title) return json({ error: '标题不能为空' }, 400);
  if (title.length > MAX_TITLE) return json({ error: `标题最多 ${MAX_TITLE} 字` }, 400);
  if (body.length > MAX_BODY) return json({ error: `正文最多 ${MAX_BODY} 字` }, 400);
  if (video.length > 300 || (video && !/^https?:\/\//i.test(video))) return json({ error: '视频链接不对' }, 400);
  if (xUrl && !tweetId(xUrl)) return json({ error: 'X 链接格式不对' }, 400);

  const imgs: string[] = Array.isArray(p?.images) ? p.images.slice(0, MAX_IMAGES) : [];
  for (const img of imgs) {
    const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(String(img));
    if (!m) return json({ error: '图片格式不对' }, 400);
    if (Math.floor((m[2].length * 3) / 4) > MAX_IMAGE) return json({ error: '有一张图太大了' }, 400);
  }

  let xStore: any = null;
  let xPhotos: any[] = [];
  if (xUrl) {
    const t = await fetchTweet(xUrl);
    xPhotos = t.photos || [];
    xStore = {
      url: t.url,
      id: t.id || null,
      author: t.author || '',
      handle: t.handle || '',
      text: t.text || '',
      date: t.date || '',
      error: t.error || null,
      images: [],
    };
  }

  const ins = await env.DB.prepare(
    'INSERT INTO news (title, body, images, video, x, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(title, body, '[]', video || null, xStore ? JSON.stringify(xStore) : null, nowSql())
    .run();
  const newsId = ins.meta.last_row_id as number;

  const ids: number[] = [];
  for (const img of imgs) {
    const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(String(img))!;
    const size = Math.floor((m[2].length * 3) / 4);
    const mir = await env.DB.prepare(
      "INSERT INTO media (post_id, mime, size, data, kind, news_id) VALUES (0, ?, ?, ?, 'news', ?)"
    )
      .bind(m[1], size, m[2], newsId)
      .run();
    ids.push(mir.meta.last_row_id as number);
  }
  await env.DB.prepare('UPDATE news SET images = ? WHERE id = ?').bind(JSON.stringify(ids), newsId).run();

  if (xStore && xPhotos.length) {
    const xIds: number[] = [];
    for (const ph of xPhotos) {
      const mir = await env.DB.prepare(
        "INSERT INTO media (post_id, mime, size, data, kind, news_id) VALUES (0, ?, ?, ?, 'x', ?)"
      )
        .bind(ph.mime, ph.size, ph.b64, newsId)
        .run();
      xIds.push(mir.meta.last_row_id as number);
    }
    xStore.images = xIds;
    await env.DB.prepare('UPDATE news SET x = ? WHERE id = ?').bind(JSON.stringify(xStore), newsId).run();
  }

  return json({ ok: true, id: newsId, images: ids.length, x: xStore });
}

export const onRequestGet = (ctx: any) => list(ctx);
export const onRequestPost = (ctx: any) => create(ctx);
