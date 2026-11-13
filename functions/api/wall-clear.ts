// 临时：清空墙全部内容（posts + 关联 media）。删墙功能前的最后一次数据清理。
// POST /api/wall-clear?key=ADMIN_KEY
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export const onRequestPost = async ({ env, request }: { env: any; request: Request }) => {
  const key = request.headers.get('x-admin-key') || new URL(request.url).searchParams.get('key') || '';
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) return json({ error: '无权' }, 403);
  const media = await env.DB.prepare('DELETE FROM media WHERE post_id IN (SELECT id FROM posts)').run();
  const posts = await env.DB.prepare('DELETE FROM posts').run();
  return json({ ok: true, media: (media.meta as any)?.changes ?? 0, posts: (posts.meta as any)?.changes ?? 0 });
};
