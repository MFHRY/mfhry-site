-- 视频切片存储（D1 版，实验性）
-- 单行 BLOB 上限 2MB，这里按 1.5MB 切片；查询结果上限 50MB。
CREATE TABLE IF NOT EXISTS video_uploads (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'uploading',
  title TEXT NOT NULL,
  body TEXT,
  cover TEXT,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  chunk_size INTEGER NOT NULL,
  chunks INTEGER NOT NULL,
  duration INTEGER,
  video_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS video_chunks (
  upload_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (upload_id, idx)
);
