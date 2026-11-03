// 小游戏排行榜
// GET    /api/score?game=tetris&limit=20     榜单（含国家/地区/你的名次）
// POST   /api/score  {game, score, name?}   交成绩（按 IP 去重）
import { flagOf, regionName, countryName } from '../lib/geo';

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

// asc: 数值越小越好（时间 / 步数）
const GAMES: Record<string, { asc: boolean; max: number; label: string; unit: string; fmt?: 'money' }> = {
  'gold-miner': { asc: false, max: 999999, label: '黄金矿工', unit: '分' },
  '2048': { asc: false, max: 999999, label: '2048', unit: '分' },
  whack: { asc: false, max: 99999, label: '打地鼠', unit: '分' },
  jump: { asc: false, max: 9999, label: '跳一跳', unit: '块' },
  maze: { asc: true, max: 9999, label: '走迷宫', unit: '秒' },
  rhythm: { asc: false, max: 9999999, label: '音游', unit: '分' },
  snake: { asc: false, max: 99999, label: '贪吃蛇', unit: '分' },
  breakout: { asc: false, max: 99999, label: '打砖块', unit: '分' },
  tetris: { asc: false, max: 999999, label: '俄罗斯方块', unit: '分' },
  flappy: { asc: false, max: 9999, label: '像素鸟', unit: '分' },
  invaders: { asc: false, max: 99999, label: '太空侵略者', unit: '分' },
  minesweeper: { asc: true, max: 999, label: '扫雷', unit: '秒' },
  memory: { asc: true, max: 999, label: '记忆翻牌', unit: '步' },
  puzzle15: { asc: true, max: 9999, label: '数字华容道', unit: '步' },
  // fx-sim：只认交易赚到的钱（客户端已扣掉充值部分），单位是美元
  'fx-sim': { asc: false, max: 1000000000, label: 'FX 模拟器', unit: '美元', fmt: 'money' },
};

// 榜单里默认遮掉 IP 最后一段：既看得出是不同的人，又不至于把完整地址公开。
const MASK_IP = true;

const ipOf = (req: Request) =>
  req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || 'unknown';

function maskIp(ip: string | null) {
  if (!ip) return '';
  if (!MASK_IP) return ip;
  if (ip.includes('.')) return ip.replace(/\.\d+$/, '.x');
  return ip.length > 14 ? ip.slice(0, 14) + '…' : ip;
}

const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

const cleanName = (v: any) =>
  String(v ?? '')
    .replace(/[<>&]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12);

function pack(row: any, rank: number) {
  const cc = row.country || null;
  return {
    id: row.id,
    rank,
    score: row.score,
    name: row.name || null,
    ip: maskIp(row.ip),
    country: cc,
    flag: flagOf(cc),
    countryName: countryName(cc),
    region: row.region || null,
    regionName: regionName(row.region, cc),
    city: row.city || null,
    at: row.updated_at || null,
  };
}

// 老数据里用账号发的帖子名字存在 users 表，这里取过来，别让它们变成匿名
const SELECT = `SELECT s.id, s.score, s.ip, COALESCE(s.name, u.name, u.login) AS name,
                       s.country, s.region, s.city, s.updated_at
                  FROM scores s LEFT JOIN users u ON u.id = s.user_id`;

export const onRequestGet = async (ctx: any) => {
  const { env, request } = ctx;
  const url = new URL(request.url);
  const game = String(url.searchParams.get('game') || 'tetris');
  const meta = GAMES[game];
  if (!meta) return json({ error: '没有这个游戏' }, 400);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);

  const order = meta.asc ? 'ASC' : 'DESC';
  const rows = await env.DB.prepare(
    `${SELECT} WHERE s.game = ? ORDER BY s.score ${order}, s.updated_at ASC LIMIT ?`
  )
    .bind(game, limit)
    .all();

  const entries = (rows.results || []).map((r: any, i: number) => pack(r, i + 1));

  let me: any = null;
  const ip = ipOf(request);
  if (ip && ip !== 'unknown') {
    const mine: any = await env.DB.prepare(`${SELECT} WHERE s.game = ? AND s.ip = ?`).bind(game, ip).first();
    if (mine) me = pack(mine, await rankOf(env, game, meta, mine.score));
  }

  const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores WHERE game = ?').bind(game).first();

  return json({
    game,
    label: meta.label,
    unit: meta.unit,
    fmt: meta.fmt || '',
    asc: meta.asc,
    total: Number(total?.c || 0),
    entries,
    me,
  });
};

async function rankOf(env: any, game: string, meta: { asc: boolean }, score: number) {
  const cmp = meta.asc ? '<' : '>';
  const better = await env.DB.prepare(`SELECT COUNT(*) AS c FROM scores WHERE game = ? AND score ${cmp} ?`)
    .bind(game, score)
    .first();
  return Number(better?.c || 0) + 1;
}

export const onRequestPost = async (ctx: any) => {
  const { env, request } = ctx;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求体不是 JSON' }, 400);
  }

  const game = String(body?.game || '');
  const meta = GAMES[game];
  if (!meta) return json({ error: '没有这个游戏' }, 400);

  const score = Math.round(Number(body?.score));
  if (!Number.isFinite(score) || score < 0 || score > meta.max) return json({ error: '分数不合适' }, 400);
  if (meta.asc && score === 0) return json({ error: '分数不合适' }, 400);

  const ip = ipOf(request);
  if (!ip || ip === 'unknown') return json({ error: '拿不到 IP' }, 400);

  const cf: any = (request as any).cf || {};
  const name = cleanName(body?.name) || null;
  const ts = nowSql();

  // 一个 IP 只留一条成绩
  const row: any = await env.DB.prepare(
    'SELECT id, score, name, updated_at FROM scores WHERE game = ? AND ip = ?'
  )
    .bind(game, ip)
    .first();

  if (row && row.updated_at && Date.now() - Date.parse(row.updated_at.replace(' ', 'T') + 'Z') < 10 * 1000) {
    return json({ ok: true, stored: false, reason: '慢一点，10 秒后再传', best: row.score });
  }

  const isBetter = (v: number) => (meta.asc ? v < row.score : v > row.score);

  if (row) {
    if (!isBetter(score)) {
      return json({ ok: true, stored: false, best: row.score });
    }
    await env.DB.prepare(
      'UPDATE scores SET score = ?, name = ?, country = ?, region = ?, city = ?, colo = ?, updated_at = ? WHERE id = ?'
    )
      .bind(score, name || row.name, cf.country || null, cf.region || null, cf.city || null, cf.colo || null, ts, row.id)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO scores (game, ip, user_id, name, score, country, region, city, colo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        game,
        ip,
        null,
        name,
        score,
        cf.country || null,
        cf.region || null,
        cf.city || null,
        cf.colo || null,
        ts,
        ts
      )
      .run();
  }

  return json({ ok: true, stored: true, best: score, rank: await rankOf(env, game, meta, score) });
};
