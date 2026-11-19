// 罪恶都市（GTA 小游戏）：统一钱包 + 外汇持仓 + 剧情存档 + 与炒股账户互通
//
// GET  /api/gta                 读取钱包、美元持仓、剧情进度、当前汇率、炒股账户现金
// POST /api/gta  {action}       见下方 switch
//
// 设计要点：游戏本身是纯前端跑的单机沙盒，赚到的钱由前端上报（沙盒作弊无所谓，
// 但榜单只认这一份数据，所以做了上限保护）；真正"跨游戏"的部分放在服务端：
//   · 城市现金 ↔ 炒股账户现金：同步维护 stock_accounts.recharged，
//     这样炒股榜按「净资产 − 本金 − 充值」算净盈利，倒钱刷不出假成绩
//   · 城市现金 ↔ 美元持仓：按实时 USDCNH 折算，记录成本价用于算汇兑盈亏
import {
  ensureSchema as ensureStockSchema,
  json,
  ipOf,
  nowStamp,
  getUsdCny,
  START_CASH,
} from '../lib/stock';

interface Env { DB: D1Database }

const MAX_CASH = 1_000_000_000;   // 10 亿封顶，防止上报天文数字
const MIN_MOVE = 100;             // 最少转 100 元
const MAX_MOVE = 50_000_000;      // 单次最多转 5000 万
const MAX_STORY_CHAPTER = 24;   // 前端目前 19 章，留点余量

let schemaReady = false;
async function ensureGtaSchema(env: Env) {
  if (schemaReady) return;
  await ensureStockSchema(env);
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS gta_wallet (
      ip TEXT PRIMARY KEY,
      cash REAL NOT NULL DEFAULT 0,
      fx_usd REAL NOT NULL DEFAULT 0,
      fx_cost REAL NOT NULL DEFAULT 0,
      chapter INTEGER NOT NULL DEFAULT 1,
      missions TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS gta_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      kind TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      memo TEXT,
      at TEXT NOT NULL
    )`,
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_gta_log_ip ON gta_log(ip, id DESC)').run();
  schemaReady = true;
}

async function walletOf(env: Env, ip: string) {
  const ts = nowStamp();
  await env.DB.prepare(
    `INSERT INTO gta_wallet (ip, cash, fx_usd, fx_cost, chapter, missions, updated_at)
     VALUES (?, 0, 0, 0, 1, '[]', ?)
     ON CONFLICT(ip) DO NOTHING`,
  ).bind(ip, ts).run();
  return (await env.DB.prepare('SELECT * FROM gta_wallet WHERE ip = ?').bind(ip).first()) as any;
}

async function stockWalletOf(env: Env, ip: string) {
  const ts = nowStamp();
  await env.DB.prepare(
    `INSERT INTO stock_accounts (ip, cash, recharged, created_at, updated_at)
     VALUES (?, ?, 0, ?, ?)
     ON CONFLICT(ip) DO NOTHING`,
  ).bind(ip, START_CASH, ts, ts).run();
  return (await env.DB.prepare('SELECT cash, recharged FROM stock_accounts WHERE ip = ?').bind(ip).first()) as any;
}

async function logTx(env: Env, ip: string, kind: string, amount: number, memo: string) {
  await env.DB.prepare('INSERT INTO gta_log (ip, kind, amount, memo, at) VALUES (?, ?, ?, ?, ?)')
    .bind(ip, kind, amount, memo, nowStamp())
    .run();
}

function pack(w: any, rate: number, extra: Record<string, unknown> = {}) {
  const missions = (() => {
    try { return JSON.parse(String(w?.missions || '[]')); } catch { return []; }
  })();
  return {
    ok: true,
    cash: Number(w?.cash || 0),
    fxUsd: Number(w?.fx_usd || 0),
    fxCost: Number(w?.fx_cost || 0),
    rate,
    chapter: Number(w?.chapter || 1),
    missions,
    netWorthCny: Number(w?.cash || 0) + Number(w?.fx_usd || 0) * rate,
    ...extra,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await ensureGtaSchema(env);
    const ip = ipOf(request);
    if (!ip) return json({ error: '拿不到你的 IP，存不了档' }, 400);
    const [w, rate] = await Promise.all([walletOf(env, ip), getUsdCny(env)]);
    const st = await stockWalletOf(env, ip);
    return json(pack(w, rate, { stock: { cash: Number(st?.cash || 0), recharged: Number(st?.recharged || 0) } }));
  } catch (error) {
    return json({ error: '存档读取失败', detail: String((error as Error)?.message || error) }, 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await ensureGtaSchema(env);
    const ip = ipOf(request);
    if (!ip) return json({ error: '拿不到你的 IP，存不了档' }, 400);
    const body: any = await request.json().catch(() => ({}));
    const action = String(body.action || '');
    const rate = await getUsdCny(env);
    let msg = '';

    switch (action) {
      // ---------- 前端上报城市现金 ----------
      case 'bank': {
        const cash = Math.round(Number(body.cash) || 0);
        if (!Number.isFinite(cash) || cash < 0) return json({ error: '现金数不对' }, 400);
        const capped = Math.min(cash, MAX_CASH);
        await env.DB.prepare('UPDATE gta_wallet SET cash = ?, updated_at = ? WHERE ip = ?')
          .bind(capped, nowStamp(), ip).run();
        msg = '现金已存入';
        break;
      }

      // ---------- 剧情进度 ----------
      case 'story': {
        const chapter = Math.min(Math.max(Math.round(Number(body.chapter) || 1), 1), MAX_STORY_CHAPTER);
        const missions = Array.isArray(body.missions) ? body.missions.slice(0, 200).map(String) : [];
        await env.DB.prepare('UPDATE gta_wallet SET chapter = ?, missions = ?, updated_at = ? WHERE ip = ?')
          .bind(chapter, JSON.stringify(missions), nowStamp(), ip).run();
        msg = '剧情进度已记录';
        break;
      }

      // ---------- 城市现金 → 炒股账户 ----------
      case 'to-stock': {
        const amount = Math.round(Number(body.amount) || 0);
        if (amount < MIN_MOVE || amount > MAX_MOVE) return json({ error: `单次转入 ${MIN_MOVE} ~ ${MAX_MOVE} 元` }, 400);
        const w = await walletOf(env, ip);
        if (Number(w.cash) < amount) return json({ error: '城市现金不够' }, 400);
        const dec = await env.DB.prepare('UPDATE gta_wallet SET cash = cash - ?, updated_at = ? WHERE ip = ? AND cash >= ?')
          .bind(amount, nowStamp(), ip, amount).run();
        if (!dec?.meta?.changes) return json({ error: '城市现金不够' }, 400);
        const st = await stockWalletOf(env, ip);
        // 转进去的钱算"充值本金"，榜单的净盈利不会被它灌水
        await env.DB.prepare('UPDATE stock_accounts SET cash = cash + ?, recharged = recharged + ?, updated_at = ? WHERE ip = ?')
          .bind(amount, amount, nowStamp(), ip).run();
        await logTx(env, ip, 'transfer-stock', amount, '城市 → 股票账户');
        msg = `已转入股票账户 ${amount} 元（当前 ${Math.round((Number(st.cash) + amount) * 100) / 100} 元）`;
        break;
      }

      // ---------- 炒股账户 → 城市现金 ----------
      case 'from-stock': {
        const amount = Math.round(Number(body.amount) || 0);
        if (amount < MIN_MOVE || amount > MAX_MOVE) return json({ error: `单次转出 ${MIN_MOVE} ~ ${MAX_MOVE} 元` }, 400);
        await stockWalletOf(env, ip);
        const dec = await env.DB.prepare(
          'UPDATE stock_accounts SET cash = cash - ?, recharged = MAX(0, recharged - ?), updated_at = ? WHERE ip = ? AND cash >= ?',
        ).bind(amount, amount, nowStamp(), ip, amount).run();
        if (!dec?.meta?.changes) return json({ error: '股票账户可用现金不够' }, 400);
        await env.DB.prepare('UPDATE gta_wallet SET cash = cash + ?, updated_at = ? WHERE ip = ?')
          .bind(amount, nowStamp(), ip).run();
        await logTx(env, ip, 'transfer-stock', -amount, '股票账户 → 城市');
        msg = `已取出 ${amount} 元到城市现金`;
        break;
      }

      // ---------- 城市现金 → 美元（地下钱庄） ----------
      case 'to-fx': {
        const cny = Math.round(Number(body.amount) || 0);
        if (cny < MIN_MOVE || cny > MAX_MOVE) return json({ error: `单次兑换 ${MIN_MOVE} ~ ${MAX_MOVE} 元` }, 400);
        const w = await walletOf(env, ip);
        if (Number(w.cash) < cny) return json({ error: '城市现金不够' }, 400);
        const usd = cny / rate;
        const dec = await env.DB.prepare('UPDATE gta_wallet SET cash = cash - ?, updated_at = ? WHERE ip = ? AND cash >= ?')
          .bind(cny, nowStamp(), ip, cny).run();
        if (!dec?.meta?.changes) return json({ error: '城市现金不够' }, 400);
        await env.DB.prepare('UPDATE gta_wallet SET fx_usd = fx_usd + ?, fx_cost = fx_cost + ?, updated_at = ? WHERE ip = ?')
          .bind(usd, cny, nowStamp(), ip).run();
        await logTx(env, ip, 'transfer-fx', cny, `换入 ${usd.toFixed(2)} 美元`);
        msg = `换到 ${usd.toFixed(2)} 美元（汇率 ${rate.toFixed(4)}）`;
        break;
      }

      // ---------- 美元 → 城市现金 ----------
      case 'from-fx': {
        const usd = Math.max(0, Number(body.usd) || 0);
        if (!(usd > 0)) return json({ error: '数量不对' }, 400);
        const w = await walletOf(env, ip);
        const holding = Number(w.fx_usd) || 0;
        if (usd > holding + 1e-6) return json({ error: '美元不够' }, 400);
        const cost = Number(w.fx_cost) || 0;
        const costPart = holding > 0 ? (cost * usd) / holding : 0;
        const proceeds = usd * rate;
        const dec = await env.DB.prepare('UPDATE gta_wallet SET fx_usd = fx_usd - ?, updated_at = ? WHERE ip = ? AND fx_usd >= ?')
          .bind(usd, nowStamp(), ip, usd).run();
        if (!dec?.meta?.changes) return json({ error: '美元不够' }, 400);
        await env.DB.prepare(
          'UPDATE gta_wallet SET cash = cash + ?, fx_cost = MAX(0, fx_cost - ?), updated_at = ? WHERE ip = ?',
        ).bind(proceeds, costPart, nowStamp(), ip).run();
        const realized = proceeds - costPart;
        await logTx(env, ip, 'transfer-fx', -proceeds, `卖出 ${usd.toFixed(2)} 美元`);
        msg = `换回 ${proceeds.toFixed(2)} 元，汇兑${realized >= 0 ? '赚' : '亏'} ${Math.abs(realized).toFixed(2)} 元`;
        break;
      }

      // ---------- 重开 ----------
      case 'reset': {
        await env.DB.prepare(
          "UPDATE gta_wallet SET cash = 0, fx_usd = 0, fx_cost = 0, chapter = 1, missions = '[]', updated_at = ? WHERE ip = ?",
        ).bind(nowStamp(), ip).run();
        await logTx(env, ip, 'reset', 0, '重开');
        msg = '存档已清空';
        break;
      }

      default:
        return json({ error: '不认识的操作：' + action }, 400);
    }

    const [w, st] = await Promise.all([walletOf(env, ip), stockWalletOf(env, ip)]);
    return json(pack(w, rate, { message: msg, stock: { cash: Number(st?.cash || 0), recharged: Number(st?.recharged || 0) } }));
  } catch (error) {
    return json({ error: '存档写入失败', detail: String((error as Error)?.message || error) }, 500);
  }
};
