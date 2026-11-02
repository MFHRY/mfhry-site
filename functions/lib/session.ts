// 会话：随机会话 token 存 D1，浏览器只拿到 HttpOnly cookie。
export type SessionUser = {
  id: number;
  gh_id: number;
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
    `SELECT u.id, u.gh_id, u.login, u.name, u.avatar, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ?`
  )
    .bind(token)
    .first();
  if (!row) return null;
  if (row.expires_at && Date.parse(row.expires_at.replace(' ', 'T') + 'Z') < Date.now()) return null;

  return {
    id: row.id,
    gh_id: row.gh_id,
    login: row.login,
    name: row.name || null,
    avatar: row.avatar || null,
    admin: isAdmin(env, row.login),
  };
}

// 管理员就是指定的那个 GitHub 账号（默认 MFHRY），可用 ADMIN_LOGIN 覆盖
export function isAdmin(env: any, login?: string | null): boolean {
  const target = String(env.ADMIN_LOGIN || 'MFHRY').toLowerCase();
  return !!login && String(login).toLowerCase() === target;
}

export function publicUser(u: SessionUser | null) {
  if (!u) return null;
  return { login: u.login, name: u.name, avatar: u.avatar, admin: u.admin };
}
