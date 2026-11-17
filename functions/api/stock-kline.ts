// 炒股模拟器：真实 K 线
// GET /api/stock-kline?symbol=600519&period=day|week|month|min5|min15|min30|min60&limit=180
// 数据来自东方财富历史行情（前复权），服务端缓存，日线 2 分钟 / 分钟线 30 秒
import { ensureSchema, json, metaOf } from '../lib/stock';

interface Env { DB: D1Database }

const PERIODS: Record<string, { klt: string; ttl: number; label: string; intraday: boolean }> = {
  min5: { klt: '5', ttl: 30_000, label: '5 分钟', intraday: true },
  min15: { klt: '15', ttl: 30_000, label: '15 分钟', intraday: true },
  min30: { klt: '30', ttl: 45_000, label: '30 分钟', intraday: true },
  min60: { klt: '60', ttl: 60_000, label: '60 分钟', intraday: true },
  day: { klt: '101', ttl: 120_000, label: '日 K', intraday: false },
  week: { klt: '102', ttl: 300_000, label: '周 K', intraday: false },
  month: { klt: '103', ttl: 600_000, label: '月 K', intraday: false },
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';

function parseKlines(lines: string[], intraday: boolean) {
  const out: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }> = [];
  for (const raw of lines) {
    const p = raw.split(',');
    if (p.length < 6) continue;
    const t = p[0];
    const o = Number(p[1]);
    const c = Number(p[2]);
    const h = Number(p[3]);
    const l = Number(p[4]);
    const v = Number(p[5]);
    if (![o, c, h, l].every(Number.isFinite)) continue;
    out.push({
      // 分钟线只保留 "MM-DD HH:mm"，日线保留 "YYYY-MM-DD"
      t: intraday ? t.replace(/^\d{4}-/, '') : t,
      o, h, l, c, v: Number.isFinite(v) ? v : 0,
    });
  }
  return out;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await ensureSchema(env);
    const url = new URL(request.url);
    const meta = metaOf(url.searchParams.get('symbol') || '');
    if (!meta) return json({ error: '没有这个股票代码' }, 400);
    const period = String(url.searchParams.get('period') || 'day');
    const cfg = PERIODS[period];
    if (!cfg) return json({ error: 'period 不支持' }, 400);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 180, 20), 500);

    const cacheKey = period + ':' + limit;
    const row: any = await env.DB.prepare('SELECT payload, fetched_at FROM stock_klines WHERE symbol = ? AND period = ?')
      .bind(meta.symbol, cacheKey)
      .first();
    if (row?.fetched_at && Date.now() - Date.parse(String(row.fetched_at).replace(' ', 'T') + 'Z') < cfg.ttl) {
      const payload = JSON.parse(String(row.payload));
      return json({ ...payload, cached: true });
    }

    const api =
      'https://push2his.eastmoney.com/api/qt/stock/kline/get?' +
      new URLSearchParams({
        secid: meta.secid,
        klt: cfg.klt,
        fqt: '1',
        beg: '0',
        end: '20500101',
        lmt: String(limit),
        fields1: 'f1,f2,f3,f4,f5,f6',
        fields2: 'f51,f52,f53,f54,f55,f56,f57',
      }).toString();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    let data: any;
    try {
      const res = await fetch(api, { headers: { 'User-Agent': UA, Referer: 'https://quote.eastmoney.com/' }, signal: ctrl.signal });
      if (!res.ok) throw new Error('eastmoney ' + res.status);
      data = await res.json();
    } finally {
      clearTimeout(timer);
    }

    const d = data?.data;
    if (!d || !Array.isArray(d.klines) || !d.klines.length) {
      // 东财没给数据：有旧缓存就先用旧的，别再报错
      if (row?.payload) return json({ ...JSON.parse(String(row.payload)), cached: true, stale: true });
      return json({ error: '这只票暂时没有 K 线数据' }, 404);
    }

    const payload = {
      ok: true,
      symbol: meta.symbol,
      market: meta.market,
      name: String(d.name || meta.name),
      period,
      interval: cfg.label,
      decimals: Number(d.decimal ?? 2),
      serverTime: Date.now(),
      candles: parseKlines(d.klines as string[], cfg.intraday),
    };

    await env.DB.prepare(
      `INSERT INTO stock_klines (symbol, period, payload, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(symbol, period) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
    )
      .bind(meta.symbol, cacheKey, JSON.stringify(payload), new Date().toISOString().slice(0, 19).replace('T', ' '))
      .run();

    return json({ ...payload, cached: false });
  } catch (error) {
    return json({ error: 'K 线读取失败', detail: String((error as Error)?.message || error) }, 503);
  }
};
