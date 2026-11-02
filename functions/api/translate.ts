// 翻译接口：GET /api/translate?text=...&tl=zh-CN
// 顺序：clients5(Google) → translate.googleapis → MyMemory；结果缓存进 D1。
const MAX_TEXT = 1500;

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=86400' },
  });

async function keyOf(text: string, tl: string) {
  const buf = new TextEncoder().encode(tl + '\u0000' + text);
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function clients5(text: string, tl: string) {
  const u =
    'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=' +
    encodeURIComponent(tl) +
    '&q=' +
    encodeURIComponent(text);
  const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error('c5:' + r.status);
  const j: any = await r.json();
  if (Array.isArray(j) && j.length) {
    const first = j[0];
    const out = Array.isArray(first) ? first[0] : first;
    if (typeof out === 'string' && out) return out;
  }
  throw new Error('c5:bad');
}

async function gt(text: string, tl: string) {
  const u =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
    encodeURIComponent(tl) +
    '&dt=t&q=' +
    encodeURIComponent(text);
  const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error('gt:' + r.status);
  const j: any = await r.json();
  const out = (j?.[0] || []).map((x: any) => x?.[0]).filter(Boolean).join('');
  if (!out) throw new Error('gt:bad');
  return out;
}

async function mymemory(text: string, tl: string) {
  const pair = tl.toLowerCase().startsWith('zh') ? 'en|zh-CN' : 'zh-CN|en';
  const u = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 480))}&langpair=${pair}`;
  const r = await fetch(u, { signal: AbortSignal.timeout(4000) });
  const j: any = await r.json();
  const out = String(j?.responseData?.translatedText || '');
  if (!out || /MYMEMORY WARNING/i.test(out)) throw new Error('mm:quota');
  return out;
}

export const onRequestGet = async (ctx: any) => {
  try {
    return await handle(ctx);
  } catch (e: any) {
    return json({ error: '翻译出错：' + (e?.message || 'unknown') }, 502);
  }
};

async function handle(ctx: any) {
  const { env, request } = ctx;
  const url = new URL(request.url);
  const text = (url.searchParams.get('text') || '').trim();
  const tl = (url.searchParams.get('tl') || 'zh-CN').slice(0, 16);

  if (!text) return json({ error: '没内容' }, 400);
  if (text.length > MAX_TEXT) return json({ error: '文本太长，最多 1500 字' }, 400);

  const k = await keyOf(text, tl);
  try {
    const row: any = await env.DB.prepare('SELECT dst FROM translations WHERE k = ?').bind(k).first();
    if (row?.dst && !/MYMEMORY WARNING/i.test(row.dst)) return json({ text: row.dst, cached: true });
  } catch {}

  let out = '';
  let source = '';
  for (const [name, fn] of [
    ['google', clients5],
    ['google2', gt],
    ['mymemory', mymemory],
  ] as const) {
    try {
      out = await fn(text, tl);
      source = name;
      break;
    } catch {
      continue;
    }
  }

  if (!out) return json({ error: '翻译服务暂时不可用' }, 502);

  try {
    await env.DB.prepare('INSERT OR REPLACE INTO translations (k, src, tl, dst, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(k, text, tl, out, new Date().toISOString().slice(0, 19).replace('T', ' '))
      .run();
  } catch {}

  return json({ text: out, source });
};
