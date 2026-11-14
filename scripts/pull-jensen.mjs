#!/usr/bin/env node
/**
 * Stand with Jensen 全量公开签名镜像。
 * 工作流每 15 分钟执行一次；成功才原子替换旧快照，失败保留下一次可用镜像。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeDesktopTxt } from './jensen-utils.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/data/jensen-mirror.json');
const SOURCE = 'https://standwithjensen.com';
const CONCURRENCY = 8;
const headers = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; MFHRY-Public-Mirror/1.0)',
  Referer: `${SOURCE}/`,
};

async function getJson(path, attempt = 0) {
  try {
    const res = await fetch(SOURCE + path, {
      headers,
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (attempt >= 4) throw new Error(`${path}: ${err.message}`);
    await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    return getJson(path, attempt + 1);
  }
}

async function main() {
  mkdirSync(dirname(out), { recursive: true });
  const campaign = await getJson('/api/campaign');
  const first = await getJson('/api/signatures?page=1');
  const pageSize = Number(first.pageSize) || 100;
  const expected = Number(first.total) || 0;
  const pageCount = Math.max(1, Math.ceil(expected / pageSize));
  const byId = new Map();
  let done = 0;

  async function worker(queue) {
    while (queue.length) {
      const page = queue.shift();
      const data = page === 1 ? first : await getJson(`/api/signatures?page=${page}`);
      for (const item of data.items || []) {
        if (item && item.id != null && !byId.has(item.id)) byId.set(item.id, item);
      }
      done += 1;
      if (done % 50 === 0 || done === pageCount) {
        console.log(`[jensen] ${done}/${pageCount} 页，已保存 ${byId.size} 名公开签名者`);
      }
    }
  }

  const queue = Array.from({ length: pageCount }, (_, i) => i + 1);
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

  // 翻页过程中通常只会出现边界重复；异常缺漏超过 0.5% 时再完整复核一遍。
  if (byId.size < expected * 0.995 && pageCount > 1) {
    console.warn(`[jensen] 缺漏较多（${byId.size}/${expected}），开始第二遍复核`);
    const reviewQueue = Array.from({ length: pageCount }, (_, i) => i + 1);
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(reviewQueue)));
  }

  const latest = await getJson('/api/signatures?page=1');
  for (const item of latest.items || []) {
    if (item && item.id != null && !byId.has(item.id)) byId.set(item.id, item);
  }
  const data = {
    source: SOURCE,
    fetchedAt: new Date().toISOString(),
    campaign,
    publicTotal: Number(latest.total) || expected,
    capturedPublic: byId.size,
    pageSize,
    items: [...byId.values()],
  };
  if (!data.items.length) throw new Error('上游返回空名单，不覆盖旧镜像');

  const tmp = `${out}.tmp`;
  writeFileSync(tmp, JSON.stringify(data), 'utf8');
  renameSync(tmp, out);
  console.log(`[jensen] 镜像完成：总签名 ${campaign.total}，公开 ${data.items.length}，文件 ${(await import('node:fs')).statSync(out).size} bytes`);

  if (!process.env.CI && process.env.JENSEN_SKIP_DESKTOP !== '1') {
    const desktop = writeDesktopTxt(data);
    console.log(`[jensen] 桌面 TXT：${desktop}`);
  }
}

main().catch((err) => {
  console.error(`[jensen] 更新失败：${err.message}`);
  if (existsSync(out)) {
    console.warn('[jensen] 保留已有镜像，继续构建');
    return;
  }
  process.exitCode = 1;
});
