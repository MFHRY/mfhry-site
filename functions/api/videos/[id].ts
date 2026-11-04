// 删除视频：DELETE /api/videos/:id （header x-admin-key 或 ?key=）
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

  const row: any = await env.DB.prepare('SELECT cover, url FROM videos WHERE id = ?').bind(id).first();
  if (!row) return json({ error: '没有这条' }, 404);

  if (row.cover) await env.DB.prepare('DELETE FROM media WHERE id = ?').bind(row.cover).run();
  await env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(id).run();

  // 服务器切片视频：连同 BLOB 切片和上传记录一起清理，避免占满 D1。
  const m = /^\/api\/video-stream\/([0-9a-f-]{20,40})$/i.exec(String(row.url || ''));
  if (m) {
    await env.DB.prepare('DELETE FROM video_chunks WHERE upload_id = ?').bind(m[1]).run();
    await env.DB.prepare('DELETE FROM video_uploads WHERE id = ?').bind(m[1]).run();
  }
  return json({ ok: true });
};
