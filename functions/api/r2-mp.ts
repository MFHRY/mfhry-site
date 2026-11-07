import { r2Bucket } from '../lib/r2';

// R2 分片上传：统一端点，覆盖视频页（口令）与留言墙（匿名）。
// POST ?action=create        body {name,mime,size}       → {key,uploadId}
// PUT  ?action=part&key&uploadId&partNumber              → {partNumber,etag}
// POST ?action=complete&key&uploadId  body {parts,mime}  → {ok,key,url,size}
// DELETE ?action=abort&key&uploadId                      → {ok}
// DELETE ?action=delete&key                              → {ok}（清理已完成对象）
//
// 单片走 R2 流式写，不占 Worker 内存；多片同时绕开 Pages 单请求 100MB 上限。

const ADMIN_MAX = 1024 * 1024 * 1024;   // 视频页（口令）：1GB
const ANON_MAX = 80 * 1024 * 1024;      // 留言墙（匿名）：80MB
const ANON_PER_HOUR = 5;
const ANON_PER_DAY = 200 * 1024 * 1024; // 日上限降到 200MB 对冲大文件
const PART_MAX = 16 * 1024 * 1024;      // 单片上限（客户端用 8MB）
const MAX_PARTS = 512;

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const EXT: Record<string, string> = {
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'video/x-m4v': '.m4v', 'video/ogg': '.ogv', 'video/x-matroska': '.mkv',
  'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/ogg': '.ogg',
  'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/flac': '.flac',
  'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac',
};
function extFor(name: string, mime: string) {
  const m = /\.(mp4|webm|mov|m4v|ogv|ogg|mkv|mp3|wav|flac|m4a|aac|jpe?g|png)$/i.exec(name || '');
  if (m) return '.' + m[1].toLowerCase();
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  return EXT[mime] || (mime.startsWith('audio/') ? '.mp3' : '.mp4');
}
const ipOf = (req: Request) => req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || 'unknown';

async function hashIp(env: any, ip: string) {
  const salt = String(env.ADMIN_KEY || 'mfhry-wall');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '\n' + ip));
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function prefixFor(hash: string) {
  return 'wall/u/' + hash + '/';
}
const isAdmin = (env: any, req: Request) =>
  !!env.ADMIN_KEY && req.headers.get('x-admin-key') === env.ADMIN_KEY;

async function ownerOk(env: any, request: Request, key: string): Promise<boolean> {
  if (key.includes('..') || key.includes('\\')) return false;
  if (isAdmin(env, request)) return key.startsWith('videos/') || key.startsWith('music/') || key.startsWith('files/');
  const hash = await hashIp(env, ipOf(request));
  return key.startsWith(prefixFor(hash));
}

export const onRequestPost = async (ctx: any) => {
  const { env, request } = ctx;
  const bucket = r2Bucket(env);
  if (!bucket) return json({ error: 'R2 未绑定' }, 503);
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';

  if (action === 'create') {
    const body: any = await request.json().catch(() => ({}));
    const mime = String(body.mime || 'video/mp4').split(';')[0].toLowerCase();
    const admin0 = isAdmin(env, request);
    if (!mime.startsWith('video/') && !mime.startsWith('audio/') && !admin0) return json({ error: '只能上传视频或音频' }, 415);
    const size = Number(body.size || 0);
    const admin = admin0;
    const MAX = admin ? ADMIN_MAX : ANON_MAX;
    if (!size || size > MAX) return json({ error: admin ? '最多 1GB' : '墙上最多 80MB' }, 413);

    let key: string;
    if (admin) {
      const customKey = String(body.key || '').trim();
      if (customKey && (customKey.startsWith('music/') || customKey.startsWith('videos/') || customKey.startsWith('files/')) && !customKey.includes('..') && !customKey.includes('\\') && customKey.length < 300) {
        key = customKey;
      } else {
        key = 'videos/' + crypto.randomUUID() + extFor(String(body.name || ''), mime);
      }
    } else {
      // 匿名：按 IP 哈希分目录 + 限频
      const hash = await hashIp(env, ipOf(request));
      const prefix = prefixFor(hash);
      let recent: any[] = [];
      try {
        const list = await bucket.list({ prefix, limit: 100 });
        recent = list.objects || [];
      } catch {
        return json({ error: '存储暂时不可用' }, 503);
      }
      const now = Date.now(), hourAgo = now - 3600 * 1000, dayAgo = now - 24 * 3600 * 1000;
      let hourCount = 0, dayBytes = 0;
      for (const o of recent) {
        const t = o.uploaded ? new Date(o.uploaded).getTime() : 0;
        if (t > hourAgo) hourCount++;
        if (t > dayAgo) dayBytes += Number(o.size || 0);
      }
      if (hourCount >= ANON_PER_HOUR) return json({ error: '视频上传太频繁，歇一会儿' }, 429);
      if (dayBytes + size > ANON_PER_DAY) return json({ error: '今天上传的视频总量到上限了' }, 429);
      key = prefix + String(9_999_999_999_999 - now).padStart(13, '0') + '-' +
        crypto.randomUUID() + extFor(String(body.name || ''), mime);
    }

    try {
      const mp = await bucket.createMultipartUpload(key, {
        httpMetadata: { contentType: mime, cacheControl: 'public, max-age=31536000, immutable' },
      });
      return json({ ok: true, key: mp.key, uploadId: mp.uploadId });
    } catch (e: any) {
      return json({ error: '创建上传失败', detail: String(e && e.message || e) }, 500);
    }
  }

  if (action === 'complete') {
    const key = url.searchParams.get('key') || '';
    const uploadId = url.searchParams.get('uploadId') || '';
    if (!key || !uploadId) return json({ error: '缺参数' }, 400);
    if (!(await ownerOk(env, request, key))) return json({ error: 'key 不对' }, 403);
    const body: any = await request.json().catch(() => ({}));
    const parts = Array.isArray(body.parts) ? body.parts : [];
    if (!parts.length || parts.length > MAX_PARTS) return json({ error: '分片列表不对' }, 400);
    const admin = isAdmin(env, request);
    const MAX = admin ? ADMIN_MAX : ANON_MAX;
    try {
      const mp = bucket.resumeMultipartUpload(key, uploadId);
      const obj = await mp.complete(parts);
      const size = Number(obj && (obj as any).size) || Number(body.size || 0);
      if (size > MAX) {
        try { await bucket.delete(key); } catch {}
        return json({ error: admin ? '视频最多 1GB' : '墙上视频最多 80MB' }, 413);
      }
      return json({ ok: true, key, url: '/api/r2?key=' + encodeURIComponent(key), size });
    } catch (e: any) {
      return json({ error: '合并分片失败', detail: String(e && e.message || e) }, 500);
    }
  }

  return json({ error: '未知操作' }, 400);
};

export const onRequestPut = async (ctx: any) => {
  const { env, request } = ctx;
  const bucket = r2Bucket(env);
  if (!bucket) return json({ error: 'R2 未绑定' }, 503);
  const url = new URL(request.url);
  if ((url.searchParams.get('action') || '') !== 'part') return json({ error: '未知操作' }, 400);
  const key = url.searchParams.get('key') || '';
  const uploadId = url.searchParams.get('uploadId') || '';
  const partNumber = Number(url.searchParams.get('partNumber') || 0);
  if (!key || !uploadId || !(partNumber >= 1)) return json({ error: '缺参数' }, 400);
  if (!(await ownerOk(env, request, key))) return json({ error: 'key 不对' }, 403);
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > PART_MAX) return json({ error: '单片超过 16MB' }, 413);
  if (!request.body) return json({ error: '没有分片内容' }, 400);
  try {
    const mp = bucket.resumeMultipartUpload(key, uploadId);
    const up = await mp.uploadPart(partNumber, request.body);
    return json({ partNumber: up.partNumber, etag: up.etag });
  } catch (e: any) {
    return json({ error: '分片上传失败', detail: String(e && e.message || e) }, 500);
  }
};

export const onRequestDelete = async (ctx: any) => {
  const { env, request } = ctx;
  const bucket = r2Bucket(env);
  if (!bucket) return json({ error: 'R2 未绑定' }, 503);
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  const key = url.searchParams.get('key') || '';
  if (!key) return json({ error: '缺参数' }, 400);
  if (!(await ownerOk(env, request, key))) return json({ error: 'key 不对' }, 403);

  if (action === 'abort') {
    const uploadId = url.searchParams.get('uploadId') || '';
    if (!uploadId) return json({ error: '缺参数' }, 400);
    try {
      await bucket.resumeMultipartUpload(key, uploadId).abort();
      return json({ ok: true });
    } catch (e: any) {
      return json({ error: '取消失败', detail: String(e && e.message || e) }, 500);
    }
  }
  // 默认 delete：清理已完成的对象
  await bucket.delete(key);
  return json({ ok: true });
};
