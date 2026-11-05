// 删除某条留言：DELETE /api/wall/:id?key=ADMIN_KEY
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

  // R2 视频：一起删掉，释放存储（外链视频不受影响）
  const row: any = await env.DB.prepare('SELECT video FROM posts WHERE id = ?').bind(id).first();
  if (!row) return json({ error: '没有这条' }, 404);
  if (row.video) {
    const rm = /^\/api\/r2\?key=(wall(?:%2F|\/).+)/i.exec(String(row.video));
    if (rm) {
      try {
        const { r2Bucket } = await import('../../lib/r2');
        const bucket = r2Bucket(env);
        if (bucket) await bucket.delete(decodeURIComponent(rm[1]));
      } catch (e) {}
    }
  }

  await env.DB.prepare('DELETE FROM media WHERE post_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  return json({ ok: true });
};
