// 邮箱验证码：生成、发信、校验。6 位数字，10 分钟有效，最多试 5 次。
import { codeMail, mailReady, sendMail } from './mail';

const TTL_SEC = 10 * 60;
const MAX_TRIES = 5;

const nowSql = (d = new Date()) => d.toISOString().slice(0, 19).replace('T', ' ');

function randomCode(): string {
  // 拒绝采样，避免 % 带来的偏斜
  const buf = new Uint32Array(1);
  let n = 0;
  do {
    crypto.getRandomValues(buf);
    n = buf[0] % 1000000;
  } while (buf[0] >= 4294000000);
  return String(n).padStart(6, '0');
}

function newSalt(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function sha(salt: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(salt + ':' + code);
  const bits = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type Purpose = 'verify' | 'reset';

export async function recentCount(env: any, email: string, purpose: Purpose): Promise<number> {
  const since = nowSql(new Date(Date.now() - 3600 * 1000));
  const row: any = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM mail_sends WHERE email = ? AND purpose = ? AND created_at > ?'
  )
    .bind(email, purpose, since)
    .first();
  return Number(row?.c || 0);
}

export async function issueCode(
  env: any,
  email: string,
  purpose: Purpose
): Promise<{ ok: boolean; error?: string; provider?: string }> {
  if (!mailReady(env)) return { ok: false, error: '站长发信还没配好（RESEND_API_KEY / MAIL_FROM）' };

  const code = randomCode();
  const salt = newSalt();
  const hash = await sha(salt, code);
  const expires = nowSql(new Date(Date.now() + TTL_SEC * 1000));

  // 同一个邮箱同一用途只保留最新一条有效码
  await env.DB.prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').bind(email, purpose).run();
  await env.DB.prepare(
    'INSERT INTO email_codes (email, purpose, code_hash, salt, expires_at, tries, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
  )
    .bind(email, purpose, hash, salt, expires, nowSql())
    .run();

  const mail = codeMail(code, purpose);
  const sent = await sendMail(env, { to: email, ...mail });
  if (!sent.ok) return { ok: false, error: sent.error || '发信失败' };
  return { ok: true };
}

export async function checkCode(
  env: any,
  email: string,
  purpose: Purpose,
  code: string
): Promise<{ ok: boolean; error?: string }> {
  const row: any = await env.DB.prepare(
    'SELECT id, code_hash, salt, expires_at, tries FROM email_codes WHERE email = ? AND purpose = ?'
  )
    .bind(email, purpose)
    .first();

  if (!row) return { ok: false, error: '验证码不对或已过期' };
  if (Number(row.tries) >= MAX_TRIES) return { ok: false, error: '试太多次了，重新获取验证码' };
  if (Date.parse(row.expires_at.replace(' ', 'T') + 'Z') < Date.now()) {
    await env.DB.prepare('DELETE FROM email_codes WHERE id = ?').bind(row.id).run();
    return { ok: false, error: '验证码过期了，重新获取' };
  }

  const got = await sha(row.salt, String(code || '').trim());
  if (got !== row.code_hash) {
    await env.DB.prepare('UPDATE email_codes SET tries = tries + 1 WHERE id = ?').bind(row.id).run();
    return { ok: false, error: '验证码不对' };
  }

  await env.DB.prepare('DELETE FROM email_codes WHERE id = ?').bind(row.id).run();
  return { ok: true };
}
