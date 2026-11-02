CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game TEXT NOT NULL,
  ip TEXT NOT NULL,
  name TEXT,
  score INTEGER NOT NULL,
  country TEXT,
  region TEXT,
  city TEXT,
  colo TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(game, ip)
);
CREATE INDEX IF NOT EXISTS idx_scores_game_best ON scores(game, score);
