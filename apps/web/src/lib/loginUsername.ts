/**
 * Maps login input to the stored `users.username` shape.
 * Matches `turso/migrations/014_users_username.sql`: local-part of an email before `@`
 * is lowercased and `.`, `-`, `+`, `@`, and spaces become `_`.
 */
export function loginIdentifierToUsername(raw: string): string {
  const t = raw.trim().toLowerCase();
  const at = t.indexOf("@");
  const segment = at >= 0 ? t.slice(0, at) : t;
  return segment
    .replace(/\./g, "_")
    .replace(/-/g, "_")
    .replace(/\+/g, "_")
    .replace(/@/g, "_")
    .replace(/ /g, "_");
}
