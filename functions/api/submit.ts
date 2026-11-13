// 投稿箱 API：访客投稿短文/想法，直接公开。
// GET  /api/submit?limit=30            → 列表（时间倒序）
// GET  /api/submit?action=like&id=N    → 点赞 +1
// POST /api/submit  body {title,body,author,link,tag} → 插入
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const MAX_BODY = 2000;
const MAX_TITLE = 80;
const MAX_AUTHOR = 24;
const MAX_LINK = 300;
const MAX_TAG = 16;
const PER_HOUR = 3;

const ipOf = (req: Request) => req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || 'unknown';
const sqlTime = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString().slice(0, 19).replace('T', ' ');

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
        ip TEXT,
        country TEXT,
        region TEXT,
        city TEXT,
        likes INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`
    )
    .run();
}

export const onRequestGet = async ({ env, request }: { env: any; request: Request }) => {
  await ensure(env.DB);
  const url = new URL(request.url);
  if (url.searchParams.get('action') === 'like') {
    const id = Number(url.searchParams.get('id'));
    if (!Number.isInteger(id) || id < 1) return json({ error: 'bad id' }, 400);
    await env.DB.prepare('UPDATE submissions SET likes = likes + 1 WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 30, 1), 50);
  const rows = await env.DB.prepare(
    'SELECT id, title, body, author, link, tag, likes, country, region, city, created_at FROM submissions ORDER BY id DESC LIMIT ?'
  )
    .bind(limit)
    .all();
  return json({ ok: true, items: rows.results || [] });
};

export const onRequestPost = async ({ env, request }: { env: any; request: Request }) => {
  await ensure(env.DB);
  let b: any;
  try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const body = String(b?.body || '').trim().slice(0, MAX_BODY);
  if (!body) return json({ error: '内容不能为空' }, 400);
  const title = String(b?.title || '').trim().slice(0, MAX_TITLE);
  const author = String(b?.author || '').trim().slice(0, MAX_AUTHOR) || '匿名';
  const link = String(b?.link || '').trim().slice(0, MAX_LINK);
  const tag = String(b?.tag || '').trim().slice(0, MAX_TAG);
  const ip = ipOf(request);

  const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM submissions WHERE ip = ? AND created_at > ?')
    .bind(ip, sqlTime(3600_000))
    .first();
  if ((cnt?.c || 0) >= PER_HOUR) return json({ error: '太频繁了，过一小时再投' }, 429);

  const ins = await env.DB.prepare(
    'INSERT INTO submissions (title, body, author, link, tag, ip, country, region, city, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(
      title, body, author, link, tag, ip,
      request.headers.get('CF-IPCountry') || '',
      request.headers.get('CF-Region') || '',
      request.headers.get('CF-City') || '',
      sqlTime()
    )
    .run();
  return json({ ok: true, id: (ins.meta as any)?.last_row_id ?? null });
};
