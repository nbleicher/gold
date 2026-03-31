-- Optional first-admin seed (replace placeholders before running).
-- Password must be bcrypt hash.
-- Example hash generation: node -e "require('bcrypt').hash('yourPassword',12).then(console.log)"

INSERT INTO users (id, email, password_hash, role, display_name)
VALUES (
  'replace-with-uuid-or-random-hex',
  'admin@example.com',
  '$2b$12$replace_with_bcrypt_hash',
  'admin',
  'Admin'
)
ON CONFLICT(email) DO NOTHING;
