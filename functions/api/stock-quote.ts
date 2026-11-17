// 炒股模拟器：真实行情
// GET /api/stock-quote                      → 全部股票池现价（A股 + 美股）
// GET /api/stock-quote?symbols=600519,AAPL  → 只取这几只
// 价格来自东方财富，服务端缓存 15 秒，同一个 symbol 全站共用一份
import { STOCKS, getQuotes, getUsdCny, ensureSchema, json, metaOf, type StockMeta } from '../lib/stock';

interface Env { DB: D1Database }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await ensureSchema(env);
    const url = new URL(request.url);
    const raw = url.searchParams.get('symbols');
    let metas: StockMeta[] = STOCKS;
    if (raw) {
      metas = raw
        .split(',')
        .map((s) => metaOf(s))
        .filter(Boolean) as StockMeta[];
      if (!metas.length) return json({ error: '没有这个股票代码' }, 400);
    }

    const [{ quotes, live }, fx] = await Promise.all([getQuotes(env, metas), getUsdCny(env)]);

    return json({
      ok: true,
      fx: Math.round(fx * 10000) / 10000,
      live,
      serverTime: Date.now(),
      quotes: quotes.map((q) => ({
        ...q,
        price: Math.round(q.price * 1000) / 1000,
        prev: Math.round(q.prev * 1000) / 1000,
        cny: Math.round((q.market === 'us' ? q.price * fx : q.price) * 100) / 100,
      })),
      stocks: metas.map((m) => ({ symbol: m.symbol, market: m.market, name: m.name, en: m.en || '' })),
    });
  } catch (error) {
    return json({ error: '行情读取失败', detail: String((error as Error)?.message || error) }, 503);
  }
};
