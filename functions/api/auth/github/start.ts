// GET /api/auth/github/start?next=/leaderboard/  -> 跳到 GitHub 授权页
import { cookie } from '../../../lib/session';

const STATE_COOKIE = 'mfhry_oauth_state';
const NEXT_COOKIE = 'mfhry_oauth_next';

export const onRequestGet = async (ctx: any) => {
  const { env, request } = ctx;
  const url = new URL(request.url);

  if (!env.GITHUB_CLIENT_ID) {
    return new Response('还没配置 GITHUB_CLIENT_ID，登录暂不可用。', {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const next = url.searchParams.get('next') || '/leaderboard/';
  const state = crypto.randomUUID();
  const redirect = `${url.origin}/api/auth/github/callback`;

  const auth = new URL('https://github.com/login/oauth/authorize');
  auth.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  auth.searchParams.set('redirect_uri', redirect);
  auth.searchParams.set('scope', 'read:user');
  auth.searchParams.set('state', state);
  auth.searchParams.set('allow_signup', 'true');

  const headers = new Headers({ location: auth.toString() });
  headers.append('set-cookie', cookie(STATE_COOKIE, state, 600));
  headers.append('set-cookie', cookie(NEXT_COOKIE, next, 600));
  return new Response(null, { status: 302, headers });
};
