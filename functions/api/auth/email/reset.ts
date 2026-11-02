// POST /api/auth/email/reset {email, code, password}
// 忘记密码：邮箱验证码 + 新密码。改完把所有旧会话踢掉。
import { checkCode } from '../../../lib/codes';
import { hashPassword, normalizeEmail, passwordProblem, validEmail } from '../../../lib/password';

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

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
  const code = String(body?.code ?? '').trim();
  const password = String(body?.password ?? '');

  if (!validEmail(email)) return json({ error: '邮箱格式不对' }, 400);
  if (!/^\d{6}$/.test(code)) return json({ error: '验证码是 6 位数字' }, 400);
  const pwProblem = passwordProblem(password);
  if (pwProblem) return json({ error: pwProblem }, 400);

  const user: any = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (!user) return json({ error: '验证码不对或已过期' }, 400);

  const res = await checkCode(env, email, 'reset', code);
  if (!res.ok) return json({ error: res.error }, 400);

  const { hash, salt, iter } = await hashPassword(password);
  await env.DB.prepare('UPDATE users SET pass_hash = ?, salt = ?, iter = ?, email_verified = 1, last_seen = ? WHERE id = ?')
    .bind(hash, salt, iter, nowSql(), user.id)
    .run();
  // 旧会话全部作废
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();

  return json({ ok: true });
};
