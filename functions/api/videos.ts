// 视频 API：GET 公开列表 / POST 上传（需口令 x-admin-key 或 body.key）
const MAX_TITLE = 120;
const MAX_BODY = 2000;
const MAX_COVER = 400 * 1024;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

function toB64(buf: ArrayBuffer) {
  const b = new Uint8Array(buf);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < b.length; i += CH) s += String.fromCharCode(...b.subarray(i, i + CH));
  return btoa(s);
}

function bvid(raw: string) {
  const m = /bilibili\.com\/video\/(BV[0-9A-Za-z]+)/i.exec(raw);
  return m ? m[1] : null;
}

async function biliMeta(bv: string) {
  // 1) 官方 JSON 接口
  try {
    const res = await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + bv, {
      headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/' },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const j: any = await res.json();
      if (j && j.code === 0 && j.data) {
        const meta = {
          title: String(j.data.title || ''),
          pic: String(j.data.pic || ''),
          duration: Number(j.data.duration || 0) || null,
          author: String(j.data.owner?.name || ''),
        };
        if (meta.title) return meta;
      }
    }
  } catch {}

  // 2) 回退：抓视频页 HTML 里的 og 信息
  try {
    const res = await fetch('https://www.bilibili.com/video/' + bv + '/', {
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9',
        referer: 'https://www.bilibili.com/',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const pick = (re: RegExp) => {
      const m = re.exec(html);
      return m ? m[1] : '';
    };
    const title = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      pick(/<title[^>]*>([^<]+)<\/title>/i).replace(/_哔哩哔哩.*$/, '');
    const pic = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    const dsec = Number(pick(/"duration"\s*:\s*(\d+)/)) || null;
    const author = pick(/"owner"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
    if (!title) return null;
    return {
      title: title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
      pic,
      duration: dsec,
      author,
    };
  } catch {
    return null;
  }
}

async function grab(url: string) {
  try {
    const res = await fetch(url.replace(/^http:/, 'https:'), {
      headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('image/')) return null;
    const buf = await res.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > MAX_COVER) return null;
    return { mime: ct.split(';')[0], b64: toB64(buf) };
  } catch {
    return null;
  }
}

export const onRequestGet = async (ctx: any) => {
  const { env } = ctx;
  const rows = await env.DB.prepare(
    "SELECT id, title, url, cover, body, author, duration, created_at FROM videos ORDER BY id DESC LIMIT 60"
  ).all();
  return json({ videos: rows.results || [] });
};

export const onRequestPost = async (ctx: any) => {
  const { env, request } = ctx;
  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }
  if (!isAdmin(env, request, p)) return json({ error: '口令不对' }, 403);

  const url = String(p?.url ?? '').trim();
  let title = String(p?.title ?? '').trim();
  const body = String(p?.body ?? '').trim();

  if (!url || !/^https?:\/\//i.test(url) || url.length > 500) return json({ error: '视频链接不对' }, 400);
  if (title.length > MAX_TITLE) return json({ error: `标题最多 ${MAX_TITLE} 字` }, 400);
  if (body.length > MAX_BODY) return json({ error: `简介最多 ${MAX_BODY} 字` }, 400);

  let cover: { mime: string; b64: string } | null = null;
  const own = String(p?.cover ?? '');
  if (own) {
    const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(own);
    if (!m) return json({ error: '封面格式不对' }, 400);
    if (Math.floor((m[2].length * 3) / 4) > MAX_COVER) return json({ error: '封面太大' }, 400);
    cover = { mime: m[1], b64: m[2] };
  }

  let author = String(p?.author ?? '').trim().slice(0, 60);
  let duration = Number(p?.duration) || null;

  // B 站信息自动补全（B 站对机房 IP 有风控，多半拿不到，失败就按手填来）
  const bv = bvid(url);
  if (bv && (!title || !cover)) {
    const meta = await biliMeta(bv);
    if (meta) {
      if (!title) title = meta.title.slice(0, MAX_TITLE);
      if (!author) author = meta.author;
      if (!duration) duration = meta.duration;
      if (!cover && meta.pic) cover = await grab(meta.pic);
    }
  }
  if (!title) return json({ error: '标题不能为空' }, 400);

  const ins = await env.DB.prepare(
    'INSERT INTO videos (title, url, cover, body, author, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(title, url, null, body || null, author || null, duration || null, nowSql())
    .run();
  const id = ins.meta.last_row_id as number;

  let coverId: number | null = null;
  if (cover) {
    const r = await env.DB.prepare(
      "INSERT INTO media (post_id, mime, size, data, kind) VALUES (0, ?, ?, ?, 'vcover')"
    )
      .bind(cover.mime, Math.floor((cover.b64.length * 3) / 4), cover.b64)
      .run();
    coverId = r.meta.last_row_id as number;
  }
  if (coverId) await env.DB.prepare('UPDATE videos SET cover = ? WHERE id = ?').bind(coverId, id).run();

  return json({ ok: true, id, title: title || url, cover: coverId, duration, author });
};
