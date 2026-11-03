#!/usr/bin/env node
// 构建后根据 dist/ 实际产出的页面生成 sitemap.xml 与 rss.xml（静态兜底）
// 动态的新闻 RSS 走 functions/rss.xml.ts，这里的 rss.xml 只放静态页面，功能接口会覆盖同路径吗？
// 不会：Pages 里 functions 优先于静态资源，所以这里只写 sitemap。
import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const ORIGIN = 'https://mfhry.store';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name === 'index.html') out.push(p);
  }
  return out;
}

const SKIP = /\/(404|500)\.html$/;
const urls = walk(dist)
  .map((p) => p.slice(dist.length).replace(/\\/g, '/').replace(/index\.html$/, ''))
  .filter((u) => !SKIP.test(u))
  .sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));

const now = new Date().toISOString().slice(0, 10);
const body = urls
  .map((u) => {
    const loc = ORIGIN + u;
    const pri = u === '/' ? '1.0' : u.split('/').filter(Boolean).length === 1 ? '0.8' : '0.6';
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${pri}</priority>\n  </url>`;
  })
  .join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
const out = join(dist, 'sitemap.xml');
writeFileSync(out, xml, 'utf8');
console.log(`[sitemap] ${urls.length} 个页面 → dist/sitemap.xml`);
