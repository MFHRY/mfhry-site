// Shared, persisted synthetic FX candles for the simulator.
// GET /api/fx-candles?pair=EUR/USD&range=1min|10min|1day|5d|1m|1y
interface Env { DB: D1Database }

type Pair = 'EUR/USD' | 'USD/JPY' | 'EUR/JPY';
type RangeKey = '1min' | '10min' | '1day' | '5d' | '1m' | '1y';

const PAIRS: Record<Pair, { base: number; digits: number }> = {
  'EUR/USD': { base: 1.085, digits: 5 },
  'USD/JPY': { base: 150, digits: 3 },
  'EUR/JPY': { base: 162.75, digits: 3 },
};
const RANGES: Record<RangeKey, { step: number; count: number; sigma: number; label: string; series: string }> = {
  '1min': { step: 60_000, count: 120, sigma: 0.00005, label: '1 分钟', series: '1min' },
  '10min': { step: 10 * 60_000, count: 144, sigma: 0.00012, label: '10 分钟', series: '10min' },
  // 1day and 1y are different zoom levels over the same persisted daily series.
  '1day': { step: 24 * 60 * 60_000, count: 120, sigma: 0.0018, label: '1 日', series: '1d' },
  '5d': { step: 15 * 60_000, count: 480, sigma: 0.00022, label: '5 天 · 15 分钟', series: '5d' },
  '1m': { step: 60 * 60_000, count: 720, sigma: 0.00052, label: '1 月 · 1 小时', series: '1m' },
  '1y': { step: 24 * 60 * 60_000, count: 365, sigma: 0.0018, label: '1 年 · 1 天', series: '1d' },
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function hashSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0 || 1;
}
function random01(seed: number, salt: number) {
  let x = (seed + Math.imul(salt + 1, 0x6d2b79f5)) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12; x = Math.imul(x, 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}
function roundPrice(n: number, digits: number) {
  return Number(n.toFixed(digits));
}
function makeBar(pair: Pair, cfg: { sigma: number }, series: string, bucket: number, open: number, progress: number) {
  const seed = hashSeed(pair + ':' + series + ':' + bucket);
  const drift = (random01(seed, 0) - 0.5) * cfg.sigma * 2.1;
  // Gentle mean reversion keeps 5d/1m/1y endpoints near the same instrument level.
  const pull = (PAIRS[pair].base - open) * 0.03;
  const target = Math.max(PAIRS[pair].base * 0.1, open * (1 + drift) + pull);
  const close = open + (target - open) * progress;
  const wiggle = open * cfg.sigma * 0.24 * Math.sqrt(progress);
  const high = Math.max(open, close) + random01(seed, 1) * wiggle;
  const low = Math.min(open, close) - random01(seed, 2) * wiggle;
  const d = PAIRS[pair].digits;
  return { o: roundPrice(open, d), h: roundPrice(high, d), l: roundPrice(low, d), c: roundPrice(close, d) };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const pair = url.searchParams.get('pair') as Pair;
  const range = url.searchParams.get('range') as RangeKey;
  if (!Object.prototype.hasOwnProperty.call(PAIRS, pair) || !Object.prototype.hasOwnProperty.call(RANGES, range)) {
    return json({ error: 'pair/range 不支持' }, 400);
  }

  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS fx_candles (
      pair TEXT NOT NULL,
      range_key TEXT NOT NULL,
      bucket INTEGER NOT NULL,
      o REAL NOT NULL,
      h REAL NOT NULL,
      l REAL NOT NULL,
      c REAL NOT NULL,
      progress REAL NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (pair, range_key, bucket)
    )`).run();

    const cfg = RANGES[range];
    const seriesKey = cfg.series;
    const now = Date.now();
    const currentBucket = Math.floor(now / cfg.step) * cfg.step;
    const startBucket = currentBucket - (cfg.count - 1) * cfg.step;
    const rows = await env.DB.prepare(
      'SELECT bucket, o, h, l, c, progress FROM fx_candles WHERE pair = ? AND range_key = ? AND bucket BETWEEN ? AND ? ORDER BY bucket ASC',
    ).bind(pair, seriesKey, startBucket, currentBucket).all();
    const byBucket = new Map<number, any>((rows.results || []).map((r: any) => [Number(r.bucket), r]));
    const previous: any = await env.DB.prepare(
      'SELECT c FROM fx_candles WHERE pair = ? AND range_key = ? AND bucket < ? ORDER BY bucket DESC LIMIT 1',
    ).bind(pair, seriesKey, startBucket).first();

    let priorClose = previous ? Number(previous.c) : PAIRS[pair].base;
    const writes: D1PreparedStatement[] = [];
    const stamp = new Date(now).toISOString();
    for (let bucket = startBucket; bucket <= currentBucket; bucket += cfg.step) {
      const progress = bucket === currentBucket
        ? clamp((now - bucket) / cfg.step, 0.04, 1)
        : 1;
      const targetProgress = Math.max(progress, Number(byBucket.get(bucket)?.progress || 0));
      const old = byBucket.get(bucket);
      if (old) {
        const open = Number(old.o);
        if (Number(old.progress) < targetProgress) {
          const bar = makeBar(pair, cfg, seriesKey, bucket, open, targetProgress);
          writes.push(env.DB.prepare(`UPDATE fx_candles
            SET h = MAX(h, ?), l = MIN(l, ?),
                c = CASE WHEN progress < ? THEN ? ELSE c END,
                progress = MAX(progress, ?), updated_at = ?
            WHERE pair = ? AND range_key = ? AND bucket = ?`)
            .bind(bar.h, bar.l, targetProgress, bar.c, targetProgress, stamp, pair, seriesKey, bucket));
          old.h = Math.max(Number(old.h), bar.h);
          old.l = Math.min(Number(old.l), bar.l);
          old.c = bar.c;
          old.progress = targetProgress;
        }
        priorClose = Number(old.c);
        continue;
      }
      const bar = makeBar(pair, cfg, seriesKey, bucket, priorClose, progress);
      writes.push(env.DB.prepare(`INSERT OR IGNORE INTO fx_candles
        (pair, range_key, bucket, o, h, l, c, progress, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(pair, seriesKey, bucket, bar.o, bar.h, bar.l, bar.c, progress, stamp));
      byBucket.set(bucket, { bucket, ...bar, progress });
      priorClose = bar.c;
    }
    for (let i = 0; i < writes.length; i += 80) await env.DB.batch(writes.slice(i, i + 80));

    const result = await env.DB.prepare(
      'SELECT bucket AS t, o, h, l, c FROM fx_candles WHERE pair = ? AND range_key = ? AND bucket BETWEEN ? AND ? ORDER BY bucket ASC',
    ).bind(pair, seriesKey, startBucket, currentBucket).all();
    return json({
      pair,
      range,
      interval: cfg.label,
      serverTime: now,
      stored: true,
      candles: result.results || [],
    });
  } catch (error) {
    return json({ error: '共享 K 线读取失败', detail: String((error as Error)?.message || error) }, 503);
  }
};
