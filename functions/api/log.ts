// 前端错误上报：POST /api/log  { kind, msg, src, line, col, stack, page, ua }
// 写入 D1 wall/client_errors；每 IP 每分钟最多 20 条，超过静默丢弃。
interface Env {
  DB: D1Database;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');

export const onRequestOptions: PagesFunction<Env> = async () => new Response(null, { status: 204, headers: CORS });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  if (!env.DB) return new Response(null, { status: 204, headers: CORS });

  let body: any = {};
  try {
    const text = await request.text();
    if (text.length > 8192) return new Response(null, { status: 204, headers: CORS });
    body = JSON.parse(text || '{}');
  } catch {
    return new Response(null, { status: 204, headers: CORS });
  }

  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const now = Date.now();

  try {
    // 简单限流：同一 IP 每分钟 20 条
    const recent: any = await env.DB.prepare(
      'SELECT COUNT(*) AS c FROM client_errors WHERE ip = ? AND ts > ?',
    )
      .bind(ip, now - 60_000)
      .first();
    if ((recent?.c || 0) >= 20) return new Response(null, { status: 204, headers: CORS });

    await env.DB.prepare(
      'INSERT INTO client_errors (ts, kind, msg, src, line, col, stack, page, ua, ip) VALUES (?,?,?,?,?,?,?,?,?,?)',
    )
      .bind(
        now,
        clip(body.kind, 16) || 'error',
        clip(body.msg, 300),
        clip(body.src, 300),
        Number(body.line) || 0,
        Number(body.col) || 0,
        clip(body.stack, 1200),
        clip(body.page, 200),
        clip(body.ua, 200),
        ip,
      )
      .run();
  } catch {
    /* 记录失败就算了，别影响页面 */
  }
  return new Response(null, { status: 204, headers: CORS });
};
