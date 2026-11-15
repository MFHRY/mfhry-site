import { r2Bucket } from '../lib/r2';

// R2 用量盘点（口令保护）：GET /api/r2-stats?pass=...
// 汇总各前缀的对象数与字节数，并列出最大的若干对象，便于定位空间占用。
const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const onRequestGet = async (ctx: any) => {
  const { env, request } = ctx;
  if (!env.ADMIN_KEY || request.headers.get('x-admin-key') !== env.ADMIN_KEY) {
    return json({ error: '口令不对' }, 403);
  }
  const bucket = r2Bucket(env);
  if (!bucket) return json({ error: 'R2 未绑定' }, 503);

  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix') || '';
  const topN = Math.min(60, Number(url.searchParams.get('top') || 25));

  const byPrefix: Record<string, { count: number; bytes: number }> = {};
  const all: { key: string; size: number }[] = [];
  let cursor: string | undefined;
  let truncated = false;
  let pages = 0;

  do {
    const page: any = await bucket.list({ prefix, limit: 1000, cursor });
    for (const o of page.objects || []) {
      const size = Number(o.size || 0);
      all.push({ key: o.key, size });
      const p = o.key.split('/')[0] + '/';
      if (!byPrefix[p]) byPrefix[p] = { count: 0, bytes: 0 };
      byPrefix[p].count += 1;
      byPrefix[p].bytes += size;
    }
    cursor = page.truncated ? page.cursor : undefined;
    truncated = Boolean(page.truncated);
    pages += 1;
    if (pages > 200) break; // 安全上限，避免长时间占用
  } while (cursor);

  const totalBytes = all.reduce((s, o) => s + o.size, 0);
  all.sort((a, b) => b.size - a.size);

  return json({
    ok: true,
    totalObjects: all.length,
    totalBytes,
    totalGB: Number((totalBytes / 1073741824).toFixed(3)),
    byPrefix: Object.fromEntries(
      Object.entries(byPrefix).map(([k, v]) => [
        k,
        { count: v.count, bytes: v.bytes, GB: Number((v.bytes / 1073741824).toFixed(3)) },
      ])
    ),
    largest: all.slice(0, topN).map((o) => ({ key: o.key, MB: Number((o.size / 1048576).toFixed(1)) })),
    truncated,
  });
};
