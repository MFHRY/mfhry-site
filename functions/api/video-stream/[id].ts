// 视频流：GET/HEAD /api/video-stream/:id
// D1 里按 1.5MB 切片存 BLOB，这里按 HTTP Range 拼回，让 <video> 能拖动进度。
function toBytes(value: any): Uint8Array {
  if (!value) return new Uint8Array(0);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (value.type === 'Buffer' && Array.isArray(value.data)) return Uint8Array.from(value.data);
  return new Uint8Array(0);
}

function parseRange(header: string, total: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  let start: number, end: number;
  if (m[1] === '') {
    const suffix = Number(m[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? total - 1 : Number(m[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (start >= total || start > end) return null;
    end = Math.min(end, total - 1);
  }
  return { start, end };
}

export const onRequestGet = async (ctx: any) => {
  const { env, params, request } = ctx;
  const id = String(params.id || '');
  if (!/^[0-9a-f-]{20,40}$/i.test(id)) return new Response('bad id', { status: 400 });

  const meta: any = await env.DB.prepare(
    'SELECT status, size, mime, chunk_size FROM video_uploads WHERE id = ?',
  ).bind(id).first();
  if (!meta || meta.status !== 'ready') return new Response('not found', { status: 404 });

  const total = Number(meta.size);
  const mime = String(meta.mime || 'video/mp4');
  const chunkSize = Number(meta.chunk_size) || 1_500_000;
  const rangeHeader = request.headers.get('range');
  const isHead = request.method === 'HEAD';
  const parsed = rangeHeader ? parseRange(rangeHeader, total) : null;

  if (rangeHeader && !parsed) {
    return new Response(null, {
      status: 416,
      headers: {
        'content-range': `bytes */${total}`,
        'accept-ranges': 'bytes',
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  }

  let start = parsed ? parsed.start : 0;
  let end = parsed ? parsed.end : total - 1;
  const partial = !!parsed;
  // 单次最多回 4MB，避免一次读太多 D1 行；播放器会继续请求下一段。
  if (partial && end - start + 1 > 4 * 1024 * 1024) end = start + 4 * 1024 * 1024 - 1;

  const headers: Record<string, string> = {
    'content-type': mime,
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  };
  if (partial) headers['content-range'] = `bytes ${start}-${end}/${total}`;
  headers['content-length'] = String(end - start + 1);

  if (isHead) return new Response(null, { status: partial ? 206 : 200, headers });

  const first = Math.floor(start / chunkSize);
  const last = Math.floor(end / chunkSize);
  const rows: any = await env.DB.prepare(
    'SELECT idx, data FROM video_chunks WHERE upload_id = ? AND idx BETWEEN ? AND ? ORDER BY idx ASC',
  ).bind(id, first, last).all();
  const list = rows.results || [];
  if (list.length !== last - first + 1) return new Response('chunks missing', { status: 500 });

  const out = new Uint8Array(end - start + 1);
  for (const row of list) {
    const idx = Number(row.idx);
    const bytes = toBytes(row.data);
    const chunkStart = idx * chunkSize;
    const from = Math.max(0, start - chunkStart);
    const to = Math.min(chunkSize, end - chunkStart + 1);
    if (to > from && bytes.length) out.set(bytes.subarray(from, to), chunkStart + from - start);
  }

  return new Response(out, { status: partial ? 206 : 200, headers });
};

export const onRequestHead = onRequestGet;
