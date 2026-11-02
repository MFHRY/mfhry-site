#!/usr/bin/env node
/**
 * 构建时同步 GitHub Releases：
 *  - 把每个 release 的附件下载到 public/downloads/<repo>/<tag>/（站点自带，国内可直接下载）
 *  - 生成 src/data/releases.json 供页面渲染
 *
 * 用法：
 *   GH_USER=mfhry node scripts/pull-releases.mjs
 *   GH_USER=mfhry RELEASE_REPOS=mcai,other-repo node scripts/pull-releases.mjs
 *
 * 单个文件超过 24MB（Cloudflare Pages 上限 25MB）时保留 GitHub 原始链接，
 * 不下载，页面上会标注「外链」。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(readFileSync(join(root, 'src/data/site.json'), 'utf8'));
const user = process.env.GH_USER || site.handle;
const out = join(root, 'src/data/releases.json');

const repos = (process.env.RELEASE_REPOS || 'mcai')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const MAX_ASSET = 24 * 1024 * 1024;
const KEEP_RELEASES = 10;

if (!user || user === 'your-github-username') {
  console.warn('[releases] 没配置 GH_USER，跳过。');
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

const safe = (s) => s.replace(/[^\w.\-]+/g, '-');

async function download(url, dest, expectedSize) {
  if (existsSync(dest) && statSync(dest).size === expectedSize) return true;
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  return true;
}

async function main() {
  const data = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};

  for (const repo of repos) {
    const url =
      `https://api.github.com/repos/${encodeURIComponent(user)}/${encodeURIComponent(repo)}` +
      '/releases?per_page=' + (KEEP_RELEASES + 5);
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.warn(`[releases] ${repo}: API ${res.status}，保留旧数据`);
      continue;
    }

    const releases = (await res.json()).slice(0, KEEP_RELEASES);
    const list = [];

    for (const rel of releases) {
      const tag = safe(rel.tag_name || rel.name || 'untagged');
      const assets = [];

      for (const a of rel.assets || []) {
        const asset = { name: a.name, size: a.size, path: null, url: a.browser_download_url };
        if (a.size <= MAX_ASSET) {
          const dest = join(root, 'public/downloads', repo, tag, a.name);
          try {
            await download(a.browser_download_url, dest, a.size);
            asset.path = `/downloads/${repo}/${tag}/${a.name}`;
          } catch (e) {
            console.warn(`[releases] ${repo}/${tag}/${a.name}: ${e.message}`);
          }
        }
        assets.push(asset);
      }

      list.push({
        tag: rel.tag_name,
        name: rel.name || rel.tag_name,
        published_at: rel.published_at,
        html_url: rel.html_url,
        prerelease: rel.prerelease,
        body: (rel.body || '').slice(0, 4000),
        assets,
      });
    }

    data[repo] = list;
    console.log(`[releases] ${repo}: ${list.length} 个版本`);
  }

  writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
}

main().catch((err) => {
  console.error(`[releases] 失败：${err.message}`);
  console.warn('[releases] 保留现有 releases.json 继续构建');
});
