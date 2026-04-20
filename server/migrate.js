const { sql } = require('./db');

// Idempotent migration runner. Runs on every boot. Each statement uses
// IF NOT EXISTS (or the INFORMATION_SCHEMA dance for ADD COLUMN IF NOT
// EXISTS on Postgres < 9.6; Neon is PG 15+ so native support is available).
// Never throws past the catch — missing columns will surface via failing
// features, but the server should still come up for everything else.
const STATEMENTS = [
  // Ensure the users relational mirror has the auth columns we need.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  // Email uniqueness is important for login. Add a unique index if not present.
  `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_lower ON users (LOWER(email))`,
];

async function runMigrations() {
  // If the users table doesn't exist yet, the schema.sql CREATE TABLE IF
  // NOT EXISTS paths inside /server/schema.sql handle it on initial install.
  // Our ALTERs would fail in that case — so bail cleanly and log.
  try {
    await sql`SELECT 1 FROM users LIMIT 1`;
  } catch (e) {
    console.warn('[migrate] users table missing; skipping ALTER TABLE migrations. Apply server/schema.sql first.');
    return;
  }

  for (const statement of STATEMENTS) {
    try {
      await sql.query(statement);
      console.log(`[migrate] ok: ${statement.slice(0, 80)}${statement.length > 80 ? '…' : ''}`);
    } catch (e) {
      console.warn(`[migrate] failed: ${statement.slice(0, 80)}… — ${e.message}`);
    }
  }
}

module.exports = { runMigrations };
