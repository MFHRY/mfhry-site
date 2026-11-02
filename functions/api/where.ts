// 查看当前请求命中的 Cloudflare 边缘节点
export const onRequestGet = async (ctx: any) => {
  const req: any = ctx.request;
  const cf: any = req.cf || {};
  const data = {
    colo: cf.colo || null,
    country: cf.country || null,
    region: cf.region || null,
    city: cf.city || null,
    asn: cf.asn || null,
    timezone: cf.timezone || null,
    ip: req.headers.get('CF-Connecting-IP') || null,
    ray: req.headers.get('CF-Ray') || null,
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};
