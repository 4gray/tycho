// Never edit a shipped migration; add a new file.
export default /* sql */ `
ALTER TABLE sessions ADD COLUMN title_rank INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_events ADD COLUMN cache_write_1h_tokens INTEGER NOT NULL DEFAULT 0;
CREATE INDEX usage_message ON usage_events(message_id);
CREATE INDEX sessions_parent ON sessions(parent_session_id);
`;
