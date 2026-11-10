CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  harness TEXT NOT NULL,
  native_id TEXT NOT NULL,
  project_path TEXT,
  title TEXT,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  parent_session_id TEXT,
  source_ref TEXT NOT NULL
);
CREATE INDEX sessions_updated ON sessions(updated_at);
CREATE INDEX sessions_harness ON sessions(harness);

CREATE TABLE messages (
  rowid INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  model TEXT,
  text TEXT,
  is_sidechain INTEGER NOT NULL DEFAULT 0,
  raw BLOB -- gzipped original record
);
CREATE INDEX messages_session ON messages(session_id, timestamp);

CREATE VIRTUAL TABLE messages_fts USING fts5(text, content='messages', content_rowid='rowid');
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;
CREATE TRIGGER messages_au AFTER UPDATE OF text ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO messages_fts(rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  name TEXT NOT NULL,
  native_name TEXT NOT NULL,
  input TEXT,
  output TEXT,
  output_sha256 TEXT,
  status TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT
);
CREATE INDEX tool_calls_session ON tool_calls(session_id);
CREATE INDEX tool_calls_name ON tool_calls(name);

CREATE TABLE usage_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  message_id TEXT,
  timestamp TEXT NOT NULL,
  provider TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  cache_write_tokens INTEGER NOT NULL,
  reasoning_tokens INTEGER,
  cost_usd REAL,
  cost_source TEXT NOT NULL
);
CREATE INDEX usage_session ON usage_events(session_id);
CREATE INDEX usage_time ON usage_events(timestamp);
CREATE INDEX usage_model ON usage_events(model);

CREATE TABLE ingest_state (
  source_ref TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  offset INTEGER,
  last_key TEXT,
  mtime_ms INTEGER,
  updated_at TEXT NOT NULL
);

CREATE TABLE sources (
  source_ref TEXT PRIMARY KEY,
  harness TEXT NOT NULL,
  health TEXT NOT NULL DEFAULT 'ok',
  last_error TEXT,
  skipped INTEGER NOT NULL DEFAULT 0,
  last_ingest_at TEXT,
  records INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE prices (
  model TEXT PRIMARY KEY,
  input_per_token REAL,
  output_per_token REAL,
  cache_read_per_token REAL,
  cache_write_per_token REAL
);
