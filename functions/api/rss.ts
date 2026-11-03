// 外部订阅源代理：GET /api/rss?src=ruanyf|sspai|gcores&n=6
// 只做标题/链接/时间/摘要，边缘缓存 30 分钟（免得每次打开都打人家站点）。
interface Env {}

const FEEDS: Record<string, { name: string; url: string; home: string }> = {
  ruanyf: { name: '阮一峰的网络日志', url: 'https://www.ruanyifeng.com/blog/atom.xml', home: 'https://www.ruanyifeng.com/blog/' },
  sspai: { name: '少数派', url: 'https://sspai.com/feed', home: 'https://sspai.com/' },
  gcores: { name: '机核', url: 'https://www.gcores.com/rss', home: 'https://www.gcores.com/' },
};

const CORS = { 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=1800' };

const strip = (s: string) =>
  String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

function pick(block: string, tags: string[]) {
  for (const t of tags) {
    const m = new RegExp('<' + t + '[^>]*>([\\s\\S]*?)</' + t + '>', 'i').exec(block);
    if (m) return m[1];
  }
  return '';
}

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const url = new URL(request.url);
  const src = (url.searchParams.get('src') || 'ruanyf').trim();
  const n = Math.max(1, Math.min(12, Number(url.searchParams.get('n')) || 6));
  const feed = FEEDS[src];
  if (!feed) {
    return new Response(JSON.stringify({ error: 'unknown src' }), {
      status: 400,
      headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const cache = (caches as any).default;
  const key = new Request('https://rss.mfhry.internal/' + src + '?n=' + n, request);
  const hit = await cache.match(key);
  if (hit) return hit;

  let items: any[] = [];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(feed.url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'mfhry.store/1.0 (+https://mfhry.store)', accept: 'application/rss+xml, application/xml, text/xml, */*' },
    });
    clearTimeout(timer);
    const xml = await r.text();
    const chunks = xml.split(/<item[\s>]|<entry[\s>]/i).slice(1);
    items = chunks.slice(0, n).map((c) => {
      const title = strip(pick(c, ['title']));
      let link = strip(pick(c, ['link']));
      if (!link) {
        const m = /<link[^>]+href="([^"]+)"/i.exec(c);
        if (m) link = m[1];
      }
      const date = strip(pick(c, ['pubDate', 'published', 'updated', 'dc:date']));
      const desc = strip(pick(c, ['description', 'summary', 'content'])).slice(0, 140);
      return { title, link, date, desc };
    }).filter((x) => x.title && x.link);
  } catch (e) {
    items = [];
  }

  const res = new Response(JSON.stringify({ src, name: feed.name, home: feed.home, items }), {
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });
  try { await cache.put(key, res.clone()); } catch (e) {}
  return res;
};
