# mfhry.store 个人站

极简个人主页 + GitHub 项目展示。纯静态，构建时拉数据，部署在 Cloudflare Pages。

- **Astro** 静态生成
- **GitHub API**：构建时拉公开仓库 → `src/data/repos.json`
- **Aiven PostgreSQL**（可选）：构建时拉文章 → `src/data/posts.json`
- **Cloudflare Pages**：托管 + 自动 HTTPS
- **Cloudflare R2**：图片/头像（`img.mfhry.store`）

## 目录

```
src/
  data/site.json        个人信息、链接、精选项目
  data/repos.json       GitHub 仓库（脚本生成，别手改）
  data/posts.json       Aiven 文章（脚本生成，可留空）
  pages/index.astro     首页
  pages/projects.astro  项目列表（搜索 + 语言筛选）
  layouts/Base.astro    公共壳
  components/ProjectCard.astro
scripts/
  pull-github.mjs
  pull-content.mjs
.github/workflows/deploy.yml
```

## 第一次跑

需要 Node 20+（自带 corepack）：

```bash
corepack enable
pnpm install
pnpm build
pnpm preview          # http://localhost:4321
```

现在 `repos.json` 里是 3 个示例仓库，先跑起来看看效果，接着替换成真实数据。

## 改这三处

1. **`src/data/site.json`** — 名字、简介、头像地址、社交链接、`handle`（GitHub 用户名）。
2. **拉真实项目**：
   ```bash
   GH_USER=你的用户名 pnpm fetch
   ```
   没有 token 时限流 60 次/小时，够用；本地频繁跑就加 `GITHUB_TOKEN=ghp_xxx`。
3. **精选项目**：`site.json` 里的 `featured` 填仓库名，留空则自动取 star 最多的 6 个。

## 部署到 Cloudflare Pages

```bash
# 只需要执行一次，创建 Pages 项目
CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=xxx pnpm pages:create
```

然后把仓库推到 GitHub，在仓库的 **Settings → Secrets and variables → Actions** 配置：

| 类型 | 名称 | 说明 |
|---|---|---|
| Variable | `GH_USER` | 你的 GitHub 用户名 |
| Variable | `PAGES_PROJECT` | Pages 项目名（默认 `mfhry-site`） |
| Secret | `CF_API_TOKEN` | 权限：Cloudflare Pages: Edit |
| Secret | `CF_ACCOUNT_ID` | Cloudflare 账号 ID |
| Secret | `AIVEN_PG_URL` | 不需要数据库就留空 |
| Secret | `AIVEN_PG_CA` | Aiven 的 ca.pem 全文 |

推一次 `main`，或者手动 **Run workflow**，Actions 会跑完拉数据 → 构建 → 上传。

最后在 Cloudflare Pages 项目的 **Custom domains** 里加 `mfhry.store` 和 `www.mfhry.store`。

## Aiven（可选）

如果只是展示项目，这步完全可以跳过——`pull-content.mjs` 没有 `DATABASE_URL` 会自动跳过。

要用的话，在 Aiven 的 Query editor 里建表：

```sql
create table if not exists posts (
  id bigserial primary key,
  title text not null,
  summary text,
  url text,
  published boolean not null default false,
  published_at timestamptz default now()
);
```

并给构建脚本建一个只读账号，别用 `avnadmin`：

```sql
create user site_reader with password '换成你的密码';
grant connect on database defaultdb to site_reader;
grant usage on schema public to site_reader;
grant select on all tables in schema public to site_reader;
```

连接串：`postgres://site_reader:密码@主机:端口/defaultdb?sslmode=verify-full`。

## 图片放 R2

1. 建桶 `media`，绑自定义域 `img.mfhry.store`；
2. 上传：`rclone copy ./media r2:media --progress`；
3. 页面里直接写 `https://img.mfhry.store/xxx.webp`。

头像同理，改 `site.json` 的 `avatar` 字段。

## 常见问题

**项目列表是空的** — 检查 `GH_USER` 是否配置，以及仓库是不是公开的。

**Actions 部署 403** — `CF_API_TOKEN` 少了 `Cloudflare Pages: Edit` 权限，或者 `CF_ACCOUNT_ID` 填错。

**星标数不更新** — 定时任务每 6 小时跑一次，想立刻刷新就手动 Run workflow。

**域名打不开但 Pages 域名能开** — 等 DNS 生效，或在 Pages 里重新点一次 Custom domains。
