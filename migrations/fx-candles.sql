CREATE TABLE IF NOT EXISTS fx_candles (
  pair TEXT NOT NULL,
  range_key TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  o REAL NOT NULL,
  h REAL NOT NULL,
  l REAL NOT NULL,
  c REAL NOT NULL,
  progress REAL NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (pair, range_key, bucket)
);
CREATE INDEX IF NOT EXISTS idx_fx_candles_lookup
  ON fx_candles(pair, range_key, bucket);
