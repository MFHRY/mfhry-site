// 炒股模拟器：账户 / 持仓 / 交易（服务器存档，按 IP 记账）
// GET  /api/stock                    → 现金、持仓（含实时盈亏）、总资产、最近成交
// POST /api/stock  {action}           → buy / sell / recharge / reset
import {
  START_CASH, ensureSchema, getQuotes, getUsdCny, json, metaOf, ipOf, nowStamp, feeOf, cnyPrice,
  type StockMeta,
} from '../lib/stock';

interface Env { DB: D1Database }

const MAX_RECHARGE_TOTAL = 1_000_000; // 累计充值上限，防止无限加钱
const RECHARGE_MAX_ONCE = 200_000;

async function ensureAccount(env: any, ip: string) {
  const ts = nowStamp();
  await env.DB.prepare(
    `INSERT INTO stock_accounts (ip, cash, recharged, created_at, updated_at) VALUES (?, ?, 0, ?, ?)
     ON CONFLICT(ip) DO NOTHING`,
  )
    .bind(ip, START_CASH, ts, ts)
    .run();
  const row: any = await env.DB.prepare('SELECT cash, recharged, created_at FROM stock_accounts WHERE ip = ?')
    .bind(ip)
    .first();
  return { cash: Number(row?.cash ?? START_CASH), recharged: Number(row?.recharged ?? 0), since: row?.created_at || ts };
}

async function positionsOf(env: any, ip: string) {
  const rows = await env.DB.prepare(
    'SELECT symbol, market, qty, cost FROM stock_positions WHERE ip = ? AND qty > 0 ORDER BY symbol',
  )
    .bind(ip)
    .all();
  return (rows.results || []) as any[];
}

function metrics(acct: { cash: number; recharged: number }, positions: any[], quotes: any[], fx: number) {
  const bySymbol = new Map(quotes.map((q: any) => [q.symbol, q]));
  let marketValue = 0;
  const list = positions.map((p) => {
    const q = bySymbol.get(p.symbol);
    const price = q ? q.price : 0;
    const cny = q ? q.market === 'us' ? q.price * fx : q.price : 0;
    const qty = Number(p.qty);
    const cost = Number(p.cost);
    const value = qty * cny;
    marketValue += value;
    const avg = qty ? cost / qty : 0;
    const pnl = value - cost;
    return {
      symbol: p.symbol,
      market: p.market,
      name: q?.name || metaOf(p.symbol)?.name || p.symbol,
      qty,
      cost: Math.round(cost * 100) / 100,
      avgCost: Math.round(avg * 1000) / 1000,
      price: Math.round(price * 1000) / 1000,
      cny: Math.round(cny * 1000) / 1000,
      value: Math.round(value * 100) / 100,
      pnl: Math.round(pnl * 100) / 100,
      pnlPct: cost ? Math.round((pnl / cost) * 10000) / 100 : 0,
    };
  });
  const netWorth = acct.cash + marketValue;
  const deposited = START_CASH + acct.recharged;
  return {
    positions: list,
    marketValue: Math.round(marketValue * 100) / 100,
    netWorth: Math.round(netWorth * 100) / 100,
    deposited: Math.round(deposited * 100) / 100,
    profit: Math.round((netWorth - deposited) * 100) / 100,
    profitPct: deposited ? Math.round(((netWorth - deposited) / deposited) * 10000) / 100 : 0,
  };
}

async function snapshot(env: any, ip: string) {
  const acct = await ensureAccount(env, ip);
  const positions = await positionsOf(env, ip);
  const metas = positions.map((p) => metaOf(p.symbol)).filter(Boolean) as StockMeta[];
  const [{ quotes }, fx] = await Promise.all([
    metas.length ? getQuotes(env, metas) : Promise.resolve({ quotes: [] as any[] }),
    getUsdCny(env),
  ]);
  const trades = await env.DB.prepare(
    'SELECT symbol, market, side, qty, price, amount, fee, at FROM stock_trades WHERE ip = ? ORDER BY id DESC LIMIT 40',
  )
    .bind(ip)
    .all();
  const m = metrics(acct, positions, quotes, fx);
  return {
    ok: true,
    cash: Math.round(acct.cash * 100) / 100,
    recharged: Math.round(acct.recharged * 100) / 100,
    startCash: START_CASH,
    fx: Math.round(fx * 10000) / 10000,
    since: acct.since,
    trades: (trades.results || []).map((t: any) => ({ ...t, name: metaOf(t.symbol)?.name || t.symbol })),
    ...m,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await ensureSchema(env);
    const ip = ipOf(request);
    if (!ip) return json({ error: '拿不到 IP，无法存档' }, 400);
    return json(await snapshot(env, ip));
  } catch (error) {
    return json({ error: '账户读取失败', detail: String((error as Error)?.message || error) }, 503);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await ensureSchema(env);
    const ip = ipOf(request);
    if (!ip) return json({ error: '拿不到 IP，无法存档' }, 400);

    let body: any;
    try {
      body = await request.json();
    } catch {
      return json({ error: '请求体不是 JSON' }, 400);
    }

    const action = String(body?.action || '');
    const ts = nowStamp();

    if (action === 'reset') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM stock_positions WHERE ip = ?').bind(ip),
        env.DB.prepare('DELETE FROM stock_trades WHERE ip = ?').bind(ip),
        env.DB.prepare('DELETE FROM stock_accounts WHERE ip = ?').bind(ip),
      ]);
      await ensureAccount(env, ip);
      return json(await snapshot(env, ip));
    }

    const acct = await ensureAccount(env, ip);

    if (action === 'recharge') {
      const amount = Math.round(Number(body?.amount));
      if (!Number.isFinite(amount) || amount < 1000 || amount > RECHARGE_MAX_ONCE) {
        return json({ error: `单次充值 1000 ~ ${RECHARGE_MAX_ONCE} 元` }, 400);
      }
      if (acct.recharged + amount > MAX_RECHARGE_TOTAL) {
        return json({ error: `累计充值上限 ${MAX_RECHARGE_TOTAL} 元` }, 400);
      }
      await env.DB.prepare(
        'UPDATE stock_accounts SET cash = cash + ?, recharged = recharged + ?, updated_at = ? WHERE ip = ?',
      )
        .bind(amount, amount, ts, ip)
        .run();
      const snap = await snapshot(env, ip);
      return json({ ...snap, message: `充值 ${amount} 元到账` });
    }

    if (action !== 'buy' && action !== 'sell') return json({ error: '不认识的操作' }, 400);

    const meta = metaOf(String(body?.symbol || ''));
    if (!meta) return json({ error: '没有这个股票代码' }, 400);
    const qty = Math.round(Number(body?.qty));
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1_000_000) return json({ error: '数量不对' }, 400);
    // A股 1 手 = 100 股
    if ((meta.market === 'sh' || meta.market === 'sz') && qty % 100 !== 0) {
      return json({ error: 'A股要按 100 股（1 手）的整数倍买卖' }, 400);
    }

    const [{ quotes }, fx] = await Promise.all([getQuotes(env, [meta]), getUsdCny(env)]);
    const quote = quotes[0];
    if (!quote) return json({ error: '暂时拿不到这只票的现价，稍后再试' }, 503);

    const price = Math.round(cnyPrice(quote, fx) * 100) / 100;
    const amount = Math.round(price * qty * 100) / 100;
    const fee = feeOf(meta.market, amount, action);

    if (action === 'buy') {
      const total = Math.round((amount + fee) * 100) / 100;
      if (acct.cash < total) {
        return json({ error: `余额不足：需要 ${total.toFixed(2)} 元，现有 ${acct.cash.toFixed(2)} 元` }, 400);
      }
      // 先扣钱（带条件，避免并发把钱扣成负数），成功后再落持仓和流水
      const upd: any = await env.DB.prepare(
        'UPDATE stock_accounts SET cash = cash - ?, updated_at = ? WHERE ip = ? AND cash >= ?',
      )
        .bind(total, ts, ip, total)
        .run();
      if (!Number(upd?.meta?.changes)) return json({ error: '余额不足，下单失败' }, 400);
      try {
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO stock_positions (ip, symbol, market, qty, cost, updated_at) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(ip, symbol) DO UPDATE SET qty = qty + excluded.qty, cost = cost + excluded.cost, updated_at = excluded.updated_at`,
          ).bind(ip, meta.symbol, meta.market, qty, total, ts),
          env.DB.prepare(
            `INSERT INTO stock_trades (ip, symbol, market, side, qty, price, amount, fee, at) VALUES (?, ?, ?, 'buy', ?, ?, ?, ?, ?)`,
          ).bind(ip, meta.symbol, meta.market, qty, price, amount, fee, ts),
        ]);
      } catch (e) {
        // 落库失败就把钱退回去，别让人钱货两空
        await env.DB.prepare('UPDATE stock_accounts SET cash = cash + ? WHERE ip = ?').bind(total, ip).run();
        throw e;
      }
      const snap = await snapshot(env, ip);
      return json({ ...snap, message: `买入 ${quote.name} ${qty} 股，成交价 ${price.toFixed(2)} 元` });
    }

    // 卖出
    const pos: any = await env.DB.prepare(
      'SELECT qty, cost FROM stock_positions WHERE ip = ? AND symbol = ?',
    )
      .bind(ip, meta.symbol)
      .first();
    const held = Number(pos?.qty || 0);
    if (held < qty) return json({ error: `持仓不够：只有 ${held} 股` }, 400);

    const proceeds = Math.round((amount - fee) * 100) / 100;
    const costAll = Number(pos.cost) || 0;
    const costOut = Math.round(costAll * (qty / held) * 100) / 100;
    const left = held - qty;
    const stmts: any[] = [
      env.DB.prepare(
        `INSERT INTO stock_trades (ip, symbol, market, side, qty, price, amount, fee, at) VALUES (?, ?, ?, 'sell', ?, ?, ?, ?, ?)`,
      ).bind(ip, meta.symbol, meta.market, qty, price, amount, fee, ts),
      env.DB.prepare('UPDATE stock_accounts SET cash = cash + ?, updated_at = ? WHERE ip = ?').bind(proceeds, ts, ip),
    ];
    if (left > 0) {
      stmts.push(
        env.DB.prepare('UPDATE stock_positions SET qty = ?, cost = ?, updated_at = ? WHERE ip = ? AND symbol = ?').bind(
          left,
          Math.round((costAll - costOut) * 100) / 100,
          ts,
          ip,
          meta.symbol,
        ),
      );
    } else {
      stmts.push(env.DB.prepare('DELETE FROM stock_positions WHERE ip = ? AND symbol = ?').bind(ip, meta.symbol));
    }
    await env.DB.batch(stmts);

    const snap = await snapshot(env, ip);
    const realized = Math.round((proceeds - costOut) * 100) / 100;
    return json({
      ...snap,
      realized,
      message: `卖出 ${quote.name} ${qty} 股，成交价 ${price.toFixed(2)} 元，${realized >= 0 ? '落袋 +' : '割肉 '}${realized.toFixed(2)} 元`,
    });
  } catch (error) {
    return json({ error: '交易失败', detail: String((error as Error)?.message || error) }, 503);
  }
};
