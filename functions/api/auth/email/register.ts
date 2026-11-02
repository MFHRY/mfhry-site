// POST /api/auth/email/register  {email, password, name?}
import {
  cookie,
  createSession,
  publicUser,
  SESSION_COOKIE,
  SESSION_DAYS,
} from '../../../lib/session';
import { hashPassword, normalizeEmail, passwordProblem, validEmail } from '../../../lib/password';

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const ipOf = (req: Request) => req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || 'unknown';
const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

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
  const name = String(body?.name ?? '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 16);

  if (!validEmail(email)) return json({ error: '邮箱格式不对' }, 400);
  const pwProblem = passwordProblem(password);
  if (pwProblem) return json({ error: pwProblem }, 400);

  const ip = ipOf(request);
  const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM auth_fails WHERE ip = ? AND kind = 'register' AND created_at > ?"
  )
    .bind(ip, hourAgo)
    .first();
  if (recent && Number(recent.c) >= 5) return json({ error: '注册太频繁了，一小时后再试' }, 429);

  const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (exists) return json({ error: '这个邮箱已经注册过了，直接登录' }, 409);

  const { hash, salt, iter } = await hashPassword(password);
  const ts = nowSql();
  const ins = await env.DB.prepare(
    `INSERT INTO users (provider, email, pass_hash, salt, iter, login, name, avatar, created_at, last_seen)
     VALUES ('email', ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
  )
    .bind(email, hash, salt, iter, email, name || null, ts, ts)
    .run();

  const userId = Number(ins.meta.last_row_id);
  const sid = await createSession(env, userId);
  await env.DB.prepare("INSERT INTO auth_fails (ip, kind, created_at) VALUES (?, 'register', ?)").bind(ip, ts).run();

  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  headers.append('set-cookie', cookie(SESSION_COOKIE, sid, SESSION_DAYS * 86400));
  return new Response(
    JSON.stringify({
      ok: true,
      user: publicUser({
        id: userId,
        provider: 'email',
        gh_id: null,
        login: email,
        name: name || null,
        avatar: null,
        admin: false,
      }),
    }),
    { status: 200, headers }
  );
};
