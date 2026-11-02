// 诊断：GET /api/x?url=...&debug=1
import { fetchTweet, tweetId } from '../lib/tweet';

const j = (data: any, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const onRequestGet = async (ctx: any) => {
  const p = new URL(ctx.request.url).searchParams;
  const url = p.get('url') || '';
  const id = tweetId(url);
  if (!id) return j({ error: '不是有效的 X 链接' }, 400);

  if (p.get('debug')) {
    const token = (Number(id) / 1e15 * Math.PI).toString(36).replace(/0/g, '').replace(/\./g, '');
    const diag: any = { id, token };

    try {
      const r = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${token}`, {
        signal: AbortSignal.timeout(8000),
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          accept: 'application/json, text/plain, */*',
          referer: 'https://platform.twitter.com/',
          origin: 'https://platform.twitter.com',
        },
      });
      diag.syndicationStatus = r.status;
      const t = await r.text();
      diag.syndicationLen = t.length;
      try {
        const o = JSON.parse(t);
        diag.keys = Object.keys(o);
        diag.photos = (o.photos || []).map((x: any) => x.url);
        diag.mediaCount = (o.mediaDetails || []).length;
      } catch {
        diag.body = t.slice(0, 200);
      }
    } catch (e: any) {
      diag.syndicationError = e?.message || String(e);
    }

    try {
      const r2 = await fetch('https://pbs.twimg.com/media/HV25Pu5acAEHhrO.jpg?name=small', {
        signal: AbortSignal.timeout(8000),
      });
      diag.pbsStatus = r2.status;
      diag.pbsType = r2.headers.get('content-type');
      diag.pbsLen = (await r2.arrayBuffer()).byteLength;
    } catch (e: any) {
      diag.pbsError = e?.message || String(e);
    }

    return j(diag);
  }

  const t = await fetchTweet(url);
  return j({
    url: t.url,
    id: t.id,
    author: t.author,
    handle: t.handle,
    text: t.text,
    date: t.date,
    error: t.error || null,
    photos: (t.photos || []).map((p2) => ({ mime: p2.mime, size: p2.size })),
  });
};
