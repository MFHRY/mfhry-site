// 会话：随机会话 token 存 D1，浏览器只拿到 HttpOnly cookie。
import { maskEmail } from './password';

export type SessionUser = {
  id: number;
  provider: string; // 'github' | 'email'
  gh_id: number | null;
  login: string;
  name: string | null;
  avatar: string | null;
  admin: boolean;
};

export function getCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie') || '';
  const m = raw.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export const SESSION_COOKIE = 'mfhry_sid';
export const SESSION_DAYS = 30;

export function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

export async function createSession(env: any, userId: number): Promise<string> {
  const token = newToken();
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_DAYS * 86400 * 1000);
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  )
    .bind(token, userId, nowSql(), expires.toISOString().slice(0, 19).replace('T', ' '))
    .run();
  return token;
}

export async function destroySession(env: any, token: string) {
  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

export async function currentUser(env: any, req: Request): Promise<SessionUser | null> {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const row: any = await env.DB.prepare(
    `SELECT u.id, u.provider, u.gh_id, u.login, u.name, u.avatar, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ?`
  )
    .bind(token)
    .first();
  if (!row) return null;
  if (row.expires_at && Date.parse(row.expires_at.replace(' ', 'T') + 'Z') < Date.now()) return null;

  return {
    id: row.id,
    provider: row.provider || 'github',
    gh_id: row.gh_id ? Number(row.gh_id) : null,
    login: row.login,
    name: row.name || null,
    avatar: row.avatar || null,
    // 只有 GitHub 账号能当管理员：邮箱没有验证，谁都能注册同名邮箱
    admin: row.provider === 'github' && isAdmin(env, row.login),
  };
}

// 管理员就是指定的那个 GitHub 账号（默认 MFHRY），可用 ADMIN_LOGIN 覆盖
export function isAdmin(env: any, login?: string | null): boolean {
  const target = String(env.ADMIN_LOGIN || 'MFHRY').toLowerCase();
  return !!login && String(login).toLowerCase() === target;
}

// 榜上、墙上显示的名字：有昵称用昵称，邮箱用户打码，GitHub 用户用 login
export function displayName(u: { provider?: string; login: string; name?: string | null }): string {
  if (u.name) return u.name;
  if (u.provider === 'email') return maskEmail(u.login);
  return u.login;
}

export function publicUser(u: SessionUser | null) {
  if (!u) return null;
  return {
    provider: u.provider,
    login: u.login,
    name: u.name,
    avatar: u.avatar,
    admin: u.admin,
    display: displayName(u),
  };
}
