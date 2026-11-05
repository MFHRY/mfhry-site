// 匿名墙 API：GET 列表 / POST 发布（多图 + 视频链接 + IP 归属地 + X 链接）
import { fetchTweet, tweetId } from '../lib/tweet';

// 老数据里用账号发的帖子显示「昵称 > 登录名」
const displayName = (u: any) => u?.name || u?.login || '匿名';

const MAX_BODY = 500;
const MAX_IMAGE = 380 * 1024;
const MAX_IMAGES = 9;
const PER_HOUR = 5;

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const ipOf = (req: Request) => req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || 'unknown';
const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

async function list(ctx: any) {
  const { env, request } = ctx;
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 30, 1), 50);

  const rows = await env.DB.prepare(
    `SELECT p.id, p.body, p.nickname, p.images, p.video, p.x, p.ip, p.country, p.region, p.city, p.created_at,
            u.id AS u_id, u.login AS u_login, u.name AS u_name, u.avatar AS u_avatar,
            u.provider AS u_provider, u.gh_id AS u_gh, u.email_verified AS u_verified
       FROM posts p LEFT JOIN users u ON u.id = p.user_id
      ORDER BY p.id DESC LIMIT ?`
  )
    .bind(limit)
    .all();

  return json({
    posts: rows.results.map((p: any) => ({
      id: p.id,
      body: p.body,
      nickname: p.nickname || null,
      user: p.u_id
        ? {
            provider: p.u_provider || 'github',
            login: p.u_login,
            name: p.u_name || null,
            avatar: p.u_avatar || null,
            display: displayName({ provider: p.u_provider, login: p.u_login, name: p.u_name }),
            verified: p.u_provider === 'github' || Number(p.u_verified) === 1,
          }
        : null,
      created_at: p.created_at,
      images: JSON.parse(p.images || '[]'),
      video: p.video || null,
      x: p.x ? JSON.parse(p.x) : null,
      ip: p.ip || '',
      country: p.country || null,
      region: p.region || null,
      city: p.city || null,
    })),
  });
}

async function create(ctx: any) {
  const { env, request } = ctx;
  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const body = String(p?.body ?? '').trim();
  const video = String(p?.video ?? '').trim();
  const xUrl = String(p?.x ?? '').trim();
  const imgs: string[] = Array.isArray(p?.images) ? p.images.slice(0, MAX_IMAGES) : [];

  if (!body && !imgs.length && !video && !xUrl) return json({ error: '写点什么吧' }, 400);
  const nickname = String(p?.nickname ?? '').replace(/[<>]/g, '').trim().slice(0, 20);
  if (body.length > MAX_BODY) return json({ error: `最多 ${MAX_BODY} 字` }, 400);
  const ownVideo = /^\/api\/r2\?key=wall(?:%2F|\/)/i.test(video);
  if (video.length > 500 || (video && !/^https?:\/\//i.test(video) && !ownVideo)) return json({ error: '视频链接不对' }, 400);
  if (xUrl && !tweetId(xUrl)) return json({ error: 'X 链接格式不对' }, 400);

  for (const img of imgs) {
    const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(String(img));
    if (!m) return json({ error: '图片格式不对' }, 400);
    if (Math.floor((m[2].length * 3) / 4) > MAX_IMAGE) return json({ error: '图片太大了' }, 400);
  }

  const ip = ipOf(request);
  const since = new Date(Date.now() - 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM posts WHERE ip = ? AND created_at > ?')
    .bind(ip, since)
    .first();
  if (cnt && cnt.c >= PER_HOUR) return json({ error: `每小时最多发 ${PER_HOUR} 条` }, 429);

  const cf: any = (request as any).cf || {};

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
    'INSERT INTO posts (body, nickname, ip, images, video, x, country, region, city, asn, colo, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(
      body,
      nickname || null,
      ip,
      '[]',
      video || null,
      xStore ? JSON.stringify(xStore) : null,
      cf.country || null,
      cf.region || null,
      cf.city || null,
      cf.asn || null,
      cf.colo || null,
      null,
      nowSql()
    )
    .run();
  const postId = ins.meta.last_row_id as number;

  const ids: number[] = [];
  for (const img of imgs) {
    const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(String(img))!;
    const size = Math.floor((m[2].length * 3) / 4);
    const mir = await env.DB.prepare(
      "INSERT INTO media (post_id, mime, size, data, kind) VALUES (?, ?, ?, ?, 'wall')"
    )
      .bind(postId, m[1], size, m[2])
      .run();
    ids.push(mir.meta.last_row_id as number);
  }
  await env.DB.prepare('UPDATE posts SET images = ? WHERE id = ?').bind(JSON.stringify(ids), postId).run();

  if (xStore && xPhotos.length) {
    const xIds: number[] = [];
    for (const ph of xPhotos) {
      const mir = await env.DB.prepare(
        "INSERT INTO media (post_id, mime, size, data, kind) VALUES (?, ?, ?, ?, 'x')"
      )
        .bind(postId, ph.mime, ph.size, ph.b64)
        .run();
      xIds.push(mir.meta.last_row_id as number);
    }
    xStore.images = xIds;
    await env.DB.prepare('UPDATE posts SET x = ? WHERE id = ?').bind(JSON.stringify(xStore), postId).run();
  }

  return json({ ok: true, id: postId, images: ids.length, x: xStore });
}

async function delVideo(ctx: any) {
  const { env, request } = ctx;
  const url = new URL(request.url);
  const idStr = url.searchParams.get('id') || '';
  const keyHeader = request.headers.get('x-admin-key') || url.searchParams.get('key') || '';
  if (!env.ADMIN_KEY || keyHeader !== env.ADMIN_KEY) return json({ error: '无权删除' }, 403);
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'id 不对' }, 400);
  const row = await env.DB.prepare('SELECT video FROM posts WHERE id = ?').bind(id).first();
  if (!row) return json({ error: '没有这条' }, 404);
  if (!row.video) return json({ error: '没有视频' }, 400);
  await env.DB.prepare('UPDATE posts SET video = NULL WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

export const onRequestGet = (ctx: any) => list(ctx);
export const onRequestPost = (ctx: any) => create(ctx);
export const onRequestDelete = (ctx: any) => delVideo(ctx);
