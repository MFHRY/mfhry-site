// 密码：PBKDF2-SHA256 + 随机盐，只存 hash。
// 迭代次数写进数据库，以后调高也不影响老账号。
export const ITERATIONS = 10000;

const enc = new TextEncoder();

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256
  );
  return b64(new Uint8Array(bits));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    hash: await derive(password, salt, ITERATIONS),
    salt: b64(salt),
    iter: ITERATIONS,
  };
}

// 定长比较，别给计时攻击留口子
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function verifyPassword(password: string, hash: string, salt: string, iter: number): Promise<boolean> {
  try {
    const got = await derive(password, unb64(salt), iter || ITERATIONS);
    return same(got, hash);
  } catch {
    return false;
  }
}

export function normalizeEmail(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().slice(0, 100);
}

export function validEmail(email: string): boolean {
  return /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/.test(email) && email.length <= 100;
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return '密码至少 8 位';
  if (pw.length > 72) return '密码太长（最多 72 位）';
  return null;
}

// 展示时把邮箱中间打码：abcde@qq.com -> ab***@qq.com
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const head = email.slice(0, at);
  const tail = email.slice(at);
  const keep = head.length <= 2 ? head.slice(0, 1) : head.slice(0, 2);
  return keep + '***' + tail;
}
