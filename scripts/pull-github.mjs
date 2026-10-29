#!/usr/bin/env node
/**
 * 构建时从 GitHub API 拉取公开仓库，写入 src/data/repos.json。
 *
 * 用法：
 *   GH_USER=你的用户名 node scripts/pull-github.mjs
 *   GH_USER=你的用户名 GITHUB_TOKEN=ghp_xxx node scripts/pull-github.mjs
 *
 * 未配置 GH_USER 时直接跳过（保留现有 repos.json），方便第一次先跑起来。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(readFileSync(join(root, 'src/data/site.json'), 'utf8'));
const out = join(root, 'src/data/repos.json');

const user = process.env.GH_USER || site.handle;

if (!user || user === 'your-github-username') {
  console.warn('[github] 没配置 GH_USER（或 site.json 里还是占位符），跳过拉取。');
  process.exit(0);
}

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'mfhry-site',
  'X-GitHub-Api-Version': '2022-11-28',
};
if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** README 的 markdown 揉成一段纯文本，给卡片当摘要用 */
function toPlain(md) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[>#\-*+\s]+/gm, ' ')
    .replace(/[*_`~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const all = [];

  for (let page = 1; page <= 3; page += 1) {
    const url =
      `https://api.github.com/users/${encodeURIComponent(user)}/repos` +
      `?per_page=100&page=${page}&sort=pushed&type=owner`;
    const res = await fetch(url, { headers });

    if (res.status === 403 || res.status === 429) {
      const reset = res.headers.get('x-ratelimit-reset');
      console.warn(`[github] 触发限流，reset=${reset || '未知'}，使用已有数据。`);
      break;
    }
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    const batch = await res.json();
    all.push(...batch);
    if (batch.length < 100) break;
    await sleep(120);
  }

  const repos = all
    .filter((r) => !r.fork && !r.archived)
    .map((r) => ({
      name: r.name,
      desc: r.description,
      url: r.html_url,
      homepage: r.homepage || '',
      stars: r.stargazers_count,
      forks: r.forks_count,
      lang: r.language,
      topics: r.topics || [],
      license: r.license?.spdx_id ?? null,
      updated: r.pushed_at,
    }))
    .sort((a, b) => b.stars - a.stars || b.updated.localeCompare(a.updated));

  // 顺手取 README 开头几句，卡片上更有内容；失败就跳过
  for (const repo of repos.slice(0, 12)) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(user)}/${encodeURIComponent(repo.name)}/readme`,
        { headers }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const text = Buffer.from(data.content ?? '', 'base64').toString('utf8');
      repo.readme = toPlain(text).slice(0, 240);
    } catch {
      // 忽略单个仓库的失败
    }
    await sleep(100);
  }

  writeFileSync(out, `${JSON.stringify(repos, null, 2)}\n`);
  console.log(`[github] ${user}: 写入 ${repos.length} 个公开仓库`);
}

main().catch((err) => {
  console.error(`[github] 拉取失败：${err.message}`);
  console.warn('[github] 保留现有 repos.json 继续构建');
});
