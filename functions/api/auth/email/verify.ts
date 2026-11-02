// POST /api/auth/email/verify {email?, code}
// 登录状态下只需 code；没登录就要 email + code。
import { checkCode } from '../../../lib/codes';
import { normalizeEmail } from '../../../lib/password';
import { currentUser } from '../../../lib/session';

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const onRequestPost = async (ctx: any) => {
  const { env, request } = ctx;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体不是 JSON' }, 400);
  }

  const user = await currentUser(env, request).catch(() => null);
  const email = user?.login || normalizeEmail(body?.email);
  if (!email) return json({ error: '缺邮箱' }, 400);
  if (user && user.provider !== 'email') return json({ error: '这个账号不是邮箱注册的' }, 400);

  const code = String(body?.code ?? '').trim();
  if (!/^\d{6}$/.test(code)) return json({ error: '验证码是 6 位数字' }, 400);

  const res = await checkCode(env, email, 'verify', code);
  if (!res.ok) return json({ error: res.error }, 400);

  await env.DB.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').bind(email).run();
  return json({ ok: true, verified: true });
};
