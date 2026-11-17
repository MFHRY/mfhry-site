// 炒股模拟器的共用部分：股票池、东财真实行情、汇率、D1 建表与缓存。
// 只会被 functions/api/stock*.ts 引用。

export type Market = 'sh' | 'sz' | 'us';

export interface StockMeta {
  symbol: string;
  market: Market;
  secid: string; // 东财 secid：沪 1.xxx / 深 0.xxx / 美股 105|106.XXX
  name: string;
  en?: string;
}

// 股票池：A股（沪深各挑流动性好的）+ 美股（纳斯达克/纽交所）
export const STOCKS: StockMeta[] = [
  { symbol: '600519', market: 'sh', secid: '1.600519', name: '贵州茅台' },
  { symbol: '601318', market: 'sh', secid: '1.601318', name: '中国平安' },
  { symbol: '600036', market: 'sh', secid: '1.600036', name: '招商银行' },
  { symbol: '601899', market: 'sh', secid: '1.601899', name: '紫金矿业' },
  { symbol: '603259', market: 'sh', secid: '1.603259', name: '药明康德' },
  { symbol: '688981', market: 'sh', secid: '1.688981', name: '中芯国际' },
  { symbol: '600900', market: 'sh', secid: '1.600900', name: '长江电力' },
  { symbol: '601012', market: 'sh', secid: '1.601012', name: '隆基绿能' },
  { symbol: '000001', market: 'sz', secid: '0.000001', name: '平安银行' },
  { symbol: '000858', market: 'sz', secid: '0.000858', name: '五粮液' },
  { symbol: '002594', market: 'sz', secid: '0.002594', name: '比亚迪' },
  { symbol: '002415', market: 'sz', secid: '0.002415', name: '海康威视' },
  { symbol: '300750', market: 'sz', secid: '0.300750', name: '宁德时代' },
  { symbol: '300059', market: 'sz', secid: '0.300059', name: '东方财富' },
  { symbol: '300308', market: 'sz', secid: '0.300308', name: '中际旭创' },
  { symbol: '002230', market: 'sz', secid: '0.002230', name: '科大讯飞' },
  { symbol: 'AAPL', market: 'us', secid: '105.AAPL', name: '苹果', en: 'Apple' },
  { symbol: 'MSFT', market: 'us', secid: '105.MSFT', name: '微软', en: 'Microsoft' },
  { symbol: 'NVDA', market: 'us', secid: '105.NVDA', name: '英伟达', en: 'NVIDIA' },
  { symbol: 'GOOGL', market: 'us', secid: '105.GOOGL', name: '谷歌', en: 'Alphabet' },
  { symbol: 'AMZN', market: 'us', secid: '105.AMZN', name: '亚马逊', en: 'Amazon' },
  { symbol: 'META', market: 'us', secid: '105.META', name: 'Meta' },
  { symbol: 'TSLA', market: 'us', secid: '105.TSLA', name: '特斯拉', en: 'Tesla' },
  { symbol: 'AMD', market: 'us', secid: '105.AMD', name: '超威半导体', en: 'AMD' },
  { symbol: 'NFLX', market: 'us', secid: '105.NFLX', name: '奈飞', en: 'Netflix' },
  { symbol: 'INTC', market: 'us', secid: '105.INTC', name: '英特尔', en: 'Intel' },
  { symbol: 'BABA', market: 'us', secid: '106.BABA', name: '阿里巴巴', en: 'Alibaba' },
  { symbol: 'PDD', market: 'us', secid: '105.PDD', name: '拼多多', en: 'PDD' },
  { symbol: 'NIO', market: 'us', secid: '106.NIO', name: '蔚来', en: 'NIO' },
  { symbol: 'PLTR', market: 'us', secid: '105.PLTR', name: 'Palantir' },
];

export const BY_SYMBOL = new Map(STOCKS.map((s) => [s.symbol, s]));

export const START_CASH = 100000; // 开户送 10 万虚拟本金（元）
export const FEE_RATE = 0.00025; // 佣金 万 2.5
export const FEE_MIN = 1; // 最低 1 元
export const STAMP_RATE = 0.001; // A股卖出印花税 千 1
export const FX_FALLBACK = 7.1; // 拿不到汇率时的兜底（USD→CNY）

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const nowStamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

export const ipOf = (request: Request) =>
  request.headers.get('CF-Connecting-IP') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || '';

// ---------- 建表（和 migrations/stock-sim.sql 保持一致，首次访问自动建） ----------
let schemaReady = false;
export async function ensureSchema(env: any) {
  if (schemaReady) return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS stock_accounts (
      ip TEXT PRIMARY KEY, cash REAL NOT NULL DEFAULT 100000, recharged REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS stock_positions (
      ip TEXT NOT NULL, symbol TEXT NOT NULL, market TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
      PRIMARY KEY (ip, symbol))`,
    `CREATE TABLE IF NOT EXISTS stock_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ip TEXT NOT NULL, symbol TEXT NOT NULL, market TEXT NOT NULL,
      side TEXT NOT NULL, qty INTEGER NOT NULL, price REAL NOT NULL, amount REAL NOT NULL,
      fee REAL NOT NULL DEFAULT 0, at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS stock_quotes (
      symbol TEXT PRIMARY KEY, market TEXT NOT NULL, name TEXT, price REAL NOT NULL,
      prev REAL, open REAL, high REAL, low REAL, volume REAL, turnover REAL, fetched_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS stock_klines (
      symbol TEXT NOT NULL, period TEXT NOT NULL, payload TEXT NOT NULL, fetched_at TEXT NOT NULL,
      PRIMARY KEY (symbol, period))`,
    `CREATE TABLE IF NOT EXISTS stock_list (
      symbol TEXT PRIMARY KEY, market TEXT NOT NULL, name TEXT NOT NULL, alias TEXT,
      sort INTEGER NOT NULL DEFAULT 0)`,
    `CREATE INDEX IF NOT EXISTS idx_stock_trades_ip ON stock_trades(ip, id DESC)`,
  ];
  for (const sql of stmts) await env.DB.prepare(sql).run();
  schemaReady = true;
}

// ---------- 东财实时行情 ----------
export interface Quote {
  symbol: string;
  market: Market;
  name: string;
  price: number; // 原币价格（A股=元，美股=美元）
  prev: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  turnover: number;
  change: number;
  changePct: number;
  at: string;
  stale?: boolean;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// 一次批量问东财要现价；失败抛错，由调用方决定退回缓存
export async function fetchLiveQuotes(metas: StockMeta[]): Promise<Quote[]> {
  if (!metas.length) return [];
  const url =
    'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f2,f3,f4,f5,f6,f12,f14,f15,f16,f17,f18&secids=' +
    metas.map((m) => m.secid).join(',');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: 'https://quote.eastmoney.com/' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error('eastmoney ' + res.status);
    const data: any = await res.json();
    const diff: any[] = (data?.data?.diff as any[]) || [];
    const out: Quote[] = [];
    for (const row of diff) {
      const code = String(row.f12 || '');
      const meta = metas.find((m) => m.symbol === code) || metas.find((m) => m.symbol.toUpperCase() === code.toUpperCase());
      if (!meta) continue;
      const price = num(row.f2);
      if (!price) continue;
      const prev = num(row.f18) || price;
      out.push({
        symbol: meta.symbol,
        market: meta.market,
        name: String(row.f14 || meta.name || meta.symbol),
        price,
        prev,
        open: num(row.f17) || prev,
        high: num(row.f15) || price,
        low: num(row.f16) || price,
        volume: num(row.f5),
        turnover: num(row.f6),
        change: num(row.f4) || price - prev,
        changePct: num(row.f3) || ((price - prev) / (prev || 1)) * 100,
        at: nowStamp(),
      });
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 汇率（USD→CNY），走同一套缓存表 ----------
export async function getUsdCny(env: any): Promise<number> {
  const KEY = '__USDCNH';
  const row: any = await env.DB.prepare('SELECT price, fetched_at FROM stock_quotes WHERE symbol = ?')
    .bind(KEY)
    .first();
  const fresh = row?.fetched_at && Date.now() - Date.parse(String(row.fetched_at).replace(' ', 'T') + 'Z') < 60_000;
  if (row && fresh && Number(row.price) > 0) return Number(row.price);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(
      'https://push2.eastmoney.com/api/qt/stock/get?secid=133.USDCNH&fields=f43,f59&fltt=2',
      { headers: { 'User-Agent': UA, Referer: 'https://quote.eastmoney.com/' }, signal: ctrl.signal },
    );
    clearTimeout(timer);
    const data: any = await res.json();
    const rate = num(data?.data?.f43);
    if (rate > 3 && rate < 12) {
      await env.DB.prepare(
        `INSERT INTO stock_quotes (symbol, market, name, price, fetched_at) VALUES (?, 'fx', '美元兑离岸人民币', ?, ?)
         ON CONFLICT(symbol) DO UPDATE SET price = excluded.price, fetched_at = excluded.fetched_at`,
      )
        .bind(KEY, rate, nowStamp())
        .run();
      return rate;
    }
  } catch {
    /* 汇率拿不到就用缓存或兜底 */
  }
  return row && Number(row.price) > 0 ? Number(row.price) : FX_FALLBACK;
}

// ---------- 带缓存的行情读取 ----------
const QUOTE_TTL = 15_000;

export async function getQuotes(env: any, metas: StockMeta[]): Promise<{ quotes: Quote[]; live: boolean }> {
  const symbols = metas.map((m) => m.symbol);
  const placeholders = symbols.map(() => '?').join(',');
  let cached: any[] = [];
  if (symbols.length) {
    const rows = await env.DB.prepare(
      `SELECT symbol, market, name, price, prev, open, high, low, volume, turnover, fetched_at
         FROM stock_quotes WHERE symbol IN (${placeholders})`,
    )
      .bind(...symbols)
      .all();
    cached = rows.results || [];
  }
  const cachedMap = new Map(cached.map((r: any) => [String(r.symbol), r]));
  const fresh = cached.every(
    (r: any) => Date.now() - Date.parse(String(r.fetched_at).replace(' ', 'T') + 'Z') < QUOTE_TTL,
  );

  if (fresh && cached.length === symbols.length) {
    return { quotes: cached.map((r: any) => rowToQuote(r)), live: false };
  }

  try {
    const live = await fetchLiveQuotes(metas);
    if (live.length) {
      const stamp = nowStamp();
      const writes = live.map((q) =>
        env.DB.prepare(
          `INSERT INTO stock_quotes (symbol, market, name, price, prev, open, high, low, volume, turnover, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(symbol) DO UPDATE SET market=excluded.market, name=excluded.name, price=excluded.price,
             prev=excluded.prev, open=excluded.open, high=excluded.high, low=excluded.low,
             volume=excluded.volume, turnover=excluded.turnover, fetched_at=excluded.fetched_at`,
        ).bind(q.symbol, q.market, q.name, q.price, q.prev, q.open, q.high, q.low, q.volume, q.turnover, stamp),
      );
      for (let i = 0; i < writes.length; i += 50) await env.DB.batch(writes.slice(i, i + 50));
      // 补上这次没取到的（停牌等），继续用缓存
      const liveMap = new Map(live.map((q) => [q.symbol, q]));
      const merged = metas.map((m) => liveMap.get(m.symbol) || (cachedMap.get(m.symbol) ? rowToQuote(cachedMap.get(m.symbol)) : null)).filter(Boolean) as Quote[];
      return { quotes: merged, live: true };
    }
  } catch {
    /* 东财抽风就走缓存 */
  }
  const fallback = metas
    .map((m) => (cachedMap.get(m.symbol) ? { ...rowToQuote(cachedMap.get(m.symbol)), stale: true } : null))
    .filter(Boolean) as Quote[];
  return { quotes: fallback, live: false };
}

function rowToQuote(r: any): Quote {
  const price = Number(r.price);
  const prev = Number(r.prev) || price;
  return {
    symbol: String(r.symbol),
    market: r.market as Market,
    name: String(r.name || r.symbol),
    price,
    prev,
    open: Number(r.open) || prev,
    high: Number(r.high) || price,
    low: Number(r.low) || price,
    volume: Number(r.volume) || 0,
    turnover: Number(r.turnover) || 0,
    change: price - prev,
    changePct: prev ? ((price - prev) / prev) * 100 : 0,
    at: String(r.fetched_at || ''),
    stale: true,
  };
}

// 人民币计价的现价（美股按实时汇率折算）
export const cnyPrice = (q: Quote, fx: number) => (q.market === 'us' ? q.price * fx : q.price);

export function feeOf(market: Market, amount: number, side: 'buy' | 'sell') {
  let fee = Math.max(FEE_MIN, amount * FEE_RATE);
  if (side === 'sell' && (market === 'sh' || market === 'sz')) fee += amount * STAMP_RATE;
  return Math.round(fee * 100) / 100;
}

export function metaOf(symbol: string): StockMeta | undefined {
  return BY_SYMBOL.get(String(symbol || '').trim().toUpperCase()) || BY_SYMBOL.get(String(symbol || '').trim());
}
