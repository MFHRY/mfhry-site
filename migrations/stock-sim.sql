-- 炒股模拟器：账户、持仓、成交、行情与 K 线缓存（Cloudflare D1）
-- 账户按 IP 记账，和 scores 表同一套去重思路；持仓/成交挂在 ip 上。

CREATE TABLE IF NOT EXISTS stock_accounts (
  ip TEXT PRIMARY KEY,
  cash REAL NOT NULL DEFAULT 100000,
  recharged REAL NOT NULL DEFAULT 0,      -- 累计充值（榜单按 净资产-充值 算净盈利）
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_positions (
  ip TEXT NOT NULL,
  symbol TEXT NOT NULL,                    -- 600519 / AAPL
  market TEXT NOT NULL,                    -- sh / sz / us
  qty INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0,            -- 累计买入成本（含手续费），用于算均价
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ip, symbol)
);

CREATE TABLE IF NOT EXISTS stock_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  symbol TEXT NOT NULL,
  market TEXT NOT NULL,
  side TEXT NOT NULL,                      -- buy / sell
  qty INTEGER NOT NULL,
  price REAL NOT NULL,
  amount REAL NOT NULL,
  fee REAL NOT NULL DEFAULT 0,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_trades_ip ON stock_trades(ip, id DESC);

-- 实时行情缓存：同一个 symbol 全站共用，避免每个访客都去打东财
CREATE TABLE IF NOT EXISTS stock_quotes (
  symbol TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  name TEXT,
  price REAL NOT NULL,
  prev REAL,
  open REAL,
  high REAL,
  low REAL,
  volume REAL,
  turnover REAL,
  fetched_at TEXT NOT NULL
);

-- K 线缓存：symbol+period 一行存整段 JSON
CREATE TABLE IF NOT EXISTS stock_klines (
  symbol TEXT NOT NULL,
  period TEXT NOT NULL,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (symbol, period)
);

-- 股票池（前端要展示哪些票、中文名、所属市场）
CREATE TABLE IF NOT EXISTS stock_list (
  symbol TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  name TEXT NOT NULL,
  alias TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
