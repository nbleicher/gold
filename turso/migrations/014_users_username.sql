-- Login identity: unique username (lowercase). Email remains NOT NULL for legacy schema;
-- login-enabled users use synthetic emails `${username}@login.internal` after this migration.

ALTER TABLE users ADD COLUMN username TEXT;

-- Initial username from email local-part or stable id-based placeholders.
UPDATE users SET username = CASE
  WHEN email LIKE 'no-login%@internal.invalid' THEN 'u' || substr(lower(id), 1, 14)
  WHEN email GLOB 'purged+*@invalid' THEN 'purged_' || substr(lower(id), 1, 14)
  WHEN instr(email, '@') > 0 THEN lower(
    replace(
      replace(
        replace(
          replace(
            replace(trim(substr(email, 1, instr(email, '@') - 1)), '.', '_'),
            '-',
            '_'
          ),
          '+',
          '_'
        ),
        '@',
        '_'
      ),
      ' ',
      '_'
    )
  )
  ELSE lower(replace(trim(email), ' ', '_'))
END;

UPDATE users SET username = 'u' || substr(lower(id), 1, 14)
WHERE username IS NULL OR trim(username) = '';

WITH ranked AS (
  SELECT id,
         username AS base_u,
         row_number() OVER (PARTITION BY username ORDER BY id) AS rn
  FROM users
)
UPDATE users SET username = (
  SELECT CASE WHEN ranked.rn = 1 THEN ranked.base_u ELSE ranked.base_u || '_' || CAST(ranked.rn AS TEXT) END
  FROM ranked WHERE ranked.id = users.id
);

CREATE UNIQUE INDEX idx_users_username ON users(username);
