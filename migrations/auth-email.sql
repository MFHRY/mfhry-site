-- 邮箱登录：users 支持两种身份（github / email），墙的帖子挂上 user_id
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,           -- 'github' | 'email'
  gh_id INTEGER,                    -- 仅 GitHub
  email TEXT,                       -- 仅邮箱（统一转小写）
  pass_hash TEXT,                   -- PBKDF2-SHA256，base64
  salt TEXT,
  iter INTEGER,                     -- 迭代次数，方便以后调高
  login TEXT NOT NULL,              -- 展示用：GitHub 是 login，邮箱是邮箱
  name TEXT,
  avatar TEXT,
  created_at TEXT NOT NULL,
  last_seen TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_gh ON users(gh_id) WHERE gh_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- 登录失败记录，防暴力破解
CREATE TABLE IF NOT EXISTS auth_fails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'login', -- login | register
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_fails_ip ON auth_fails(ip, created_at);
