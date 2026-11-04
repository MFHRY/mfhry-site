// 视频上传（D1 切片版）：POST /api/video-upload
//   JSON 创建任务：{ key, title, body, size, mime, duration, cover }
//   原始字节上传：?id=xxx&start=字节偏移  header x-admin-key
//   完成：?finish=xxx  header x-admin-key
//   DELETE ?id=xxx  header x-admin-key（放弃未完成任务）
const CHUNK_SIZE = 1_500_000;          // D1 单行上限 2MB，留出余量
const MAX_GROUP = CHUNK_SIZE * 4;      // 单次请求最多 6MB
const MAX_VIDEO = 40 * 1024 * 1024;    // 实验性上限：40MB/条
const MAX_TITLE = 120;
const MAX_BODY = 2000;
const MAX_COVER = 400 * 1024;

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

function isAdmin(env: any, request: Request, body?: any) {
  const h = request.headers.get('x-admin-key') || '';
  const k = body?.key || '';
  return !!env.ADMIN_KEY && (h === env.ADMIN_KEY || k === env.ADMIN_KEY);
}

let schemaReady = false;
async function ensureSchema(env: any) {
  if (schemaReady) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS video_uploads (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'uploading',
    title TEXT NOT NULL,
    body TEXT,
    cover TEXT,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    chunk_size INTEGER NOT NULL,
    chunks INTEGER NOT NULL,
    duration INTEGER,
    video_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS video_chunks (
    upload_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    data BLOB NOT NULL,
    PRIMARY KEY (upload_id, idx)
  )`).run();
  // 浏览器中途关掉会留下未完成任务；顺手清掉一天前的，别让切片一直占 D1。
  await env.DB.prepare(`DELETE FROM video_chunks WHERE upload_id IN (
    SELECT id FROM video_uploads WHERE status = 'uploading' AND created_at < datetime('now', '-1 day')
  )`).run();
  await env.DB.prepare(`DELETE FROM video_uploads WHERE status = 'uploading' AND created_at < datetime('now', '-1 day')`).run();
  schemaReady = true;
}

async function createUpload(env: any, request: Request) {
  let p: any;
  try { p = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }
  if (!isAdmin(env, request, p)) return json({ error: '口令不对' }, 403);

  const title = String(p?.title ?? '').trim();
  const body = String(p?.body ?? '').trim();
  const mime = String(p?.mime ?? 'video/mp4').toLowerCase().startsWith('video/')
    ? String(p.mime).toLowerCase()
    : 'video/mp4';
  const size = Number(p?.size);
  const duration = Number(p?.duration) || null;

  if (!title) return json({ error: '标题不能为空' }, 400);
  if (title.length > MAX_TITLE) return json({ error: `标题最多 ${MAX_TITLE} 字` }, 400);
  if (body.length > MAX_BODY) return json({ error: `简介最多 ${MAX_BODY} 字` }, 400);
  if (!Number.isInteger(size) || size <= 0) return json({ error: '文件大小不对' }, 400);
  if (size > MAX_VIDEO) return json({ error: '单条视频最多 40MB（D1 切片实验版）' }, 413);

  let cover = '';
  const rawCover = String(p?.cover ?? '');
  if (rawCover) {
    const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(rawCover);
    if (!m) return json({ error: '封面格式不对' }, 400);
    if (Math.floor((m[2].length * 3) / 4) > MAX_COVER) return json({ error: '封面太大' }, 400);
    cover = rawCover;
  }

  const id = crypto.randomUUID();
  const chunks = Math.ceil(size / CHUNK_SIZE);
  const now = nowSql();
  await env.DB.prepare(`INSERT INTO video_uploads
    (id, status, title, body, cover, mime, size, chunk_size, chunks, duration, created_at, updated_at)
    VALUES (?, 'uploading', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, title, body || null, cover || null, mime, size, CHUNK_SIZE, chunks, duration, now, now)
    .run();

  return json({ ok: true, id, chunkSize: CHUNK_SIZE, chunks, max: MAX_VIDEO });
}

async function uploadChunk(env: any, request: Request, id: string) {
  const url = new URL(request.url);
  const start = Number(url.searchParams.get('start') || '0');
  if (!Number.isInteger(start) || start < 0 || start % CHUNK_SIZE !== 0) {
    return json({ error: '切片起点不对' }, 400);
  }

  const meta: any = await env.DB.prepare(
    'SELECT status, size, chunks, chunk_size FROM video_uploads WHERE id = ?',
  ).bind(id).first();
  if (!meta) return json({ error: '上传任务不存在' }, 404);
  if (meta.status !== 'uploading') return json({ error: '这个任务已经结束' }, 409);
  if (start >= Number(meta.size)) return json({ error: '切片超出文件大小' }, 400);

  let buf: ArrayBuffer;
  try { buf = await request.arrayBuffer(); } catch { return json({ error: '读取切片失败' }, 400); }
  if (!buf.byteLength) return json({ error: '空切片' }, 400);
  if (buf.byteLength > MAX_GROUP) return json({ error: '单次切片组太大' }, 413);

  const end = start + buf.byteLength;
  if (end > Number(meta.size)) return json({ error: '切片超出文件大小' }, 400);
  if (end < Number(meta.size) && buf.byteLength % CHUNK_SIZE !== 0) {
    return json({ error: '切片组没有按块对齐' }, 400);
  }

  const stmts: any[] = [];
  for (let off = 0; off < buf.byteLength; off += CHUNK_SIZE) {
    const idx = (start + off) / CHUNK_SIZE;
    const piece = buf.slice(off, Math.min(off + CHUNK_SIZE, buf.byteLength));
    stmts.push(env.DB.prepare(
      'INSERT OR REPLACE INTO video_chunks (upload_id, idx, data) VALUES (?, ?, ?)',
    ).bind(id, idx, piece));
  }
  await env.DB.batch(stmts);
  return json({ ok: true, next: end, received: end, size: Number(meta.size) });
}

async function finishUpload(env: any, id: string) {
  const meta: any = await env.DB.prepare(
    'SELECT * FROM video_uploads WHERE id = ?',
  ).bind(id).first();
  if (!meta) return json({ error: '上传任务不存在' }, 404);
  if (meta.status === 'ready') return json({ ok: true, id: meta.video_id, url: '/api/video-stream/' + id });

  const stat: any = await env.DB.prepare(
    'SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM video_chunks WHERE upload_id = ?',
  ).bind(id).first();
  if (Number(stat?.n || 0) !== Number(meta.chunks) || Number(stat?.bytes || 0) !== Number(meta.size)) {
    return json({ error: '切片还不完整，继续上传后再试', got: Number(stat?.n || 0), need: Number(meta.chunks) }, 400);
  }

  const url = '/api/video-stream/' + id;
  const ins = await env.DB.prepare(
    'INSERT INTO videos (title, url, cover, body, author, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(meta.title, url, null, meta.body || null, '服务器上传', meta.duration || null, nowSql()).run();
  const videoId = ins.meta.last_row_id as number;

  let coverId: number | null = null;
  if (meta.cover) {
    const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(String(meta.cover));
    if (m) {
      const r = await env.DB.prepare(
        "INSERT INTO media (post_id, mime, size, data, kind) VALUES (0, ?, ?, ?, 'vcover')",
      ).bind(m[1], Math.floor((m[2].length * 3) / 4), m[2]).run();
      coverId = r.meta.last_row_id as number;
    }
  }
  if (coverId) await env.DB.prepare('UPDATE videos SET cover = ? WHERE id = ?').bind(coverId, videoId).run();
  await env.DB.prepare(
    "UPDATE video_uploads SET status = 'ready', video_id = ?, cover = NULL, updated_at = ? WHERE id = ?",
  ).bind(videoId, nowSql(), id).run();

  return json({ ok: true, id: videoId, url, bytes: Number(meta.size) });
}

async function abortUpload(env: any, id: string) {
  const meta: any = await env.DB.prepare('SELECT status FROM video_uploads WHERE id = ?').bind(id).first();
  if (!meta) return json({ ok: true });
  if (meta.status === 'ready') return json({ error: '视频已发布，请到列表里删除' }, 409);
  await env.DB.prepare('DELETE FROM video_chunks WHERE upload_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM video_uploads WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

export const onRequestPost = async (ctx: any) => {
  const { env, request } = ctx;
  if (!env.DB) return json({ error: 'D1 未绑定' }, 503);
  await ensureSchema(env);

  const url = new URL(request.url);
  const finish = url.searchParams.get('finish');
  const id = url.searchParams.get('id');
  if (!finish && !id) return createUpload(env, request);

  if (!isAdmin(env, request)) return json({ error: '口令不对' }, 403);
  if (finish) return finishUpload(env, finish);
  if (!id || !/^[0-9a-f-]{20,40}$/i.test(id)) return json({ error: '任务 id 不对' }, 400);
  return uploadChunk(env, request, id);
};

export const onRequestDelete = async (ctx: any) => {
  const { env, request } = ctx;
  if (!env.DB) return json({ error: 'D1 未绑定' }, 503);
  if (!isAdmin(env, request)) return json({ error: '口令不对' }, 403);
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!id) return json({ error: '缺少任务 id' }, 400);
  return abortUpload(env, id);
};
