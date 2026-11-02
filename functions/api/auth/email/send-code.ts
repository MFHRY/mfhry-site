// POST /api/auth/email/send-code {email, purpose: 'verify'|'reset'}
// 不管邮箱有没有注册都返回 ok，避免被人拿来试探哪些邮箱注册过。
import { normalizeEmail, validEmail } from '../../../lib/password';
import { issueCode, type Purpose } from '../../../lib/codes';
import { mailReady } from '../../../lib/mail';

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const ipOf = (req: Request) => req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || 'unknown';
const nowSql = (d = new Date()) => d.toISOString().slice(0, 19).replace('T', ' ');

export const onRequestPost = async (ctx: any) => {
  try {
    return await handle(ctx);
  } catch (e: any) {
    return json({ error: '服务端出错：' + (e?.message || String(e)) }, 500);
  }
};

async function handle(ctx: any) {
  const { env, request } = ctx;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体不是 JSON' }, 400);
  }

  if (!mailReady(env)) return json({ error: '站长发信还没配好，暂时发不了验证码' }, 503);

  const email = normalizeEmail(body?.email);
  const purpose: Purpose = body?.purpose === 'reset' ? 'reset' : 'verify';
  if (!validEmail(email)) return json({ error: '邮箱格式不对' }, 400);

  const ip = ipOf(request);
  const hourAgo = nowSql(new Date(Date.now() - 3600 * 1000));

  const perEmail: any = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM mail_sends WHERE email = ? AND purpose = ? AND created_at > ?'
  )
    .bind(email, purpose, hourAgo)
    .first();
  if (Number(perEmail?.c || 0) >= 5) return json({ error: '这个邮箱刚发过好几封了，一小时后再试' }, 429);

  const perIp: any = await env.DB.prepare('SELECT COUNT(*) AS c FROM mail_sends WHERE ip = ? AND created_at > ?')
    .bind(ip, hourAgo)
    .first();
  if (Number(perIp?.c || 0) >= 12) return json({ error: '发太频繁了，一小时后再试' }, 429);

  await env.DB.prepare('INSERT INTO mail_sends (email, purpose, ip, created_at) VALUES (?, ?, ?, ?)')
    .bind(email, purpose, ip, nowSql())
    .run();

  // 只有账号存在才真发，但对外永远回 ok
  const user: any = await env.DB.prepare('SELECT id, email_verified FROM users WHERE email = ?').bind(email).first();
  if (!user) return json({ ok: true, sent: false });
  if (purpose === 'verify' && Number(user.email_verified) === 1) return json({ ok: true, sent: false, verified: true });

  const sent = await issueCode(env, email, purpose);
  if (!sent.ok) return json({ error: sent.error || '发信失败' }, 503);

  return json({ ok: true, sent: true });
};
