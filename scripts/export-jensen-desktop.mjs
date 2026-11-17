#!/usr/bin/env node
// 本机计划任务用：优先用本地完整镜像（tmp/），没有再下载站内镜像；只更新桌面 TXT，不重复抓取原站 454 个分页。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeDesktopTxt } from './jensen-utils.mjs';

const root = process.cwd();
const local = join(root, 'tmp/jensen-mirror.full.json');

let data;
if (existsSync(local)) {
  data = JSON.parse(readFileSync(local, 'utf8'));
} else {
  // 站内镜像现在只带统计字段（完整名单在 tmp/），拿不到 items 时明确报错，别生成空 TXT
  const res = await fetch('https://mfhry.store/data/jensen-mirror.json', {
    headers: { Accept: 'application/json', 'User-Agent': 'MFHRY-Desktop-Mirror/1.0' },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`镜像下载失败：HTTP ${res.status}`);
  data = await res.json();
}
if (!Array.isArray(data.items) || !data.items.length) {
  throw new Error('镜像里没有名单（站内镜像已瘦身，请先跑 pnpm fetch 生成本地 tmp/jensen-mirror.full.json）');
}
const out = writeDesktopTxt(data);
console.log(`${new Date().toISOString()} ${out}：${data.items.length} 名公开签名者`);
