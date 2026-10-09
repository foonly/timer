-- Emails are compared case-insensitively: store them lowercased and trimmed, and enforce it, so
-- the existing UNIQUE(email) index also rules out case-only duplicates.
UPDATE users SET email = lower(trim(email)) WHERE email <> lower(trim(email));
ALTER TABLE users ADD CONSTRAINT users_email_normalized CHECK (email = lower(trim(email)));
