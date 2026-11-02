// 小游戏排行榜：按 IP 记一条最好成绩，返回时报国家 / 地区。
// GET  /api/score?game=tetris&limit=20
// POST /api/score  {game, score, name?}
import { flagOf, regionName, countryName } from '../lib/geo';

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

// asc: 数值越小越好（时间 / 步数）
const GAMES: Record<string, { asc: boolean; max: number; label: string; unit: string }> = {
  'gold-miner': { asc: false, max: 999999, label: '黄金矿工', unit: '分' },
  '2048': { asc: false, max: 999999, label: '2048', unit: '分' },
  snake: { asc: false, max: 99999, label: '贪吃蛇', unit: '分' },
  breakout: { asc: false, max: 99999, label: '打砖块', unit: '分' },
  tetris: { asc: false, max: 999999, label: '俄罗斯方块', unit: '分' },
  flappy: { asc: false, max: 9999, label: '像素鸟', unit: '分' },
  invaders: { asc: false, max: 99999, label: '太空侵略者', unit: '分' },
  minesweeper: { asc: true, max: 999, label: '扫雷', unit: '秒' },
  memory: { asc: true, max: 999, label: '记忆翻牌', unit: '步' },
  puzzle15: { asc: true, max: 9999, label: '数字华容道', unit: '步' },
};

// 榜单里默认遮掉 IP 最后一段：既看得出是不同的人，又不至于把完整地址公开。
// 想显示完整 IP 就把这里改成 false。
const MASK_IP = true;

const ipOf = (req: Request) =>
  req.headers.get('CF-Connecting-IP') || req.headers.get('x-forwarded-for') || 'unknown';

function maskIp(ip: string) {
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
    rank,
    name: row.name || null,
    score: row.score,
    ip: maskIp(row.ip || ''),
    country: cc,
    flag: flagOf(cc),
    countryName: countryName(cc),
    region: row.region || null,
    regionName: regionName(row.region, cc),
    city: row.city || null,
    at: row.updated_at || null,
  };
}

export const onRequestGet = async (ctx: any) => {
  const { env, request } = ctx;
  const url = new URL(request.url);
  const game = String(url.searchParams.get('game') || 'tetris');
  const meta = GAMES[game];
  if (!meta) return json({ error: '没有这个游戏' }, 400);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);

  const order = meta.asc ? 'ASC' : 'DESC';
  const rows = await env.DB.prepare(
    `SELECT name, score, ip, country, region, city, updated_at FROM scores
     WHERE game = ? ORDER BY score ${order}, updated_at ASC LIMIT ?`
  )
    .bind(game, limit)
    .all();

  const entries = (rows.results || []).map((r: any, i: number) => pack(r, i + 1));

  // 顺手告诉调用者「你自己排第几」
  let me: any = null;
  const ip = ipOf(request);
  if (ip && ip !== 'unknown') {
    const mine = await env.DB.prepare('SELECT name, score, ip, country, region, city, updated_at FROM scores WHERE game = ? AND ip = ?')
      .bind(game, ip)
      .first();
    if (mine) {
      const cmp = meta.asc ? '<' : '>';
      const better = await env.DB.prepare(`SELECT COUNT(*) AS c FROM scores WHERE game = ? AND score ${cmp} ?`)
        .bind(game, mine.score)
        .first();
      me = pack(mine, Number(better?.c || 0) + 1);
    }
  }

  const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores WHERE game = ?').bind(game).first();

  return json({ game, label: meta.label, unit: meta.unit, asc: meta.asc, total: Number(total?.c || 0), entries, me });
};

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

  const row: any = await env.DB.prepare('SELECT id, score, name, updated_at FROM scores WHERE game = ? AND ip = ?')
    .bind(game, ip)
    .first();

  // 同一个 IP 同一个游戏，10 秒内只能提交一次
  if (row && row.updated_at && Date.now() - Date.parse(row.updated_at.replace(' ', 'T') + 'Z') < 10 * 1000) {
    return json({ ok: true, stored: false, reason: '慢一点，10 秒后再传', best: row.score });
  }

  const better = meta.asc ? (v: number) => v < row.score : (v: number) => v > row.score;

  if (row) {
    if (!better(score)) {
      if (name && name !== row.name) {
        await env.DB.prepare('UPDATE scores SET name = ? WHERE id = ?').bind(name, row.id).run();
      }
      return json({ ok: true, stored: false, best: row.score });
    }
    await env.DB.prepare(
      'UPDATE scores SET score = ?, name = ?, country = ?, region = ?, city = ?, colo = ?, updated_at = ? WHERE id = ?'
    )
      .bind(
        score,
        name || row.name,
        cf.country || null,
        cf.region || null,
        cf.city || null,
        cf.colo || null,
        ts,
        row.id
      )
      .run();
  } else {
    await env.DB.prepare(
      'INSERT INTO scores (game, ip, name, score, country, region, city, colo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(game, ip, name, score, cf.country || null, cf.region || null, cf.city || null, cf.colo || null, ts, ts)
      .run();
  }

  const cmp = meta.asc ? '<' : '>';
  const better2 = await env.DB.prepare(`SELECT COUNT(*) AS c FROM scores WHERE game = ? AND score ${cmp} ?`)
    .bind(game, score)
    .first();

  return json({ ok: true, stored: true, best: score, rank: Number(better2?.c || 0) + 1 });
};
