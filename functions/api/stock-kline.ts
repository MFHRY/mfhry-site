// 炒股模拟器：真实 K 线
// GET /api/stock-kline?symbol=600519&period=day|week|month|min5|min30|min60&limit=180
//
// 数据源优先级（东财在国内快、在边缘节点慢，所以拿它当兜底）：
//   A股  日/周/月：腾讯 fqkline（前复权）→ 东财
//   A股  分钟：    腾讯 mkline → 东财
//   美股 全部：    Yahoo chart → 东财
// 结果按 symbol+period 缓存进 D1，日线 2 分钟、分钟线 1 分钟，避免每次都打上游。
import { ensureSchema, json, metaOf } from '../lib/stock';

interface Env { DB: D1Database }

type Candle = { t: string; o: number; h: number; l: number; c: number; v: number };

const PERIODS: Record<string, { ttl: number; label: string; intraday: boolean }> = {
  min5: { ttl: 60_000, label: '5 分钟', intraday: true },
  min30: { ttl: 90_000, label: '30 分钟', intraday: true },
  min60: { ttl: 120_000, label: '60 分钟', intraday: true },
  day: { ttl: 120_000, label: '日 K', intraday: false },
  week: { ttl: 300_000, label: '周 K', intraday: false },
  month: { ttl: 600_000, label: '月 K', intraday: false },
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';

async function getJson(url: string, timeout = 8000, headers: Record<string, string> = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmtDay = (s: string) => s.slice(0, 10);
const fmtMin = (s: string) => {
  // '202611171440' -> '11-17 14:40'
  if (/^\d{12}$/.test(s)) return s.slice(4, 6) + '-' + s.slice(6, 8) + ' ' + s.slice(8, 10) + ':' + s.slice(10, 12);
  return s.slice(5, 16);
};

// ---------- 腾讯：A股 日/周/月（前复权） ----------
async function tencentDaily(meta: any, period: string, limit: number): Promise<Candle[]> {
  const sym = (meta.market === 'us' ? 'us' : meta.market) + meta.symbol;
  const url = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=' +
    encodeURIComponent(sym + ',' + period + ',,,' + (limit + 8) + ',qfq');
  const d: any = await getJson(url, 8000, { Referer: 'https://gu.qq.com/' });
  const node = d?.data?.[sym];
  if (!node) return [];
  const rows: any[] = node['qfq' + period] || node[period] || [];
  if (!Array.isArray(rows)) return [];
  const out: Candle[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 6) continue;
    const o = num(r[1]), c = num(r[2]), h = num(r[3]), l = num(r[4]);
    if (!o || !c) continue;
    out.push({ t: fmtDay(String(r[0])), o, h, l, c, v: num(r[5]) });
  }
  // 腾讯美股会塞一根 2011 年的锚点，排序后取尾部即可
  out.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  return out.slice(-limit);
}

// ---------- 腾讯：A股 分钟 ----------
async function tencentMin(meta: any, period: string, limit: number): Promise<Candle[]> {
  const ktype = period.replace('min', 'm'); // min5 -> m5
  const sym = meta.market + meta.symbol;
  const url = 'https://ifzq.gtimg.cn/appstock/app/kline/mkline?param=' +
    encodeURIComponent(sym + ',' + ktype + ',,' + (limit + 5));
  const d: any = await getJson(url, 8000, { Referer: 'https://gu.qq.com/' });
  const rows: any[] = d?.data?.[sym]?.[ktype] || [];
  if (!Array.isArray(rows)) return [];
  const out: Candle[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 6) continue;
    const o = num(r[1]), c = num(r[2]), h = num(r[3]), l = num(r[4]);
    if (!o || !c) continue;
    out.push({ t: fmtMin(String(r[0])), o, h, l, c, v: num(r[5]) });
  }
  return out.slice(-limit);
}

// ---------- Yahoo：美股 全部周期 ----------
const YAHOO: Record<string, { range: string; interval: string }> = {
  min5: { range: '5d', interval: '5m' },
  min30: { range: '1mo', interval: '30m' },
  min60: { range: '3mo', interval: '60m' },
  day: { range: '1y', interval: '1d' },
  week: { range: '5y', interval: '1wk' },
  month: { range: '10y', interval: '1mo' },
};

async function yahoo(meta: any, period: string, limit: number): Promise<Candle[]> {
  const cfg = YAHOO[period];
  if (!cfg) return [];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(meta.symbol)}` +
    `?range=${cfg.range}&interval=${cfg.interval}&includePrePost=false&events=none`;
  const d: any = await getJson(url, 9000, { Accept: 'application/json' });
  const r0 = d?.chart?.result?.[0];
  const ts: number[] = r0?.timestamp || [];
  const q = r0?.indicators?.quote?.[0];
  if (!ts.length || !q) return [];
  const off = num(r0?.meta?.gmtoffset);
  const intraday = PERIODS[period].intraday;
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = num(q.open?.[i]), c = num(q.close?.[i]), h = num(q.high?.[i]), l = num(q.low?.[i]);
    if (!o || !c || !h || !l) continue; // Yahoo 会给出 null 行
    // 按交易所时区还原日期，避免跨时区差一天
    const iso = new Date((ts[i] + off) * 1000).toISOString();
    out.push({
      t: intraday ? iso.slice(5, 10) + ' ' + iso.slice(11, 16) : iso.slice(0, 10),
      o, h, l, c, v: num(q.volume?.[i]),
    });
  }
  return out.slice(-limit);
}

// ---------- 东财：兜底（慢，但覆盖全） ----------
const EM_KLT: Record<string, { klt: string; intraday: boolean }> = {
  min5: { klt: '5', intraday: true },
  min30: { klt: '30', intraday: true },
  min60: { klt: '60', intraday: true },
  day: { klt: '101', intraday: false },
  week: { klt: '102', intraday: false },
  month: { klt: '103', intraday: false },
};

async function eastmoney(meta: any, period: string, limit: number): Promise<Candle[]> {
  const cfg = EM_KLT[period];
  if (!cfg) return [];
  const url = 'https://push2his.eastmoney.com/api/qt/stock/kline/get?' + new URLSearchParams({
    secid: meta.secid,
    klt: cfg.klt,
    fqt: '1',
    beg: '0',
    end: '20500101',
    lmt: String(limit),
    fields1: 'f1,f2,f3,f4,f5,f6',
    fields2: 'f51,f52,f53,f54,f55,f56',
  }).toString();
  const d: any = await getJson(url, 16000, { Referer: 'https://quote.eastmoney.com/' });
  const lines: string[] = d?.data?.klines || [];
  const out: Candle[] = [];
  for (const raw of lines) {
    const p = String(raw).split(',');
    if (p.length < 6) continue;
    const o = num(p[1]), c = num(p[2]), h = num(p[3]), l = num(p[4]);
    if (!o || !c) continue;
    out.push({
      t: cfg.intraday ? p[0].slice(5, 16) : p[0].slice(0, 10),
      o, h, l, c, v: num(p[5]),
    });
  }
  return out.slice(-limit);
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
      return json({ ...JSON.parse(String(row.payload)), cached: true });
    }

    const isA = meta.market === 'sh' || meta.market === 'sz';
    const tries: Array<{ name: string; run: () => Promise<Candle[]> }> = [];
    if (isA) {
      tries.push({ name: 'tencent', run: () => (cfg.intraday ? tencentMin(meta, period, limit) : tencentDaily(meta, period, limit)) });
      tries.push({ name: 'eastmoney', run: () => eastmoney(meta, period, limit) });
    } else {
      tries.push({ name: 'yahoo', run: () => yahoo(meta, period, limit) });
      tries.push({ name: 'eastmoney', run: () => eastmoney(meta, period, limit) });
    }

    let candles: Candle[] = [];
    let source = '';
    for (const t of tries) {
      try {
        const got = await t.run();
        if (got.length >= 2) { candles = got; source = t.name; break; }
      } catch {
        /* 换下一个源 */
      }
    }

    // 上游给的是浮点（352.9200134277344），统一收一下小数位
    const r3 = (n: number) => Math.round(n * 1000) / 1000;
    candles = candles.map((c) => ({ t: c.t, o: r3(c.o), h: r3(c.h), l: r3(c.l), c: r3(c.c), v: Math.round(c.v) }));

    if (!candles.length) {
      if (row?.payload) return json({ ...JSON.parse(String(row.payload)), cached: true, stale: true });
      return json({ error: '这只票暂时没有 K 线数据，稍后再试' }, 404);
    }

    const payload = {
      ok: true,
      symbol: meta.symbol,
      market: meta.market,
      name: meta.name,
      period,
      interval: cfg.label,
      source,
      serverTime: Date.now(),
      candles,
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
