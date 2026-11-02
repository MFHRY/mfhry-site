// POST /api/logout -> 删会话、清 cookie
import { cookie, destroySession, getCookie, SESSION_COOKIE } from '../lib/session';

export const onRequestPost = async (ctx: any) => {
  const { env, request } = ctx;
  const sid = getCookie(request, SESSION_COOKIE);
  if (sid) {
    try {
      await destroySession(env, sid);
    } catch (e) {
      /* 数据库抽风也让用户退出，cookie 反正清掉了 */
    }
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'set-cookie': cookie(SESSION_COOKIE, '', 0),
    },
  });
};
