// Never edit a shipped migration; add a new file.
export default /* sql */ `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;
