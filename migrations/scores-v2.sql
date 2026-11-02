-- 重建 scores：登录用户按 user_id 去重（ip 留空），匿名按 ip 去重
DROP TABLE IF EXISTS scores;
CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game TEXT NOT NULL,
  ip TEXT,
  user_id INTEGER,
  name TEXT,
  score INTEGER NOT NULL,
  country TEXT,
  region TEXT,
  city TEXT,
  colo TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_game_score ON scores(game, score);
CREATE INDEX IF NOT EXISTS idx_scores_game_user ON scores(game, user_id);
CREATE INDEX IF NOT EXISTS idx_scores_game_ip ON scores(game, ip);
