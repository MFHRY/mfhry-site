// 口令校验：POST { key } -> { ok }
const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const onRequestPost = async (ctx: any) => {
  const { env, request } = ctx;
  let p: any;
  try {
    p = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }
  const key = String(p?.key ?? '').trim();
  if (!env.ADMIN_KEY) return json({ error: '服务端还没设置口令' }, 500);
  if (key !== env.ADMIN_KEY) return json({ error: '口令不对' }, 403);
  return json({ ok: true });
};
