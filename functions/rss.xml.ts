// /rss.xml —— 站点订阅：新闻（D1）+ 固定页面。边缘缓存 10 分钟。
interface Env {
  DB: D1Database;
}

const ORIGIN = 'https://mfhry.store';

const esc = (s: string) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const cache = (caches as any).default;
  const key = new Request('https://rss.mfhry.internal/site.xml', request);
  const hit = await cache.match(key);
  if (hit) return hit;

  let items: any[] = [];
  try {
    const rs = await env.DB.prepare(
      'SELECT id, title, body, created_at FROM news ORDER BY id DESC LIMIT 30',
    ).all();
    items = (rs.results || []) as any[];
  } catch (e) {
    items = [];
  }

  const entries = items
    .map((n) => {
      const body = String(n.body || '').slice(0, 600);
      return (
        '  <item>\n' +
        '    <title>' + esc(n.title || '新闻') + '</title>\n' +
        '    <link>' + ORIGIN + '/news/#n' + n.id + '</link>\n' +
        '    <guid isPermaLink="false">mfhry-news-' + n.id + '</guid>\n' +
        (n.created_at ? '    <pubDate>' + new Date(String(n.created_at).replace(' ', 'T') + 'Z').toUTCString() + '</pubDate>\n' : '') +
        '    <description>' + esc(body) + '</description>\n' +
        '  </item>\n'
      );
    })
    .join('');

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n' +
    '<channel>\n' +
    '  <title>mfhry.store</title>\n' +
    '  <link>' + ORIGIN + '/</link>\n' +
    '  <description>写点小东西，偶尔折腾硬件和游戏模组。</description>\n' +
    '  <language>zh-CN</language>\n' +
    '  <atom:link href="' + ORIGIN + '/rss.xml" rel="self" type="application/rss+xml" />\n' +
    '  <lastBuildDate>' + new Date().toUTCString() + '</lastBuildDate>\n' +
    entries +
    '</channel>\n</rss>\n';

  const res = new Response(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=600',
      'access-control-allow-origin': '*',
    },
  });
  try { await cache.put(key, res.clone()); } catch (e) {}
  return res;
};
