#!/usr/bin/env node
/**
 * Stand with Jensen 历史存档：每 15 分钟记一条统计，每天存一份整页快照。
 *  - public/data/jensen-history.json  统计时间线（保留 7 天）
 *  - public/standwithjensen/archive/<YYYY-MM-DD>.html  当天整页快照（保留 14 天）
 * 由 CI 在部署前运行，并把结果提交回仓库，页面即可「看以前 / 看现在」。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(root, 'public/data/jensen-mirror.json');
const HIST = join(root, 'public/data/jensen-history.json');
const SITE = join(root, 'public/standwithjensen/index.html');
const ARCHIVE = join(root, 'public/standwithjensen/archive');

const MAX_POINTS = 7 * 24 * 4; // 7 天 × 每天 96 条
const KEEP_DAYS = 14;

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function main() {
  if (!existsSync(DATA)) {
    console.warn('[jensen-history] 没有镜像数据，跳过');
    return;
  }
  const snap = readJson(DATA, null);
  const c = snap?.campaign || {};
  const at = new Date().toISOString().slice(0, 16) + 'Z';

  const hist = readJson(HIST, { points: [] });
  const points = Array.isArray(hist.points) ? hist.points : [];
  const last = points[points.length - 1];
  const point = {
    at,
    total: Number(c.total) || 0,
    currentEmployees: Number(c.currentEmployees) || 0,
    formerEmployees: Number(c.formerEmployees) || 0,
    shareholders: Number(c.shareholders) || 0,
    supporters: Number(c.supporters) || 0,
    publicTotal: Number(snap.publicTotal) || 0,
    capturedPublic: Number(snap.capturedPublic) || 0,
  };

  // 同一分钟重复运行不重复记
  if (!last || last.at !== point.at) points.push(point);
  const trimmed = points.slice(-MAX_POINTS);
  writeFileSync(HIST, JSON.stringify({ source: 'https://standwithjensen.com', points: trimmed }), 'utf8');
  console.log(`[jensen-history] 统计时间线 ${trimmed.length} 条（最新 ${at}）`);

  // 每天一份整页快照
  if (!existsSync(SITE)) {
    console.warn('[jensen-history] 没有整页镜像，跳过快照');
    return;
  }
  mkdirSync(ARCHIVE, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  writeFileSync(join(ARCHIVE, `${day}.html`), readFileSync(SITE, 'utf8'), 'utf8');
  console.log(`[jensen-history] 当日快照 archive/${day}.html`);

  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  for (const f of readdirSync(ARCHIVE)) {
    if (!f.endsWith('.html')) continue;
    if (f.slice(0, 10) < cutoff) {
      rmSync(join(ARCHIVE, f), { force: true });
      console.log(`[jensen-history] 清理过期快照 ${f}`);
    }
  }
}

main();
