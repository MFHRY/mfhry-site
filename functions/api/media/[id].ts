// 读取图片：GET /api/media/:id（data 列存 base64 文本）
export const onRequestGet = async (ctx: any) => {
  const { env, params } = ctx;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return new Response('bad id', { status: 400 });

  const row: any = await env.DB.prepare('SELECT mime, data FROM media WHERE id = ?').bind(id).first();
  if (!row || !row.data) return new Response('not found', { status: 404 });

  const s = typeof row.data === 'string' ? row.data : '';
  const bin = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  return new Response(bin, {
    headers: {
      'content-type': row.mime,
      'content-length': String(bin.length),
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
