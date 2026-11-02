// GET /api/me -> 当前登录用户（没登录返回 { user: null }）
import { currentUser, publicUser } from '../lib/session';
import { mailReady } from '../lib/mail';

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const onRequestGet = async (ctx: any) => {
  const { env, request } = ctx;
  try {
    const user = await currentUser(env, request);
    return json({
      user: publicUser(user),
      configured: !!env.GITHUB_CLIENT_ID,
      mail: mailReady(env),
    });
  } catch (e: any) {
    return json({ user: null, configured: false, mail: false, error: e?.message || 'db' });
  }
};
