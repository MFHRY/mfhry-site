// 删除新闻：DELETE /api/news/:id  （header x-admin-key 或 ?key=）
const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const onRequestDelete = async (ctx: any) => {
  const { env, request, params } = ctx;
  const url = new URL(request.url);
  const key = request.headers.get('x-admin-key') || url.searchParams.get('key') || '';
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return json({ error: '无权删除' }, 403);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'id 不对' }, 400);

  await env.DB.prepare('DELETE FROM media WHERE news_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM news WHERE id = ?').bind(id).run();
  return json({ ok: true });
};
