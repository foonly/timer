-- Store only a SHA-256 of each session token, so a leaked database (or backup) can't be used to
-- impersonate anyone. Existing tokens are hashed in place, so nobody is logged out. Must match
-- auth.hashToken: lowercase hex of SHA-256 over the token string's bytes.
ALTER TABLE sessions RENAME COLUMN token TO token_hash;
UPDATE sessions SET token_hash = encode(sha256(convert_to(token_hash, 'UTF8')), 'hex');
