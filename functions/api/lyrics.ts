// 歌词代理：GET /api/lyrics?track=歌名&artist=歌手
// 数据源 LRCLIB（免费、无 key），边缘缓存 24h，避免前端跨域与重复请求。
interface Env {}

const CORS = {
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=86400',
};

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const url = new URL(request.url);
  const track = (url.searchParams.get('track') || '').trim();
  const artist = (url.searchParams.get('artist') || '').trim();
  if (!track) {
    return new Response(JSON.stringify({ error: 'missing track' }), {
      status: 400,
      headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const cacheKey = new Request(
    'https://lyrics.mfhry.internal/' + encodeURIComponent(track + '|' + artist),
    request,
  );
  const cache = (caches as any).default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const q = new URLSearchParams({ track_name: track });
  if (artist) q.set('artist_name', artist);

  let payload: any = { found: false };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch('https://lrclib.net/api/search?' + q.toString(), {
      signal: ctrl.signal,
      headers: { 'user-agent': 'mfhry.store/1.0 (https://mfhry.store)' },
    });
    clearTimeout(timer);
    if (r.ok) {
      const list = (await r.json()) as any[];
      const withSynced = (list || []).find((x) => x && x.syncedLyrics);
      const withPlain = (list || []).find((x) => x && x.plainLyrics);
      const pick = withSynced || withPlain;
      if (pick) {
        payload = {
          found: true,
          synced: pick.syncedLyrics || '',
          plain: pick.plainLyrics || '',
          track: pick.trackName || track,
          artist: pick.artistName || artist,
          duration: pick.duration || 0,
        };
      }
    }
  } catch (e) {
    payload = { found: false, error: 'upstream' };
  }

  const res = new Response(JSON.stringify(payload), {
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });
  try {
    await cache.put(cacheKey, res.clone());
  } catch (e) {}
  return res;
};
