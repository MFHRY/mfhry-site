// POST /api/auth/email/login  {email, password}
import {
  cookie,
  createSession,
  publicUser,
  SESSION_COOKIE,
  SESSION_DAYS,
} from '../../../lib/session';
import { normalizeEmail, verifyPassword } from '../../../lib/password';

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const ipOf = (req: Request) => req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || 'unknown';
const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// 用户不存在时也跑一次哈希，别让响应时间暴露邮箱是否注册过
const DUMMY = {
  hash: 'x',
  salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
  iter: 10000,
};

export const onRequestPost = async (ctx: any) => {
  const { env, request } = ctx;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体不是 JSON' }, 400);
  }

  const email = normalizeEmail(body?.email);
  const password = String(body?.password ?? '');
  if (!email || !password) return json({ error: '邮箱和密码都要填' }, 400);

  const ip = ipOf(request);
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const fails = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM auth_fails WHERE ip = ? AND kind = 'login' AND created_at > ?"
  )
    .bind(ip, windowStart)
    .first();
  if (fails && Number(fails.c) >= 8) return json({ error: '试太多次了，15 分钟后再来' }, 429);

  const row: any = await env.DB.prepare(
    'SELECT id, email, pass_hash, salt, iter, name, avatar, provider FROM users WHERE email = ?'
  )
    .bind(email)
    .first();

  const ok = row
    ? await verifyPassword(password, row.pass_hash, row.salt, Number(row.iter) || 10000)
    : await verifyPassword(password, DUMMY.hash, DUMMY.salt, DUMMY.iter);

  if (!row || !ok) {
    await env.DB.prepare("INSERT INTO auth_fails (ip, kind, created_at) VALUES (?, 'login', ?)").bind(ip, nowSql()).run();
    return json({ error: '邮箱或密码不对' }, 401);
  }

  const sid = await createSession(env, row.id);
  await env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(nowSql(), row.id).run();

  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  headers.append('set-cookie', cookie(SESSION_COOKIE, sid, SESSION_DAYS * 86400));
  return new Response(
    JSON.stringify({
      ok: true,
      user: publicUser({
        id: row.id,
        provider: row.provider || 'email',
        gh_id: null,
        login: row.email,
        name: row.name || null,
        avatar: row.avatar || null,
        admin: false,
      }),
    }),
    { status: 200, headers }
  );
};
