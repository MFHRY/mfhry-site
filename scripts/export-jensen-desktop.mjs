#!/usr/bin/env node
// 本机计划任务用：下载站内已发布的镜像，只更新桌面 TXT，不重复抓取原站 454 个分页。
import { writeDesktopTxt } from './jensen-utils.mjs';

const res = await fetch('https://mfhry.store/data/jensen-mirror.json', {
  headers: { Accept: 'application/json', 'User-Agent': 'MFHRY-Desktop-Mirror/1.0' },
  signal: AbortSignal.timeout(60000),
});
if (!res.ok) throw new Error(`镜像下载失败：HTTP ${res.status}`);
const data = await res.json();
if (!Array.isArray(data.items) || !data.items.length) throw new Error('镜像为空，保留旧 TXT');
const out = writeDesktopTxt(data);
console.log(`${new Date().toISOString()} ${out}：${data.items.length} 名公开签名者`);
