// GET /api/auth/github/callback?code=..&state=..  -> 换 token、写用户、发会话
import {
  cookie,
  createSession,
  getCookie,
  SESSION_COOKIE,
  SESSION_DAYS,
} from '../../../lib/session';

const STATE_COOKIE = 'mfhry_oauth_state';
const NEXT_COOKIE = 'mfhry_oauth_next';

const back = (to: string) => new Response(null, { status: 302, headers: { location: to } });
const fail = (reason: string) => back('/login/?error=' + encodeURIComponent(reason));

export const onRequestGet = async (ctx: any) => {
  const { env, request } = ctx;
  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const savedState = getCookie(request, STATE_COOKIE);

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return fail('服务端还没配置 GitHub 登录');
  }
  if (!code) return fail('GitHub 没有返回 code');
  if (!state || !savedState || state !== savedState) return fail('登录状态校验失败，请重试');

  const nextRaw = getCookie(request, NEXT_COOKIE) || '/leaderboard/';
  const next = nextRaw.startsWith('/') ? nextRaw : '/leaderboard/';

  // 1. code 换 access_token
  let token = '';
  try {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${url.origin}/api/auth/github/callback`,
      }),
    });
    const data: any = await res.json();
    token = data?.access_token || '';
    if (!token) return fail(data?.error_description || data?.error || '换取 token 失败');
  } catch (e: any) {
    return fail('连不上 GitHub：' + (e?.message || 'network'));
  }

  // 2. 取用户资料
  let gh: any = null;
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'mfhry-store',
      },
    });
    if (!res.ok) return fail('读取 GitHub 资料失败（' + res.status + '）');
    gh = await res.json();
  } catch (e: any) {
    return fail('读取 GitHub 资料失败：' + (e?.message || 'network'));
  }

  const ghId = Number(gh?.id);
  const login = String(gh?.login || '');
  if (!ghId || !login) return fail('GitHub 返回的资料不完整');

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const name = gh?.name ? String(gh.name).slice(0, 40) : null;
  const avatar = gh?.avatar_url ? String(gh.avatar_url) : null;

  // 3. 有则更新，无则建号
  const existing: any = await env.DB.prepare('SELECT id FROM users WHERE gh_id = ?').bind(ghId).first();
  let userId: number;
  if (existing) {
    userId = existing.id;
    await env.DB.prepare('UPDATE users SET login = ?, name = ?, avatar = ?, last_seen = ? WHERE id = ?')
      .bind(login, name, avatar, now, userId)
      .run();
  } else {
    const ins = await env.DB.prepare(
      'INSERT INTO users (gh_id, login, name, avatar, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(ghId, login, name, avatar, now, now)
      .run();
    userId = Number(ins.meta.last_row_id);
  }

  // 4. 发会话
  const sid = await createSession(env, userId);

  const headers = new Headers({ location: next });
  headers.append('set-cookie', cookie(SESSION_COOKIE, sid, SESSION_DAYS * 86400));
  // 顺手把 oauth 的临时 cookie 清掉
  headers.append('set-cookie', cookie(STATE_COOKIE, '', 0));
  headers.append('set-cookie', cookie(NEXT_COOKIE, '', 0));
  return new Response(null, { status: 302, headers });
};
