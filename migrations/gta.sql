-- GTA 小游戏：统一钱包、外汇持仓、剧情进度（Cloudflare D1）
-- 钱包按 IP 记账，和 stock_accounts / scores 同一套去重思路。
-- 和炒股小游戏联动的关键：钱在两个账户之间转的时候，同步维护 stock_accounts.recharged，
-- 这样炒股榜按「净资产 − 本金 − 充值」算的净盈利不会被转账刷出来。

CREATE TABLE IF NOT EXISTS gta_wallet (
  ip TEXT PRIMARY KEY,
  cash REAL NOT NULL DEFAULT 0,          -- 城市里的现金（元）
  fx_usd REAL NOT NULL DEFAULT 0,        -- 地下钱庄换来的美元
  fx_cost REAL NOT NULL DEFAULT 0,       -- 这些美元的累计人民币成本（算汇兑盈亏）
  chapter INTEGER NOT NULL DEFAULT 1,    -- 剧情进度
  missions TEXT NOT NULL DEFAULT '[]',   -- 已完成任务 id
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gta_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  kind TEXT NOT NULL,                    -- transfer-stock / transfer-fx / story / reset
  amount REAL NOT NULL DEFAULT 0,
  memo TEXT,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gta_log_ip ON gta_log(ip, id DESC);
