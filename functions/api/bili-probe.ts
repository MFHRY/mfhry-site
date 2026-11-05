// 临时诊断：从 Worker 探测能否拉取 B 站页面/playurl。确认后删除。
const TOKEN = 'bilidiag-9f2e7d1b';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const onRequestGet = async ({ request }: any) => {
  const url = new URL(request.url);
  if (url.searchParams.get('t') !== TOKEN) return new Response('not found', { status: 404 });
  const bvid = url.searchParams.get('bv') || 'BV1H27E6vEgh';
  const out: any = {};
  try {
    const page = await fetch('https://www.bilibili.com/video/' + bvid, {
      headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/' },
      redirect: 'follow',
    });
    out.pageStatus = page.status;
    const cookieHeader = page.headers.get('set-cookie') || '';
    out.hasCookie = !!cookieHeader;
    const cookies = cookieHeader.split(/,(?![^=;]+=)/).map((c) => c.split(';')[0].trim()).filter(Boolean);
    out.cookieCount = cookies.length;
    const text = await page.text();
    const m = text.match(/"cid":(\d+)/);
    out.cid = m ? m[1] : null;
    if (m && cookies.length) {
      const pr = await fetch(
        'https://api.bilibili.com/x/player/playurl?bvid=' + bvid + '&cid=' + m[1] + '&qn=64&fnval=0&fourk=1&platform=html5',
        { headers: { 'user-agent': UA, referer: 'https://www.bilibili.com/video/' + bvid, cookie: cookies.join('; ') } },
      );
      const body = await pr.json().catch(() => null);
      out.playStatus = pr.status;
      out.playCode = body?.code;
      out.playMsg = body?.message;
      out.quality = body?.data?.quality;
      out.durl = body?.data?.durl?.length || 0;
      out.firstSize = body?.data?.durl?.[0]?.size || null;
    }
  } catch (e: any) {
    out.error = String(e && e.message || e);
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};