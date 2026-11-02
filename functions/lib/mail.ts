// 发信：Resend / Brevo 任配一个即可。
//   RESEND_API_KEY + MAIL_FROM   例：MAIL_FROM = "MFHRY <no-reply@mfhry.store>"
//   BREVO_API_KEY  + MAIL_FROM   例：MAIL_FROM = "no-reply@mfhry.store"
export type Mail = { to: string; subject: string; text: string; html?: string };

function parseFrom(raw: string) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(raw);
  if (m) return { name: m[1] || 'MFHRY', email: m[2] };
  return { name: 'MFHRY', email: raw.trim() };
}

export function mailReady(env: any): boolean {
  return !!((env.RESEND_API_KEY || env.BREVO_API_KEY) && env.MAIL_FROM);
}

export async function sendMail(env: any, mail: Mail): Promise<{ ok: boolean; error?: string }> {
  const from = env.MAIL_FROM ? parseFrom(String(env.MAIL_FROM)) : null;
  if (!from) return { ok: false, error: '还没配置 MAIL_FROM' };

  if (env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: `${from.name} <${from.email}>`,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
          html: mail.html || undefined,
        }),
      });
      if (res.ok) return { ok: true };
      const body = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    } catch (e: any) {
      return { ok: false, error: '连不上 Resend：' + (e?.message || 'network') };
    }
  }

  if (env.BREVO_API_KEY) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': String(env.BREVO_API_KEY),
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: from,
          to: [{ email: mail.to }],
          subject: mail.subject,
          textContent: mail.text,
          htmlContent: mail.html || undefined,
        }),
      });
      if (res.ok) return { ok: true };
      const body = await res.text();
      return { ok: false, error: `Brevo ${res.status}: ${body.slice(0, 200)}` };
    } catch (e: any) {
      return { ok: false, error: '连不上 Brevo：' + (e?.message || 'network') };
    }
  }

  return { ok: false, error: '还没配置发信服务（RESEND_API_KEY 或 BREVO_API_KEY）' };
}

export function codeMail(code: string, purpose: 'verify' | 'reset'): Mail2 {
  const title = purpose === 'verify' ? '验证邮箱' : '重置密码';
  const text =
    `你正在${title}。\n\n验证码：${code}\n\n10 分钟内有效，只能用在一次操作上。\n` +
    `如果这不是你本人操作，忽略这封邮件即可，你的账号不会有任何变化。\n\n—— mfhry.store`;
  const html =
    `<div style="font:15px/1.7 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#222">` +
    `<p>你正在${title}。</p>` +
    `<p style="font-size:26px;letter-spacing:6px;font-weight:700;margin:18px 0">${code}</p>` +
    `<p style="color:#666">10 分钟内有效，只能用在一次操作上。如果不是你本人操作，忽略这封邮件即可。</p>` +
    `<p style="color:#999;font-size:13px">mfhry.store</p></div>`;
  return { subject: `[MFHRY] ${title}验证码：${code}`, text, html };
}

type Mail2 = { subject: string; text: string; html: string };
