#!/usr/bin/env node
/**
 * 构建时从 Aiven PostgreSQL 拉取文章列表，写入 src/data/posts.json。
 *
 * 用法：
 *   DATABASE_URL="postgres://avnadmin:密码@主机:端口/defaultdb?sslmode=verify-full" \
 *   PG_CA="$(cat ca.pem)" \
 *   node scripts/pull-content.mjs
 *
 * 没有 DATABASE_URL 时直接跳过——这个站点不依赖数据库也能构建。
 * 表结构见 README；查不到表时会保留现有 posts.json。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src/data/posts.json');

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn('[aiven] 没配置 DATABASE_URL，跳过内容拉取。');
  process.exit(0);
}

const SQL = `
  select id, title, summary, url, published_at
  from posts
  where published = true
  order by published_at desc
  limit 20
`;

async function main() {
  const { default: pg } = await import('pg');

  const pool = new pg.Pool({
    connectionString: url,
    ssl: process.env.PG_CA
      ? { ca: process.env.PG_CA, rejectUnauthorized: true }
      : { rejectUnauthorized: false },
    max: 2,
    connectionTimeoutMillis: 15000,
  });

  try {
    const { rows } = await pool.query(SQL);
    const posts = rows.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      url: r.url,
      date: r.published_at ? new Date(r.published_at).toISOString().slice(0, 10) : null,
    }));

    writeFileSync(out, `${JSON.stringify(posts, null, 2)}\n`);
    console.log(`[aiven] 写入 ${posts.length} 篇文章`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[aiven] 拉取失败：${err.message}`);
  if (!existsSync(out)) {
    console.warn('[aiven] 没有可用的 posts.json，写入空数组继续构建');
    writeFileSync(out, '[]\n');
  } else {
    console.warn('[aiven] 保留现有 posts.json 继续构建');
  }
});
