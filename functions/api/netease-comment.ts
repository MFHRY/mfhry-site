// 网易云音乐评论代理：浏览器直连 music.163.com 会被 CORS / 防盗链拦，
// 这里在 Edge 端代取评论，返回清洗后的热评 + 最新评论。
// GET /api/netease-comment?id=<网易云歌曲ID>&limit=20&offset=0
//   → { id, total, more, hot:[{user,avatar,content,time,liked,loc}], comments:[...] }
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export const onRequestGet = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') || '').trim();
  if (!/^\d{1,12}$/.test(id)) return json({ error: 'bad id' }, 400);
  const limit = Math.min(30, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

  const target = `https://music.163.com/api/v1/resource/comments/R_SO_4_${id}?limit=${limit}&offset=${offset}`;
  try {
    const r = await fetch(target, {
      headers: { 'User-Agent': UA, Referer: 'https://music.163.com/' },
      cf: { cacheTtl: 300, cacheEverything: true },
    } as any);
    if (!r.ok) return json({ error: 'upstream ' + r.status }, 502);
    const d = (await r.json()) as any;
    if (d.code !== 200) return json({ error: 'netease ' + (d.code ?? 'err') }, 502);
    const pick = (c: any) => ({
      user: c?.user?.nickname || '匿名',
      avatar: c?.user?.avatarUrl || '',
      content: c?.content || '',
      time: c?.time || 0,
      liked: c?.likedCount || 0,
      loc: (c?.user?.location || '') as string,
    });
    return json({
      id,
      total: d.total ?? 0,
      more: !!d.more,
      hot: ((d.hotComments || []) as any[]).map(pick),
      comments: ((d.comments || []) as any[]).map(pick),
    });
  } catch {
    return json({ error: 'upstream failed' }, 502);
  }
};
