// 投稿箱 API：短文/想法 + X 帖子卡片 + 站内评论 + 转贴，全部直接公开。
// GET  /api/submit?limit=30                  → 时间线（投稿 + 转贴混排，倒序）
// GET  /api/submit?action=like&id=N          → 投稿点赞 +1
// GET  /api/submit?action=comments&id=N      → 某投稿的评论列表
// GET  /api/submit?action=repost&id=N        → 转贴 +1（body 可带 author）
// POST /api/submit   body {title,body,author,link,tag,x}  → 新建投稿（带 X 链接则抓推文）
// POST /api/submit?action=comment  body {id,author,body}   → 给投稿发评论
import { fetchTweet, tweetId } from '../lib/tweet';

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const MAX_BODY = 2000;
const MAX_TITLE = 80;
const MAX_AUTHOR = 24;
const MAX_LINK = 300;
const MAX_TAG = 16;
const MAX_COMMENT = 500;
const PER_HOUR = 3;
const COMMENT_PER_HOUR = 20;

const ipOf = (req: Request) => req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || 'unknown';
const sqlTime = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString().slice(0, 19).replace('T', ' ');
const cleanName = (s: unknown, fb = '匿名') => String(s || '').trim().slice(0, MAX_AUTHOR) || fb;

async function ensure(db: any) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT '匿名',
        link TEXT NOT NULL DEFAULT '',
        tag TEXT NOT NULL DEFAULT '',
        tweet TEXT NOT NULL DEFAULT '',
        ip TEXT,
        country TEXT,
        region TEXT,
        city TEXT,
        likes INTEGER NOT NULL DEFAULT 0,
        reposts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`
    )
    .run();
  // 老表补列（幂等：列已存在会报错，吞掉）
  for (const col of ['tweet TEXT NOT NULL DEFAULT \'\'', 'reposts INTEGER NOT NULL DEFAULT 0']) {
    try { await db.prepare(`ALTER TABLE submissions ADD COLUMN ${col}`).run(); } catch {}
  }
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS submit_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        author TEXT NOT NULL DEFAULT '匿名',
        body TEXT NOT NULL,
        ip TEXT,
        created_at TEXT NOT NULL
      )`
    )
    .run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_sc_post ON submit_comments (post_id, id)').run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS submit_reposts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        author TEXT NOT NULL DEFAULT '匿名',
        ip TEXT,
        created_at TEXT NOT NULL
      )`
    )
    .run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_sr_post ON submit_reposts (post_id, id)').run();
}

const commentCount = (db: any, ids: number[]) => {
  if (!ids.length) return Promise.resolve<Record<number, number>>({});
  const ph = ids.map(() => '?').join(',');
  return db
    .prepare(`SELECT post_id, COUNT(*) AS c FROM submit_comments WHERE post_id IN (${ph}) GROUP BY post_id`)
    .bind(...ids)
    .all()
    .then((r: any) => {
      const m: Record<number, number> = {};
      for (const row of r.results || []) m[row.post_id] = row.c;
      return m;
    });
};

export const onRequestGet = async ({ env, request }: { env: any; request: Request }) => {
  await ensure(env.DB);
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const id = Number(url.searchParams.get('id'));

  if (action === 'like') {
    if (!Number.isInteger(id) || id < 1) return json({ error: 'bad id' }, 400);
    await env.DB.prepare('UPDATE submissions SET likes = likes + 1 WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  if (action === 'repost') {
    if (!Number.isInteger(id) || id < 1) return json({ error: 'bad id' }, 400);
    const row: any = await env.DB.prepare('SELECT id FROM submissions WHERE id = ?').bind(id).first();
    if (!row) return json({ error: '没有这条投稿' }, 404);
    const author = cleanName(url.searchParams.get('author'));
    await env.DB.prepare('INSERT INTO submit_reposts (post_id, author, ip, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, author, ipOf(request), sqlTime())
      .run();
    await env.DB.prepare('UPDATE submissions SET reposts = reposts + 1 WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  if (action === 'comments') {
    if (!Number.isInteger(id) || id < 1) return json({ error: 'bad id' }, 400);
    const rows = await env.DB.prepare(
      'SELECT id, author, body, created_at FROM submit_comments WHERE post_id = ? ORDER BY id ASC LIMIT 200'
    )
      .bind(id)
      .all();
    return json({ ok: true, items: rows.results || [] });
  }

  // 时间线：投稿 + 转贴事件混排（按时间倒序）
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 30, 1), 50);
  const rows = await env.DB.prepare(
    'SELECT id, title, body, author, link, tag, tweet, likes, reposts, country, region, city, created_at FROM submissions ORDER BY id DESC LIMIT ?'
  )
    .bind(limit)
    .all();
  const items: any[] = rows.results || [];
  const cc = await commentCount(env.DB, items.map((i) => i.id));

  // 最近转贴事件（作为时间线里的「xx 转贴了 yy」条目）
  const reposts = await env.DB.prepare(
    `SELECT r.id, r.post_id, r.author AS reposter, r.created_at AS reposted_at,
            s.title, s.author AS post_author, s.body
       FROM submit_reposts r LEFT JOIN submissions s ON s.id = r.post_id
      ORDER BY r.id DESC LIMIT ?`
  )
    .bind(limit)
    .all();

  return json({
    ok: true,
    items: items.map((i) => ({
      ...i,
      tweet: i.tweet ? safeParse(i.tweet) : null,
      commentCount: cc[i.id] || 0,
    })),
    reposts: (reposts.results || []).map((r: any) => ({
      id: r.id,
      postId: r.post_id,
      reposter: r.reposter,
      at: r.reposted_at,
      postAuthor: r.post_author,
      title: r.title || '',
      body: String(r.body || '').slice(0, 120),
    })),
  });
};

function safeParse(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}

export const onRequestPost = async ({ env, request }: { env: any; request: Request }) => {
  await ensure(env.DB);
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const ip = ipOf(request);

  // 发评论
  if (action === 'comment') {
    const pid = Number(b?.id);
    const body = String(b?.body || '').trim().slice(0, MAX_COMMENT);
    if (!Number.isInteger(pid) || pid < 1) return json({ error: 'bad id' }, 400);
    if (!body) return json({ error: '评论不能为空' }, 400);
    const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM submit_comments WHERE ip = ? AND created_at > ?')
      .bind(ip, sqlTime(3600_000))
      .first();
    if ((cnt?.c || 0) >= COMMENT_PER_HOUR) return json({ error: '评论太频繁了' }, 429);
    const row: any = await env.DB.prepare('SELECT id FROM submissions WHERE id = ?').bind(pid).first();
    if (!row) return json({ error: '没有这条投稿' }, 404);
    const ins = await env.DB.prepare(
      'INSERT INTO submit_comments (post_id, author, body, ip, created_at) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(pid, cleanName(b?.author), body, ip, sqlTime())
      .run();
    return json({ ok: true, id: (ins.meta as any)?.last_row_id ?? null });
  }

  // 新建投稿
  const body = String(b?.body || '').trim().slice(0, MAX_BODY);
  const xUrl = String(b?.x || b?.link || '').trim().slice(0, MAX_LINK);
  const isTweet = !!tweetId(xUrl);
  if (!body && !isTweet) return json({ error: '内容不能为空（或贴一条 X 链接）' }, 400);

  const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM submissions WHERE ip = ? AND created_at > ?')
    .bind(ip, sqlTime(3600_000))
    .first();
  if ((cnt?.c || 0) >= PER_HOUR) return json({ error: '太频繁了，过一小时再投' }, 429);

  let tweetJson = '';
  if (isTweet) {
    try {
      const t = await fetchTweet(xUrl);
      tweetJson = JSON.stringify({
        url: t.url || xUrl,
        id: t.id || tweetId(xUrl),
        author: t.author || '',
        handle: t.handle || '',
        text: t.text || '',
        date: t.date || '',
        photos: (t.photos || []).map((p) => ({ mime: p.mime, b64: p.b64, size: p.size })),
        error: t.error || null,
      });
    } catch {
      tweetJson = JSON.stringify({ url: xUrl, id: tweetId(xUrl), error: '抓取失败' });
    }
  }

  const ins = await env.DB.prepare(
    'INSERT INTO submissions (title, body, author, link, tag, tweet, ip, country, region, city, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(
      String(b?.title || '').trim().slice(0, MAX_TITLE),
      body, cleanName(b?.author),
      isTweet ? xUrl : String(b?.link || '').trim().slice(0, MAX_LINK),
      String(b?.tag || '').trim().slice(0, MAX_TAG),
      tweetJson, ip,
      request.headers.get('CF-IPCountry') || '',
      request.headers.get('CF-Region') || '',
      request.headers.get('CF-City') || '',
      sqlTime()
    )
    .run();
  return json({ ok: true, id: (ins.meta as any)?.last_row_id ?? null, tweet: !!tweetJson });
};
