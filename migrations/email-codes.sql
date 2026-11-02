-- 邮箱验证码：验证邮箱 / 找回密码共用
CREATE TABLE IF NOT EXISTS email_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,          -- verify | reset
  ip TEXT,
  code_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_codes ON email_codes(email, purpose, created_at);

-- 发信配额单独记，避免和「有没有这封验证码」混在一起
CREATE TABLE IF NOT EXISTS mail_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT,
  purpose TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mail_sends_email ON mail_sends(email, created_at);
CREATE INDEX IF NOT EXISTS idx_mail_sends_ip ON mail_sends(ip, created_at);
