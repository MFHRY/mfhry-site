// Stand with Jensen 镜像接口：用本地快照复刻原站 /api/* 的返回结构
//   /mirror-api/campaign               活动统计
//   /mirror-api/signatures?page=1&search=  公开签名者分页（page/pageSize/search）
//   /mirror-api/signatures/live         实时总数
//   /mirror-api/testimonials/featured   首页精选留言
//   其余写操作（签署/联系）一律拒绝：镜像只读。
const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60' },
  });

type Row = {
  id: number;
  name: string;
  title?: string;
  affiliation?: string;
  testimonial?: string;
  photoUrl?: string | null;
  createdAt?: string;
};

let cache: { at: number; rows: Row[]; campaign: any; publicTotal: number } | null = null;
const TTL = 60_000;

async function load(ctx: any) {
  if (cache && Date.now() - cache.at < TTL) return cache;
  const res = await ctx.env.ASSETS.fetch(new URL('/data/jensen-mirror.json', ctx.request.url));
  if (!res.ok) throw new Error('镜像快照不可用：HTTP ' + res.status);
  const data: any = await res.json();
  cache = {
    at: Date.now(),
    rows: data.items || [],
    campaign: data.campaign || {},
    publicTotal: Number(data.publicTotal) || (data.items || []).length,
  };
  return cache!;
}

export const onRequestGet = async (ctx: any) => {
  const url = new URL(ctx.request.url);
  const rawPath = ctx.params.path;
  const path = '/' + (Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '')).replace(/^\/+|\/+$/g, '');
  try {
    const { rows, campaign, publicTotal } = await load(ctx);

    if (path === '/campaign') return json(campaign);

    if (path === '/signatures/live') {
      return json({ items: [...rows].sort((a, b) => b.id - a.id).slice(0, 16), refreshedAt: new Date().toISOString() });
    }

    if (path === '/signatures') {
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get('pageSize')) || 100));
      const search = (url.searchParams.get('search') || '').trim().toLowerCase();
      const filtered = search
        ? rows.filter((r) => String(r.name || '').toLowerCase().includes(search))
        : rows;
      const start = (page - 1) * pageSize;
      const items = filtered.slice(start, start + pageSize);
      return json({ items, page, pageSize, total: filtered.length });
    }

    if (path === '/testimonials/featured') {
      const featured =
        rows.find((r) => (r.testimonial || '').trim().length > 40) ||
        rows[0] || { id: 0, name: 'Stand with Jensen', testimonial: '' };
      return json({
        id: featured.id,
        name: featured.name,
        title: featured.title || '',
        affiliation: featured.affiliation || '',
        testimonial: featured.testimonial || '',
      });
    }

    if (path === '/photos') return json({ items: [] });

    return json({ error: '镜像接口不支持该路径：' + path }, 404);
  } catch (err: any) {
    return json({ error: err?.message || '镜像读取失败' }, 503);
  }
};

export const onRequestPost = async (ctx: any) =>
  json({ error: '此页面为只读镜像，不接受签署或留言提交。请前往原站：https://standwithjensen.com' }, 405);

export const onRequestPut = async () => json({ error: '只读镜像' }, 405);
export const onRequestDelete = async () => json({ error: '只读镜像' }, 405);
